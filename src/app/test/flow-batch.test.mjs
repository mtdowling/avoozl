// Task 61.1 (R108, §4.37; the run is 12.8, R46.5–R46.7): the planner's
// batch groups run as one handoff once every open member is ready; a group
// that breaks a rule in code runs alone with the reason; checks once on the
// head; one rebase; a failing batch splits at no attempt cost.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { checkRuns, drainCheckRuns } from "../check-runs.mjs";
import { FLOW_DEFAULTS, FLOW_KEYS, flowSection, listSpans } from "../flow.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const REASON = "Tiny edits to README.md";
// A planner group as approval stores it on each member.
const group = (id, tasks, reason = REASON) => ({ id, tasks, reason });
const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "app",
  planId: "p1",
  planHash: "h1",
  ...extra,
});
const grouped = (ids, extra = {}) =>
  ids.map((id) => leaf(id, { batch: group("g1", ids), ...extra }));

function setup(t, tasks, { flow, routing, placement, edges = [] } = {}) {
  const root = temporaryDirectory("avoozl-batch-"),
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
  store.importSnapshot({ ...snapshot(), tasks, edges });
  // The spec revision the groups came from was approved by a person.
  store.put("approvals", { id: "approval-1", planId: "p1", hash: "h1" });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    checks: [["git", "status"]],
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      delivery: { concurrency: 1, retries: 1 },
      ...(flow ? { flow } : {}),
      ...(routing ? { routing } : {}),
    }),
  );
  return {
    root,
    store,
    ops: new Operations(store, {
      workspaceRoot: root,
      ...(placement ? { placement } : {}),
    }),
  };
}

const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });
const tick = (ops, slots = []) =>
  ops.execute("workspace.tick", {
    sessions: slots.map((target) => ({ target, status: "idle" })),
  });
const workersOf = (result) =>
  result.dispatch.filter((d) => d.role === "worker");

async function runBatch(ops, dispatch, slot, whileRunning = async () => {}) {
  await ops.execute("session.bind", {
    taskId: dispatch.task,
    slot,
    role: "worker",
    attempt: dispatch.attempt,
    source: "tick",
    title: dispatch.title,
    batch: dispatch.batch,
  });
  await whileRunning();
  const { path: worktree } = await ops.execute("worktree.prepare", {
    taskId: dispatch.task,
  });
  const commits = [];
  for (const id of dispatch.batch.tasks) {
    fs.writeFileSync(path.join(worktree, id + ".txt"), id + "\n");
    git(worktree, "add", ".");
    git(worktree, "commit", "-m", "Do " + id);
    const commit = git(worktree, "rev-parse", "HEAD");
    commits.push(commit);
    await ops.execute(
      "session.report",
      { taskId: id, kind: "done", commit },
      undefined,
      as(slot),
    );
  }
  return commits;
}

test("a planner group runs as one handoff: one session, checks once on the head, one integration", async (t) => {
  const { root, store, ops } = setup(
    t,
    [
      ...grouped(["a1", "a2", "a3"]),
      leaf("b1"),
      // c1 and c2 are a group; c2 waits on x, which is deferred.
      leaf("c1", { batch: group("g2", ["c1", "c2"]) }),
      leaf("c2", { batch: group("g2", ["c1", "c2"]) }),
      leaf("x", { status: "deferred" }),
    ],
    { edges: [{ from: "x", to: "c2", kind: "requires" }] },
  );
  const first = await tick(ops);
  const workers = workersOf(first);
  assert.equal(workers.length, 1, "one slot");
  assert.deepEqual(workers[0].batch.tasks, ["a1", "a2", "a3"]);
  assert.equal(workers[0].batch.reason, REASON);
  assert.equal(workers[0].batch.by, "planner");
  assert.match(workers[0].brief, /one commit per task/);
  assert.match(workers[0].brief, /Why together: Tiny edits to README\.md/);
  const commits = await runBatch(ops, workers[0], "w-batch", async () => {
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      JSON.stringify({ version: 1, delivery: { concurrency: 3, retries: 1 } }),
    );
    const running = await ops.execute("workspace.tick", {
      sessions: [{ target: "w-batch", status: "working" }],
    });
    // c1 is ready but waits for c2, so no slot runs it alone.
    assert.deepEqual(
      workersOf(running).map((d) => d.task),
      ["b1"],
    );
  });
  const view = await ops.execute("delivery.view", {});
  const a2 = view.items.find((i) => i.id === "a2");
  assert.deepEqual(a2.batchGroup, {
    id: workers[0].batch.id,
    group: "g1",
    tasks: ["a1", "a2", "a3"],
    leader: "a1",
    reason: REASON,
    state: "running",
  });
  assert.equal(a2.alone, null);
  const second = await tick(ops, ["w-batch"]);
  assert.deepEqual(
    second.dispatch.filter((d) => d.role === "verifier"),
    [],
    "a command-only bar opens no verifier chat",
  );
  assert.deepEqual(
    checkRuns(store).map((r) => [r.taskId, r.commit]),
    [["a3", commits[2]]],
    "checks once, on the head",
  );
  await drainCheckRuns(store);
  await tick(ops, ["w-batch"]);
  const integrated = ["a1", "a2", "a3"].map(
    (id) => store.read().tasks.find((x) => x.id === id).integration?.commit,
  );
  assert.deepEqual(integrated, commits, "each task keeps its own commit");
  assert.equal(
    store.get("flow_batches", workers[0].batch.id).state,
    "integrated",
  );
  assert.equal(store.get("flow_batches", workers[0].batch.id).reason, REASON);
  const done = await ops.execute("delivery.view", {});
  assert.equal(
    done.items.find((i) => i.id === "a2").batch,
    workers[0].batch.id,
  );
  for (const id of ["a1", "a2", "a3"])
    assert.ok(
      listSpans(store, { taskId: id }).some(
        (s) => s.role === "worker" && s.batchId === workers[0].batch.id,
      ),
      id,
    );
});

test("a failing batch head splits the batch; each task retries alone at no attempt cost", async (t) => {
  const { store, ops } = setup(t, grouped(["a1", "a2"]));
  const [batch] = (await tick(ops)).dispatch;
  const commits = await runBatch(ops, batch, "w-batch");
  await tick(ops, ["w-batch"]);
  await ops.execute("session.bind", {
    taskId: "a2",
    slot: "v1",
    role: "verifier",
    attempt: 1,
    source: "tick",
    commit: commits[1],
  });
  await ops.execute(
    "session.report",
    {
      taskId: "a2",
      kind: "done",
      commit: commits[1],
      checks: [{ command: "git status", exitCode: 1 }],
    },
    undefined,
    as("v1"),
  );
  const after = await tick(ops, ["w-batch", "v1"]);
  for (const id of ["a1", "a2"]) {
    const delivery = store.get("task_deliveries", id);
    assert.equal(delivery.state, "failed", id);
    assert.equal(delivery.batchSplit, true);
    assert.equal(
      delivery.attempts.filter((a) => a.outcome === "failed").length,
      0,
      "no attempt counts",
    );
  }
  const retried = workersOf(after);
  assert.equal(retried.length, 1);
  assert.equal(
    retried[0].batch,
    undefined,
    "never batched again in this delivery",
  );
  assert.equal(retried[0].attempt, 2);
  const view = await ops.execute("delivery.view", {});
  assert.equal(
    view.items.find((i) => i.id === "a2").alone,
    "the batch was split after it failed",
  );
});

// Each rule (R108.5): the group runs as single tasks, and the task shows why.
const RULES = [
  {
    name: "an edge joins two members",
    tasks: grouped(["a1", "a2"]),
    edges: [{ from: "a1", to: "a2", kind: "requires" }],
    reason: "a2 waits on a1",
  },
  {
    name: "members are in different repositories",
    tasks: [
      leaf("a1", { batch: group("g1", ["a1", "a2"]) }),
      leaf("a2", { batch: group("g1", ["a1", "a2"]), repository: "other" }),
    ],
    reason: "its tasks are in different repositories",
  },
  {
    name: "the group is not from an approved revision",
    tasks: grouped(["a1", "a2"], { planHash: "h2" }),
    reason: "the group is not from the approved spec revision",
  },
  {
    name: "a member stores a different group",
    tasks: [
      leaf("a1", { batch: group("g1", ["a1", "a2"]) }),
      leaf("a2", { batch: group("g1", ["a2", "a3"]) }),
      leaf("a3"),
    ],
    reason: "the group changed; it runs alone until the spec is approved again",
  },
  {
    name: "more than the fixed bound",
    tasks: grouped(["a1", "a2", "a3", "a4", "a5", "a6"]),
    reason: "more than 5 tasks",
  },
  {
    name: "a member is a manual step",
    tasks: [
      leaf("a1", { batch: group("g1", ["a1", "a2"]) }),
      leaf("a2", {
        batch: group("g1", ["a1", "a2"]),
        manual: true,
        completion: "person",
      }),
    ],
    reason: "a2 is not a local automatic leaf",
  },
];

for (const rule of RULES)
  test(`a group runs alone with its reason when ${rule.name}`, async (t) => {
    const { ops } = setup(t, rule.tasks, { edges: rule.edges || [] });
    const workers = workersOf(await tick(ops));
    assert.equal(workers.length, 1);
    assert.equal(workers[0].task, "a1");
    assert.equal(workers[0].batch, undefined, "dispatched as a single task");
    const view = await ops.execute("delivery.view", {});
    assert.equal(view.items.find((i) => i.id === "a1").alone, rule.reason);
  });

test("a member that already ran alone keeps the rest of its group alone", async (t) => {
  const { store, ops } = setup(t, grouped(["a1", "a2"]));
  store.put("task_deliveries", {
    id: "a2",
    taskId: "a2",
    state: "failed",
    attempts: [{ attempt: 1, outcome: "failed" }],
  });
  const workers = workersOf(await tick(ops));
  assert.equal(workers[0].task, "a1");
  assert.equal(workers[0].batch, undefined);
  const view = await ops.execute("delivery.view", {});
  assert.equal(
    view.items.find((i) => i.id === "a1").alone,
    "a2 already ran alone",
  );
});

test("batching has no setting, and an old flow.batch is ignored", async (t) => {
  assert.deepEqual(
    Object.keys(FLOW_KEYS).filter((key) => key.startsWith("batch")),
    [],
  );
  assert.equal("batch" in FLOW_DEFAULTS, false);
  assert.deepEqual(flowSection({ batch: { max: 9, by: "epic" } }), {});
  // An old file with flow.batch loads, and the planner's group still runs.
  const { ops } = setup(t, grouped(["a1", "a2"]), {
    flow: { batch: { max: 1, by: "epic" }, localChecksFirst: true },
  });
  const workers = workersOf(await tick(ops));
  assert.deepEqual(workers[0].batch.tasks, ["a1", "a2"]);
  const settings = await ops.execute("flow.settings.get", {});
  // A save that still carries the old key never fails.
  const saved = await ops.execute("flow.settings.update", {
    flow: { ...settings.flow, localChecksFirst: false },
    expectedHash: settings.hash,
  });
  assert.equal(saved.flow.localChecksFirst, false);
  await tick(ops);
});
