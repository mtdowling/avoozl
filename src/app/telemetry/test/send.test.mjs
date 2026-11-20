// ot-3.3: queue, send and retry (OT10.2 to OT10.8, OT12.2 to OT12.6).
import assert from "node:assert/strict";
import test from "node:test";
import { Store } from "../../store/store.mjs";
import { readTelemetryConfig } from "../config.mjs";
import { createQueue } from "../queue.mjs";
import { finishTask, point, registerExporter, span } from "../record.mjs";
import { createSender } from "../send.mjs";
import { startCollector } from "./fake-collector.mjs";
import fs from "node:fs";
import path from "node:path";
import { temporaryDirectory } from "../../test/temporary.mjs";

const CANARY = "CANARY-HEADER-VALUE";

function config(collector, extra = {}) {
  const directory = temporaryDirectory("avoozl-send-");
  fs.writeFileSync(
    path.join(directory, "config.json"),
    JSON.stringify({ telemetry: { enabled: true } }),
  );
  return readTelemetryConfig(directory, {
    OTEL_EXPORTER_OTLP_ENDPOINT: collector.url,
    OTEL_EXPORTER_OTLP_HEADERS: `authorization=${CANARY},x-team=blue`,
    OTEL_EXPORTER_OTLP_TIMEOUT: "300",
    ...extra,
  });
}

// A queue holding one finished task: one trace and its points.
function fill(t) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  const queue = createQueue();
  registerExporter(store, {
    name: "otlp",
    onTrace: (trace) => queue.addTrace(trace),
    onPoint: (row) => queue.addPoint(row),
  });
  span(store, {
    key: "a1:1:coding",
    taskId: "a1",
    repo: "acme/app",
    spec: "acme-cache",
    stage: "coding",
    attempt: 1,
    startedAt: "2025-11-20T03:00:00.000Z",
    endedAt: "2025-11-20T03:10:00.000Z",
  });
  finishTask(store, {
    taskId: "a1",
    repo: "acme/app",
    spec: "acme-cache",
    finishedAt: "2025-11-20T03:30:00.000Z",
    outcome: "landed",
    firstPass: true,
  });
  return { store, queue };
}

function sender(t, collector, options = {}) {
  const { queue } = options.filled ?? fill(t);
  const clock = { at: 1_000_000 };
  const logs = [];
  const made = createSender({
    config: config(collector),
    context: { instanceId: "11111111-1111-4111-8111-111111111111" },
    queue,
    now: () => clock.at,
    random: () => 0,
    version: "9.9.9",
    log: (line) => logs.push(line),
  });
  return { ...made, queue, clock, logs };
}

test("a batch posts one traces request and one metrics request with the owner's headers", async (t) => {
  const collector = await startCollector(t);
  const s = sender(t, collector);
  await s.pass();
  assert.deepEqual(
    collector.requests.map((r) => r.url),
    ["/v1/traces", "/v1/metrics"],
  );
  for (const request of collector.requests) {
    assert.equal(request.headers["content-type"], "application/json");
    assert.equal(request.headers["user-agent"], "avoozl/9.9.9");
    assert.equal(request.headers.authorization, CANARY);
    assert.equal(request.headers["x-team"], "blue");
  }
  assert.ok(collector.requests[0].body.resourceSpans);
  assert.ok(collector.requests[1].body.resourceMetrics);
  const status = s.status();
  assert.equal(status.sent > 0, true);
  assert.equal(status.queued, 0);
  assert.equal(status.state, "sending");
  assert.equal(status.failure, null);
  assert.match(status.lastSuccessAt, /^\d{4}-/);
});

test("503, 429 with Retry-After, a reset and a timeout retry with backoff", async (t) => {
  const collector = await startCollector(t);
  const s = sender(t, collector);
  const replies = [
    503,
    { status: 429, headers: { "retry-after": "7" } },
    "reset",
    "hold",
  ];
  const waits = [];
  for (const reply of replies) {
    collector.behave = () => reply;
    const before = s.clock.at;
    await s.pass();
    assert.equal(s.status().state, "backing-off");
    // Nothing is sent until the wait is over.
    const count = collector.requests.length;
    await s.pass();
    assert.equal(collector.requests.length, count);
    // The wait is found by moving the clock.
    let wait = 0;
    while (s.status().state === "backing-off") {
      s.clock.at += 500;
      wait += 500;
    }
    waits.push(wait);
    assert.ok(s.clock.at > before);
  }
  assert.deepEqual(waits, [1000, 7000, 4000, 8000]);
  assert.equal(s.status().failure, "timeout");
  assert.equal(s.status().sent, 0);
  // The fifth failure drops the batch.
  await s.pass();
  const status = s.status();
  assert.equal(status.queued, 0);
  assert.equal(status.dropped > 0, true);
  // A collector that is back gets later records.
  collector.behave = () => 200;
});

test("a retried batch that then succeeds is sent once", async (t) => {
  const collector = await startCollector(t);
  const s = sender(t, collector);
  collector.behave = (n) => (n === 1 ? 503 : 200);
  await s.pass();
  s.clock.at += 5000;
  await s.pass();
  assert.equal(s.status().queued, 0);
  assert.equal(s.status().failure, null);
  assert.equal(s.status().dropped, 0);
});

test("a 400 is rejected and not retried, and a 302 is not followed", async (t) => {
  const collector = await startCollector(t);
  const s = sender(t, collector);
  collector.behave = () => 400;
  await s.pass();
  assert.equal(s.status().queued, 0);
  assert.equal(s.status().rejected > 0, true);
  assert.equal(s.status().failure, "http 400");
  assert.equal(collector.requests.length, 2);
  const again = sender(t, collector);
  collector.requests.length = 0;
  collector.behave = () => ({
    status: 302,
    headers: { location: `${collector.url}/elsewhere` },
  });
  await again.pass();
  assert.equal(again.status().failure, "http 302");
  assert.equal(again.status().rejected > 0, true);
  assert.deepEqual([...new Set(collector.requests.map((r) => r.url))].sort(), [
    "/v1/metrics",
    "/v1/traces",
  ]);
});

test("a full queue drops the oldest item and counts it", () => {
  const queue = createQueue(500);
  let dropped = 0;
  for (let i = 0; i < 501; i++) dropped += queue.addTrace({ n: i });
  assert.equal(dropped, 1);
  assert.equal(queue.length(), 500);
  assert.equal(queue.take(1)[0].trace.n, 1);
  // Points share an item up to 100, then start another.
  const points = createQueue();
  for (let i = 0; i < 250; i++) points.addPoint({ id: i });
  assert.equal(points.length(), 3);
  assert.equal(points.units(), 250);
});

test("only one request is in flight at a time", async (t) => {
  const collector = await startCollector(t);
  const s = sender(t, collector);
  collector.behave = () => "hold";
  const first = s.pass();
  const second = s.pass();
  await second;
  await first;
  assert.equal(collector.peak, 1);
});

test("stopping the sender sends nothing from the tables", async (t) => {
  const collector = await startCollector(t);
  const filled = fill(t);
  const s = sender(t, collector, { filled });
  filled.queue.clear();
  await s.pass();
  assert.equal(collector.requests.length, 0);
  point(filled.store, {
    id: "later",
    name: "avoozl.tokens",
    kind: "sum",
    value: 1,
    at: "2025-11-20T04:00:00.000Z",
  });
  await s.pass();
  assert.equal(collector.requests.length, 1);
});

test("the log holds the endpoint's host and port and no header value, body or URL", async (t) => {
  const collector = await startCollector(t);
  const s = sender(t, collector);
  collector.behave = () => 503;
  await s.pass();
  const text = JSON.stringify([s.logs, s.status()]);
  assert.ok(text.includes(new URL(collector.url).host));
  assert.ok(!text.includes(CANARY));
  assert.ok(!text.includes("/v1/"));
  assert.ok(!text.includes("resourceSpans"));
});
