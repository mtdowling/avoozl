// The served-model gate (design §5.2, R36.3, R36.4): a review verdict counts
// only when Kiro Crew's session rows show the reviewer ran on a named model
// other than the writer's. Fake roster rows only: each case reports the
// model_requested, served_model, model_withheld and model_changed fields a
// newer Kiro Crew adds, or leaves them out as an older one does.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { deliveryView } from "../page-views.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const CHECK = "scripts/validate.sh";
const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });

function setup(t) {
  const root = temporaryDirectory("avoozl-served-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout, { recursive: true });
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "a.txt"), "a\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: [
      {
        id: "w1",
        title: "Task w1",
        kind: "leaf",
        scope: "catalog",
        status: "planned",
        epic: "sample",
        track: "catalog",
        tags: [],
        acceptance: ["Works."],
        checks: [CHECK],
        repository: "app",
      },
    ],
    edges: [],
  });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync(checkout),
    baseBranch: "main",
    checks: [["git", "status"]],
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      delivery: {
        concurrency: 1,
        retries: 2,
        model: "fake-a",
        reviewers: [
          {
            id: "conventions",
            focus: "conventions",
            agent: "avoozl-reviewer",
            model: "fake-b",
          },
        ],
      },
    }),
  );
  return { store, ops: new Operations(store, { workspaceRoot: root }) };
}

// One round: the writer reports, the checks and review sessions open, both
// approve (or the review asks for changes), and the cron ticks with `rows`
// (slot -> extra roster fields) and `status` (slot -> status).
async function round(t, { rows = {}, status = {}, verdict = "approved" } = {}) {
  const { store, ops } = setup(t),
    slots = [];
  const tick = () =>
    ops.execute("workspace.tick", {
      sessions: slots.map((target) => ({
        target,
        status: status[target] ?? "idle",
        ...(rows[target] || {}),
      })),
    });
  const bind = async (slot, role, extra) => {
    slots.push(slot);
    await ops.execute("session.bind", {
      taskId: "w1",
      slot,
      role,
      attempt: 1,
      source: "tick",
      title: `avoozl:w1 ${role}`,
      ...extra,
    });
  };
  const report = (slot, input) =>
    ops.execute(
      "session.report",
      { kind: "done", taskId: "w1", ...input },
      undefined,
      as(slot),
    );
  await tick();
  await bind("w", "worker", { model: "fake-a" });
  const { path: worktree } = await ops.execute("worktree.prepare", {
    taskId: "w1",
  });
  fs.writeFileSync(path.join(worktree, "a.txt"), "a1\n");
  git(worktree, "commit", "-am", "Work");
  const commit = git(worktree, "rev-parse", "HEAD");
  await report("w", { commit });
  await tick();
  await bind("v", "verifier", { commit });
  await bind("r", "review:conventions", { model: "fake-b", commit });
  await report("v", { commit, checks: [{ command: CHECK, exitCode: 0 }] });
  await report("r", {
    commit,
    verdict,
    ...(verdict === "approved"
      ? {}
      : {
          findings: [
            { id: "F1", kind: "defect", paths: ["a.txt"], text: "Wrong." },
          ],
        }),
  });
  const result = await tick();
  return { store, ops, tick, result, status, rows };
}

const served = (model, extra = {}) => ({
  model_requested: null,
  served_model: model,
  model_withheld: false,
  model_changed: false,
  ...extra,
});
const writerA = { w: served("fake-a", { model_requested: "fake-a" }) };
const review = (row) => ({ r: { ...row, model_requested: "fake-b" } });
const verdictOf = (store) =>
  store.get("task_deliveries", "w1").verifications.find((v) => v.role);

for (const [name, rows, cause] of [
  [
    "served model unknown",
    { ...writerA, ...review(served(null)) },
    /reports its served model as unknown/,
  ],
  [
    "served model auto",
    { ...writerA, ...review(served("auto")) },
    /served model as auto/,
  ],
  [
    "a model Kiro Crew does not offer (withheld, ran auto)",
    { ...writerA, ...review(served("auto", { model_withheld: true })) },
    /withheld the requested model fake-b and ran auto/,
  ],
  [
    "a model changed mid-session",
    { ...writerA, ...review(served("fake-c", { model_changed: true })) },
    /changed its model mid-session \(last fake-c\)/,
  ],
  [
    "the writer's served model",
    { ...writerA, ...review(served("fake-a")) },
    /ran on the writer's model fake-a/,
  ],
  [
    "a writer whose served model is unknown",
    {
      w: served(null, { model_requested: "fake-a" }),
      ...review(served("fake-b")),
    },
    /the writer: Kiro Crew reports its served model as unknown/,
  ],
  [
    "a writer that fell back to the reviewer's model",
    {
      w: served("fake-b", { model_changed: true }),
      ...review(served("fake-b")),
    },
    /the writer: Kiro Crew changed its model/,
  ],
  [
    "the writer's requested model when the writer reports none",
    review(served("fake-a")),
    /ran on the writer's model fake-a/,
  ],
])
  test(`a review verdict from ${name} is refused with a decision`, async (t) => {
    const { store, result } = await round(t, { rows });
    const delivery = store.get("task_deliveries", "w1");
    assert.equal(delivery.state, "decision", "the gate stays shut");
    assert.match(delivery.cause, cause);
    assert.equal(delivery.attempts.length, 1);
    assert.equal(
      delivery.attempts[0].outcome,
      "done",
      "no writer attempt spent",
    );
    assert.equal(verdictOf(store).outcome, "refused");
    assert.equal(verdictOf(store).verdict, "approved");
    const notice = result.notify.find(
      (n) => n.title === "Avoozl refused review conventions on w1",
    );
    assert.equal(notice?.channel, "decision");
    assert.ok(
      !result.notify.some((n) => n.title.startsWith("Avoozl stopped")),
      "one notice, not a failure too",
    );
    assert.deepEqual(
      result.dispatch.filter((d) => d.task === "w1"),
      [],
      "no new session",
    );
  });

test("a refused changes-requested verdict spends no writer attempt and leaves no finding", async (t) => {
  const { store } = await round(t, {
    rows: { ...writerA, ...review(served("auto", { model_withheld: true })) },
    verdict: "changes-requested",
  });
  const delivery = store.get("task_deliveries", "w1");
  assert.equal(delivery.state, "decision");
  assert.equal(delivery.attempts[0].outcome, "done");
  assert.equal(verdictOf(store).findings, undefined);
});

test("distinct served models on both sides merge", async (t) => {
  const { store } = await round(t, {
    rows: { ...writerA, ...review(served("fake-b")) },
  });
  assert.equal(store.get("task_deliveries", "w1").state, "integrated");
  assert.equal(verdictOf(store).outcome, "accepted");
  const view = deliveryView(store, store.read()).items[0];
  assert.deepEqual(view.sessions.find((s) => s.slot === "r").served, {
    model: "fake-b",
    withheld: false,
    changed: false,
  });
  assert.equal(view.sessions.find((s) => s.slot === "r").model, "fake-b");
  assert.equal(
    view.rounds[0].verdicts.find((v) => v.role === "conventions").served,
    "fake-b",
  );
});

test("an older Kiro Crew that reports no model keeps today's behavior", async (t) => {
  // Nearby input: the same rows with no served_model key at all.
  const { store } = await round(t);
  assert.equal(store.get("task_deliveries", "w1").state, "integrated");
  const view = deliveryView(store, store.read()).items[0];
  assert.ok(
    view.sessions.every((s) => s.served === null),
    "served model not reported",
  );
  assert.equal(store.get("session_bindings", "r").served, undefined);
});

test("a verdict waits while a reporting reviewer still has a turn in flight", async (t) => {
  const { store, tick, status, rows } = await round(t, {
    rows: { ...writerA, ...review(served(null)) },
    status: { r: "working" },
  });
  assert.equal(
    store.get("task_deliveries", "w1").state,
    "done",
    "not judged yet",
  );
  assert.equal(verdictOf(store), undefined);
  // The turn completes on the reviewer's model; the verdict now counts.
  status.r = "idle";
  rows.r = { ...served("fake-b"), model_requested: "fake-b" };
  await tick();
  assert.equal(store.get("task_deliveries", "w1").state, "integrated");
});

test("the tick refuses roster model fields of the wrong type", async (t) => {
  const { ops } = setup(t);
  for (const bad of [
    { served_model: 5 },
    { served_model: "m", model_withheld: "yes" },
    { served_model: "m", model_changed: 1 },
    { served_model: "m", model_requested: {} },
  ])
    await assert.rejects(
      ops.execute("workspace.tick", {
        sessions: [{ target: "x", status: "idle", ...bad }],
      }),
      /model_withheld and model_changed are booleans/,
    );
});

test("a closed session's empty model fields keep its last live reading", async (t) => {
  // Kiro Crew reports a gone row's model fields as null and false.
  const gone = served(null);
  const { store, tick, status, rows } = await round(t, {
    rows: { ...writerA, ...review(served(null)) },
    status: { r: "working" },
  });
  status.r = "idle";
  rows.r = { ...served("fake-b"), model_requested: "fake-b" };
  await tick();
  assert.equal(store.get("task_deliveries", "w1").state, "integrated");
  status.w = status.r = "closed";
  rows.w = rows.r = gone;
  await tick();
  assert.equal(store.get("session_bindings", "r").served.model, "fake-b");
  assert.equal(store.get("session_bindings", "w").served.model, "fake-a");
});

test("a reviewer first seen closed, with no model reading, is refused", async (t) => {
  const { store } = await round(t, {
    rows: { ...writerA, r: served(null) },
    status: { r: "closed" },
  });
  assert.equal(store.get("task_deliveries", "w1").state, "decision");
  assert.match(
    store.get("task_deliveries", "w1").cause,
    /served model as unknown/,
  );
});
