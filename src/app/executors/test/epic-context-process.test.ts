// Epic context in a process session (epic-context ec-2.2, ec-2.3): reads,
// skills and the brief for a worker that passes the two tests, the MCP
// relay and broker with a fake server, and a session that fails the gate
// running exactly as one with no source at all. A fake harness CLI, a real
// supervisor and real git; no network.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { drainProcessRequests } from "../process.ts";
import { parseHarnessDefinition } from "../harness-definitions.ts";
import { childRecord, openSupervisorDatabase } from "../supervisor.ts";
import { listActivity, type ActivityRow } from "../../store/activity-log.ts";
import { enqueueSessionRequests } from "../../sessions/session-requests.ts";
import { FakeGitHub } from "../../test/fake-github.ts";
import { unapprove } from "../../test/epic-context-seed.ts";
import { until } from "./process-machine.ts";
import { found } from "../../test/view-shapes.ts";
import type { SessionBinding } from "../../sessions/session-bindings.ts";
import type { RequestRow } from "../../sessions/session-requests.ts";

import {
  finish,
  plugin,
  run,
  runAt,
  runs,
  settings,
  type Run,
  followUp,
  settle,
  world,
} from "./epic-context-world.ts";
const posix = process.platform !== "win32";
// A binding with the epic context record the gate leaves on it.
type ContextBinding = SessionBinding & {
  epicContext?: { tests: { passed: boolean }[]; items: string[] } | null;
};
// An activity row of `kind`, which must exist.
const activity = (
  w: ReturnType<typeof world>,
  test: (row: ActivityRow) => boolean,
) => {
  const row = listActivity(w.store).items.find(test);
  assert.ok(row, "no such activity");
  return row;
};

test("a passing worker gets reads, skills, the brief and the MCP server, and the folder goes with it", {
  skip: !posix && "the MCP relay uses a Unix socket",
}, async (t) => {
  const w = world(t),
    { ctx, record } = plugin(w);
  w.note = path.join(ctx.notes, "widgets", "note.md");
  await finish(w, ctx);
  process.env.RESEARCH_TOKEN = "sign-in-value";
  t.after(() => delete process.env.RESEARCH_TOKEN);
  const slot = await run(w);
  const saved = settings(w, slot).context;
  assert.ok(saved);
  // A read joins the read-only folders; none is writable (EC6.1).
  assert.ok(
    saved.readable.includes(fs.realpathSync(path.join(ctx.notes, "widgets"))),
  );
  const skills = saved.cleanup[0];
  assert.ok(
    saved.readable.some((folder) => folder.endsWith(path.basename(skills))),
  );
  assert.deepEqual(Object.keys(saved.mcp), ["research"]);
  const [first] = runs(w);
  // The brief lists each skill and read (EC6.3).
  assert.match(first.prompt, /## Epic context/);
  assert.match(first.prompt, /module-layout: How the team lays out a module/);
  assert.match(first.prompt, /error-messages: How the team words an error/);
  assert.match(first.prompt, /The team's design notes/);
  assert.match(
    first.prompt,
    /research: Answers questions from the team's design archive/,
  );
  // The worker read the copied skill and the note.
  assert.equal(
    fs.readFileSync(path.join(w.m.worktree, "skill.txt"), "utf8"),
    fs.readFileSync(
      path.join(ctx.folder, "skills", "module-layout", "SKILL.md"),
      "utf8",
    ),
  );
  assert.equal(
    fs.readFileSync(path.join(w.m.worktree, "note.txt"), "utf8"),
    "A note.\n",
  );
  // The tool answered through the relay with the server's own sign-in,
  // which the worker's environment never held (EC7.4).
  const reply = JSON.parse(
    fs.readFileSync(path.join(w.m.worktree, "mcp-research.json"), "utf8"),
  );
  assert.equal(reply.result.content[0].text, "marker:sign-in-value");
  assert.ok(!first.env.includes("RESEARCH_TOKEN"));
  const serverEnv = JSON.parse(fs.readFileSync(record, "utf8"));
  assert.ok(serverEnv.includes("RESEARCH_TOKEN"));
  // The config names only the relay and holds no environment value.
  const config = first.argv[first.argv.indexOf("--mcp-config") + 1];
  assert.ok(!fs.readFileSync(config, "utf8").includes("sign-in-value"));
  // The skills copy goes when the child exits (EC6.4).
  assert.ok(!fs.existsSync(skills));
  // Activity names the tests and the given items; the chip's binding too.
  const row = activity(w, (item) => item.kind === "epic-context.session");
  assert.match(row.summary, /approved passed.*approver passed/);
  assert.match(row.summary, /skill module-layout/);
  assert.match(row.summary, /mcp research/);
  const binding = w.store.get<ContextBinding>("session_bindings", slot);
  assert.deepEqual(
    binding?.epicContext?.tests.map((x) => x.passed),
    [true, true],
  );
  // Each call reaches Activity, with no argument or reply (EC7.5).
  await drainProcessRequests(w.store, {
    stateDirectory: w.m.stateDirectory,
    ops: w.ops,
  });
  const text = JSON.stringify(
    listActivity(w.store).items.filter(
      (item) => item.kind === "epic-context.call",
    ),
  );
  assert.match(text, /MCP research ask: \d+ bytes/);
  assert.doesNotMatch(text, /SECRET-ARGUMENT|marker:sign-in-value/);
});

test("a changed skill file gives no skill", async (t) => {
  const w = world(t),
    { ctx } = plugin(w);
  w.note = path.join(ctx.notes, "widgets", "note.md");
  await finish(w, ctx);
  // The plugin's file changes after the approval was given.
  fs.appendFileSync(
    path.join(ctx.folder, "skills", "module-layout", "SKILL.md"),
    "\nchanged\n",
  );
  await run(w);
  // A changed file turns the plugin `changed`, so nothing is given at all.
  assert.ok(!runAt(w, 0).prompt.includes("## Epic context"));
  assert.ok(!fs.existsSync(path.join(w.m.worktree, "skill.txt")));
});

test("a failing or sourceless session runs exactly as one with no source", async (t) => {
  const w = world(t),
    { ctx } = plugin(w);
  w.note = path.join(ctx.notes, "widgets", "note.md");
  await finish(w, ctx);
  // Run 1: the only source is switched off. Run 2: a source names the
  // repository and the gate fails.
  ctx.write((settings) => (settings.disabled = ["team-context"]));
  const plain = await run(w, { attempt: 1 });
  ctx.write((settings) => (settings.disabled = []));
  unapprove(w.store);
  const failed = await run(w, { attempt: 2 });
  const normal = (slot: string, run: Run) => ({
    argv: JSON.parse(JSON.stringify(run.argv).replaceAll(slot.slice(8), "ID")),
    prompt: run.prompt,
    env: run.env,
  });
  const [one, two] = runs(w);
  assert.deepEqual(normal(failed, two), normal(plain, one));
  const db = openSupervisorDatabase(w.m.stateDirectory);
  try {
    const row = (slot: string) => found(childRecord(db, slot), "the child");
    assert.equal(row(failed).brief, row(plain).brief);
    assert.equal(
      row(failed).placeholder_values.replaceAll(failed, "S"),
      row(plain).placeholder_values.replaceAll(plain, "S"),
    );
  } finally {
    db.close();
  }
  assert.equal(settings(w, failed).context, null);
  // The failed one is recorded with its failing test; the other writes nothing.
  const rows = listActivity(w.store).items.filter(
    (item) => item.kind === "epic-context.session",
  );
  assert.equal(rows.length, 1);
  assert.match(
    rows[0].summary,
    /approved failed: The approved revision of config is not on the specs branch/,
  );
});

test("a resume runs the tests again and drops context when one now fails", async (t) => {
  const w = world(t),
    { ctx } = plugin(w);
  w.note = path.join(ctx.notes, "widgets", "note.md");
  await finish(w, ctx);
  const slot = await run(w);
  assert.ok(settings(w, slot).context);
  unapprove(w.store);
  enqueueSessionRequests(w.store, {
    sends: [
      {
        executor: "process",
        slot,
        task: "sample-task",
        role: "worker",
        text: "Please go on.",
      },
    ],
  });
  await drainProcessRequests(w.store, {
    stateDirectory: w.m.stateDirectory,
    ops: w.ops,
  });
  assert.equal(settings(w, slot).context, null);
  await until(() => {
    w.m.supervisor.pass();
    return runs(w).length === 2;
  });
  assert.ok(!runAt(w, 1).argv.includes("--mcp-config"));
  const resumed = activity(
    w,
    (item) =>
      item.kind === "epic-context.session" && /Resumed/.test(item.summary),
  );
  assert.match(
    resumed.summary,
    /approved failed: The approved revision of config is not on the specs branch/,
  );
  assert.equal(
    w.store.get<ContextBinding>("session_bindings", slot)?.epicContext,
    null,
  );
});

test("only the worker role gets context", async (t) => {
  const w = world(t),
    { ctx } = plugin(w);
  w.note = path.join(ctx.notes, "widgets", "note.md");
  await finish(w, ctx);
  const { processContext } = await import("../../workers/epic-context.ts");
  const given = await processContext(
    w.store,
    {
      taskId: "sample-task",
      role: "verifier",
      repository: w.store.get("repositories", "app"),
    },
    { ops: w.ops, places: { home: os.homedir() }, definition: null },
  );
  assert.equal(given, null);
});

test("a harness without context.mcp gets no MCP servers, and the record says so", {
  skip: !posix,
}, async (t) => {
  const w = world(t, { mcp: false }),
    { ctx } = plugin(w);
  w.note = path.join(ctx.notes, "widgets", "note.md");
  await finish(w, ctx);
  const slot = await run(w);
  const [first] = runs(w);
  assert.ok(!first.argv.includes("--mcp-config"));
  assert.match(first.prompt, /## Epic context/);
  assert.ok(!first.prompt.includes("research:"));
  assert.ok(!fs.existsSync(path.join(w.m.worktree, "mcp-research.json")));
  assert.deepEqual(Object.keys(settings(w, slot).context?.mcp ?? {}), []);
  const row = w.store.get<ContextBinding>("session_bindings", slot);
  assert.equal(row?.epicContext?.items.includes("mcp"), false);
  const left = JSON.stringify(
    w.store.getMeta<{ tasks: Record<string, { left: unknown }> }>("epicContext")
      ?.tasks["sample-task"]?.left,
  );
  assert.match(left, /mcp research.*the harness has no context\.mcp/);
});

test("a server that listens is stopped and its plugin is marked broken", {
  skip: !posix,
}, async (t) => {
  const w = world(t),
    { ctx } = plugin(w, { listen: true });
  w.note = path.join(ctx.notes, "widgets", "note.md");
  await finish(w, ctx);
  await run(w, { brief: `HOLD:3000 READ:${w.note}` });
  await until(() => ctx.settings().broken?.["team-context"]);
  assert.match(
    ctx.settings().broken?.["team-context"]?.reason ?? "",
    /network listener/,
  );
  assert.equal(ctx.plugin()?.state, "unapproved");
});

test("the harness context key passes the argv checks and must name the config file", () => {
  const base = JSON.parse(
    fs.readFileSync(
      new URL(
        "../../../../examples/harnesses/claude-code.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(parseHarnessDefinition(base).context?.mcp, [
    "--mcp-config",
    "{context_mcp}",
    "--strict-mcp-config",
  ]);
  for (const [context, pattern] of [
    [{ mcp: "claude --mcp-config {context_mcp}" }, /shell string/],
    [{ mcp: ["--mcp-config", "x"] }, /must name \{context_mcp\}/],
    [{ mcp: ["{context_mcp}"], extra: [] }, /context must be/],
    [
      { mcp: ["--dangerously-skip-permissions", "{context_mcp}"] },
      /skips permissions/,
    ],
    [
      { mcp: ["--mcp-config", "{context_mcp}", "bypassPermissions"] },
      /skips permissions/,
    ],
  ])
    assert.throws(
      () => parseHarnessDefinition({ ...base, context }),
      pattern,
      JSON.stringify(context),
    );
});

test("text from a login that does not count never reaches a context session", {
  skip: !posix,
}, async (t) => {
  const w = world(t),
    { ctx } = plugin(w);
  w.note = path.join(ctx.notes, "widgets", "note.md");
  await finish(w, ctx);
  const github = new FakeGitHub();
  github.permissions.set("maintainer", "write");
  github.permissions.set("stranger", "read");
  assert.ok(w.ops);
  w.ops.github = github;
  // The session is still running when the text arrives.
  const slot = await run(w, { brief: `HOLD:100 READ:${w.note}` });
  const send = (login: string, text: string) => {
    enqueueSessionRequests(w.store, {
      sends: [
        {
          executor: "process",
          slot,
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
  // A counted login's text is sent as today, and the context stays.
  await send("maintainer", "Please rename it.");
  assert.ok(settings(w, slot).context);
  await until(() => {
    w.m.supervisor.pass();
    return runs(w).length === 2;
  });
  assert.match(runAt(w, 1).prompt, /Please rename it/);
  // A login that does not count is not sent; the session stops and a new
  // one starts with the text and no epic context.
  await send("stranger", "Also add this.");
  assert.ok(!JSON.stringify(runs(w)).includes("Also add this"));
  await settle(w, slot);
  const follow = w.store
    .list<RequestRow>("session_requests")
    .find((row) => row.request?.epicContext === false);
  assert.ok(follow);
  assert.equal(follow.request.attempt, 2);
  assert.equal(follow.request.after, slot);
  // Once the first session has ended, the follow-up starts.
  const second = await followUp(w, 2);
  const last = runAt(w, -1);
  assert.match(last.prompt, /Also add this/);
  assert.ok(!last.prompt.includes("## Epic context"));
  assert.ok(!last.argv.includes("--mcp-config"));
  assert.equal(settings(w, second.slot).context, null);
  const secondBinding = w.store.get<ContextBinding>(
    "session_bindings",
    second.slot,
  );
  assert.ok(secondBinding);
  assert.equal(secondBinding.epicContext, undefined);
  const rows = listActivity(w.store).items.map((item) => item.summary);
  assert.ok(
    rows.some((row) => /Text from stranger, who does not count/.test(row)),
  );
  assert.ok(
    rows.some((row) => /Started sample-task: no tests run.*withheld/.test(row)),
  );
});
