// @ts-nocheck: typing debt
// The recording API (spec otel-export, OT1): the one path every writer of
// timing calls. Each call is checked against the allowlist, written by the
// SQLite exporter, and then handed to the other registered exporters. This
// folder imports nothing from src/app/flow/.
import crypto from "node:crypto";
import { createSqliteExporter } from "./sqlite-exporter.ts";
import { STAGES } from "./stages.ts";

// The one table of fields (§D8). No other code adds a field.
export const FIELDS = Object.freeze({
  span: [
    "key",
    "taskId",
    "repo",
    "spec",
    "stage",
    "role",
    "attempt",
    "harness",
    "source",
    "detail",
    "startedAt",
    "endedAt",
  ],
  point: [
    "id",
    "name",
    "kind",
    "unit",
    "value",
    "at",
    "taskId",
    "repo",
    "spec",
    "stage",
    "role",
    "harness",
    "model",
    "attrs",
  ],
  export: [
    "repo",
    "spec",
    "task.id",
    "stage",
    "role",
    "attempt",
    "harness",
    "model",
    "source",
    "outcome",
    "first_pass",
    "attempts",
    "direction",
    "scope",
    "kind",
    "event",
  ],
});

// A point's `attrs` holds only these (§D3).
const ATTRS = ["direction", "outcome", "first_pass", "scope", "kind", "event"];
const NAME = /^[A-Za-z0-9._:/-]+$/;
const SPEC = /^[A-Za-z0-9._-]+$/;
// A UCUM unit as OTLP writes it: `s`, `{token}`.
const UNIT = /^[A-Za-z0-9._/{}]+$/;
const METRIC = /^[a-z][a-z0-9._]*$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to find them.
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX = 128;
// A point with no stage span around its time, and a stage of its own.
export const UNATTRIBUTED = "unattributed";

const fail = (message) => {
  throw Error(`Telemetry: ${message}`);
};

function text(field, value) {
  if (typeof value !== "string") fail(`${field} must be a string.`);
  if (!value || value.length > MAX)
    fail(`${field} must be 1 to ${MAX} characters.`);
  if (CONTROL.test(value)) fail(`${field} holds a control character.`);
  return value;
}
function time(field, value) {
  if (!Number.isFinite(Date.parse(text(field, value))))
    fail(`${field} must be a time.`);
  return value;
}
function pattern(field, value, regex) {
  if (!regex.test(text(field, value)))
    fail(`${field} holds a character that is not allowed.`);
  return value;
}
function integer(field, value) {
  if (!Number.isInteger(value) || value < 0)
    fail(`${field} must be a whole number.`);
  return value;
}

// One check per field; each returns the value to store.
const CHECKS = {
  key: (v) => text("key", v),
  id: (v) => text("id", v),
  taskId: (v) => text("taskId", v),
  repo: (v) => text("repo", v),
  spec: (v) => pattern("spec", v, SPEC),
  stage: (v, extra = []) => {
    text("stage", v);
    if (![...STAGES, ...extra].includes(v)) fail(`stage ${v} is not known.`);
    return v;
  },
  role: (v) => pattern("role", v, NAME),
  harness: (v) => pattern("harness", v, NAME),
  model: (v) => pattern("model", v, NAME),
  source: (v) => pattern("source", v, NAME),
  attempt: (v) => integer("attempt", v),
  detail: (v) => text("detail", v),
  startedAt: (v) => time("startedAt", v),
  endedAt: (v) => time("endedAt", v),
  at: (v) => time("at", v),
  unit: (v) => pattern("unit", v, UNIT),
  name: (v) => pattern("name", v, METRIC),
  kind: (v) => {
    if (v !== "sum" && v !== "histogram")
      fail("kind must be sum or histogram.");
    return v;
  },
  value: (v) => {
    if (typeof v !== "number" || !Number.isFinite(v))
      fail("value must be a finite number.");
    return v;
  },
  attrs: (v) => {
    if (!v || typeof v !== "object" || Array.isArray(v))
      fail("attrs must be an object.");
    const out = {};
    for (const [key, value] of Object.entries(v)) {
      if (!ATTRS.includes(key)) fail(`attrs.${key} is not an allowed field.`);
      if (typeof value === "boolean") out[key] = value;
      else out[key] = text(`attrs.${key}`, value);
    }
    return out;
  },
};

// Refuse an unknown field, and a value its field does not allow. A field set
// to null or undefined is left out.
function clean(kind, input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(`a ${kind} must be an object.`);
  const out = {};
  for (const [field, value] of Object.entries(input)) {
    if (!FIELDS[kind].includes(field))
      fail(`${field} is not a field of a ${kind}.`);
    if (value === undefined || value === null) continue;
    out[field] =
      field === "stage"
        ? CHECKS.stage(value, kind === "point" ? [UNATTRIBUTED] : [])
        : CHECKS[field](value);
  }
  return out;
}

const sha = (...parts) =>
  crypto.createHash("sha256").update(parts.join("\n")).digest("hex");
// The first 16 bytes of sha256 over the repository, spec and task (§D7).
export const traceId = (repo, spec, taskId) =>
  sha("avoozl.trace", repo ?? "", spec ?? "", taskId).slice(0, 32);
// The row's own ID. The OTLP exporter derives the ID it sends from the key and
// the instance ID, so a row does not depend on a state file.
export const spanId = (key) => sha("avoozl.span", key).slice(0, 16);
export const rootKey = (taskId) => `root:${taskId}`;

const contexts = new WeakMap();

// The recording state of one store: its SQLite exporter, registered first,
// and the exporters after it.
function context(store) {
  let value = contexts.get(store);
  if (!value) {
    value = { sqlite: createSqliteExporter(store), others: [] };
    contexts.set(store, value);
  }
  return value;
}

// Tests pass small limits or a clock before the first write.
export function openTelemetry(store, options) {
  const value = { sqlite: createSqliteExporter(store, options), others: [] };
  contexts.set(store, value);
  return value;
}

export const sqliteExporter = (store) => context(store).sqlite;

// The exporters after SQLite, by name. SQLite cannot be unregistered.
export const exporters = (store) => [
  context(store).sqlite,
  ...context(store).others,
];
export function registerExporter(store, exporter) {
  const { others } = context(store);
  if (exporter.name === "sqlite") fail("sqlite is already registered.");
  if (!others.includes(exporter)) others.push(exporter);
}
export function unregisterExporter(store, name) {
  const value = context(store);
  value.others = value.others.filter((exporter) => exporter.name !== name);
}

// shortcut: a hook runs inside the caller's transaction, so a rollback after
// it leaves the other exporter with a record the database lacks; upgrade when
// an exporter must not see a rolled-back write.
function notify(store, hook, row) {
  for (const exporter of context(store).others) {
    try {
      const result = exporter[hook]?.(row);
      // An async hook is not waited for.
      if (typeof result?.catch === "function") result.catch(() => {});
    } catch {}
  }
}

const SPAN_FIELD = {
  taskId: "task_id",
  startedAt: "started_at",
  endedAt: "ended_at",
};

// Record or replace the span of `key`. Returns false when the stored row
// already holds these values.
export function span(store, input) {
  const given = clean("span", input);
  for (const field of ["key", "taskId", "stage", "startedAt"])
    if (given[field] === undefined) fail(`a span needs ${field}.`);
  const row = { name: `avoozl.stage.${given.stage}`, attempt: null };
  for (const [field, value] of Object.entries(given))
    row[SPAN_FIELD[field] ?? field] = value;
  row.span_id = spanId(given.key);
  row.trace_id = traceId(given.repo, given.spec, given.taskId);
  row.parent_span_id = spanId(rootKey(given.taskId));
  const changed = context(store).sqlite.writeSpan(row);
  if (changed) notify(store, "onSpan", row);
  return changed;
}

export function dropSpan(store, key) {
  const removed = context(store).sqlite.removeSpan(text("key", key));
  if (removed) notify(store, "onDropSpan", { key });
  return removed > 0;
}

// Record one observation by its ID. Returns false for a repeat.
export function point(store, input) {
  const given = clean("point", input);
  for (const field of ["id", "name", "kind", "value", "at"])
    if (given[field] === undefined) fail(`a point needs ${field}.`);
  const row = { ...given, task_id: given.taskId };
  delete row.taskId;
  if (given.taskId)
    row.trace_id = traceId(given.repo, given.spec, given.taskId);
  if (given.attrs) row.attrs = JSON.stringify(given.attrs);
  const added = context(store).sqlite.putPoint(row);
  if (added) notify(store, "onPoint", row);
  return added;
}

// The tasks whose root span is recorded.
export const finishedTasks = (store) =>
  new Set(
    store.db
      .prepare(
        "SELECT task_id FROM telemetry_spans WHERE parent_span_id IS NULL",
      )
      .all()
      .map((row) => row.task_id),
  );

const seconds = (from, to) => (Date.parse(to) - Date.parse(from)) / 1000;

// Record a task's root span and its task-level points once (§D2). A second
// call finds the root and records nothing. Returns false for a repeat.
export function finishTask(store, input) {
  const { taskId, repo, spec, finishedAt, outcome, firstPass, manual } = input;
  clean("span", {
    key: rootKey(taskId),
    taskId,
    repo,
    spec,
    startedAt: finishedAt,
  });
  time("finishedAt", finishedAt);
  const { sqlite } = context(store);
  const trace = traceId(repo, spec, taskId);
  const key = rootKey(taskId);
  return store.transaction(() => {
    if (sqlite.findSpan(key)) return false;
    const stages = sqlite.stageSpans(trace);
    const done = manual ? "done" : text("outcome", outcome);
    const pass = manual || firstPass === undefined ? null : !!firstPass;
    const attempts = Math.max(1, ...stages.map((s) => s.attempt ?? 1));
    const startedAt = stages.length
      ? stages.reduce(
          (a, s) => (s.started_at < a ? s.started_at : a),
          finishedAt,
        )
      : finishedAt;
    const root = {
      span_id: spanId(key),
      key,
      trace_id: trace,
      parent_span_id: null,
      name: "avoozl.task",
      task_id: taskId,
      repo: repo ?? null,
      spec: spec ?? null,
      started_at: startedAt,
      ended_at: finishedAt,
      outcome: done,
      first_pass: pass === null ? null : pass ? 1 : 0,
      attempts,
    };
    sqlite.writeSpan(root);
    const base = { taskId, repo, spec, at: finishedAt };
    const attrs = { outcome: done };
    if (pass !== null) attrs.first_pass = pass;
    const prefix = `${trace}:`;
    if (stages.length) {
      point(store, {
        ...base,
        id: `${prefix}lead_time`,
        name: "avoozl.task.lead_time",
        kind: "histogram",
        unit: "s",
        value: seconds(startedAt, finishedAt),
        attrs,
      });
      const totals = new Map();
      for (const s of stages)
        if (s.ended_at)
          totals.set(
            s.stage,
            (totals.get(s.stage) ?? 0) + seconds(s.started_at, s.ended_at),
          );
      for (const [stage, value] of totals)
        if (value > 0)
          point(store, {
            ...base,
            id: `${prefix}duration:${stage}`,
            name: "avoozl.stage.duration",
            kind: "histogram",
            unit: "s",
            stage,
            value,
          });
    }
    point(store, {
      ...base,
      id: `${prefix}finished`,
      name: "avoozl.tasks.finished",
      kind: "sum",
      value: 1,
      attrs,
    });
    // shortcut: a point is in the span of its attempt by time alone; upgrade
    // when two spans of one task overlap.
    const models = {};
    if (context(store).others.length)
      for (const s of stages) {
        const model =
          s.ended_at && sqlite.modelIn(taskId, s.started_at, s.ended_at);
        if (model) models[s.span_id] = model;
      }
    notify(store, "onTrace", { root, spans: stages, models });
    return true;
  });
}
