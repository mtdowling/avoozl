import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";

test("saved reports retain named task filters without changing task state", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    before = structuredClone(store.read().tasks);
  const report = await ops.execute(
    "report.save",
    {
      title: "Blocked runtime work",
      view: "graph",
      filters: {
        query: "status:blocked",
        scopes: ["runtime"],
        statuses: ["blocked"],
        historical: false,
      },
    },
    store.read().revision,
  );
  assert.match(report.id, /^report-/);
  assert.equal(report.view, "graph");
  assert.deepEqual(report.filters.statuses, ["blocked"]);
  assert.deepEqual(store.read().tasks, before);

  const updated = await ops.execute(
    "report.save",
    {
      id: report.id,
      title: "Blocked work",
      view: "tasks",
      filters: { statuses: ["blocked"] },
    },
    store.read().revision,
  );
  assert.equal(updated.id, report.id);
  assert.equal(store.read().savedSearches.length, 1);

  await ops.execute(
    "report.delete",
    { id: report.id },
    store.read().revision,
  );
  assert.deepEqual(store.read().savedSearches, []);
});

test("saved reports reject malformed filters and stale writes", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    revision = store.read().revision;
  await assert.rejects(
    ops.execute("report.save", {
      title: "Bad",
      view: "terminal",
      filters: {},
    }),
    /Unknown report view/,
  );
  await ops.execute("report.save", {
    title: "Current",
    filters: { tags: ["release"] },
  });
  await assert.rejects(
    ops.execute(
      "report.save",
      { title: "Stale", filters: {} },
      revision,
    ),
    /Database changed/,
  );
});
