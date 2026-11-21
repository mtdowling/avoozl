// @ts-nocheck: typing debt
// Builds OTLP/HTTP JSON bodies from recorded rows (spec otel-export, OT7, OT8,
// §D7, §D9). Every attribute passes the export allowlist in `record.ts`.
// Wire rules: IDs are lowercase hex, 64-bit integers and times are decimal
// strings, field names are camelCase.
import crypto from "node:crypto";
import { FIELDS, rootKey } from "./record.ts";

const SCOPE = { name: "avoozl" };
const DELTA = 1;
// The bounds of every histogram, in seconds, so a backend can sum them.
export const BOUNDS = [
  30, 60, 120, 300, 600, 1800, 3600, 7200, 14400, 28800, 86400,
];
const EXPORTABLE = new Set(FIELDS.export);

// The instruments (OT8.1): name, kind, unit and the attributes each carries.
const INSTRUMENTS = {
  "avoozl.task.lead_time": {
    kind: "histogram",
    unit: "s",
    attributes: ["repo", "spec", "outcome"],
  },
  "avoozl.stage.duration": {
    kind: "histogram",
    unit: "s",
    attributes: ["repo", "spec", "stage", "role"],
  },
  "avoozl.tasks.finished": {
    kind: "sum",
    unit: "{task}",
    attributes: ["repo", "spec", "outcome", "first_pass"],
  },
  "avoozl.tokens": {
    kind: "sum",
    unit: "{token}",
    attributes: [
      "repo",
      "spec",
      "stage",
      "role",
      "harness",
      "model",
      "direction",
    ],
  },
  "avoozl.credits": {
    kind: "sum",
    unit: "{credit}",
    attributes: ["repo", "spec", "stage", "role", "harness", "model"],
  },
  "avoozl.stop_the_line.events": {
    kind: "sum",
    unit: "{event}",
    attributes: ["repo", "scope", "kind", "event"],
  },
};

const nanos = (iso) => (BigInt(Date.parse(iso)) * 1_000_000n).toString();

// One attribute, or nothing when the value is empty.
function attribute(name, value) {
  if (value === null || value === undefined || value === "") return null;
  const key = `avoozl.${name}`;
  if (typeof value === "boolean") return { key, value: { boolValue: value } };
  if (Number.isInteger(value))
    return { key, value: { intValue: String(value) } };
  if (typeof value === "number") return { key, value: { doubleValue: value } };
  return { key, value: { stringValue: String(value) } };
}

// Only names on the export allowlist are built; the rest is dropped.
function attributes(values) {
  return Object.entries(values)
    .filter(([name]) => EXPORTABLE.has(name))
    .map(([name, value]) => attribute(name, value))
    .filter(Boolean);
}

// The ID Avoozl sends: the machine's instance ID and the span's key (§D7).
const sendSpanId = (instance, key) =>
  crypto
    .createHash("sha256")
    .update(`${instance}\n${key}`)
    .digest("hex")
    .slice(0, 16);

function resource({ instanceId, serviceName = "avoozl", resource: extra }) {
  const text = (key, stringValue) => ({ key, value: { stringValue } });
  return {
    attributes: [
      ...Object.entries(extra ?? {})
        .filter(([key]) => !key.startsWith("service."))
        .map(([key, value]) => text(key, value)),
      text("service.name", serviceName),
      text("service.instance.id", instanceId),
    ],
  };
}

function spanBody(row, ids, extra) {
  const parent = row.parent_span_id === null ? null : ids.root;
  return {
    traceId: row.trace_id,
    spanId: ids.of(row.key),
    ...(parent ? { parentSpanId: parent } : {}),
    name: row.name,
    kind: 1,
    startTimeUnixNano: nanos(row.started_at),
    endTimeUnixNano: nanos(row.ended_at),
    attributes: attributes(extra),
  };
}

// The body for one trace: the root and the task's stage spans. A span with no
// end, or one that ends before it starts, is left out. `models` maps a span
// ID to the one model its token points name. Returns null when no stage span
// is sendable (OT7.6).
export function buildTrace({ root, spans, models = {} }, context) {
  const ids = {
    of: (key) => sendSpanId(context.instanceId, key),
    root: sendSpanId(context.instanceId, rootKey(root.task_id)),
  };
  const sendable = (row) =>
    row.ended_at && Date.parse(row.ended_at) >= Date.parse(row.started_at);
  const stages = spans.filter(sendable);
  if (!stages.length || !sendable(root)) return null;
  const common = { repo: root.repo, spec: root.spec, "task.id": root.task_id };
  return {
    resourceSpans: [
      {
        resource: resource(context),
        scopeSpans: [
          {
            scope: SCOPE,
            spans: [
              spanBody(root, ids, {
                ...common,
                outcome: root.outcome,
                first_pass:
                  root.first_pass === null ? null : root.first_pass === 1,
                attempts: root.attempts,
              }),
              ...stages.map((row) =>
                spanBody(row, ids, {
                  ...common,
                  stage: row.stage,
                  role: row.role,
                  attempt: row.attempt,
                  harness: row.harness,
                  model: models[row.span_id],
                  source: row.source,
                }),
              ),
            ],
          },
        ],
      },
    ],
  };
}

function histogram(point, base) {
  const buckets = BOUNDS.map(() => 0).concat(0);
  const at = BOUNDS.findIndex((bound) => point.value <= bound);
  buckets[at < 0 ? BOUNDS.length : at] = 1;
  return {
    ...base,
    count: "1",
    sum: point.value,
    min: point.value,
    max: point.value,
    bucketCounts: buckets.map(String),
    explicitBounds: BOUNDS,
  };
}

// The body for up to 100 points, one metric for each instrument. A point of a
// name that is not an instrument is left out.
export function buildMetrics(points, context) {
  const metrics = new Map();
  for (const point of points) {
    const instrument = INSTRUMENTS[point.name];
    if (!instrument) continue;
    const given = {
      ...(point.attrs ? JSON.parse(point.attrs) : {}),
      repo: point.repo,
      spec: point.spec,
      stage: point.stage,
      role: point.role,
      harness: point.harness,
      model: point.model,
    };
    const pick = Object.fromEntries(
      instrument.attributes.map((name) => [name, given[name]]),
    );
    const time = nanos(point.at);
    const base = {
      attributes: attributes(pick),
      startTimeUnixNano: time,
      timeUnixNano: time,
    };
    if (!metrics.has(point.name)) metrics.set(point.name, []);
    metrics
      .get(point.name)
      .push(
        instrument.kind === "histogram"
          ? histogram(point, base)
          : { ...base, asDouble: point.value },
      );
  }
  if (!metrics.size) return null;
  return {
    resourceMetrics: [
      {
        resource: resource(context),
        scopeMetrics: [
          {
            scope: SCOPE,
            metrics: [...metrics].map(([name, dataPoints]) => {
              const { kind, unit } = INSTRUMENTS[name];
              return kind === "histogram"
                ? {
                    name,
                    unit,
                    histogram: { aggregationTemporality: DELTA, dataPoints },
                  }
                : {
                    name,
                    unit,
                    sum: {
                      aggregationTemporality: DELTA,
                      isMonotonic: true,
                      dataPoints,
                    },
                  };
            }),
          },
        ],
      },
    ],
  };
}
