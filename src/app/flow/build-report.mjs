// Build reports, version 1 (Requirement 101.7-101.9, design §4.31,
// docs/build-report.md). A repository writes them; Avoozl only reads,
// stores, shows and compares them. No budget, limit or profiler lives here.

const REPORT_FORMAT = "avoozl.build-report";
const REPORT_VERSION = 1;
const COSTS = ["build", "provisioning", "cache", "test"];
// The comparison key, in order.
const KEY_FIELDS = ["workload", "engine", "target", "toolchain", "cache"];
const LIMITS = {
  workload: 80,
  engine: 80,
  target: 80,
  toolchain: 120,
  cache: 32,
};
const MAX_PARTS = 32;
const MAX_COUNTERS = 16;
// Fields a receipt line already has, so a report field cannot shadow one.
const RECEIPT_FIELDS = new Set([
  "v",
  "issue",
  "task",
  "attempt",
  "phase",
  "commit",
  "command",
  "target",
  "start",
  "ms",
  "exit",
  "counters",
  "at",
]);
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const ARTIFACT_PREFIX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

const isRecord = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isMs = (value) => Number.isFinite(value) && value >= 0;

// `receipts.report` from `.avoozl.json`: `{ field }`, `{ artifact }` or
// absent. Throws on anything else, so a typo is not read as "no reports".
export function validateReportSetting(value, source = "receipts.report") {
  if (value === undefined || value === null) return null;
  if (!isRecord(value))
    throw Error(`${source} must be {"field": NAME} or {"artifact": PREFIX}.`);
  const keys = Object.keys(value);
  if (keys.length !== 1 || !["field", "artifact"].includes(keys[0]))
    throw Error(
      `${source} must have exactly one of field or artifact, not ${keys.join(", ") || "neither"}.`,
    );
  if ("field" in value) {
    const name = value.field;
    if (typeof name !== "string" || !FIELD_NAME.test(name))
      throw Error(
        `${source}.field must be a name of letters, digits and underscores.`,
      );
    if (RECEIPT_FIELDS.has(name))
      throw Error(`${source}.field ${name} is already a receipt field.`);
    return { field: name };
  }
  const prefix = value.artifact;
  if (typeof prefix !== "string" || !ARTIFACT_PREFIX.test(prefix))
    throw Error(
      `${source}.artifact must be an artifact name prefix of letters, digits, dots, dashes and underscores.`,
    );
  if (prefix.startsWith("build-receipt"))
    throw Error(
      `${source}.artifact must not start with build-receipt, which names receipts.`,
    );
  return { artifact: prefix };
}

// True when an artifact holds reports under the given setting.
export const isReportArtifact = (name, setting) =>
  Boolean(setting?.artifact) && String(name).startsWith(setting.artifact);

function text(value, field, limit) {
  if (value === undefined || value === null) return { missing: field };
  if (typeof value !== "string" || !value.trim() || value.length > limit)
    return { invalid: field };
  return { value };
}

// One report value: `{ breakdown }`, or `{ skip }` with the reason. Nothing
// is guessed: an unknown version, a missing field or a bad value skips it.
export function parseBuildReport(value) {
  if (!isRecord(value)) return { skip: "not-object" };
  if (value.format !== REPORT_FORMAT || value.v !== REPORT_VERSION)
    return { skip: "version" };
  const breakdown = {};
  for (const field of KEY_FIELDS) {
    const result = text(value[field], field, LIMITS[field]);
    if (!("value" in result))
      return { skip: result.missing ? `missing:${field}` : `invalid:${field}` };
    breakdown[field] = result.value;
  }
  if (value.costs === undefined) return { skip: "missing:costs" };
  if (!isRecord(value.costs)) return { skip: "invalid:costs" };
  breakdown.costs = {};
  for (const cost of COSTS) {
    if (value.costs[cost] === undefined)
      return { skip: `missing:costs.${cost}` };
    if (!isMs(value.costs[cost])) return { skip: `invalid:costs.${cost}` };
    breakdown.costs[cost] = value.costs[cost];
  }
  breakdown.parts = [];
  if (value.parts !== undefined) {
    if (!Array.isArray(value.parts) || value.parts.length > MAX_PARTS)
      return { skip: "invalid:parts" };
    for (const part of value.parts) {
      if (
        !isRecord(part) ||
        typeof part.name !== "string" ||
        !part.name.trim() ||
        part.name.length > 80 ||
        !COSTS.includes(part.kind) ||
        !isMs(part.ms)
      )
        return { skip: "invalid:parts" };
      breakdown.parts.push({ name: part.name, kind: part.kind, ms: part.ms });
    }
  }
  breakdown.counters = {};
  if (value.counters !== undefined) {
    if (!isRecord(value.counters)) return { skip: "invalid:counters" };
    const entries = Object.entries(value.counters);
    if (
      entries.length > MAX_COUNTERS ||
      entries.some(([key, n]) => key.length > 64 || !Number.isFinite(n))
    )
      return { skip: "invalid:counters" };
    breakdown.counters = Object.fromEntries(entries);
  }
  breakdown.task =
    typeof value.task === "string" ? value.task.slice(0, 80) : null;
  breakdown.attempt =
    Number.isSafeInteger(value.attempt) && value.attempt > 0
      ? value.attempt
      : null;
  breakdown.commit = typeof value.commit === "string" ? value.commit : null;
  breakdown.at = typeof value.at === "string" ? value.at : null;
  return { breakdown };
}

// The five key fields joined, or null when any is missing. Only breakdowns
// with equal non-null keys are ever compared (Requirement 101.9).
export function comparisonKey(breakdown) {
  const values = KEY_FIELDS.map((field) => breakdown?.[field]);
  if (values.some((value) => typeof value !== "string" || !value)) return null;
  return JSON.stringify(values);
}

function collect(values) {
  const breakdowns = [],
    reasons = {};
  let skipped = 0;
  for (const { value, line } of values) {
    const result = parseBuildReport(value);
    if (result.breakdown) {
      // In the field form, the receipt line fills what the report leaves out.
      const b = result.breakdown;
      if (line) {
        b.task ??=
          typeof line.task === "string" ? line.task.slice(0, 80) : null;
        b.attempt ??=
          Number.isSafeInteger(line.attempt) && line.attempt > 0
            ? line.attempt
            : null;
        b.commit ??= typeof line.commit === "string" ? line.commit : null;
        b.at ??= typeof line.at === "string" ? line.at : null;
      }
      b.attempt ??= 1;
      breakdowns.push(b);
    } else {
      skipped += 1;
      reasons[result.skip] = (reasons[result.skip] ?? 0) + 1;
    }
  }
  return { breakdowns, skipped, reasons };
}

function jsonLines(text) {
  const out = [];
  let bad = 0;
  for (const line of String(text).split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      bad += 1;
    }
  }
  return { values: out, bad };
}

function withBadLines(result, bad) {
  if (!bad) return result;
  result.skipped += bad;
  result.reasons.json = (result.reasons.json ?? 0) + bad;
  return result;
}

// Reports in a receipt file, field form: the object at `setting.field` of
// each line. A line without that field has no report and is not counted; a
// line that is not JSON is the receipt parser's skip, not counted twice.
export function reportsFromReceipts(text, setting) {
  if (!setting?.field) return { breakdowns: [], skipped: 0, reasons: {} };
  const found = jsonLines(text)
    .values.filter(
      (line) => isRecord(line) && line[setting.field] !== undefined,
    )
    .map((line) => ({ value: line[setting.field], line }));
  return collect(found);
}

// Reports in a report artifact's file: one report per line.
export function reportsFromArtifact(text) {
  const { values, bad } = jsonLines(text);
  return withBadLines(collect(values.map((value) => ({ value }))), bad);
}
