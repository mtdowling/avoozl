import test from "node:test";
import assert from "node:assert/strict";
import { HostScheduler } from "../host-scheduler.mjs";

test("host scheduler enforces host and workspace limits", async () => {
  const scheduler = new HostScheduler({ maxConcurrentRuns: 2 });
  scheduler.configureWorkspace("one", { maxConcurrentRuns: 1 });
  scheduler.configureWorkspace("two", { maxConcurrentRuns: 2 });
  await scheduler.acquire("one", "one-a");
  const oneWaiting = scheduler.acquire("one", "one-b");
  await scheduler.acquire("two", "two-a");
  assert.deepEqual(scheduler.status("one").workspace, {
    id: "one",
    maxConcurrentRuns: 1,
    running: 1,
    waiting: 1,
  });
  scheduler.release("one", "one-a");
  assert.equal((await oneWaiting).runId, "one-b");
  scheduler.release("one", "one-b");
  scheduler.release("two", "two-a");
});

test("host scheduler admits waiting work fairly across workspaces", async () => {
  const scheduler = new HostScheduler({ maxConcurrentRuns: 1 });
  scheduler.configureWorkspace("one", { maxConcurrentRuns: 4 });
  scheduler.configureWorkspace("two", { maxConcurrentRuns: 4 });
  await scheduler.acquire("one", "one-a");
  const oneB = scheduler.acquire("one", "one-b");
  const twoA = scheduler.acquire("two", "two-a");
  scheduler.release("one", "one-a");
  assert.equal((await twoA).runId, "two-a");
  scheduler.release("two", "two-a");
  assert.equal((await oneB).runId, "one-b");
  scheduler.release("one", "one-b");
});

test("zero workspace concurrency pauses only new work", async () => {
  const scheduler = new HostScheduler({ maxConcurrentRuns: 2 });
  scheduler.configureWorkspace("one", { maxConcurrentRuns: 1 });
  await scheduler.acquire("one", "one-a");
  scheduler.configureWorkspace("one", { maxConcurrentRuns: 0 });
  const waiting = scheduler.acquire("one", "one-b");
  scheduler.release("one", "one-a");
  assert.equal(scheduler.status("one").workspace.running, 0);
  assert.equal(scheduler.status("one").workspace.waiting, 1);
  scheduler.configureWorkspace("one", { maxConcurrentRuns: 1 });
  assert.equal((await waiting).runId, "one-b");
  scheduler.release("one", "one-b");
});

test("user starts move ahead of normal work within a workspace", async () => {
  const scheduler = new HostScheduler({ maxConcurrentRuns: 1 });
  await scheduler.acquire("one", "running");
  const normal = scheduler.acquire("one", "normal");
  const user = scheduler.acquire("one", "user", { priority: "user" });
  scheduler.release("one", "running");
  assert.equal((await user).runId, "user");
  scheduler.release("one", "user");
  assert.equal((await normal).runId, "normal");
  scheduler.release("one", "normal");
});

test("identical run IDs in different workspaces do not collide", async () => {
  const scheduler = new HostScheduler({ maxConcurrentRuns: 2 });
  const first = await scheduler.acquire("one", "run-same");
  const second = await scheduler.acquire("two", "run-same");
  assert.equal(first.runId, second.runId);
  assert.notEqual(first.workspaceId, second.workspaceId);
  scheduler.release("one", "run-same");
  assert.equal(scheduler.status().running, 1);
  scheduler.release("two", "run-same");
  assert.equal(scheduler.status().running, 0);
});
