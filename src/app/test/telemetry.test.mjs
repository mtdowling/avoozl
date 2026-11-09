import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import {
  recordUsage,
  metrics,
  runTime,
  normalizeUsage,
} from "../telemetry.mjs";

test("Codex cumulative reports deduplicate and retain their baseline across resumes", (t) => {
  const { store } = fixture(t),
    run = {
      id: "usage-run",
      taskId: "sample-task",
      provider: "codex",
      providerSessionId: "thread-usage",
      createdAt: new Date().toISOString(),
      state: "completed",
    };
  store.put("runs", run);
  const report = {
    model: "test-model",
    tokenUsage: {
      total: {
        inputTokens: 100,
        cachedInputTokens: 30,
        outputTokens: 20,
        reasoningOutputTokens: 8,
        totalTokens: 120,
      },
    },
  };
  recordUsage(store, run, report);
  recordUsage(store, run, report);
  const second = structuredClone(report);
  second.tokenUsage.total.inputTokens = 150;
  second.tokenUsage.total.totalTokens = 170;
  recordUsage(store, run, second);
  const totals = metrics(store).groups[0];
  assert.equal(totals.totalTokens, 170);
  assert.equal(totals.cacheReadTokens, 30);
  assert.equal(totals.cacheWriteTokens, null);
  assert.equal(totals.uncachedInputTokens, 120);
  assert.equal(totals.reasoningTokens, 8);
  assert.equal(totals.estimatedCostUsd, null);
});
test("Claude accounts for model totals including caches, excludes reasoning double counting and zeroed errors", (t) => {
  const { store } = fixture(t),
    run = {
      id: "claude-usage",
      taskId: "sample-task",
      provider: "claude",
      providerSessionId: "claude-session",
      createdAt: new Date().toISOString(),
      state: "completed",
    };
  store.put("runs", run);
  const report = {
    reportId: "first",
    modelUsage: {
      model: {
        inputTokens: 10,
        cacheReadInputTokens: 100,
        cacheCreationInputTokens: 20,
        outputTokens: 40,
        thinkingTokens: 15,
        costUSD: 0.5,
      },
    },
  };
  recordUsage(store, run, report);
  recordUsage(store, run, report);
  recordUsage(store, run, {
    reportId: "second",
    modelUsage: {
      model: {
        ...report.modelUsage.model,
        inputTokens: 20,
        outputTokens: 50,
        costUSD: 0.7,
      },
    },
  });
  recordUsage(store, run, {
    reportId: "startup-error",
    modelUsage: { model: { inputTokens: 0, outputTokens: 0, costUSD: 0 } },
  });
  const result = metrics(store).groups[0];
  assert.equal(result.totalTokens, 190);
  assert.equal(result.inputTokens, 140);
  assert.equal(result.outputTokens, 50);
  assert.equal(result.estimatedCostUsd, 0.7);
  assert.equal(metrics(store).samples, 2);
});
test("time measurements distinguish approvals, execution and idle; tool time is overlapping", (t) => {
  const { store } = fixture(t),
    start = Date.parse("2026-11-09T00:00:00Z"),
    run = {
      id: "timed-run",
      taskId: "sample-task",
      provider: "codex",
      createdAt: new Date(start).toISOString(),
      state: "completed",
    };
  store.put("runs", run);
  const event = (seconds, kind, body) => {
    const e = store.event(run.id, kind, body);
    store.db
      .prepare("UPDATE events SET at=? WHERE seq=?")
      .run(new Date(start + seconds * 1000).toISOString(), e.seq);
  };
  event(2, "state", { state: "running" });
  event(5, "request.created", { request: { kind: "approval" } });
  event(10, "request.answered", {});
  event(15, "turn.completed", { state: "completed" });
  const time = runTime(store, run);
  assert.equal(time.wallMs, 15000);
  assert.equal(time.phases.startup, 2000);
  assert.equal(time.phases.agent, 8000);
  assert.equal(time.phases.approval, 5000);
});
