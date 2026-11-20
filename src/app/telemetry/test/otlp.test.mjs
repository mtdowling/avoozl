// ot-3.2: trace and metric bodies (OT7, OT8, §D7, §D9, OT14.4).
import assert from "node:assert/strict";
import test from "node:test";
import { Store } from "../../store/store.mjs";
import { BOUNDS, buildMetrics, buildTrace } from "../otlp.mjs";
import { finishTask, point, registerExporter, span } from "../record.mjs";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const t0 = "2025-11-20T03:00:00.000Z";

function stage(extra) {
  return {
    taskId: "a1",
    repo: "acme/app",
    spec: "acme-cache",
    attempt: 1,
    startedAt: t0,
    ...extra,
  };
}

// Records one finished task and returns what an exporter registered beside
// SQLite saw: the trace and the points.
function record(t, { id = "a1", first = true, manual = false, model } = {}) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  const seen = { traces: [], points: [] };
  registerExporter(store, {
    name: "fake",
    onTrace: (trace) => seen.traces.push(trace),
    onPoint: (row) => seen.points.push(row),
  });
  span(
    store,
    stage({
      taskId: id,
      key: `${id}:1:coding`,
      stage: "coding",
      role: "worker",
      harness: "claude",
      source: "tool-calls",
      detail: "CANARY-DETAIL",
      endedAt: "2025-11-20T03:10:00.000Z",
    }),
  );
  span(
    store,
    stage({
      taskId: id,
      key: `${id}:1:tests`,
      stage: "tests",
      startedAt: "2025-11-20T03:10:00.000Z",
      endedAt: "2025-11-20T03:15:00.000Z",
    }),
  );
  if (model)
    point(store, {
      id: `${id}:tok`,
      name: "avoozl.tokens",
      kind: "sum",
      value: 10,
      at: "2025-11-20T03:05:00.000Z",
      taskId: id,
      repo: "acme/app",
      spec: "acme-cache",
      stage: "coding",
      model,
      attrs: { direction: "input" },
    });
  finishTask(store, {
    taskId: id,
    repo: "acme/app",
    spec: "acme-cache",
    finishedAt: "2025-11-20T03:30:00.000Z",
    outcome: "landed",
    firstPass: first,
    manual,
  });
  return seen;
}
const context = (instanceId) => ({ instanceId });
const attr = (span, key) => span.attributes.find((a) => a.key === key)?.value;

// The OTLP JSON rules a body must follow.
function checkAttributes(list) {
  for (const { key, value } of list) {
    assert.match(key, /^[a-z][a-z0-9._]*$/);
    const [kind] = Object.keys(value);
    assert.ok(
      ["stringValue", "boolValue", "intValue", "doubleValue"].includes(kind),
    );
    if (kind === "intValue") assert.equal(typeof value.intValue, "string");
    assert.notEqual(value[kind], "");
  }
}
function checkTrace(body) {
  const [{ resource, scopeSpans }] = body.resourceSpans;
  checkAttributes(resource.attributes);
  for (const s of scopeSpans[0].spans) {
    assert.match(s.traceId, /^[0-9a-f]{32}$/);
    assert.match(s.spanId, /^[0-9a-f]{16}$/);
    assert.equal(s.kind, 1);
    for (const field of ["startTimeUnixNano", "endTimeUnixNano"])
      assert.match(s[field], /^[0-9]{19}$/);
    assert.equal(s.status, undefined);
    checkAttributes(s.attributes);
  }
}
function checkMetrics(body) {
  const [{ resource, scopeMetrics }] = body.resourceMetrics;
  checkAttributes(resource.attributes);
  for (const metric of scopeMetrics[0].metrics) {
    const data = metric.sum ?? metric.histogram;
    assert.equal(data.aggregationTemporality, 1);
    for (const p of data.dataPoints) {
      assert.match(p.timeUnixNano, /^[0-9]{19}$/);
      checkAttributes(p.attributes);
      if (metric.histogram) {
        assert.equal(typeof p.count, "string");
        assert.equal(p.bucketCounts.length, BOUNDS.length + 1);
        assert.equal(
          p.bucketCounts.reduce((sum, n) => sum + Number(n), 0),
          Number(p.count),
        );
        assert.deepEqual(p.explicitBounds, BOUNDS);
      } else assert.equal(typeof p.asDouble, "number");
    }
  }
}

test("a trace body is deterministic, well formed and links stage spans to the root", (t) => {
  const seen = record(t);
  const [trace] = seen.traces;
  const first = buildTrace(trace, context(A));
  assert.deepEqual(first, buildTrace(trace, context(A)));
  checkTrace(first);
  const [root, ...stages] = first.resourceSpans[0].scopeSpans[0].spans;
  assert.equal(root.name, "avoozl.task");
  assert.equal(root.parentSpanId, undefined);
  assert.equal(stages.length, 2);
  for (const s of stages) assert.equal(s.parentSpanId, root.spanId);
  assert.deepEqual(attr(root, "avoozl.outcome"), { stringValue: "landed" });
  assert.deepEqual(attr(root, "avoozl.first_pass"), { boolValue: true });
  assert.deepEqual(attr(root, "avoozl.attempts"), { intValue: "1" });
  assert.deepEqual(attr(root, "avoozl.task.id"), { stringValue: "a1" });
  assert.equal(attr(stages[1], "avoozl.role"), undefined);
  assert.equal(root.startTimeUnixNano, "1763607600000000000");
  assert.ok(!JSON.stringify(first).includes("CANARY-DETAIL"));
  const other = buildTrace(trace, context(B));
  assert.equal(
    other.resourceSpans[0].scopeSpans[0].spans[0].traceId,
    root.traceId,
  );
  assert.notEqual(
    other.resourceSpans[0].scopeSpans[0].spans[0].spanId,
    root.spanId,
  );
});

test("a span with no end or a negative length is left out, and no stage means no trace", (t) => {
  const { traces } = record(t);
  const [trace] = traces;
  const open = { ...trace, spans: [{ ...trace.spans[0], ended_at: null }] };
  assert.equal(buildTrace(open, context(A)), null);
  const backwards = {
    ...trace,
    spans: [{ ...trace.spans[0], ended_at: "2025-11-20T02:00:00.000Z" }],
  };
  assert.equal(buildTrace(backwards, context(A)), null);
  const mixed = {
    ...trace,
    spans: [trace.spans[0], { ...trace.spans[1], ended_at: null }],
  };
  const body = buildTrace(mixed, context(A));
  assert.equal(body.resourceSpans[0].scopeSpans[0].spans.length, 2);
});

test("avoozl.model is sent only when the token points in a span name one model", (t) => {
  const one = record(t, { model: "model-x" }).traces[0];
  const spans = (trace) =>
    buildTrace(trace, context(A)).resourceSpans[0].scopeSpans[0].spans;
  assert.deepEqual(attr(spans(one)[1], "avoozl.model"), {
    stringValue: "model-x",
  });
  assert.equal(attr(spans(one)[2], "avoozl.model"), undefined);
  assert.equal(attr(spans(record(t).traces[0])[1], "avoozl.model"), undefined);
});

test("a first-pass and a reworked task give finished points that differ only in first_pass", (t) => {
  const points = [
    ...record(t, { id: "a1", first: true }).points,
    ...record(t, { id: "a2", first: false }).points,
  ];
  const body = buildMetrics(points, context(A));
  checkMetrics(body);
  const metrics = body.resourceMetrics[0].scopeMetrics[0].metrics;
  const finished = metrics.find((m) => m.name === "avoozl.tasks.finished");
  const [pass, rework] = finished.sum.dataPoints;
  const keys = (p) => p.attributes.map((a) => a.key);
  assert.deepEqual(keys(pass), keys(rework));
  const differing = pass.attributes
    .filter(
      (a, i) => JSON.stringify(a) !== JSON.stringify(rework.attributes[i]),
    )
    .map((a) => a.key);
  assert.deepEqual(differing, ["avoozl.first_pass"]);
  assert.ok(!JSON.stringify(body).includes('"avoozl.task.id"'));
  assert.ok(metrics.some((m) => m.name === "avoozl.task.lead_time"));
  const lead = metrics.find((m) => m.name === "avoozl.task.lead_time");
  assert.equal(lead.histogram.dataPoints[0].sum, 1800);
  assert.equal(lead.histogram.dataPoints[0].bucketCounts[5], "1");
});

test("a manual task has outcome done and no first_pass", (t) => {
  const { points } = record(t, { manual: true });
  const body = buildMetrics(points, context(A));
  const finished = body.resourceMetrics[0].scopeMetrics[0].metrics.find(
    (m) => m.name === "avoozl.tasks.finished",
  );
  const names = finished.sum.dataPoints[0].attributes.map((a) => [
    a.key,
    Object.values(a.value)[0],
  ]);
  assert.deepEqual(names, [
    ["avoozl.repo", "acme/app"],
    ["avoozl.spec", "acme-cache"],
    ["avoozl.outcome", "done"],
  ]);
});

test("token, credit and stop points become delta sums without a task ID", () => {
  const row = (name, extra) => ({
    id: name,
    name,
    kind: "sum",
    at: t0,
    value: 5,
    task_id: "a1",
    repo: "acme/app",
    spec: "acme-cache",
    stage: "coding",
    role: "worker",
    harness: "claude",
    model: "model-x",
    ...extra,
  });
  const body = buildMetrics(
    [
      row("avoozl.tokens", { attrs: '{"direction":"output"}' }),
      row("avoozl.credits"),
      row("avoozl.stop_the_line.events", {
        attrs: '{"scope":"dependents","kind":"check","event":"pulled"}',
      }),
      row("avoozl.unknown"),
    ],
    context(A),
  );
  checkMetrics(body);
  const metrics = body.resourceMetrics[0].scopeMetrics[0].metrics;
  assert.deepEqual(
    metrics.map((m) => [m.name, m.unit, m.sum.isMonotonic]),
    [
      ["avoozl.tokens", "{token}", true],
      ["avoozl.credits", "{credit}", true],
      ["avoozl.stop_the_line.events", "{event}", true],
    ],
  );
  const stop = metrics[2].sum.dataPoints[0].attributes.map((a) => a.key);
  assert.deepEqual(stop, [
    "avoozl.repo",
    "avoozl.scope",
    "avoozl.kind",
    "avoozl.event",
  ]);
  assert.equal(buildMetrics([row("avoozl.unknown")], context(A)), null);
});
