import test from "node:test";
import assert from "node:assert/strict";
import { taskSignals } from "./workbench-model.mjs";
import { queryTasks } from "./query.mjs";

const now = Date.parse("2026-11-09T01:00:00Z");
function fixture() {
  const task = (id, extra = {}) => ({
    id,
    title: id,
    epic: "W1",
    track: "core",
    scope: "runtime",
    status: "planned",
    tags: [],
    ...extra,
  });
  return {
    statuses: [
      { id: "planned" },
      { id: "partial" },
      { id: "accepted", complete: true },
      { id: "deferred" },
      { id: "review" },
      { id: "blocked" },
    ],
    epics: [{ id: "W1" }, { id: "W2" }],
    tracks: [{ id: "core" }],
    documents: { "done/old.md": { historical: true } },
    tasks: [
      task("done", { status: "accepted" }),
      task("ready"),
      task("blocked"),
      task("supported"),
      task("partial", { status: "partial" }),
      task("deferred", { status: "deferred" }),
    ],
    edges: [
      { from: "done", to: "ready", kind: "requires" },
      { from: "partial", to: "blocked", kind: "sequence" },
      { from: "partial", to: "supported", kind: "supports" },
    ],
  };
}
test("workbench readiness agrees with the existing query and ignores supporting links", () => {
  const data = fixture();
  assert.deepEqual(
    data.tasks
      .filter((task) => taskSignals(data, task, now).ready)
      .map((task) => task.id),
    queryTasks(data, { scope: "all", q: "ready:true" }).map((task) => task.id),
  );
  assert.deepEqual(taskSignals(data, data.tasks[2], now).blockers, ["partial"]);
});
