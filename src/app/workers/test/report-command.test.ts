// The report command (worker-paths WP4.1, WP4.3; design D5): a worker's brief
// carries a command that runs with no node or avoozl on PATH, from a checkout and from
// the built app package, and no chat brief names an MCP tool.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Operations } from "../../api/operations.ts";
import { cliCommand, shellQuote } from "../report-command.ts";
import { issueReportToken } from "../report-match.ts";
import { briefCell, EXECUTORS, KINDS } from "../worker-briefs.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { found } from "../../test/view-shapes.ts";
import { reportWorkspace } from "../../test/report-workspace.ts";
import type { SessionBinding } from "../../sessions/session-bindings.ts";

// The repository row a brief is built for.
type Repository = {
  id: string;
  sandbox?: { allowCommands?: string[][] };
  [key: string]: unknown;
};
// Where a chat worker's report command reports to.
type CliReport = { worktree: string; token: string | null; workspace: string };
// A binding with the report its session made.
type Reported = SessionBinding & { report?: { kind: string; commit?: string } };

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const as = (slot: string) => ({ caller: { sessionKey: "dashboard:" + slot } });

async function setup(t: TestContext) {
  const dir = temporaryDirectory("avoozl-report-command-"),
    store = reportWorkspace(t, dir);
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
const bare = (command: string, cwd: string) =>
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
let gitPath: string | undefined;

// The two commands a chat brief gives: prepare the worktree, then report.
const commandsOf = (steps: string[]) => {
  const text = steps.join("\n");
  return {
    prepare: /`([^`]+ worktree prepare [^`]+)`/.exec(text)?.[1],
    report: /run exactly: (.+ runner report [^\n]+)/.exec(text)?.[1],
  };
};

// `localSteps` as a copy of Avoozl gives it: this checkout's, or the built
// app package's, which Kiro Crew installs without a checkout around it.
async function runsWithEmptyPath(
  t: TestContext,
  steps: (
    repository: Repository,
    cliReport: CliReport,
  ) => string[] | Promise<string[]>,
) {
  const w = await setup(t),
    repository = found(w.store.get<Repository>("repositories", "app")),
    token = issueReportToken(w.store, { taskId: "a", attempt: 1 }),
    cliReport = { worktree: "/unused", token, workspace: w.dir },
    given = commandsOf(await steps(repository, cliReport));
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
  const report = found(
    w.store.get<Reported>("session_bindings", "chat")?.report,
    "the report",
  );
  assert.equal(report.kind, "done");
  assert.equal(report.commit, git(tree, "rev-parse", "HEAD"));
}

test("the report command runs with no node or avoozl on PATH against the source checkout", async (t) => {
  const { localSteps } = await import("../../delivery/delivery.ts");
  await runsWithEmptyPath(t, (repository, cliReport) =>
    localSteps({ id: "a" }, repository, { cliReport }),
  );
});

test("the report command runs with no node or avoozl on PATH against the built app package", async (t) => {
  const lib = path.join(root, "hosts", "kirocrew", "bin", "lib");
  assert.ok(fs.existsSync(lib), "npm run build makes bin/lib");
  const built = await import(
    pathToFileURL(path.join(lib, "src", "app", "delivery", "delivery.mjs")).href
  );
  await runsWithEmptyPath(t, (repository, cliReport) =>
    built.localSteps({ id: "a" }, repository, { cliReport }),
  );
});

test("the command is quoted for the shell it runs in", () => {
  assert.equal(shellQuote("a b'c", "linux"), `'a b'\\''c'`);
  assert.equal(shellQuote('C:\\x y\\"z', "win32"), '"C:\\x y\\\\"z"');
  assert.ok(cliCommand().startsWith(shellQuote(process.execPath)));
  assert.ok(cliCommand().endsWith(shellQuote(path.join(root, "cli.ts"))));
});

test("no chat worker brief in the pair table names an MCP tool", async (t) => {
  const w = await setup(t),
    { workerBrief, localSteps } = await import("../../delivery/delivery.ts"),
    token = issueReportToken(w.store, { taskId: "a", attempt: 1 }),
    repository = found(w.store.get<Repository>("repositories", "app")),
    task = w.store.read().tasks[0],
    cliReport = { worktree: "/tmp/wt", token, workspace: w.dir },
    seen: string[] = [];
  for (const kind of KINDS) {
    const { cell } = briefCell("kirocrew", kind);
    // KINDS is single and round: a task's steps, or the round's closing line.
    const text =
      kind === "single"
        ? workerBrief(task, repository, {
            attempt: 1,
            steps: found(cell.steps)({ task, repository, cliReport }),
          })
        : found(cell.finish);
    seen.push(kind);
    assert.doesNotMatch(text, /plans_/, `kirocrew ${kind}`);
    assert.doesNotMatch(text, /(^|\s)avoozl runner/, `kirocrew ${kind}`);
  }
  assert.deepEqual(seen, [...KINDS]);
  assert.deepEqual(EXECUTORS.length, 2);
  // The pieces the brief is built from, too.
  assert.doesNotMatch(
    localSteps({ id: "a" }, repository, { cliReport }).join("\n"),
    /plans_/,
  );
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
  const out = await w.ops.execute<{ report: { kind: string } }>(
    "session.report",
    { taskId: "a", kind: "blocked", text: "Need a key." },
    undefined,
    as("opened"),
  );
  assert.equal(out.report.kind, "blocked");
});
