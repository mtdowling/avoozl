// A tick on the base branch completes the task (Requirement 113).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { lintSpec } from "../spec-plans.mjs";
import { ticksOf } from "../spec-ticks.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";

async function setup(t) {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root }),
    git = (...args) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(),
    directory = writeSpec(root, "config"),
    tasksFile = path.join(directory, "tasks.md"),
    original = fs.readFileSync(tasksFile, "utf8");
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  await ops.execute("plan.create", { spec: "config" });
  const preview = await ops.execute("plan.preview", { id: "config" });
  await ops.execute("plan.approve", {
    id: "config",
    expectedHash: preview.reviewedHash,
    expectedRevision: preview.expectedRevision,
    approvedBy: "owner",
  });
  // The approval is the commit that adds the spec.
  const tick = (...keys) => {
    let text = fs.readFileSync(tasksFile, "utf8");
    for (const key of keys)
      text = text.replace(`- [ ] ${key} `, `- [x] ${key} `);
    fs.writeFileSync(tasksFile, text);
  };
  const commit = (message) => {
    git("add", ".kiro");
    git("commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  const task = (id) => store.read().tasks.find((row) => row.id === id);
  return {
    root,
    store,
    ops,
    git,
    tick,
    commit,
    task,
    original,
    tasksFile,
    hash: () => store.get("plans", "config").hash,
  };
}

test("a tick on main completes the task with no re-approval and an unchanged hash", async (t) => {
  const { ops, store, tick, commit, task, hash, tasksFile, original } =
      await setup(t),
    before = hash(),
    approvals = store.list("approvals").length;
  await ops.applyBaseTicks();
  assert.equal(task("config.1.1").status, "planned");
  tick("1.1");
  const sha = commit("Tick 1.1");
  await ops.applyBaseTicks();
  const row = task("config.1.1");
  assert.equal(row.status, "accepted");
  assert.equal(row.integration.commit, sha, "the landing commit is the tick's");
  assert.equal(row.acceptanceEvidence.baseline.commit, sha);
  assert.match(row.acceptanceEvidence.evidence, /marks 1\.1 \[x\] on main/);
  assert.equal(task("config.1.2").status, "planned", "only the ticked task");
  assert.equal(hash(), before, "a tick is not a new revision");
  assert.equal(store.list("approvals").length, approvals);
  assert.equal(
    ops.readSpec("config").hash,
    before,
    "the folder hashes the same",
  );
  assert.notEqual(fs.readFileSync(tasksFile, "utf8"), original);
  const line = (await ops.execute("activity.list", {})).items.find(
    (item) => item.kind === "task.ticked",
  );
  assert.match(line.summary, /config\.1\.1 is done: ticked .* on main/);
});

test("a tick off the base branch, or not committed, does nothing", async (t) => {
  const { ops, git, tick, commit, task, tasksFile } = await setup(t);
  tick("1.1");
  await ops.applyBaseTicks();
  assert.equal(task("config.1.1").status, "planned", "an unsaved edit");
  git("checkout", "-q", "-b", "work");
  commit("Tick 1.1 on a branch");
  await ops.applyBaseTicks();
  assert.equal(task("config.1.1").status, "planned", "a worker branch");
  git("checkout", "-q", "main");
  assert.ok(!fs.readFileSync(tasksFile, "utf8").includes("[x] 1.1"));
  git("merge", "-q", "--no-edit", "work");
  await ops.applyBaseTicks();
  assert.equal(task("config.1.1").status, "accepted", "once it is on main");
});

test("[~] and [-] marks do not complete a task", async (t) => {
  const { ops, tick, commit, task, tasksFile } = await setup(t);
  tick();
  fs.writeFileSync(
    tasksFile,
    fs
      .readFileSync(tasksFile, "utf8")
      .replace("- [ ] 1.1 ", "- [~] 1.1 ")
      .replace("- [ ] 1.2 ", "- [-] 1.2 "),
  );
  commit("Queue and run");
  await ops.applyBaseTicks();
  assert.equal(task("config.1.1").status, "planned");
  assert.equal(task("config.1.2").status, "planned");
});

test("a tick of an in-flight task releases its worker session", async (t) => {
  const { ops, store, tick, commit, task } = await setup(t);
  await ops.execute("session.bind", { taskId: "config.1.1", slot: "slot-1" });
  await ops.execute("session.status", { slot: "slot-1", status: "working" });
  tick("1.1");
  commit("Tick 1.1");
  await ops.applyBaseTicks();
  assert.equal(task("config.1.1").status, "accepted", "done wins");
  assert.equal(store.get("session_bindings", "slot-1").status, "closed");
  const kinds = (await ops.execute("activity.list", {})).items.map(
    (item) => item.kind,
  );
  assert.ok(kinds.includes("worker.released"));
});

test("a ticked parent completes its open sub-tasks", async (t) => {
  const { ops, tick, commit, task } = await setup(t);
  tick("1");
  commit("Tick the parent");
  await ops.applyBaseTicks();
  for (const id of ["config.1", "config.1.1", "config.1.2"])
    assert.equal(task(id).status, "accepted", id);
});

test("an untick of a done task waits in Needs you; Keep done and Reopen settle it", async (t) => {
  const { ops, tick, commit, task, tasksFile } = await setup(t);
  tick("1.1", "1.2");
  commit("Tick both");
  await ops.applyBaseTicks();
  fs.writeFileSync(
    tasksFile,
    fs
      .readFileSync(tasksFile, "utf8")
      .replace("- [x] 1.1 ", "- [ ] 1.1 ")
      .replace("- [x] 1.2 ", "- [ ] 1.2 "),
  );
  commit("Untick both");
  await ops.applyBaseTicks();
  assert.equal(task("config.1.1").status, "accepted", "not reopened silently");
  const items = () =>
    ops
      .execute("conflicts.view", {})
      .then((view) => view.items.filter((item) => item.kind === "untick"));
  assert.deepEqual((await items()).map((item) => item.taskId).sort(), [
    "config.1.1",
    "config.1.2",
  ]);
  const settle = (action, taskId) =>
    ops.execute(
      "conflicts.settle",
      { action, items: [{ taskId }] },
      ops.read().revision,
    );
  await settle("keep", "config.1.1");
  assert.equal(task("config.1.1").status, "accepted");
  assert.equal(task("config.1.1").untick, undefined);
  await settle("reopen", "config.1.2");
  assert.equal(task("config.1.2").status, "planned");
  assert.equal(task("config.1.2").acceptanceEvidence, undefined);
  assert.deepEqual(await items(), []);
  // Settled for good: reading the same branch again raises nothing.
  await ops.applyBaseTicks();
  assert.deepEqual(await items(), []);
});

test("lint names a ticked item that has no task ID", () => {
  const { diagnostics } = lintSpec({
    spec: {
      name: "config",
      exists: true,
      folder: ".kiro/specs/config/",
      files: {
        "requirements.md": "# R\n",
        "design.md": "# D\n",
        "tasks.md": "# Tasks\n\n- [x] Write tests\n",
      },
    },
    plan: { id: "config" },
  });
  const found = diagnostics.find((d) => d.code === "task.ticked-unknown-id");
  assert.equal(found.file, "tasks.md");
  assert.equal(found.lineStart, 3);
  assert.equal(found.severity, "error");
});

test("ticksOf reads [x] only, with sub-items of a ticked parent", () => {
  const { ticked, present } = ticksOf(
    "s",
    [
      "- [x] 1 P",
      "  - [ ] 1.1 A",
      "- [~] 2 Q",
      "  - [x] 2.1 B",
      "- [-] 3 R",
    ].join("\n"),
  );
  assert.deepEqual([...ticked.keys()].sort(), ["s.1", "s.1.1", "s.2.1"]);
  assert.equal(present.size, 5);
});
