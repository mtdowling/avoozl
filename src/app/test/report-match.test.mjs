import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  cliReportCaller,
  issueReportToken,
  matchCliReport,
  reportByToken,
} from "../report-match.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const leaf = (id) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "app",
});

// Two leaves, each with a real worktree and a bound session.
async function setup(t) {
  const root = temporaryDirectory("avoozl-report-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: [leaf("a"), leaf("b")],
    edges: [],
  });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
  });
  const ops = new Operations(store, { workspaceRoot: root }),
    paths = {};
  for (const id of ["a", "b"]) {
    paths[id] = (await ops.execute("worktree.prepare", { taskId: id })).path;
    await ops.execute("session.bind", {
      taskId: id,
      slot: `slot-${id}`,
      attempt: 1,
      source: "tick",
      title: `avoozl:${id} Task ${id}`,
    });
  }
  return { store, ops, paths };
}

test("a token matches its task from the worktree or a folder below it", async (t) => {
  const { store, paths } = await setup(t),
    token = issueReportToken(store, { taskId: "a", attempt: 1 });
  fs.mkdirSync(path.join(paths.a, "sub"));
  for (const cwd of [paths.a, path.join(paths.a, "sub")])
    assert.equal(
      matchCliReport(store, { taskId: "a", token, cwd }).slot,
      "slot-a",
    );
});

test("wrong, malformed, other-task and replaced tokens get 403 and never echo the token", async (t) => {
  const { store, ops, paths } = await setup(t),
    token = issueReportToken(store, { taskId: "a", attempt: 1 }),
    tokenB = issueReportToken(store, { taskId: "b", attempt: 1 }),
    refuse = (input, pattern) =>
      assert.throws(
        () => matchCliReport(store, { cwd: paths.a, ...input }),
        (e) =>
          e.status === 403 &&
          pattern.test(e.message) &&
          !e.message.includes(token),
      );
  refuse({ taskId: "a", token: "0".repeat(48) }, /does not match/);
  refuse({ taskId: "a", token: "nope" }, /malformed/);
  refuse({ taskId: "a" }, /malformed/);
  refuse({ taskId: "a", token: tokenB }, /does not match/);
  // A new attempt replaces the token.
  await ops.execute("session.bind", {
    taskId: "a",
    slot: "slot-a2",
    attempt: 2,
    source: "tick",
    title: "avoozl:a Task a",
  });
  refuse({ taskId: "a", token }, /does not match/);
  assert.equal(
    matchCliReport(store, {
      taskId: "a",
      token: issueReportToken(store, { taskId: "a", attempt: 2 }),
      cwd: paths.a,
    }).slot,
    "slot-a2",
  );
});

test("a report from another task's worktree, a symlink out, or a missing folder gets 403", async (t) => {
  const { store, paths } = await setup(t),
    token = issueReportToken(store, { taskId: "a", attempt: 1 }),
    link = path.join(paths.a, "escape");
  fs.symlinkSync(paths.b, link);
  for (const cwd of [paths.b, link, path.join(paths.a, "missing")])
    assert.throws(
      () => matchCliReport(store, { taskId: "a", token, cwd }),
      (e) => e.status === 403 && /worktree/.test(e.message),
    );
});

test("a matched report is accepted without MCP identity, an unmatched one is not", async (t) => {
  const { store, ops, paths } = await setup(t),
    token = issueReportToken(store, { taskId: "a", attempt: 1 }),
    progress = { taskId: "a", kind: "progress", text: "Halfway." };
  await assert.rejects(
    ops.execute("session.report", progress, undefined, {}),
    (e) => e.status === 403,
  );
  const binding = matchCliReport(store, { taskId: "a", token, cwd: paths.a }),
    done = await ops.execute("session.report", progress, undefined, {
      caller: cliReportCaller(binding),
    });
  assert.ok(done.report);
  // Task a's token cannot speak for task b.
  assert.throws(() =>
    matchCliReport(store, { taskId: "b", token, cwd: paths.b }),
  );
});

test("reportByToken reads the commit from HEAD and refuses a wrong token or worktree", async (t) => {
  const { store, ops, paths } = await setup(t),
    token = issueReportToken(store, { taskId: "a", attempt: 1 });
  await assert.rejects(
    reportByToken(store, ops, {
      taskId: "a",
      state: "done",
      token,
      cwd: paths.b,
    }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    reportByToken(store, ops, {
      taskId: "a",
      state: "done",
      token: "1".repeat(48),
      cwd: paths.a,
    }),
    (e) => e.status === 403,
  );
  fs.writeFileSync(path.join(paths.a, "x.txt"), "x\n");
  git(paths.a, "add", ".");
  git(
    paths.a,
    "-c",
    "user.name=T",
    "-c",
    "user.email=t@e.x",
    "commit",
    "-m",
    "Work",
  );
  const result = await reportByToken(store, ops, {
    taskId: "a",
    state: "done",
    token,
    cwd: paths.a,
  });
  assert.equal(result.report.commit, git(paths.a, "rev-parse", "HEAD"));
});
