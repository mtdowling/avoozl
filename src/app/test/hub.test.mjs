import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import { Operations } from "../api/operations.mjs";
import { createPlan } from "../specs/plans.mjs";
test("deleting drafts can restore and refuses approved work", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  const plan = createPlan(store, { prompt: "A draft" });
  await ops.execute("plan.delete", { id: plan.id });
  assert.equal((await ops.execute("plan.list")).total, 0);
  await ops.execute("plan.restore", { id: plan.id });
  assert.equal((await ops.execute("plan.list")).total, 1);
  store.put("plans", { ...plan, state: "approved" });
  await assert.rejects(
    ops.execute("plan.delete", { id: plan.id }),
    /approved revision.*retire: true/,
  );
});
