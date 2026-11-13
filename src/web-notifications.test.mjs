import assert from "node:assert/strict";
import test from "node:test";
import {
  newWebNotificationSignals,
  webNotificationSignals,
} from "./web-notifications.mjs";

function run(id, state, extra = {}) {
  return {
    id,
    state,
    title: `Run ${id}`,
    createdAt: "2026-11-11T06:00:00.000Z",
    updatedAt: "2026-11-11T06:01:00.000Z",
    ...extra,
  };
}

test("web notifications include only run states that need human attention", () => {
  const signals = webNotificationSignals([
    run("starting", "starting"),
    run("running", "running"),
    run("input", "waiting-input"),
    run("approval", "waiting-approval"),
    run("completed", "completed"),
    run("failed", "failed", { error: { message: "Checks failed" } }),
    run("stopped", "interrupted"),
    run("offline", "disconnected"),
  ]);

  assert.deepEqual(
    signals.map((signal) => signal.runId),
    ["input", "approval", "completed", "failed"],
  );
  assert.doesNotMatch(
    signals.find((signal) => signal.runId === "failed").body,
    /Checks failed/,
  );
});

test("the first workspace snapshot establishes a baseline without alerting", () => {
  const current = webNotificationSignals([
    run("approval", "waiting-approval"),
    run("completed", "completed"),
  ]);

  assert.deepEqual(newWebNotificationSignals(null, current), []);
});

test("run attention transitions notify once and do not repeat on refresh", () => {
  const running = webNotificationSignals([run("task", "running")]);
  const waiting = webNotificationSignals(
    [run("task", "waiting-approval")],
    [{ id: "request-1", runId: "task", kind: "approval", state: "pending" }],
  );

  assert.deepEqual(
    newWebNotificationSignals(running, waiting).map((signal) => signal.runId),
    ["task"],
  );
  assert.deepEqual(newWebNotificationSignals(waiting, waiting), []);
});

test("a later request and completion cycle on the same run notify again", () => {
  const firstRequest = webNotificationSignals(
    [run("driver", "waiting-input")],
    [{ id: "request-1", runId: "driver", kind: "input", state: "pending" }],
  );
  const nextRequest = webNotificationSignals(
    [run("driver", "waiting-input")],
    [{ id: "request-2", runId: "driver", kind: "input", state: "pending" }],
  );
  const firstCompletion = webNotificationSignals([
    run("driver", "completed", {
      updatedAt: "2026-11-11T06:02:00.000Z",
    }),
  ]);
  const nextCompletion = webNotificationSignals([
    run("driver", "completed", {
      updatedAt: "2026-11-11T06:03:00.000Z",
    }),
  ]);

  assert.equal(newWebNotificationSignals(firstRequest, nextRequest).length, 1);
  assert.equal(
    newWebNotificationSignals(firstCompletion, nextCompletion).length,
    1,
  );
});
