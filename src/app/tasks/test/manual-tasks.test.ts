// Manual tasks (design §4.16, Requirement 61.9–61.15): lint, the tick and
// next leave them out of ready, they wait in Needs you tagged Manual, only a
// person marks them done or reopens them, and Flow counts their wait as a
// person's.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Operations } from "../../api/operations.ts";
import { fixture } from "../../test/fixtures.ts";
import { writeSpec } from "../../test/spec-fixture.ts";
import { readyCandidates } from "../../delivery/delivery.ts";
import { flowView } from "../../flow/flow.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { withStatus } from "../../test/refusal.ts";
import {
  found,
  type GraphNode,
  type NeedsYouItem,
  type PlanDraft,
  type PlanPreview,
} from "../../test/view-shapes.ts";
import type { Task } from "../../../types.ts";

// A graph node with its manual fields, and graph.view.
type Node = GraphNode & {
  manual?: boolean;
  needsYou?: unknown;
  manualDone?: { choice: string };
};
type Graph = { tasks: Node[] };
// runner.next's lists.
interface Next {
  needsYou: { id: string; reason: string; detail: string }[];
  ready: { id: string }[];
  waiting: { id: string }[];
}
type Done = { manualDone: { choice: string } };
type Row = NeedsYouItem & { context: { referenceMaterial: unknown } };

// This plan's tasks; the fixture keeps one unrelated sample task.
const ours = (tasks: { id: string }[]) =>
  tasks.map((task) => task.id).filter((id) => id.startsWith("sdk."));
const manifest = (tasks: Record<string, unknown>) =>
  JSON.stringify({ tasks }, null, 2) + "\n";
const TASKS = [
  "# Tasks",
  "",
  "- [ ] `1` Build the client",
  "- [ ] `2` Review with team (§D1)",
  "- [ ] `3` Cut over",
  "",
].join("\n");
const DESIGN = [
  "# Design",
  "",
  "## D1. Team review",
  "",
  "Confirm the client behavior and rollout plan.",
  "",
  "## D2. Cutover",
  "",
  "Release the approved client.",
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

function workspace(t: TestContext, review: Record<string, unknown> = REVIEW) {
  const { root, store } = fixture(t);
  store.put("repositories", {
    id: "code",
    root: temporaryDirectory(),
    baseBranch: "main",
    checks: ["npm test"],
  });
  writeSpec(root, "sdk", {
    "design.md": DESIGN,
    "tasks.md": TASKS,
    "avoozl/manifest.json": manifest({
      1: leaf(),
      2: review,
      3: leaf({ requires: ["2"] }),
    }),
  });
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

async function approve(ops: Operations) {
  const plan = await ops.execute<PlanDraft>("plan.create", { spec: "sdk" }),
    preview = await ops.execute<PlanPreview>("plan.preview", { id: "sdk" });
  return ops.execute("plan.approve", {
    id: "sdk",
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
}

const errors = async (ops: Operations) =>
  (
    await ops.execute<{
      diagnostics: { severity: string; code: string; message: string }[];
    }>("plan.lint", { id: "sdk" })
  ).diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => [d.code, d.message]);

test("a manual leaf is never ready; once its blockers hold it waits in Needs you tagged Manual", async (t) => {
  const { store, ops } = workspace(t);
  await approve(ops);
  const state = async (id: string) =>
    found(
      (await ops.execute<Graph>("graph.view", {})).tasks.find(
        (task) => task.id === id,
      ),
    );
  // Before its blocker finishes: Blocked or waiting.
  assert.equal((await state("sdk.2")).state, "waiting");
  assert.equal((await state("sdk.2")).manual, true);
  store.mutate("finish 1", (data) => {
    found(data.tasks.find((task: Task) => task.id === "sdk.1")).status =
      "accepted";
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
  const next = await ops.execute<Next>("runner.next", {});
  assert.deepEqual(
    next.needsYou.map((item) => [item.id, item.reason, item.detail]),
    [["sdk.2", "manual", "Waiting for a person: Review with team"]],
  );
  assert.equal(next.ready.length, 0);
  // Needs you lists it with what to do.
  const rows = (
    await ops.execute<{ items: Row[] }>("conflicts.view", {})
  ).items.filter((item) => item.reason === "manual-ready");
  assert.deepEqual(
    rows.map((item) => [item.taskId, item.detail]),
    [
      [
        "sdk.2",
        "This manual task is ready. Review its approval criteria and referenced material, then Mark done in its drawer.",
      ],
    ],
  );
  assert.deepEqual(rows[0].context.referenceMaterial, [
    {
      kind: "design",
      ref: "§D1",
      path: ".kiro/specs/sdk/design.md",
      lineStart: 3,
      lineEnd: 5,
      text: [
        "## D1. Team review",
        "",
        "Confirm the client behavior and rollout plan.",
      ].join("\n"),
    },
  ]);
  assert.deepEqual(ours(next.waiting), ["sdk.3"]);
});

test("a manual leaf is marked done or reopened, by an agent tool too; either choice releases its dependents", async (t) => {
  const { store, ops } = workspace(t);
  await approve(ops);
  store.mutate("finish 1", (data) => {
    found(data.tasks.find((task: Task) => task.id === "sdk.1")).status =
      "accepted";
  });
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
  // Tasks keep no notes or links: either is refused, and nothing is marked.
  await assert.rejects(
    ops.execute("task.manual.complete", {
      taskId: "sdk.2",
      choice: "skipped",
      note: "Agreed in the review meeting",
    }),
    /Tasks keep no notes/,
  );
  await assert.rejects(
    ops.execute("task.manual.complete", {
      taskId: "sdk.2",
      choice: "skipped",
      links: [{ url: "https://docs.example.test/review", label: "Notes" }],
    }),
    /Tasks keep no links/,
  );
  assert.deepEqual(ready(), []);
  const done = await ops.execute<Done>("task.manual.complete", {
    taskId: "sdk.2",
    choice: "skipped",
  });
  assert.equal(done.manualDone.choice, "skipped");
  assert.deepEqual(ready(), ["sdk.3"]);
  // Skipped shows on the task.
  const graph = await ops.execute<Graph>("graph.view", {});
  assert.equal(
    graph.tasks.find((task) => task.id === "sdk.2")?.manualDone?.choice,
    "skipped",
  );
  await ops.execute("task.manual.reopen", { taskId: "sdk.2" }, undefined, {
    mcp: true,
  });
  assert.deepEqual(ready(), []);
  await ops.execute("task.manual.complete", {
    taskId: "sdk.2",
    choice: "done",
  });
  assert.deepEqual(ready(), ["sdk.3"]);
});

test("a refused manual leaf holds its dependents until it is reopened", async (t) => {
  const { store, ops } = workspace(t);
  await approve(ops);
  store.mutate("finish 1", (data) => {
    found(data.tasks.find((task: Task) => task.id === "sdk.1")).status =
      "accepted";
  });
  const ready = () => ours(readyCandidates(store));
  const refused = await ops.execute<Done>(
    "task.manual.complete",
    { taskId: "sdk.2", choice: "refused" },
    undefined,
    { mcp: true },
  );
  assert.equal(refused.manualDone.choice, "refused");
  assert.deepEqual(ready(), []);
  const row = found(
    store.read().tasks.find((task: Task) => task.id === "sdk.2"),
  );
  assert.equal(row.status, "blocked");
  // Shown as refused on the task, in next, and in the activity log.
  const graph = await ops.execute<Graph>("graph.view", {});
  assert.equal(
    graph.tasks.find((task) => task.id === "sdk.2")?.manualDone?.choice,
    "refused",
  );
  const next = await ops.execute<Next>("runner.next", {});
  assert.deepEqual(
    next.needsYou
      .filter((item) => item.id === "sdk.2")
      .map((item) => [item.reason, item.detail]),
    [["blocked", "Refused by a person: Review with team"]],
  );
  assert.deepEqual(ours(next.ready), []);
  assert.ok(
    store
      .events()
      .some(
        (event) =>
          event.kind === "task.manual.completed" && event.choice === "refused",
      ),
  );
  await assert.rejects(
    ops.execute("task.manual.complete", { taskId: "sdk.2", choice: "done" }),
    /already refused\. Reopen it first/,
  );
  // Flow does not count a refusal as a finished task.
  const view = flowView(store, store.read());
  assert.equal(
    view.tasks.find((task: { taskId: string }) => task.taskId === "sdk.2")
      ?.finishedAt ?? null,
    null,
  );
  // Reopen undoes it; then Done releases the dependents.
  await ops.execute("task.manual.reopen", { taskId: "sdk.2" });
  assert.equal(
    found(store.read().tasks.find((task: Task) => task.id === "sdk.2"))
      .manualDone,
    undefined,
  );
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
    const task = found(data.tasks.find((item: Task) => item.id === "sdk.1"));
    task.status = "accepted";
    task.updatedAt = "2026-11-13T09:00:00.000Z";
  });
  await ops.execute("task.manual.complete", {
    taskId: "sdk.2",
    choice: "done",
  });
  const view = flowView(store, store.read()),
    review = found(
      view.tasks.find((task: { taskId: string }) => task.taskId === "sdk.2"),
    );
  assert.ok(review.stages.waiting > 0);
  assert.equal(review.manual, true);
  // The only finished task is the manual one: no agent first-pass rate.
  assert.equal(view.metrics.firstPassRate, null);
});
