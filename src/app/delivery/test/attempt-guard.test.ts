// Task stall-1.1: one guard, previousAttemptEnded, checks every new worker
// attempt (stalled-workers SW2, §D2). Each binding shape the planner sees is
// driven by the reads its executor can give: nothing opens while the end is
// unconfirmed, and one attempt opens once it is confirmed.
import assert from "node:assert/strict";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  GONE_GRACE_MS,
  busyTaskIds,
  deliveryPolicy,
  planReadyDispatches,
  previousAttemptEnded,
  reconcileDeliveries,
} from "../delivery.ts";
import { observeSessions } from "../../executors/kirocrew/session-observer.ts";
import { Operations } from "../../api/operations.ts";
import { Store } from "../../store/store.ts";
import { snapshot } from "../../test/fixtures.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { leaf } from "../../test/delivery-fixture.ts";

const LONG_AGO = "2026-01-01T00:00:00.000Z";
const policy = deliveryPolicy({
  lanes: { local: 4 },
  delivery: { retries: 3, timeboxMinutes: 600 },
});
const BLOCKED = { kind: "blocked", text: "stuck", at: LONG_AGO };

const binding = (extra: Record<string, unknown>) => ({
  id: "s-a",
  slot: "s-a",
  taskId: "a",
  role: "worker",
  attempt: 1,
  source: "tick",
  title: "avoozl:a Task a",
  boundAt: LONG_AGO,
  statusAt: LONG_AGO,
  ...extra,
});

// What a Kiro Crew slot read can answer.
type Read = () => Promise<string>;
const reads = (...statuses: string[]) =>
  Object.fromEntries(statuses.map((s) => [s, async () => s] as [string, Read]));
const FAILED: Record<string, Read> = {
  "a failed read": async () => {
    throw Error("refused (403)");
  },
};

interface Shape {
  // The store just before the path would open attempt 2.
  seed: (store: Store, ops: Operations) => unknown;
  // Reads that leave the end unconfirmed, each seeded afresh.
  unconfirmed: Record<string, Read>;
  // What confirms the end: a read, or a step the shape takes itself.
  confirm: (store: Store) => Promise<void>;
}

const SHAPES: Record<string, Shape> = {
  // The planner's retry start: a tick worker reported blocked while running.
  "tick retry": {
    seed: (store) =>
      store.put(
        "session_bindings",
        binding({ status: "working", report: BLOCKED }),
      ),
    unconfirmed: { ...reads("working"), ...FAILED },
    confirm: (store) => observeSessions(store, async () => "idle").then(),
  },
  // A tick worker with no report yet: idle is a turn, not an end.
  "tick, no report": {
    seed: (store) =>
      store.put("session_bindings", binding({ status: "working" })),
    unconfirmed: { ...reads("working", "idle"), ...FAILED },
    confirm: (store) => observeSessions(store, async () => "closed").then(),
  },
  // The vanished resume: gone, read before the grace ran out.
  vanished: {
    seed: (store) =>
      store.put(
        "session_bindings",
        binding({
          status: "gone",
          statusAt: new Date(Date.now() - 60_000).toISOString(),
        }),
      ),
    unconfirmed: { ...reads("working", "idle"), ...FAILED },
    confirm: async (store) => {
      await observeSessions(store, async () => "gone");
      const row = store.get<Record<string, unknown>>("session_bindings", "s-a");
      store.put("session_bindings", {
        ...row,
        id: "s-a",
        statusAt: new Date(Date.now() - GONE_GRACE_MS).toISOString(),
      });
    },
  },
  // A full stop, then Resume: Kiro Crew keeps the stopped chat, so the
  // first read after the stop that finds it idle confirms it.
  interrupted: {
    seed: async (store, ops) => {
      store.put("session_bindings", binding({ status: "idle" }));
      const { stop } = await ops.execute<{ stop: { id: string } }>(
        "flow.stop",
        { full: true, reason: "pause" },
      );
      await ops.execute("flow.resume", { stopId: stop.id }, undefined, {
        mcp: true,
      });
    },
    unconfirmed: { ...reads("working"), ...FAILED },
    confirm: (store) => observeSessions(store, async () => "idle").then(),
  },
  // A hand take (avoozl take): no session to read, so its final report is
  // its end.
  "hand take": {
    seed: (store) =>
      store.put(
        "session_bindings",
        binding({
          id: "manual-a-1",
          slot: "manual-a-1",
          source: "conductor",
          conductor: "cli",
          statusAt: undefined,
        }),
      ),
    unconfirmed: { ...reads("working", "idle"), ...FAILED },
    confirm: async (store) => {
      const row = store.get<Record<string, unknown>>(
        "session_bindings",
        "manual-a-1",
      );
      store.put("session_bindings", {
        ...row,
        id: "manual-a-1",
        report: BLOCKED,
      });
    },
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
  const ops = new Operations(store, {
    workspaceRoot: root,
    sessionStopper: async () => {},
  });
  return { store, ops };
}

// One tick's worth: read the sessions, record outcomes, plan starts.
async function tick(store: Store, read: Read) {
  await observeSessions(store, read);
  reconcileDeliveries(store, policy, {});
  return planReadyDispatches(store, policy).map((d) => [d.task, d.attempt]);
}

for (const [shapeName, shape] of Object.entries(SHAPES)) {
  for (const [readName, read] of Object.entries(shape.unconfirmed))
    test(`${shapeName}: a read of ${readName} opens no attempt`, async (t) => {
      const { store, ops } = setup(t);
      await shape.seed(store, ops);
      for (let round = 0; round < 3; round += 1)
        assert.deepEqual(await tick(store, read), [], `round ${round}`);
      assert.ok(busyTaskIds(store).has("a"));
    });
  test(`${shapeName}: one attempt opens once the end is confirmed`, async (t) => {
    const { store, ops } = setup(t);
    await shape.seed(store, ops);
    await shape.confirm(store);
    const failing: Read = async () => {
      throw Error("refused (403)");
    };
    assert.deepEqual(await tick(store, failing), [["a", 2]]);
  });
}

test("previousAttemptEnded holds only for the ends SW2.1 and SW2.2 name", () => {
  const now = Date.parse("2026-11-24T12:00:00.000Z"),
    settled = new Date(now - GONE_GRACE_MS).toISOString(),
    fresh = new Date(now - 1000).toISOString(),
    before = new Date(now - 5000).toISOString(),
    stop = { stop: "x", at: new Date(now - 2000).toISOString() };
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
    [{ status: "idle", statusAt: fresh, interrupted: stop }, true],
    [{ status: "idle", statusAt: before, interrupted: stop }, false],
    [{ status: "working", statusAt: fresh, interrupted: stop }, false],
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
