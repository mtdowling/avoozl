// The worker edits and reports; Avoozl reads HEAD, checks, pushes and lands
// (Requirement 86.3, 96; design §4.26). Every name here is made up.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  EDIT_ONLY_STEP,
  localSteps,
  remoteSteps,
  workerBrief,
} from "../delivery.mjs";
import { batchBrief } from "../flow-batch.mjs";
import { Operations } from "../operations.mjs";
import { rolePrompt } from "../prompts.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const PROJECT = { id: "app", root: "/tmp/app", baseBranch: "main" };
const TASK = { id: "a", title: "Task a", acceptance: ["Works."] };

// An instruction to publish: push, open or edit a pull request, merge,
// auto-merge, label, comment, or wait on a pull request's checks.
const PUBLISH = [
  /git push/i,
  /\bgh (pr|issue|api)\b/i,
  /--auto\b/,
  /git merge/i,
  /\bpush (it|the|your|to)\b/i,
  /\bopen (one|a) pull request/i,
  /turn on auto-merge/i,
  /\bwait (on|for) (ci|checks|the pull request)/i,
];

function editsAndReportsOnly(text, label, { boundary = true } = {}) {
  if (boundary) assert.ok(text.includes(EDIT_ONLY_STEP), `${label}: boundary`);
  const rest = text.split(EDIT_ONLY_STEP).join("");
  for (const pattern of PUBLISH)
    assert.doesNotMatch(rest, pattern, `${label}: ${pattern}`);
  // The commit is read from the worktree, so the brief asks for none.
  assert.doesNotMatch(rest, /full SHA|"commit":/, `${label}: names no commit`);
}

test("worker briefs say edit, commit and report, never push, merge or comment", () => {
  editsAndReportsOnly(
    workerBrief(TASK, PROJECT, { attempt: 1 }) + "\n" + rolePrompt("worker"),
    "local",
  );
  editsAndReportsOnly(
    workerBrief(TASK, PROJECT, {
      attempt: 1,
      steps: localSteps(TASK, PROJECT, { relay: true }),
    }),
    "relay",
  );
  const data = { tasks: [TASK, { ...TASK, id: "b" }] };
  editsAndReportsOnly(
    batchBrief(null, data, {
      task: TASK,
      batch: { id: "x", tasks: ["a", "b"] },
    }),
    "batch",
  );
  // A hand-back crew's commit is fetched from its folder, so it names the
  // branch tip it left there.
  const handback = remoteSteps(TASK, {
    url: "https://git.example.test/app.git",
    base: "0".repeat(40),
    folder: "/work/app-a",
  }).join("\n");
  assert.ok(handback.includes(EDIT_ONLY_STEP));
  for (const pattern of PUBLISH)
    assert.doesNotMatch(handback.split(EDIT_ONLY_STEP).join(""), pattern);
  // The shipped standing rules carry no publishing step of their own.
  editsAndReportsOnly(rolePrompt("worker"), "worker.md", { boundary: false });
});

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function setup(t) {
  const root = temporaryDirectory("avoozl-boundary-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-q", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: [
      {
        ...TASK,
        kind: "leaf",
        scope: "catalog",
        status: "planned",
        epic: "sample",
        track: "catalog",
        tags: [],
        repository: "app",
      },
    ],
    edges: [],
  });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, delivery: { concurrency: 2 } }),
  );
  return { store, ops: new Operations(store, { workspaceRoot: root }) };
}

const as = { caller: { sessionKey: "dashboard:w-1" } };

test("a local worker's done is HEAD of its worktree, never the reported commit", async (t) => {
  const { store, ops } = setup(t);
  await ops.execute("session.bind", {
    taskId: "a",
    slot: "w-1",
    role: "worker",
    attempt: 1,
    source: "tick",
    title: "avoozl:a worker",
  });
  const { path: worktree } = await ops.execute("worktree.prepare", {
    taskId: "a",
  });
  const base = git(worktree, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(worktree, "a.txt"), "work\n");
  git(worktree, "add", ".");
  git(worktree, "commit", "-qm", "Work a");
  const head = git(worktree, "rev-parse", "HEAD");
  // A report naming another commit is refused, and nothing is recorded.
  await assert.rejects(
    ops.execute(
      "session.report",
      { taskId: "a", kind: "done", commit: base },
      undefined,
      as,
    ),
    (error) => error.status === 409 && error.message.includes(head),
  );
  assert.equal(store.get("session_bindings", "w-1").report, undefined);
  // A done with no commit takes HEAD from the worktree.
  await ops.execute(
    "session.report",
    { taskId: "a", kind: "done" },
    undefined,
    as,
  );
  assert.equal(store.get("session_bindings", "w-1").report.commit, head);
});
