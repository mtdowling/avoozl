#!/usr/bin/env node
// @ts-nocheck: typing debt, see the commit message
// Proof ec-p1 (epic-context): context reaches the owner's own spec task and
// nothing else. Everything runs on this machine in temporary folders: an
// isolated Avoozl home and workspace, a scratch repository acme/widgets with
// an approved one-task spec, the example team-context plugin with its server
// replaced by a fake stdio MCP server, a fake GitHub, and a scripted harness
// CLI that reads the note, the skill and calls the `research` tool through
// the relay. Avoozl's own code (gate, supervisor, broker, relay, content
// rules, Activity) does the rest. Prints one JSON line per observation and
// writes the receipt; exits 1 on a failed expectation.
//
//   node scripts/proofs/ec-p1.ts <receipt file>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ec-p1-")));
process.env.XDG_CONFIG_HOME = path.join(root, "xdg");
process.env.TMPDIR = root;
delete process.env.KIROCREW_HOME;
const imp = (file) => import(path.join(repo, "src", "app", file));
const [receipt] = process.argv.slice(2);
if (!receipt) {
  console.error("Usage: ec-p1.ts <receipt file>");
  process.exit(2);
}

const World = await imp("executors/test/epic-context-world.mjs");
const { seedApproval, setDriver } = await imp("test/epic-context-seed.mjs");
const { listActivity } = await imp("store/activity-log.ts");
const { contextView, contextSources } = await imp("context/plugin-context.mjs");
const { contextChip } = await imp("context/context-record.mjs");
const { enforce } = await imp("content/content-rules.mjs");
const { loadLayeredConfig } = await imp("settings/layered-config.mjs");
const { contextMachine } = await imp("context/test/context-fixture.mjs");
const { taskEvidence } = await imp("tasks/evidence.mjs");
const { drainProcessRequests } = await imp("executors/process.mjs");
const { enqueueSessionRequests } = await imp("sessions/session-requests.mjs");
const { FakeGitHub } = await imp("test/fake-github.mjs");

const cleanups = [];
const t = { after: (fn) => cleanups.push(fn) };
const results = [];
const observe = (n, what, ok, detail = "") => {
  results.push({ n, what, ok, detail });
  console.log(JSON.stringify({ n, what, ok, detail }));
};
// Every TCP listener, with the folder its process works in; those started
// under this proof's folder (or this process) are the ones that count.
const listeners = () =>
  execFileSync("ss", ["-Hltnp"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const pid = Number(/pid=(\d+)/.exec(line)?.[1] ?? 0);
      let ours = pid === process.pid;
      for (const link of ["cwd", "exe"])
        try {
          if (fs.readlinkSync(`/proc/${pid}/${link}`).startsWith(root))
            ours = true;
        } catch {}
      try {
        if (fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").includes(root))
          ours = true;
      } catch {}
      return { line: line.replace(/\s+/g, " "), ours };
    });

try {
  const before = listeners();
  const w = World.world(t);
  const { ctx, record } = World.plugin(w, { sets: true });
  w.note = path.join(ctx.notes, "widgets", "note.md");
  fs.writeFileSync(
    path.join(ctx.notes, "widgets", "note.md"),
    "Design note: the loader reads config.json.\n",
  );
  // An acme-terms set that covers nothing by itself: it applies only where
  // epic context names it.
  fs.writeFileSync(
    path.join(ctx.workspaceRoot, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      contentRules: { sets: [{ id: "acme-terms", boundaries: ["plan"] }] },
    }),
  );
  const rules = path.join(
    ctx.workspaceRoot,
    ".avoozl",
    "local",
    "content-rules",
  );
  fs.mkdirSync(rules, { recursive: true });
  fs.writeFileSync(
    path.join(rules, "acme-terms.txt"),
    "acme-codename: acme-codename-zeta\n",
  );
  await World.finish(w, ctx);
  w.ops.github = new FakeGitHub();
  w.ops.github.permissions.set("maintainer", "write");
  w.ops.github.permissions.set("stranger", "read");
  process.env.RESEARCH_TOKEN = "proof-sign-in-marker";

  // (1) The approval view.
  const view = contextView(ctx.plugin(), ctx.settings());
  observe(
    1,
    "the approval view lists both skills, the read and the research alias with its command and env name",
    view.skills.length === 2 &&
      view.reads[0].filled.endsWith(path.join("notes", "widgets")) &&
      view.servers[0].alias === "research" &&
      view.servers[0].command.join(" ").includes("research.mjs") &&
      view.servers[0].env.join() === "RESEARCH_TOKEN",
    JSON.stringify({
      skills: view.skills.map((s) => s.name),
      server: view.servers[0],
    }),
  );

  // (2) The owner's own spec task.
  const slot = await World.run(w, {
    attempt: 1,
    brief: `Do the work. READ:${w.note} HOLD:200`,
  });
  await drainProcessRequests(w.store, {
    stateDirectory: w.m.stateDirectory,
    ops: w.ops,
  });
  const first = World.runs(w)[0];
  const noteRead = fs.readFileSync(path.join(w.m.worktree, "note.txt"), "utf8");
  const skillRead = fs.readFileSync(
    path.join(w.m.worktree, "skill.txt"),
    "utf8",
  );
  const reply = JSON.parse(
    fs.readFileSync(path.join(w.m.worktree, "mcp-research.json"), "utf8"),
  );
  const calls =
    JSON.stringify(taskEvidence(w.store, { taskId: "sample-task" })).match(
      /MCP research ask/g,
    ) ?? [];
  const row = listActivity(w.store).items.find(
    (i) => i.kind === "epic-context.session",
  );
  observe(
    2,
    "the session read the note, quoted the skill's phrase, called research once; Activity shows three passed tests and the given items; the row shows Epic context",
    noteRead.includes("loader reads config.json") &&
      skillRead.includes("Put a module in one folder") &&
      reply.result.content[0].text.startsWith("marker:") &&
      calls.length === 1 &&
      /approved passed.*approver passed.*you-drive passed/.test(row.summary) &&
      /skill module-layout/.test(row.summary) &&
      contextChip(w.store, "sample-task")?.label === "Epic context",
    row.summary,
  );

  // (3) Who held the sign-in.
  const serverEnv = JSON.parse(fs.readFileSync(record, "utf8"));
  observe(
    3,
    "the fake server's environment holds the marker variable and the worker's does not",
    serverEnv.includes("RESEARCH_TOKEN") &&
      !first.env.includes("RESEARCH_TOKEN"),
  );

  // (6) The acme-terms set, only where context names it.
  const diff = {
    boundary: "diff",
    repository: "acme/widgets",
    target: "diff:sample-task",
    added: [
      { target: "src/a.js", line: 1, text: "const x = 'acme-codename-zeta'" },
    ],
  };
  let blocked = false;
  try {
    enforce(w.store, diff, { mode: "refuse", taskId: "sample-task" });
  } catch (error) {
    blocked = error.status === 422;
  }
  let other = true;
  try {
    enforce(
      w.store,
      { ...diff, target: "diff:other" },
      { mode: "refuse", taskId: "other" },
    );
  } catch {
    other = false;
  }
  observe(
    6,
    "a diff with an acme-terms term is blocked for the context task and not for another task",
    blocked && other,
    JSON.stringify({ blocked, other }),
  );

  // (4) Work that is not the owner's own.
  const data = w.store.read();
  data.tasks.push({
    id: "intake-0123456789abcdef",
    title: "i",
    scope: "catalog",
    status: "planned",
    track: "catalog",
    tags: [],
    acceptance: ["x"],
    planId: "config",
    repository: "app",
  });
  w.store.commit(data, "intake", data.revision);
  const countRuns = () => World.runs(w).length;
  const gave = (index) =>
    World.runs(w)[index].prompt.includes("## Epic context");
  await World.run(w, {
    attempt: 2,
    task: "intake-0123456789abcdef",
    brief: "Intake work.",
  });
  const intakeRow = listActivity(w.store).items.find((i) =>
    /intake-0123/.test(i.summary),
  );
  setDriver(w.store, "other-person");
  await World.run(w, { attempt: 3, brief: "A coworker's spec." });
  const coworkerRow = listActivity(w.store).items.find((i) =>
    /you-drive failed: Taken by octo-dev/.test(i.summary),
  );
  setDriver(w.store, "driver");
  fs.writeFileSync(
    path.join(root, "tools.avoozl.json"),
    JSON.stringify({ version: 1, epicContext: { repos: ["*"] } }),
  );
  fs.mkdirSync(path.join(root, "tools"), { recursive: true });
  fs.copyFileSync(
    path.join(root, "tools.avoozl.json"),
    path.join(root, "tools", ".avoozl.json"),
  );
  let refusal = "";
  try {
    loadLayeredConfig({
      workspaceRoot: path.join(root, "tools"),
      env: {},
      home: root,
    });
  } catch (error) {
    refusal = error.message;
  }
  const declared = contextMachine({ declare: "repository", approve: true });
  observe(
    4,
    "the intake task, the coworker's spec and the repository that names epicContext or declares the plugin get none, and Activity names why",
    !gave(1) &&
      !gave(2) &&
      countRuns() === 3 &&
      /approved failed: An intake task/.test(intakeRow.summary) &&
      Boolean(coworkerRow) &&
      /"epicContext".*\.avoozl\.json/.test(refusal) &&
      contextSources(declared.options).length === 0,
    `${refusal} | ${intakeRow.summary}`,
  );

  // (5) Text from a login without write access.
  const send = (login, text) => {
    enqueueSessionRequests(w.store, {
      sends: [
        {
          executor: "process",
          slot: held,
          task: "sample-task",
          role: "worker",
          text,
          from: { login },
        },
      ],
    });
    return drainProcessRequests(w.store, {
      stateDirectory: w.m.stateDirectory,
      prepareWorktree: async () => ({ path: w.m.worktree }),
      ops: w.ops,
    });
  };
  const held = await World.run(w, {
    attempt: 4,
    brief: `Context task. READ:${w.note} HOLD:300`,
  });
  await send("stranger", "Also add this.");
  const sawText = JSON.stringify(World.runs(w)).includes("Also add this");
  await World.settle(w, held);
  const next = await World.followUp(w, 5);
  const last = World.runs(w).at(-1);
  observe(
    5,
    "text from a login without write access starts a new session without context",
    !sawText &&
      /Also add this/.test(last.prompt) &&
      !last.prompt.includes("## Epic context") &&
      World.settings(w, next.slot).context === null,
    JSON.stringify({
      sawText,
      hasText: /Also add this/.test(last.prompt),
      hasCtx: last.prompt.includes("## Epic context"),
    }),
  );

  // (7) Editing servers.json.
  fs.appendFileSync(path.join(ctx.folder, "mcp", "servers.json"), "\n");
  const changed = ctx.plugin().state === "changed";
  await World.run(w, { attempt: 6, brief: "After the edit." });
  observe(
    7,
    "editing servers.json turns the plugin changed and the next session gets nothing",
    changed && !World.runs(w).at(-1).prompt.includes("## Epic context"),
  );

  // (8) No new listener.
  const after = listeners();
  const added = after
    .filter((l) => l.ours && !before.some((b) => b.line === l.line))
    .map((l) => l.line);
  observe(
    8,
    "no new TCP listener appeared",
    added.length === 0,
    JSON.stringify(added),
  );
} finally {
  delete process.env.RESEARCH_TOKEN;
  for (const fn of cleanups.reverse()) await fn();
}

results.sort((a, b) => a.n - b.n);
const ok = results.every((r) => r.ok);
fs.writeFileSync(
  receipt,
  [
    "# Proof ec-p1: epic context reaches the owner's own spec task and nothing else",
    "",
    `Run ${new Date().toISOString()} on ${os.platform()} with \`node scripts/proofs/ec-p1.ts\`.`,
    "",
    "Setup: an isolated home and workspace, scratch repository acme/widgets with an approved one-task spec, the example `team-context` plugin with a fake stdio MCP server `research`, a fake GitHub, and a scripted harness CLI. Avoozl's gate, supervisor, broker, relay, content rules and Activity are the real code. This machine has no sandbox, so the harness ran under the per-machine opt-in; the sandbox profile itself is covered by unit tests only.",
    "",
    "| # | Expected | Result |",
    "| --- | --- | --- |",
    ...results.map(
      (r) => `| ${r.n} | ${r.what} | ${r.ok ? "observed" : "FAILED"} |`,
    ),
    "",
    "Details:",
    "",
    ...results.map((r) => `- (${r.n}) ${r.detail.replaceAll(root, "<tmp>")}`),
    "",
    ok ? "Expected result observed." : "A step failed.",
    "",
  ].join("\n"),
);
process.exit(ok ? 0 : 1);
