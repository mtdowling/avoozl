// A task waiting on a decision that did not come from failing checks has no
// failed checks to show. Reading its `commit` threw, and conflicts.view
// answered 500 for the whole Needs you page.
import assert from "node:assert/strict";
import test from "node:test";
import { addItemContext } from "../needs-you-context.mjs";
import { fixture } from "./fixtures.mjs";

test("a decision with no kept failed checks gives no failed checks and no error", (t) => {
  const { store } = fixture(t),
    task = store.read().tasks[0];
  store.put("task_deliveries", { id: task.id, state: "decision" });
  const [item] = addItemContext(store, store.read(), [
    { kind: "stale-session", taskId: task.id },
  ]);
  assert.equal(item.context.failedChecks, null);
  // The same with a cause but no kept checks.
  store.put("task_deliveries", {
    id: task.id,
    state: "decision",
    cause: "review",
  });
  const [again] = addItemContext(store, store.read(), [
    { kind: "stale-session", taskId: task.id },
  ]);
  assert.equal(again.context.failedChecks, null);
});
