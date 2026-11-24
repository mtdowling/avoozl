// Task stall-1.1: one guard, previousAttemptEnded, checks every new worker
// attempt (stalled-workers SW2, §D2). Each path is driven by a fake executor
// read, and none opens an attempt until a read confirms the last one ended.
import assert from "node:assert/strict";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  GONE_GRACE_MS,
  deliveryPolicy,
  planReadyDispatches,
  previousAttemptEnded,
  reconcileDeliveries,
} from "../delivery.ts";
import { observeSessions } from "../../executors/kirocrew/session-observer.ts";
import { Store } from "../../store/store.ts";
import { snapshot } from "../../test/fixtures.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { leaf } from "../../test/delivery-fixture.ts";

const LONG_AGO = "2026-01-01T00:00:00.000Z";
const policy = deliveryPolicy({
  lanes: { local: 4 },
  delivery: { retries: 3, timeboxMinutes: 600 },
});

const binding = (extra: Record<string, unknown>) => ({
  id: "s-a",
  slot: "s-a",
  taskId: "a",
  role: "worker",
  attempt: 1,
  source: "tick",
  title: "avoozl:a Task a",
  boundAt: new Date().toISOString(),
  statusAt: LONG_AGO,
  ...extra,
});

// Each path that opens a worker attempt, as the store holds it just before.
const PATHS = {
  // The planner's retry start: the attempt was recorded failed, and its
  // session still runs.
  retry: (store: Store, reported = true) => {
    store.put(
      "session_bindings",
      binding({
        status: "working",
        ...(reported
          ? { report: { kind: "blocked", text: "stuck", at: LONG_AGO } }
          : {}),
      }),
    );
    store.put("task_deliveries", {
      id: "a",
      taskId: "a",
      state: "failed",
      attempts: [
        { attempt: 1, slot: "s-a", outcome: "failed", cause: "blocked: x" },
      ],
    });
  },
  // The vanished resume: a session that never reported, last read gone
  // before the grace ran out.
  vanished: (store: Store, reported = true, statusAt = LONG_AGO) =>
    store.put(
      "session_bindings",
      binding({
        status: "gone",
        statusAt,
        ...(reported
          ? { report: { kind: "progress", text: "Halfway.", at: LONG_AGO } }
          : {}),
      }),
    ),
};

// What the fake executor answers for the slot.
const READS = {
  working: async () => "working",
  "idle with no report": async () => "idle",
  "a failed read": async () => {
    throw Error("refused (403)");
  },
};

function setup(t: TestContext) {
  const root = temporaryDirectory("avoozl-guard-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize({
    ...snapshot(),
    tasks: [leaf("a", { repository: "r1" })],
    edges: [],
  });
  store.put("repositories", { id: "r1", root: temporaryDirectory("r1-") });
  return store;
}

for (const [pathName, seed] of Object.entries(PATHS))
  for (const [readName, read] of Object.entries(READS))
    test(`${pathName}: a read of ${readName} opens no attempt`, async (t) => {
      const store = setup(t);
      // Gone, read before the grace ran out.
      seed(
        store,
        readName !== "idle with no report",
        new Date(Date.now() - GONE_GRACE_MS + 60_000).toISOString(),
      );
      await observeSessions(store, read);
      reconcileDeliveries(store, policy, {});
      assert.deepEqual(planReadyDispatches(store, policy), []);
      const delivery = store.get<{ attempts: { vanished?: boolean }[] }>(
        "task_deliveries",
        "a",
      );
      assert.ok(!delivery?.attempts.some((a) => a.vanished));
    });

test("each path opens one attempt once a read confirms the end", async (t) => {
  for (const [pathName, seed] of Object.entries(PATHS)) {
    const store = setup(t);
    // Idle after its blocked report, or gone past the grace.
    seed(store);
    await observeSessions(store, async () =>
      pathName === "retry" ? "idle" : "gone",
    );
    reconcileDeliveries(store, policy, {});
    assert.deepEqual(
      planReadyDispatches(store, policy).map((d) => [d.task, d.attempt]),
      [["a", 2]],
      pathName,
    );
  }
});

test("previousAttemptEnded holds only for the ends SW2.1 names", () => {
  const now = Date.parse("2026-11-24T12:00:00.000Z"),
    settled = new Date(now - GONE_GRACE_MS).toISOString(),
    fresh = new Date(now - 1000).toISOString();
  const rows: [Record<string, unknown>, boolean][] = [
    [{ status: "closed" }, true],
    [{ status: "lost" }, true],
    [{ status: "gone", statusAt: settled }, true],
    [{ status: "gone", statusAt: fresh }, false],
    [{ status: "idle", report: { kind: "done" } }, true],
    [{ status: "idle", report: { kind: "blocked" } }, true],
    [{ status: "idle", report: { kind: "wait" } }, true],
    [{ status: "idle", report: { kind: "progress" } }, false],
    [{ status: "idle", report: { kind: "question" } }, false],
    [{ status: "idle" }, false],
    [{ status: "working", report: { kind: "done" } }, false],
    [{ status: "queued" }, false],
    [{ status: "unknown" }, false],
    [{}, false],
  ];
  for (const [row, ended] of rows)
    assert.equal(
      previousAttemptEnded({ boundAt: fresh, ...row }, now),
      ended,
      JSON.stringify(row),
    );
});
