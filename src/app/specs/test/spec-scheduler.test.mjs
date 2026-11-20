// Task 41.1: the scheduler for spec drivers. Unblock ranking, repository-wide
// path holds and the branch-only release rule (R102.3). Workspaces are
// scratch copies.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../api/operations.mjs";
import { Store } from "../../store/store.mjs";
import { branchOnly, scheduleReady } from "../spec-scheduler.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "app",
  ...extra,
});

const ids = (tasks) => tasks.map((task) => task.id);

test("ranking: more unblocked first within a rank; pins and ranks stay first", () => {
  const tasks = [
      leaf("pin2"),
      leaf("pin1"),
      leaf("urgent", { rank: 1 }),
      leaf("few"),
      leaf("many"),
      leaf("x"),
      leaf("y"),
      leaf("z"),
    ],
    data = {
      ...snapshot(),
      tasks,
      edges: [
        { from: "many", to: "x", kind: "requires" },
        { from: "x", to: "y", kind: "requires" },
        { from: "few", to: "z", kind: "sequence" },
        { from: "pin1", to: "z", kind: "requires" },
        { from: "pin1", to: "y", kind: "requires" },
      ],
    };
  const { order, notes } = scheduleReady({
    data,
    candidates: tasks.slice(0, 5),
    pinned: new Set(["pin2", "pin1"]),
  });
  assert.deepEqual(order, ["pin2", "pin1", "urgent", "many", "few"]);
  assert.equal(notes.get("many"), "Next: unblocks 2 tasks.");
  assert.equal(notes.get("few"), "Next: unblocks 1 task.");
  assert.equal(notes.has("urgent"), false);
});

test("path holds are repository-wide, across specs, and the first by rank goes", () => {
  const running = leaf("running", { planId: "spec-a", paths: ["src/app"] }),
    tasks = [
      running,
      leaf("other-spec", { planId: "spec-b", paths: ["src/app/x.mjs"] }),
      leaf("other-repo", {
        planId: "spec-b",
        repository: "lib",
        paths: ["src/app/x.mjs"],
      }),
      leaf("no-paths", { planId: "spec-b" }),
      leaf("first", { planId: "spec-c", paths: ["docs/*.md"], rank: 1 }),
      leaf("second", { planId: "spec-d", paths: ["docs/guide.md"], rank: 2 }),
      leaf("apart", { planId: "spec-d", paths: ["test"] }),
    ],
    data = { ...snapshot(), tasks, edges: [] };
  const { order, held } = scheduleReady({
    data,
    candidates: tasks.slice(1),
    flight: [running],
  });
  assert.deepEqual(order, ["other-repo", "no-paths", "first", "apart"]);
  assert.equal(held.get("other-spec"), "Held: paths overlap running in app.");
  assert.equal(held.get("second"), "Held: paths overlap first in app.");
  // Nothing in flight and nothing ahead: nothing is held.
  assert.equal(scheduleReady({ data, candidates: [tasks[1]] }).held.size, 0);
});

test("a branch-only prerequisite releases only its own spec's work in its repository", () => {
  const onBranch = {
      commit: "a".repeat(40),
      into: "avoozl/spec-a/work",
      branch: "avoozl/a",
    },
    tasks = [
      leaf("verified", {
        planId: "spec-a",
        status: "accepted",
        integration: onBranch,
      }),
      leaf("landed", {
        planId: "spec-a",
        status: "accepted",
        integration: { ...onBranch, into: "main" },
      }),
      leaf("same-spec", { planId: "spec-a" }),
      leaf("cross-spec", { planId: "spec-b" }),
      leaf("cross-repo", { planId: "spec-a", repository: "lib" }),
      leaf("after-landed", { planId: "spec-b" }),
    ],
    edges = [
      { from: "verified", to: "same-spec", kind: "requires" },
      { from: "verified", to: "cross-spec", kind: "requires" },
      { from: "verified", to: "cross-repo", kind: "sequence" },
      { from: "landed", to: "after-landed", kind: "requires" },
    ];
  assert.equal(branchOnly(tasks[0], "main"), true);
  assert.equal(branchOnly(tasks[1], "main"), false);
  assert.equal(branchOnly(tasks[0], "avoozl/spec-a/work"), false);
  const { order, held } = scheduleReady({
    data: { ...snapshot(), tasks, edges },
    candidates: tasks.slice(2),
  });
  assert.deepEqual(order, ["same-spec", "after-landed"]);
  assert.match(held.get("cross-spec"), /Waits for verified to land/);
  assert.match(held.get("cross-repo"), /Waits for verified to land/);
});

// A workspace with a real checkout `app`, a tick-run delivery policy and
// the given tasks.
function workspace(t, { tasks, edges = [] }) {
  const root = temporaryDirectory("avoozl-scheduler-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  const git = (...args) => execFileSync("git", args, { cwd: checkout });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git("add", ".");
  git("commit", "-q", "-m", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize({ ...snapshot(), tasks, edges });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, lanes: { local: 4 }, delivery: {} }),
  );
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

const dispatched = async (ops) =>
  (await ops.execute("workspace.tick", { sessions: [] })).dispatch.map(
    (d) => d.task,
  );

test("the tick holds overlapping work behind a task in flight, then releases it", async (t) => {
  const { store, ops } = workspace(t, {
    tasks: [
      leaf("busy", { planId: "spec-a", paths: ["src/app"] }),
      leaf("clash", { planId: "spec-b", paths: ["src/app/x.mjs"] }),
      leaf("free", { planId: "spec-b", paths: ["docs"] }),
    ],
  });
  // `busy` is in flight: a delivery record claims it.
  store.put("task_deliveries", {
    taskId: "busy",
    state: "running",
    attempts: [],
  });
  assert.deepEqual(await dispatched(ops), ["free"]);
  store.mutate("Finish busy", (data) => {
    data.tasks.find((task) => task.id === "busy").status = "accepted";
  });
  assert.deepEqual((await dispatched(ops)).sort(), ["clash", "free"]);
});

test("the tick dispatches the leaf that unblocks more first, within a rank", async (t) => {
  const { ops } = workspace(t, {
    tasks: [
      leaf("few"),
      leaf("many"),
      leaf("x"),
      leaf("y"),
      leaf("top", { rank: 1 }),
    ],
    edges: [
      { from: "many", to: "x", kind: "requires" },
      { from: "many", to: "y", kind: "requires" },
    ],
  });
  assert.deepEqual(await dispatched(ops), ["top", "many", "few"]);
});
