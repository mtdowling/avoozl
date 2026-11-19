// The tick's own health in Activity and Needs you: a failure, a stall and a
// recovery each leave a row, a run of identical failures is one row with a
// count, a tick that works leaves nothing, and three failures open Needs you.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { listActivity } from "../../store/activity-log.mjs";
import { conflictsView } from "../../api/page-views.mjs";
import { tick, tickHealthPath } from "../tick.mjs";
import {
  NEEDS_YOU_AFTER,
  noteTickRun,
  tickFailedItems,
} from "../tick-activity.mjs";
import { fixture } from "../../test/fixtures.mjs";

const at = (minutes) =>
  new Date(Date.UTC(2026, 10, 18, 3, minutes)).toISOString();
const rows = (store) => listActivity(store, { source: "tick" }).items;
const failed = (minutes, error = "database is locked\n    at open") => ({
  at: at(minutes),
  outcome: "error",
  error,
});

test("a tick that works writes nothing", (t) => {
  const { store } = fixture(t);
  noteTickRun(store, { at: at(0), outcome: "ok" }, at(-1));
  noteTickRun(store, { at: at(1), outcome: "locked" }, at(0));
  assert.deepEqual(rows(store), []);
});

test("identical failures are one row with a count and the first error line", (t) => {
  const { store } = fixture(t);
  for (let i = 0; i < 4; i += 1)
    noteTickRun(store, failed(i), i ? at(i - 1) : null);
  const [row, ...rest] = rows(store);
  assert.equal(rest.length, 0);
  assert.equal(row.kind, "tick.failed");
  assert.equal(row.summary, "Tick failed 4 times in a row: database is locked");
  assert.equal(row.at, at(3));
});

test("a different error starts its own row", (t) => {
  const { store } = fixture(t);
  noteTickRun(store, failed(0), null);
  noteTickRun(store, failed(1, "disk full"), at(0));
  assert.deepEqual(
    rows(store)
      .map((row) => row.summary)
      .sort(),
    ["Tick failed: database is locked", "Tick failed: disk full"],
  );
});

test("a tick that works after failures writes one recovery row", (t) => {
  const { store } = fixture(t);
  noteTickRun(store, failed(0), null);
  noteTickRun(store, failed(1), at(0));
  noteTickRun(store, { at: at(2), outcome: "ok" }, at(1));
  noteTickRun(store, { at: at(3), outcome: "ok" }, at(2));
  assert.deepEqual(
    rows(store)
      .map((row) => row.kind)
      .sort(),
    ["tick.failed", "tick.recovered"],
  );
  // The next failure starts a fresh count.
  noteTickRun(store, failed(4), at(3));
  assert.ok(
    rows(store).some(
      (row) => row.summary === "Tick failed: database is locked",
    ),
  );
});

test("a gap past the stall limit writes one stall row", (t) => {
  const { store } = fixture(t);
  noteTickRun(store, { at: at(9), outcome: "ok" }, at(1));
  assert.deepEqual(rows(store), []);
  noteTickRun(store, { at: at(40), outcome: "ok" }, at(9));
  const [row] = rows(store);
  assert.equal(row.kind, "tick.stalled");
  assert.equal(row.summary, "Tick had not run for 31 min; it is running again");
});

test("a real tick records its stall and failure from the health file", async (t) => {
  const { store } = fixture(t);
  fs.writeFileSync(
    tickHealthPath(store),
    JSON.stringify({ at: "2026-11-18T01:00:00.000Z", outcome: "ok" }),
  );
  // With no workspace root this tick fails, which a real run records too.
  await tick(store, {}).catch(() => {});
  const kinds = rows(store).map((row) => row.kind);
  assert.ok(kinds.includes("tick.stalled"));
  assert.ok(kinds.includes("tick.failed"));
});

test("three failures in a row open a Needs you item that a good tick clears", (t) => {
  const { store } = fixture(t);
  for (let i = 0; i < NEEDS_YOU_AFTER - 1; i += 1)
    noteTickRun(store, failed(i), null);
  assert.deepEqual(tickFailedItems(store), []);
  noteTickRun(store, failed(NEEDS_YOU_AFTER - 1), null);
  const [item] = conflictsView(store, store.read()).items.filter(
    (entry) => entry.kind === "tick-failed",
  );
  assert.equal(item.title, "The tick failed 3 times in a row");
  assert.match(item.detail, /^database is locked\./);
  noteTickRun(store, { at: at(10), outcome: "ok" }, null);
  assert.deepEqual(tickFailedItems(store), []);
});

test("an error with a secret is saved redacted", (t) => {
  const { store } = fixture(t);
  noteTickRun(
    store,
    failed(0, "bad token ghp_abcdefghijklmnopqrstuvwxyz0123456789"),
    null,
  );
  assert.equal(rows(store)[0].redacted, true);
});
