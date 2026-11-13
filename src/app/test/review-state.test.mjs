// Status review with nothing behind it (set by hand, as in the old Nupp
// import) is shown as needing the owner, not as a review in progress. A
// review with a reviewer session stays in progress and keeps its session.
import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

const task = (id, extra = {}) => ({
  id,
  title: id,
  scope: "catalog",
  status: "review",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Done."],
  ...extra,
});

test("a hand-set review needs the owner; a real one keeps its reviewer", async (t) => {
  const { root, store } = fixture(t);
  store.mutate("seed", (data) => {
    data.tasks.push(
      task("by-hand", { nextAction: "Owner decision: pick one." }),
      task("reviewed"),
    );
  });
  store.transaction(() =>
    store.put("session_bindings", {
      id: "reviewed:reviewer:1",
      taskId: "reviewed",
      slot: "chat-9",
      role: "reviewer",
      attempt: 1,
      status: "running",
      model: "opus",
    }),
  );
  const ops = new Operations(store, { workspaceRoot: root });
  const graph = await ops.execute("graph.view", {});
  const node = (id) => graph.tasks.find((x) => x.id === id);
  assert.equal(node("by-hand").handSetReview, true);
  assert.equal(node("by-hand").state, "needs-you");
  assert.equal(node("by-hand").nextAction, "Owner decision: pick one.");
  assert.equal(node("reviewed").handSetReview, false);
  assert.notEqual(node("reviewed").state, "needs-you");

  const conflicts = await ops.execute("conflicts.view", {});
  const item = conflicts.items.find((x) => x.taskId === "by-hand");
  assert.equal(item.kind, "needs-human");
  assert.equal(item.reason, "hand-set-review");
  assert.match(
    item.detail,
    /Marked in review, but no review is running\. Next: Owner decision: pick one/,
  );
  assert.equal(
    conflicts.items.some((x) => x.taskId === "reviewed"),
    false,
  );

  const delivery = await ops.execute("delivery.view", {});
  const card = delivery.items.find((x) => x.id === "reviewed");
  assert.equal(card.sessions[0].role, "reviewer");
  assert.equal(card.handSetReview, false);
  assert.equal(
    delivery.items.find((x) => x.id === "by-hand").handSetReview,
    true,
  );
  // Nothing about the task row changed.
  assert.equal(
    store.read().tasks.find((x) => x.id === "by-hand").status,
    "review",
  );
});

test("Running means a live session: a closed one, or none, is not running", async (t) => {
  const { root, store } = fixture(t);
  store.mutate("seed", (data) => {
    if (!data.statuses.some((x) => x.id === "running"))
      data.statuses.push({ id: "running", label: "Running", complete: false });
    data.tasks.push(
      task("orphan", { status: "running" }),
      task("ended", { status: "running" }),
      task("live", { status: "planned" }),
    );
  });
  store.transaction(() => {
    store.put("session_bindings", {
      id: "ended:worker:1",
      taskId: "ended",
      slot: "chat-1",
      role: "worker",
      attempt: 1,
      status: "closed",
    });
    store.put("session_bindings", {
      id: "live:checks:1",
      taskId: "live",
      slot: "chat-2",
      role: "checks",
      attempt: 1,
      status: "running",
    });
  });
  const ops = new Operations(store, { workspaceRoot: root });
  const graph = await ops.execute("graph.view", {});
  const node = (id) => graph.tasks.find((x) => x.id === id);
  assert.deepEqual(
    ["orphan", "ended", "live"].map((id) => [
      node(id).state,
      node(id).noSession,
    ]),
    [
      ["needs-you", "running"],
      ["needs-you", "running"],
      ["running", null],
    ],
  );
  const conflicts = await ops.execute("conflicts.view", {});
  assert.match(
    conflicts.items.find((x) => x.taskId === "orphan").detail,
    /Marked running, but no session is running/,
  );
});
