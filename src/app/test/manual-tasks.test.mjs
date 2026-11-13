// Manual tasks (design §4.16, Requirement 61.9–61.15): lint, the tick and
// next leave them out of ready, they wait in Needs you tagged Manual, only a
// person marks them done or reopens them, and Flow counts their wait as a
// person's.
import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { readyCandidates } from "../delivery.mjs";
import { flowView } from "../flow.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// This plan's tasks; the fixture keeps one unrelated sample task.
const ours = (tasks) =>
  tasks.map((task) => task.id).filter((id) => id.startsWith("sdk."));
const manifest = (tasks) => JSON.stringify({ tasks }, null, 2) + "\n";
const TASKS = [
  "# Tasks",
  "",
  "- [ ] 1 Build the client",
  "- [ ] 2 Review with team",
  "- [ ] 3 Cut over",
  "",
].join("\n");
const leaf = (extra = {}) => ({
  kind: "leaf",
  repository: "code",
  acceptance: ["It works for a caller"],
  checks: ["npm test"],
  completion: "integrated",
  ...extra,
});
const REVIEW = {
  kind: "leaf",
  manual: true,
  repository: "code",
  acceptance: ["The team agreed the results are good enough to cut over"],
  completion: "person",
  requires: ["1"],
};

function workspace(t, review = REVIEW) {
  const { root, store } = fixture(t);
  store.put("projects", {
    id: "code",
    root: temporaryDirectory(),
    baseBranch: "main",
    checks: ["npm test"],
  });
  writeSpec(root, "sdk", {
    "tasks.md": TASKS,
    "avoozl/manifest.json": manifest({
      1: leaf(),
      2: review,
      3: leaf({ requires: ["2"] }),
    }),
  });
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

async function approve(ops) {
  const plan = await ops.execute("plan.create", { spec: "sdk" }),
    preview = await ops.execute("plan.preview", { id: "sdk" });
  return ops.execute("plan.approve", {
    id: "sdk",
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
}

const errors = async (ops) =>
  (await ops.execute("plan.lint", { id: "sdk" })).diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => [d.code, d.message]);

test("lint refuses each agent field on a manual leaf, by name, and person on any other", async (t) => {
  const { ops } = workspace(t);
  await ops.execute("plan.create", { spec: "sdk" });
  assert.deepEqual(await errors(ops), []);
  for (const [key, value] of [
    ["checks", ["npm test"]],
    ["session", { agent: "coder" }],
    ["agent", "coder"],
    ["model", "auto"],
    ["size", "small"],
    ["paths", ["src/**"]],
    ["route", "local"],
  ]) {
    const t2 = { after: t.after.bind(t) },
      { ops: other } = workspace(t2, { ...REVIEW, [key]: value });
    await other.execute("plan.create", { spec: "sdk" });
    const found = await errors(other);
    assert.ok(
      found.some(
        ([code, message]) =>
          code === "spec.manual-field" && message.includes(`"${key}"`),
      ),
      `${key}: ${JSON.stringify(found)}`,
    );
  }
  const { ops: wrong } = workspace(t, { ...REVIEW, completion: "integrated" });
  await wrong.execute("plan.create", { spec: "sdk" });
  assert.ok(
    (await errors(wrong)).some(
      ([code, message]) =>
        code === "spec.manual-field" && /completion/.test(message),
    ),
  );
  const { root, ops: person } = workspace(t);
  writeSpec(root, "sdk", {
    "tasks.md": TASKS,
    "avoozl/manifest.json": manifest({
      1: leaf({ completion: "person" }),
      2: REVIEW,
      3: leaf({ requires: ["2"] }),
    }),
  });
  await person.execute("plan.create", { spec: "sdk" });
  assert.ok(
    (await errors(person)).some(([code]) => code === "spec.person-completion"),
  );
});

test("a manual leaf is never ready; once its blockers hold it waits in Needs you tagged Manual", async (t) => {
  const { store, ops } = workspace(t);
  await approve(ops);
  const state = async (id) =>
    (await ops.execute("graph.view", {})).tasks.find((task) => task.id === id);
  // Before its blocker finishes: Blocked or waiting.
  assert.equal((await state("sdk.2")).state, "waiting");
  assert.equal((await state("sdk.2")).manual, true);
  store.mutate("finish 1", (data) => {
    data.tasks.find((task) => task.id === "sdk.1").status = "accepted";
  });
  const review = await state("sdk.2");
  assert.equal(review.state, "needs-you");
  assert.equal(review.ready, false);
  assert.deepEqual(review.needsYou, {
    reason: "Waiting for a person: Review with team",
    link: null,
    manual: true,
  });
  assert.equal((await state("sdk.3")).state, "waiting");
  // Neither the tick's candidates nor a conductor's next offer it.
  assert.deepEqual(ours(readyCandidates(store)), []);
  const next = await ops.execute("runner.next", {});
  assert.deepEqual(
    next.needsYou.map((item) => [item.id, item.reason, item.detail]),
    [["sdk.2", "manual", "Waiting for a person: Review with team"]],
  );
  assert.equal(next.ready.length, 0);
  assert.deepEqual(ours(next.waiting), ["sdk.3"]);
});

test("only a person marks a manual leaf done or reopens it; either choice releases its dependents", async (t) => {
  const { store, ops } = workspace(t);
  await approve(ops);
  store.mutate("finish 1", (data) => {
    data.tasks.find((task) => task.id === "sdk.1").status = "accepted";
  });
  for (const context of [
    { mcp: true },
    { caller: { sessionKey: "dashboard:w" } },
  ])
    await assert.rejects(
      ops.execute(
        "task.manual.complete",
        { taskId: "sdk.2", choice: "done" },
        undefined,
        context,
      ),
      (error) => error.status === 403,
    );
  await assert.rejects(
    ops.execute("task.manual.complete", { taskId: "sdk.1", choice: "done" }),
    /not a manual task/,
  );
  await assert.rejects(
    ops.execute("task.manual.complete", { taskId: "sdk.2", choice: "maybe" }),
    /choice/,
  );
  const ready = () => ours(readyCandidates(store));
  assert.deepEqual(ready(), []);
  const done = await ops.execute("task.manual.complete", {
    taskId: "sdk.2",
    choice: "skipped",
    note: "Agreed in the review meeting",
    links: [{ url: "https://docs.example.test/review", label: "Notes" }],
  });
  assert.equal(done.manualDone.choice, "skipped");
  assert.deepEqual(ready(), ["sdk.3"]);
  const notes = await ops.execute("task.notes.list", { taskId: "sdk.2" });
  assert.deepEqual(
    notes.entries.map((e) => [e.kind, e.outcome, e.author]),
    // Newest first: the note was saved first, then the link.
    [
      ["link", true, "person"],
      ["note", true, "person"],
    ],
  );
  // Skipped shows on the task.
  const graph = await ops.execute("graph.view", {});
  assert.equal(
    graph.tasks.find((task) => task.id === "sdk.2").manualDone.choice,
    "skipped",
  );
  await assert.rejects(
    ops.execute("task.manual.reopen", { taskId: "sdk.2" }, undefined, {
      mcp: true,
    }),
    (error) => error.status === 403,
  );
  await ops.execute("task.manual.reopen", { taskId: "sdk.2" });
  assert.deepEqual(ready(), []);
  await ops.execute("task.manual.complete", {
    taskId: "sdk.2",
    choice: "done",
  });
  assert.deepEqual(ready(), ["sdk.3"]);
});

test("Flow counts a manual leaf's wait as a person's and leaves it out of first-pass rate", async (t) => {
  const { store, ops } = workspace(t);
  await approve(ops);
  store.mutate("finish 1", (data) => {
    const task = data.tasks.find((item) => item.id === "sdk.1");
    task.status = "accepted";
    task.updatedAt = "2026-11-13T09:00:00.000Z";
  });
  await ops.execute("task.manual.complete", {
    taskId: "sdk.2",
    choice: "done",
  });
  const view = flowView(store, store.read()),
    review = view.tasks.find((task) => task.taskId === "sdk.2");
  assert.ok(review.stages.waiting > 0);
  assert.equal(review.manual, true);
  // The only finished task is the manual one: no agent first-pass rate.
  assert.equal(view.metrics.firstPassRate, null);
});
