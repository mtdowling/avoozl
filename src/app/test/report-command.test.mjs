// The report command (worker-paths WP4.1, WP4.3; design D5): a worker's brief
// carries a command that runs with no node or avoozl on PATH, from a checkout and from
// the built app package, and no chat brief names an MCP tool.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { workspaceConfig } from "../config.mjs";
import { Operations } from "../operations.mjs";
import { cliCommand, shellQuote } from "../report-command.mjs";
import { issueReportToken } from "../report-match.mjs";
import { Store } from "../store.mjs";
import { briefCell, EXECUTORS, KINDS } from "../worker-briefs.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });

async function setup(t) {
  const dir = temporaryDirectory("avoozl-report-command-"),
    checkout = path.join(dir, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-q", "-b", "main");
  git(checkout, "config", "user.name", "T");
  git(checkout, "config", "user.email", "t@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  const { dbPath } = workspaceConfig({ workspace: dir, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  t.after(() => store.close());
  const task = (id) => ({
    id,
    title: "Task " + id,
    kind: "leaf",
    scope: "catalog",
    status: "planned",
    epic: "sample",
    track: "catalog",
    tags: [],
    acceptance: ["Works."],
    checks: [],
    repository: "app",
  });
  store.importSnapshot({
    ...snapshot(),
    tasks: [task("a"), task("b")],
    edges: [],
  });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
  });
  return { dir, store, ops: new Operations(store, { workspaceRoot: dir }) };
}

// A PATH with `git` and nothing else: no `node`, no `avoozl`. The report
// reads HEAD and prepares a worktree with git, which a worker has on its PATH
// to commit; an entirely empty PATH would stop git, not the report command.
function gitOnlyPath() {
  const found = execFileSync(
    process.platform === "win32" ? "where" : "which",
    ["git"],
    { encoding: "utf8" },
  )
    .split(/\r?\n/)[0]
    .trim();
  if (process.platform === "win32") return path.dirname(found);
  const dir = temporaryDirectory("avoozl-git-only-");
  fs.symlinkSync(found, path.join(dir, "git"));
  return dir;
}

// A command from a brief, run by a shell that finds only git.
const bare = (command, cwd) =>
  spawnSync(command, {
    shell: true,
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: (gitPath ??= gitOnlyPath()),
      Path: gitPath,
      AVOOZL_WORKSPACE: "",
    },
  });
let gitPath;

// The two commands a chat brief gives: prepare the worktree, then report.
const commandsOf = (steps) => {
  const text = steps.join("\n");
  return {
    prepare: /`([^`]+ worktree prepare [^`]+)`/.exec(text)?.[1],
    report: /run exactly: (.+ runner report [^\n]+)/.exec(text)?.[1],
  };
};

// `localSteps` as a copy of Avoozl gives it: this checkout's, or the built
// app package's, which Kiro Crew installs without a checkout around it.
async function runsWithEmptyPath(t, steps) {
  const w = await setup(t),
    project = w.store.get("projects", "app"),
    token = issueReportToken(w.store, { taskId: "a", attempt: 1 }),
    cliReport = { worktree: "/unused", token, workspace: w.dir },
    given = commandsOf(await steps(project, cliReport));
  assert.ok(given.prepare, "the brief gives a worktree command");
  assert.ok(given.report, "the brief gives a report command");
  const prepared = bare(given.prepare, w.dir);
  assert.equal(prepared.status, 0, prepared.stderr);
  const tree = JSON.parse(prepared.stdout).path;
  await w.ops.execute("session.bind", {
    taskId: "a",
    slot: "chat",
    attempt: 1,
    source: "tick",
    title: "avoozl:a Task a",
  });
  fs.writeFileSync(path.join(tree, "a.txt"), "a\n");
  git(tree, "add", ".");
  git(
    tree,
    "-c",
    "user.name=T",
    "-c",
    "user.email=t@e.x",
    "commit",
    "-qm",
    "a",
  );
  const out = bare(given.report, tree);
  assert.equal(out.status, 0, out.stderr);
  const report = w.store.get("session_bindings", "chat").report;
  assert.equal(report.kind, "done");
  assert.equal(report.commit, git(tree, "rev-parse", "HEAD"));
}

test("the report command runs with no node or avoozl on PATH against the source checkout", async (t) => {
  const { localSteps } = await import("../delivery.mjs");
  await runsWithEmptyPath(t, (project, cliReport) =>
    localSteps({ id: "a" }, project, { cliReport }),
  );
});

test("the report command runs with no node or avoozl on PATH against the built app package", async (t) => {
  const lib = path.join(root, "kirocrew-app", "bin", "lib");
  assert.ok(fs.existsSync(lib), "npm run build makes bin/lib");
  const built = await import(
    pathToFileURL(path.join(lib, "src", "app", "delivery.mjs"))
  );
  await runsWithEmptyPath(t, (project, cliReport) =>
    built.localSteps({ id: "a" }, project, { cliReport }),
  );
});

test("the command is quoted for the shell it runs in", () => {
  assert.equal(shellQuote("a b'c", "linux"), `'a b'\\''c'`);
  assert.equal(shellQuote('C:\\x y\\"z', "win32"), '"C:\\x y\\\\"z"');
  assert.ok(cliCommand().startsWith(shellQuote(process.execPath)));
  assert.ok(cliCommand().endsWith(shellQuote(path.join(root, "cli.mjs"))));
});

test("no chat worker brief in the pair table names an MCP tool", async (t) => {
  const w = await setup(t),
    { workerBrief, localSteps } = await import("../delivery.mjs"),
    { investigateLines } = await import("../investigate.mjs"),
    token = issueReportToken(w.store, { taskId: "a", attempt: 1 }),
    project = w.store.get("projects", "app"),
    task = w.store.read().tasks[0],
    cliReport = { worktree: "/tmp/wt", token, workspace: w.dir },
    data = w.store.read(),
    leaf = {
      task,
      attempt: 1,
      batch: { id: "x", tasks: ["a", "b"], reason: "Small" },
    },
    seen = [];
  for (const kind of KINDS) {
    const { cell } = briefCell("kirocrew", kind);
    let text;
    if (kind === "single" || kind === "investigate")
      text = workerBrief(task, project, {
        attempt: 1,
        investigate: kind === "investigate",
        findingsVia: { executor: "kirocrew", cliReport },
        steps: cell.steps({ task, project, relay: false, cliReport }),
      });
    else if (kind === "batch") text = cell.brief(w.store, data, leaf, "");
    else if (kind === "round") text = cell.finish;
    else
      text = cell.brief(
        {
          envelope: { taskId: "a", baseCommit: "abc", brief: "Do it." },
        },
        { worktree: "/tmp/wt", branch: "avoozl/remote/a" },
        cliCommand(),
      );
    seen.push(kind);
    assert.doesNotMatch(text, /plans_/, `kirocrew ${kind}`);
    assert.doesNotMatch(text, /(^|\s)avoozl runner/, `kirocrew ${kind}`);
  }
  assert.deepEqual(seen, [...KINDS]);
  assert.deepEqual(EXECUTORS.length, 2);
  // The pieces the brief is built from, too.
  assert.doesNotMatch(
    [
      ...localSteps({ id: "a" }, project, { cliReport }),
      ...investigateLines({ id: "a" }, "kirocrew", cliReport),
    ].join("\n"),
    /plans_/,
  );
});

test("a batch reports each task with its leader's token", async (t) => {
  const w = await setup(t),
    lead = w.store.read().tasks[0],
    token = issueReportToken(w.store, { taskId: "a", attempt: 1 }),
    { batchBrief } = await import("../flow-batch.mjs"),
    brief = batchBrief(
      w.store,
      w.store.read(),
      { task: lead, attempt: 1, batch: { id: "x", tasks: ["a", "b"] } },
      "",
    );
  assert.ok(brief.includes(`--token ${token}`));
  assert.match(brief, /worktree prepare a/);
  await w.ops.execute("session.bind", {
    taskId: "a",
    slot: "chat",
    attempt: 1,
    source: "tick",
    title: "avoozl:a batch",
    batch: { id: "x", tasks: ["a", "b"] },
  });
  const tree = (await w.ops.execute("worktree.prepare", { taskId: "a" })).path,
    run = (id) =>
      bare(
        `${cliCommand()} runner report ${id} done --token ${token} --workspace ${JSON.stringify(w.dir)}`,
        tree,
      );
  for (const id of ["a", "b"]) {
    fs.writeFileSync(path.join(tree, id + ".txt"), id + "\n");
    git(tree, "add", ".");
    git(
      tree,
      "-c",
      "user.name=T",
      "-c",
      "user.email=t@e.x",
      "commit",
      "-qm",
      id,
    );
    const out = run(id);
    assert.equal(out.status, 0, `${id}: ${out.stderr}`);
  }
  const binding = w.store.get("session_bindings", "chat");
  assert.deepEqual(Object.keys(binding.reports).sort(), ["a", "b"]);
  assert.notEqual(binding.reports.a.commit, binding.reports.b.commit);
});

test("plans_report still works for a session Avoozl did not start", async (t) => {
  const w = await setup(t);
  // No source: a chat found by its title, as an MCP client the person opened.
  await w.ops.execute("session.bind", {
    taskId: "a",
    slot: "opened",
    attempt: 1,
    title: "avoozl:a by hand",
  });
  const out = await w.ops.execute(
    "session.report",
    { taskId: "a", kind: "blocked", text: "Need a key." },
    undefined,
    as("opened"),
  );
  assert.equal(out.report.kind, "blocked");
});
