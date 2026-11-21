// Flow (design §4.11, Requirements 43–48): where each task's time goes, and
// the settings the flow rules read. Timing is always on; there is no setting
// for it. A span is one stretch of one attempt in one stage, and names the
// source it came from (tool calls, phase markers, or events) so a coarse
// number never reads as an exact one. Spans hold durations, stage names, and
// check or command names only: no prompts, output, tokens, or cost.
import { crossPlanEpics, taskEpic } from "../epics/epics.mjs";
import fs from "node:fs";
import path from "node:path";
import {
  check as checkContent,
  contentBinding,
} from "../content/content-rules.mjs";
import {
  FINAL_STATUSES,
  listSessionBindings,
} from "../sessions/session-bindings.mjs";
import { taskRepository } from "../../work-model.mjs";
import { inPlan } from "../api/page-views.mjs";
import { fail } from "../store/store.mjs";
import { STAGES } from "../telemetry/stages.mjs";
import * as telemetry from "../telemetry/record.mjs";
import { listStageSpans } from "../telemetry/sqlite-exporter.mjs";

export { STAGES };
// Active time in flow efficiency; the rest is waiting on someone else.
const ACTIVE = new Set([
  "coding",
  "tests",
  "commands",
  "checks",
  "rework",
  "merge",
]);
export const SOURCES = Object.freeze(["tool-calls", "markers", "events"]);
// The phases a worker may mark with plans_report progress (R43.5).
export const PHASES = Object.freeze(["coding", "tests", "commands", "ci-wait"]);

// ---------------------------------------------------------------- settings

export const FLOW_DEFAULTS = Object.freeze({
  stopTheLine: Object.freeze({ scope: "dependents" }),
  localChecksFirst: true,
  // Verify (§4.26, R86.6, R86.7): protected paths beyond the built-in ones,
  // and each check's timeout.
  verify: Object.freeze({
    checkTimeoutSeconds: 1200,
    protectedPaths: Object.freeze([]),
    checkTimeouts: Object.freeze({}),
  }),
});
export const SCOPES = Object.freeze(["dependents", "repo", "all"]);
const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// The settings Settings > Flow edits, each with how it is checked.
export const FLOW_KEYS = Object.freeze({
  "stopTheLine.scope": (v) =>
    SCOPES.includes(v) || `one of ${SCOPES.join(", ")}`,
  localChecksFirst: (v) => typeof v === "boolean" || "true or false",
  "verify.checkTimeoutSeconds": (v) =>
    (Number.isInteger(v) && v >= 1 && v <= 86400) || "a whole number 1–86400",
});

// `verify.protectedPaths`: at most 50 path globs. `verify.checkTimeouts`: a
// check's command to its own timeout in seconds.
function verifyProblem(inner, value) {
  if (inner === "protectedPaths")
    return Array.isArray(value) &&
      value.length <= 50 &&
      value.every((g) => typeof g === "string" && g && g.length <= 200)
      ? null
      : "a list of at most 50 path globs";
  if (
    record(value) &&
    Object.keys(value).length <= 100 &&
    Object.entries(value).every(
      ([k, v]) =>
        k && k.length <= 500 && Number.isInteger(v) && v >= 1 && v <= 86400,
    )
  )
    return null;
  return "an object of check commands to whole seconds 1–86400";
}
const VERIFY_LISTS = new Set(["protectedPaths", "checkTimeouts"]);
// Every `flow` setting by dotted path: the checked values above, the lists
// checked on their own. A test holds src/avoozl-config.schema.json to this list.
export const FLOW_PATHS = Object.freeze([
  ...Object.keys(FLOW_KEYS),
  ...[...VERIFY_LISTS].map((key) => `verify.${key}`),
]);

// Check one `flow` object (the workspace's or one repository's) and return
// it with only the keys it sets. Throws naming the key, so the tick keeps its
// last valid policy and Settings refuses the save (R48.7, R47.8).
export function flowSection(value, where = "flow") {
  if (value === undefined) return {};
  if (!record(value)) throw Error(`${where} must be an object.`);
  const groups = { stopTheLine: 1, verify: 1 };
  for (const key of Object.keys(value)) {
    if (key === "localChecksFirst") continue;
    if (!(key in groups)) throw Error(`${where}.${key} is not a flow setting.`);
    if (!record(value[key])) throw Error(`${where}.${key} must be an object.`);
    for (const inner of Object.keys(value[key])) {
      if (key === "verify" && VERIFY_LISTS.has(inner)) {
        const problem = verifyProblem(inner, value.verify[inner]);
        if (problem)
          throw Error(`${where}.verify.${inner} must be ${problem}.`);
        continue;
      }
      if (!(`${key}.${inner}` in FLOW_KEYS))
        throw Error(`${where}.${key}.${inner} is not a flow setting.`);
    }
  }
  for (const [key, valid] of Object.entries(FLOW_KEYS)) {
    const v = readKey(value, key);
    if (v === undefined) continue;
    const ok = valid(v);
    if (ok !== true) throw Error(`${where}.${key} must be ${ok}.`);
  }
  return structuredClone(value);
}

export function readKey(value, key) {
  return key
    .split(".")
    .reduce((v, part) => (record(v) ? v[part] : undefined), value);
}

function merged(...layers) {
  const out = structuredClone(FLOW_DEFAULTS);
  for (const layer of layers)
    for (const key of Object.keys(FLOW_KEYS)) {
      const v = readKey(layer, key);
      if (v === undefined) continue;
      const [group, inner] = key.split(".");
      if (inner) out[group] = { ...out[group], [inner]: v };
      else out[group] = v;
    }
  for (const layer of layers) {
    // A repository adds protected paths; it never removes the workspace's.
    const guarded = readKey(layer, "verify.protectedPaths"),
      timeouts = readKey(layer, "verify.checkTimeouts");
    if (Array.isArray(guarded))
      out.verify = {
        ...out.verify,
        protectedPaths: [
          ...new Set([...out.verify.protectedPaths, ...guarded]),
        ],
      };
    if (record(timeouts))
      out.verify = {
        ...out.verify,
        checkTimeouts: { ...out.verify.checkTimeouts, ...timeouts },
      };
  }
  return out;
}

// `.avoozl.json`'s flow settings: the workspace's, each repository's override
// (`repositories.<id>.flow`), and a reader for one repository. A missing key
// means its default.
export function flowPolicy(config) {
  const workspace = flowSection(config?.flow, "flow"),
    repositories = {};
  for (const [id, repository] of Object.entries(
    record(config?.repositories) ? config.repositories : {},
  ))
    if (record(repository) && repository.flow !== undefined)
      repositories[id] = flowSection(
        repository.flow,
        `repositories.${id}.flow`,
      );
  const base = merged(workspace);
  return {
    workspace: base,
    set: { workspace, repositories },
    for: (repository) =>
      repositories[repository]
        ? merged(workspace, repositories[repository])
        : base,
  };
}

// ------------------------------------------------------------------- spans

// Every stage span, oldest first, from the local telemetry table.
export const listSpans = (store, { taskId } = {}) =>
  listStageSpans(store.db, { taskId });

// The repository and spec a task's spans carry, so every span of one task
// names one trace. A value the recording API would refuse is left out.
const SPEC_NAME = /^[A-Za-z0-9._-]{1,128}$/;
export function traceFields(store, taskId) {
  const task = store.read().tasks.find((t) => t.id === taskId),
    repo = taskRepository(task),
    spec = task?.planId;
  return {
    ...(typeof repo === "string" && repo && repo.length <= 128 ? { repo } : {}),
    ...(typeof spec === "string" && SPEC_NAME.test(spec) ? { spec } : {}),
  };
}

// Record or replace one stage span through the recording API; `id` is the
// span's stable key. Returns false when nothing changed.
export function recordSpan(store, span) {
  if (!STAGES.includes(span.stage)) fail(`Unknown flow stage ${span.stage}.`);
  if (!SOURCES.includes(span.source))
    fail(`Unknown span source ${span.source}.`);
  return telemetry.span(store, {
    key: span.id,
    taskId: span.taskId,
    ...traceFields(store, span.taskId),
    stage: span.stage,
    role: span.role ?? null,
    attempt: span.attempt ?? null,
    source: span.source,
    detail: span.detail || null,
    startedAt: span.startedAt,
    endedAt: span.endedAt ?? null,
  });
}

// Store a stop-the-line row. A new stop records a `pulled` point and a stop
// that just closed a `resumed` one (OT8.7), with its scope and kind and never
// its check or reason.
export function putStop(store, stop) {
  const before = store.get("flow_stops", stop.id);
  store.put("flow_stops", stop);
  const event = !before
    ? "pulled"
    : stop.closedAt && !before.closedAt
      ? "resumed"
      : null;
  if (!event) return;
  const repo = stop.repositoryId;
  telemetry.point(store, {
    id: `${stop.id}:${event}`,
    name: "avoozl.stop_the_line.events",
    kind: "sum",
    unit: "{event}",
    value: 1,
    at: event === "pulled" ? stop.openedAt : stop.closedAt,
    ...(typeof repo === "string" && repo && repo.length <= 128 ? { repo } : {}),
    attrs: {
      scope: String(stop.scope || "dependents").slice(0, 128),
      kind: stop.manual ? "manual" : "check",
      event,
    },
  });
}

// Record each finished task's root span and task points once (OT3.4).
// A task with no stage span on this machine records nothing, so a database
// that predates the tables does not record its whole history at once.
function finishTasks(store, data) {
  const done = telemetry.finishedTasks(store);
  for (const task of data.tasks) {
    const end = finishedAt(task);
    if (!end || done.has(task.id)) continue;
    const spans = listSpans(store, { taskId: task.id });
    if (!spans.length) continue;
    const timing = taskTiming(store, task, { spans });
    try {
      telemetry.finishTask(store, {
        taskId: task.id,
        ...traceFields(store, task.id),
        finishedAt: end,
        outcome: "landed",
        firstPass: timing.firstPass,
        manual: task.manual === true,
      });
    } catch {}
  }
}

// A check or command name, kept only when it passes the content rules at the
// `brief` boundary (R43.6); a match or an unavailable set drops it.
function spanDetail(store, text, repository = null) {
  if (typeof text !== "string" || !text.trim()) return null;
  const value = text.trim().slice(0, 120);
  if (!contentBinding(store)?.workspaceRoot) return value;
  try {
    const { findings, unavailable } = checkContent(store, {
      boundary: "brief",
      repository,
      target: "flow-detail",
      text: value,
    });
    return findings.length || unavailable.length ? null : value;
  } catch {
    return null;
  }
}

// The command's first words: the program and, when it has one, its
// subcommand. Never its arguments.
export function commandName(command) {
  const words = String(command || "")
    .trim()
    .split(/\s+/)
    .filter((w) => !/^[A-Z_][A-Z0-9_]*=/.test(w));
  if (!words.length) return null;
  const [program, sub] = words;
  return sub && /^[a-z][a-z0-9:_-]*$/.test(sub) ? `${program} ${sub}` : program;
}

const spanId = (source, taskId, attempt, role, stage, at) =>
  `${source}:${taskId}:${attempt ?? 0}:${role || "-"}:${stage}:${at}`;

const openSpans = (store, taskId, attempt, role) =>
  listSpans(store, { taskId }).filter(
    (s) => s.attempt === attempt && s.role === role && !s.endedAt,
  );

function closeOpen(store, taskId, attempt, role, at, { except = null } = {}) {
  for (const span of openSpans(store, taskId, attempt, role))
    if (!except || !except(span))
      recordSpan(store, {
        ...span,
        endedAt: span.startedAt > at ? span.startedAt : at,
      });
}

const BLOCKING_EDGES = new Set(["requires", "sequence"]);
const workerStage = (attempt) => (attempt > 1 ? "rework" : "coding");
const firstStage = (binding) => workerStage(binding.attempt);
const isRunner = (b) =>
  b.role === "worker" && ["tick", "conductor"].includes(b.source);

// The first stretch of a worker attempt, from its binding (events).
function ensureWorkerStart(store, binding) {
  const spans = listSpans(store, { taskId: binding.taskId }).filter(
    (s) => s.attempt === binding.attempt && s.role === "worker",
  );
  if (spans.length) return;
  recordSpan(store, {
    id: spanId(
      "events",
      binding.taskId,
      binding.attempt,
      "worker",
      firstStage(binding),
      binding.boundAt,
    ),
    taskId: binding.taskId,
    attempt: binding.attempt,
    role: "worker",
    stage: firstStage(binding),
    startedAt: binding.boundAt,
    source: "events",
  });
}

// plans_report, as it is taken: phase markers, waiting on a question, and
// the end of an attempt (R43.3, R43.5). Called after the report is stored.
export function flowOnReport(store, binding, report) {
  if (!binding || !report?.at) return;
  const at = report.at,
    { taskId, attempt } = binding;
  if (binding.role !== "worker") {
    if (["done", "blocked"].includes(report.kind))
      closeOpen(store, taskId, attempt, binding.role, at);
    return;
  }
  if (!isRunner(binding)) return;
  ensureWorkerStart(store, binding);
  const open = openSpans(store, taskId, attempt, "worker"),
    waiting = open.find((s) => s.stage === "waiting"),
    tools = listSpans(store, { taskId }).some(
      (s) =>
        s.attempt === attempt &&
        s.role === "worker" &&
        s.source === "tool-calls",
    ),
    put = (stage, source, detail = null) =>
      recordSpan(store, {
        id: spanId(source, taskId, attempt, "worker", stage, at),
        taskId,
        attempt,
        role: "worker",
        stage,
        startedAt: at,
        source,
        detail,
      });
  if (report.kind === "done" || report.kind === "blocked") {
    closeOpen(store, taskId, attempt, "worker", at);
    // Blocked on a person or another task: waiting until the next attempt.
    if (report.kind === "blocked") put("waiting", "events");
    return;
  }
  if (report.kind === "question") {
    if (waiting) return;
    closeOpen(store, taskId, attempt, "worker", at);
    put("waiting", "events");
    return;
  }
  // progress: an answered question resumes; a phase marker switches stage.
  // Tool calls, when Avoozl reads them, say more than a marker does.
  const phase = report.phase;
  if (waiting) {
    closeOpen(store, taskId, attempt, "worker", at);
    if (!tools)
      put(
        phase && attempt === 1 ? phase : workerStage(attempt),
        phase ? "markers" : "events",
      );
    return;
  }
  if (!phase || tools || attempt > 1) return;
  const current = open.find((s) => s.stage !== "waiting");
  if (current?.stage === phase && current.source === "markers") return;
  closeOpen(store, taskId, attempt, "worker", at);
  put(phase, "markers");
}

// When a task became ready for this attempt, from events Avoozl already
// holds, so planning a dispatch writes nothing: attempt 1 is ready when its
// last blocker finished (else when its plan was approved); a later attempt
// when the one before it was recorded failed or a person retried it.
// `memo` holds the task, edge and approval lookups across calls on the same
// data, so one tick builds them once instead of once per binding.
export function readyAt(store, data, task, attempt, memo = {}) {
  if (attempt > 1) {
    const delivery = store.get("task_deliveries", task.id),
      before = delivery?.attempts?.find((a) => a.attempt === attempt - 1);
    return (
      [before?.at, delivery?.retriedAt].filter(Boolean).sort().at(-1) || null
    );
  }
  memo.byId ??= new Map(data.tasks.map((t) => [t.id, t]));
  if (!memo.blockers) {
    memo.blockers = new Map();
    for (const e of data.edges)
      if (BLOCKING_EDGES.has(e.kind)) {
        if (!memo.blockers.has(e.to)) memo.blockers.set(e.to, []);
        memo.blockers.get(e.to).push(e.from);
      }
  }
  const blockers = (memo.blockers.get(task.id) || [])
    .map((id) => memo.byId.get(id))
    .filter(Boolean)
    .map((t) => finishedAt(t) || t.childrenComplete?.at || t.acceptedAt || null)
    .filter(Boolean)
    .sort();
  if (blockers.length) return blockers.at(-1);
  if (!task.planId) return null;
  memo.approvals ??= listOr(store, "approvals");
  const approvals = memo.approvals
    .filter((a) => a.planId === task.planId && a.at)
    .map((a) => a.at)
    .sort();
  return approvals[0] || null;
}

// The tick's event spans (R43.3): queued (ready to bound), each attempt's
// start, verifier and review sessions, merge, and closing spans at the event
// that ends them. Writes only what changed; an open span stays open across a
// restart and closes here at its ending event (R43.8).
export function syncSpans(store, { now = Date.now() } = {}) {
  const at = new Date(now).toISOString(),
    bindings = listSessionBindings(store),
    spans = listSpans(store),
    byTask = new Map();
  for (const span of spans) {
    if (!byTask.has(span.taskId)) byTask.set(span.taskId, []);
    byTask.get(span.taskId).push(span);
  }
  const own = (taskId) => byTask.get(taskId) || [];
  let data = null;
  const memo = {};
  for (const binding of bindings) {
    const { taskId, attempt } = binding;
    if (isRunner(binding)) {
      // queued: from ready to this worker's binding.
      if (
        !own(taskId).some((s) => s.stage === "queued" && s.attempt === attempt)
      ) {
        data ||= store.read();
        memo.byId ??= new Map(data.tasks.map((t) => [t.id, t]));
        const task = memo.byId.get(taskId),
          from = task && readyAt(store, data, task, attempt, memo);
        if (from && from < binding.boundAt)
          recordSpan(store, {
            id: spanId("events", taskId, attempt, null, "queued", from),
            taskId,
            attempt,
            stage: "queued",
            startedAt: from,
            endedAt: binding.boundAt,
            source: "events",
          });
      }
      ensureWorkerStart(store, binding);
      // A blocked attempt waits until the next attempt is bound.
      const next = bindings.find(
        (b) => isRunner(b) && b.taskId === taskId && b.attempt === attempt + 1,
      );
      if (next)
        for (const span of own(taskId))
          if (
            span.attempt === attempt &&
            span.role === "worker" &&
            !span.endedAt
          )
            recordSpan(store, {
              ...span,
              endedAt:
                span.startedAt > next.boundAt ? span.startedAt : next.boundAt,
            });
      if (FINAL_STATUSES.has(binding.status) && !binding.report?.kind)
        closeOpen(store, taskId, attempt, "worker", binding.statusAt || at);
      if (["done", "blocked"].includes(binding.report?.kind))
        closeOpen(store, taskId, attempt, "worker", binding.report.at, {
          except: (s) =>
            s.stage === "waiting" && binding.report.kind === "blocked",
        });
      continue;
    }
    const stage = binding.role?.startsWith("review:") ? "review" : null;
    if (!stage || binding.source !== "tick") continue;
    const id = spanId(
        "events",
        taskId,
        attempt,
        binding.role,
        stage,
        binding.boundAt,
      ),
      end =
        binding.report && ["done", "blocked"].includes(binding.report.kind)
          ? binding.report.at
          : FINAL_STATUSES.has(binding.status) || binding.status === "gone"
            ? binding.statusAt || at
            : null;
    const span = {
      id,
      taskId,
      attempt,
      role: binding.role,
      stage,
      startedAt: binding.boundAt,
      endedAt: end,
      source: "events",
      detail: stage === "review" ? binding.role.slice("review:".length) : null,
    };
    const seen = spans.find((s) => s.id === id);
    if (!seen || seen.endedAt !== end) recordSpan(store, span);
  }
  // merge: from the last approval of the delivered commit to integration.
  for (const delivery of store.list("task_deliveries")) {
    const accepted = (delivery.verifications || []).filter(
      (v) => v.outcome === "accepted" && v.commit === delivery.commit,
    );
    if (
      !["verified", "integrated"].includes(delivery.state) ||
      !accepted.length
    )
      continue;
    // From the last approving verdict as it was reported, not as the
    // tick recorded it.
    const start = accepted
        .map((v) => store.get("session_bindings", v.slot)?.report?.at || v.at)
        .sort()
        .at(-1),
      end =
        delivery.state === "integrated" ? integratedAt(store, delivery) : null,
      id = spanId("events", delivery.taskId, null, null, "merge", start),
      seen = spans.find((s) => s.id === id);
    if (!seen || seen.endedAt !== end)
      recordSpan(store, {
        id,
        taskId: delivery.taskId,
        stage: "merge",
        startedAt: start,
        endedAt: end,
        source: "events",
      });
  }
  // Flow's pass over finished tasks: each one's root span, once.
  finishTasks(store, store.read());
}

function integratedAt(store, delivery) {
  const task = store.read().tasks.find((t) => t.id === delivery.taskId);
  return task?.integration?.at || delivery.updatedAt || null;
}

// Tool rows a tick-opened worker session left (F90, F91): kind, the
// command's first words, and the start time only. A shell call that runs a
// declared check is `tests`, any other shell call `commands`, the rest
// `coding` (R43.4). Rows already seen (by tool call id) are skipped, so the
// incremental read may hand back the same rows twice.
export function toolStage(row, checks = []) {
  const kind = row?.meta?.kind;
  if (kind !== "execute") return { stage: "coding", detail: null };
  const command = commandText(row.meta.input);
  const check = checks.find(
    (c) =>
      command &&
      (command === c || command.startsWith(c + " ") || command.includes(c)),
  );
  if (check) return { stage: "tests", detail: check };
  return { stage: "commands", detail: commandName(command) };
}

function commandText(input) {
  if (typeof input === "string") return input;
  if (record(input)) {
    for (const key of ["command", "cmd", "script"])
      if (typeof input[key] === "string") return input[key];
    if (Array.isArray(input.args)) return input.args.join(" ");
  }
  return "";
}

export function ingestToolRows(store, binding, rows, { checks = [] } = {}) {
  if (!isRunner(binding) || binding.attempt > 1 || !Array.isArray(rows))
    return 0;
  const tools = rows
    .filter(
      (r) =>
        r?.role === "tool" && typeof r.ts === "string" && r.meta?.tool_call_id,
    )
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  if (!tools.length) return 0;
  const { taskId, attempt } = binding,
    repository = taskRepository(
      store.read().tasks.find((t) => t.id === taskId),
    ),
    mine = () =>
      listSpans(store, { taskId }).filter(
        (s) => s.attempt === attempt && s.role === "worker",
      ),
    seen = new Set(
      mine()
        .filter((s) => s.source === "tool-calls")
        .map((s) => s.id.split("#").at(-1)),
    );
  let added = 0;
  store.transaction(() => {
    // The first tool rows replace the attempt's coarse coding stretch.
    if (!mine().some((s) => s.source === "tool-calls")) {
      for (const span of mine())
        if (span.source !== "tool-calls" && span.stage !== "waiting")
          telemetry.dropSpan(store, span.id);
      recordSpan(store, {
        id: `tool-calls:${taskId}:${attempt}:worker:start#start`,
        taskId,
        attempt,
        role: "worker",
        stage: "coding",
        startedAt: binding.boundAt,
        source: "tool-calls",
      });
    }
    for (const row of tools) {
      const key = String(row.meta.tool_call_id);
      if (seen.has(key)) continue;
      seen.add(key);
      for (const span of mine())
        if (span.source === "tool-calls" && !span.endedAt)
          recordSpan(store, {
            ...span,
            endedAt: span.startedAt > row.ts ? span.startedAt : row.ts,
          });
      const { stage, detail } = toolStage(row, checks);
      recordSpan(store, {
        id: `tool-calls:${taskId}:${attempt}:worker:${row.ts}#${key}`,
        taskId,
        attempt,
        role: "worker",
        stage,
        startedAt: row.ts,
        source: "tool-calls",
        detail: detail ? spanDetail(store, detail, repository) : null,
      });
      added += 1;
    }
    // Rows read after the attempt ended close at its report.
    if (["done", "blocked"].includes(binding.report?.kind))
      for (const span of mine())
        if (span.source === "tool-calls" && !span.endedAt)
          recordSpan(store, {
            ...span,
            endedAt:
              span.startedAt > binding.report.at
                ? span.startedAt
                : binding.report.at,
          });
  });
  return added;
}

// Whether Avoozl can read this session's tool calls: only sessions the
// tick opened on this machine (F91, F94). Crew Mode and remote sessions get
// a brief that asks for phase markers instead (R43.5).
export const toolCallsReadable = (binding) =>
  binding?.source === "tick" && !binding?.crew;

// ----------------------------------------------------------------- metrics

const ms = (a, b) => Math.max(0, Date.parse(b) - Date.parse(a));
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// When a task finished: integrated, or marked done by a person.
export function finishedAt(task) {
  return (
    task?.integration?.at ||
    // A manual leaf finishes when a person marks it done (R61.15). A
    // refusal stops the work; it is not a finish.
    (task?.manual === true && task.manualDone?.choice !== "refused"
      ? task.manualDone?.at
      : null) ||
    null
  );
}

// One task's timing: lead time, time per stage, sources, and whether any of
// it is coarse (not from tool calls or GitHub timestamps).
export function taskTiming(
  store,
  task,
  { spans = null, now = Date.now(), deliveries = null } = {},
) {
  const own = spans || listSpans(store, { taskId: task.id }),
    end = finishedAt(task),
    until = end || new Date(now).toISOString(),
    stages = Object.fromEntries(STAGES.map((s) => [s, 0]));
  let first = null;
  for (const span of own) {
    const stop = span.endedAt && span.endedAt < until ? span.endedAt : until;
    if (span.startedAt >= stop) continue;
    stages[span.stage] += ms(span.startedAt, stop);
    if (!first || span.startedAt < first) first = span.startedAt;
  }
  const lead = first ? ms(first, until) : 0,
    active = [...ACTIVE].reduce((sum, s) => sum + stages[s], 0),
    delivery = deliveries
      ? deliveries.get(task.id)
      : store.get("task_deliveries", task.id),
    workerSpans = own.filter((s) => s.role === "worker");
  return {
    taskId: task.id,
    title: task.title || "",
    repository: taskRepository(task) || null,
    epic: taskEpic(store.read(), task),
    phase: task.phase?.id ?? null,
    plan: task.planId ?? null,
    startedAt: first,
    finishedAt: end,
    leadMs: lead,
    activeMs: active,
    stages,
    coarse: workerSpans.some((s) => s.source !== "tool-calls"),
    sources: [...new Set(own.map((s) => s.source))],
    // A manual leaf's time is a person's: first-pass rate skips it.
    manual: task.manual === true,
    firstPass:
      Boolean(end) &&
      !own.some((s) => s.stage === "rework") &&
      !(delivery?.attempts || []).some((a) => a.outcome === "failed"),
  };
}

// Agent tasks that passed the first time, of those finished; a manual leaf
// is a person's step and is left out (R61.15).
function firstPassRate(timings) {
  const agent = timings.filter((t) => !t.manual);
  return agent.length
    ? agent.filter((t) => t.firstPass).length / agent.length
    : null;
}

function windowMetrics(timings, stops, culprits, size) {
  const finished = timings.length;
  if (!finished)
    return {
      tasks: 0,
      leadTimeMs: null,
      flowEfficiency: null,
      firstPassRate: null,
      changeFailureRate: null,
      integrationsPerDay: null,
    };
  const lead = timings.reduce((s, t) => s + t.leadMs, 0),
    active = timings.reduce((s, t) => s + t.activeMs, 0),
    times = timings.map((t) => Date.parse(t.finishedAt)),
    days = Math.max(1, (Math.max(...times) - Math.min(...times)) / 86_400_000);
  return {
    tasks: finished,
    size,
    leadTimeMs: median(timings.map((t) => t.leadMs)),
    flowEfficiency: lead ? active / lead : null,
    firstPassRate: firstPassRate(timings),
    changeFailureRate:
      timings.filter((t) => culprits.has(t.taskId)).length / finished,
    integrationsPerDay: finished / days,
  };
}

// Who pulled a stop, as Flow's Line stops list says it: the person's name,
// or for an agent session its role and task when Avoozl bound it ("worker
// for a1"), else "agent chat <slot>". An automatic stop has none.
export function stopWho(store, stop) {
  if (!stop.manual || !stop.by) return null;
  if (stop.by.kind !== "agent") return stop.by.name;
  const slot = String(stop.by.name).split(":").pop(),
    bound = listSessionBindings(store).find((b) => b.slot === slot);
  return bound?.taskId
    ? `${bound.role || "worker"} for ${bound.taskId}`
    : `agent chat ${slot}`;
}

const timeToFix = (stops) =>
  median(
    stops.filter((s) => s.closedAt).map((s) => ms(s.openedAt, s.closedAt)),
  );

// The biggest bottleneck (theory of constraints): the waiting or rework
// stage with the most time in the window, with its share of lead time and
// the repository where it is largest.
export function bottleneck(timings) {
  const lead = timings.reduce((s, t) => s + t.leadMs, 0);
  if (!lead) return null;
  let best = null;
  for (const stage of ["queued", "ci-wait", "review", "waiting", "rework"]) {
    const total = timings.reduce((s, t) => s + t.stages[stage], 0);
    if (total > 0 && (!best || total > best.totalMs))
      best = { stage, totalMs: total };
  }
  if (!best) return null;
  const perRepo = new Map();
  for (const t of timings)
    perRepo.set(
      t.repository,
      (perRepo.get(t.repository) || 0) + t.stages[best.stage],
    );
  const repository = [...perRepo.entries()].sort((a, b) => b[1] - a[1])[0][0],
    medianMs = median(timings.map((t) => t.stages[best.stage]).filter(Boolean));
  return {
    ...best,
    share: best.totalMs / lead,
    repository,
    medianMs,
    tasks: timings.length,
    evidence: `${best.stage} is ${Math.round((100 * best.totalMs) / lead)}% of lead time over ${timings.length} tasks; median ${Math.round(medianMs / 60_000)} min`,
  };
}

export const listOr = (store, table) => {
  try {
    return store.list(table);
  } catch {
    return [];
  }
};

// flow.view: the Flow tab, `avoozl flow`, and plans_view (action: flow). Computed on read,
// never stored as truth (§4.11). Filters: repository, epic (across plans),
// plan and phase (inside the plan), window (last N finished tasks, default
// 20), stage (bars only).
export function flowView(store, data, input = {}, { now = Date.now() } = {}) {
  const size =
      Number.isInteger(input.window) && input.window > 0
        ? Math.min(input.window, 500)
        : 20,
    spans = listSpans(store),
    byTask = new Map(),
    deliveries = new Map(
      listOr(store, "task_deliveries").map((d) => [d.taskId, d]),
    );
  for (const span of spans) {
    if (!byTask.has(span.taskId)) byTask.set(span.taskId, []);
    byTask.get(span.taskId).push(span);
  }
  const stops = listOr(store, "flow_stops").sort((a, b) =>
      a.openedAt < b.openedAt ? 1 : -1,
    ),
    culprits = new Set(stops.map((s) => s.culprit).filter(Boolean)),
    manualIds = new Set(
      data.tasks.filter((t) => t.manual === true).map((t) => t.id),
    ),
    tasks = data.tasks.filter(
      (t) =>
        byTask.has(t.id) &&
        (!input.repository || taskRepository(t) === input.repository) &&
        (!input.epic || taskEpic(data, t) === input.epic) &&
        (!input.plan || t.planId === input.plan) &&
        (!input.phase || t.phase?.id === input.phase),
    ),
    timings = tasks.map((t) =>
      taskTiming(store, t, { spans: byTask.get(t.id), now, deliveries }),
    ),
    finished = timings
      .filter((t) => t.finishedAt)
      .sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1)),
    current = finished.slice(0, size),
    previous = finished.slice(size, size * 2),
    since = current.at(-1)?.startedAt || null,
    stopsIn = (list) => {
      if (!list.length) return [];
      const from = list.map((t) => t.startedAt).sort()[0],
        to = list[0].finishedAt;
      return stops.filter(
        (s) => s.closedAt && s.closedAt >= from && s.closedAt <= to,
      );
    },
    metrics = windowMetrics(current, stops, culprits, size),
    before = windowMetrics(previous, stops, culprits, size),
    records = listOr(store, "flow_records");
  // Time to fix skips a stop a manual leaf caused (R61.15).
  const agentStops = (list) => list.filter((s) => !manualIds.has(s.culprit));
  metrics.timeToFixMs = timeToFix(
    agentStops(stopsIn(current).length ? stopsIn(current) : stops),
  );
  before.timeToFixMs = previous.length
    ? timeToFix(agentStops(stopsIn(previous)))
    : null;
  const shown = (
    input.stage ? timings.filter((t) => t.stages[input.stage] > 0) : timings
  ).sort((a, b) => ((b.startedAt || "") < (a.startedAt || "") ? -1 : 1));
  return {
    window: { size, since },
    metrics,
    previous: before,
    bottleneck: bottleneck(current),
    tasks: shown.slice(0, 200),
    stops: stops.map((stop) => ({ ...stop, who: stopWho(store, stop) })),
    flaky: records.filter((r) => r.kind === "flaky"),
    ciOnly: records.filter((r) => r.kind === "ci-only"),
    series: {
      day: flowSeries(timings, stops, "day"),
      week: flowSeries(timings, stops, "week"),
    },
    stages: [...STAGES],
    repositories: [
      ...new Set(data.tasks.map(taskRepository).filter(Boolean)),
    ].sort(),
    epics: crossPlanEpics(data).map((e) => ({
      id: e.id,
      title: e.title || e.id,
    })),
    plans: [...new Set(data.tasks.map((t) => t.planId).filter(Boolean))]
      .map((id) => ({ id, title: store.get("plans", id)?.title || id }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    phases: flowPhases(data, input.plan),
  };
}

// The phases of one plan, for the Phase filter; none until a plan is picked.
function flowPhases(data, planId) {
  if (!planId) return [];
  const seen = new Map();
  for (const task of data.tasks)
    if (task.planId === planId && task.phase && !seen.has(task.phase.id))
      seen.set(task.phase.id, { id: task.phase.id, title: task.phase.title });
  return [...seen.values()];
}

// The Flow tab's charts over time (owner addition 2026-11-13): per day or
// ISO week, from tasks finished in that bucket: median lead time, flow
// efficiency, first-pass rate, time per stage; time to fix from stops
// closed in it.
export function bucketOf(iso, unit) {
  const day = iso.slice(0, 10);
  if (unit !== "week") return day;
  const d = new Date(day + "T00:00:00Z"),
    shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

function flowSeries(timings, stops, unit = "day") {
  const buckets = new Map(),
    get = (key) => {
      if (!buckets.has(key))
        buckets.set(key, {
          key,
          tasks: [],
          fixes: [],
          opened: 0,
        });
      return buckets.get(key);
    };
  for (const t of timings)
    if (t.finishedAt) get(bucketOf(t.finishedAt, unit)).tasks.push(t);
  for (const s of stops) {
    get(bucketOf(s.openedAt, unit)).opened += 1;
    if (s.closedAt)
      get(bucketOf(s.closedAt, unit)).fixes.push(ms(s.openedAt, s.closedAt));
  }
  return [...buckets.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map(({ key, tasks, fixes, opened }) => {
      const lead = tasks.reduce((sum, t) => sum + t.leadMs, 0),
        active = tasks.reduce((sum, t) => sum + t.activeMs, 0),
        stages = Object.fromEntries(
          STAGES.map((s) => [
            s,
            tasks.reduce((sum, t) => sum + t.stages[s], 0),
          ]),
        );
      return {
        key,
        tasks: tasks.length,
        leadTimeMs: median(tasks.map((t) => t.leadMs)),
        flowEfficiency: lead ? active / lead : null,
        firstPassRate: firstPassRate(tasks),
        timeToFixMs: median(fixes),
        // Line stops opened in the bucket, automatic and pulled (R64.11).
        stops: opened,
        stages,
      };
    });
}

// One task's Timing fold in the drawer (R48.4).
export function taskFlow(store, task, { now = Date.now() } = {}) {
  const spans = listSpans(store, { taskId: task.id });
  if (!spans.length) return null;
  // Which prompt and skill versions each attempt ran on (R68.12).
  const versions = (store.get("task_deliveries", task.id)?.attempts || [])
    .filter((a) => a.prompts || a.skills)
    .map((a) => ({
      attempt: a.attempt,
      prompts: a.prompts || {},
      skills: a.skills || {},
    }));
  return {
    ...taskTiming(store, task, { spans, now }),
    versions,
    spans: spans.map(
      ({ id, stage, startedAt, endedAt, source, detail, attempt, role }) => ({
        id,
        stage,
        startedAt,
        endedAt,
        lengthMs: ms(startedAt, endedAt || new Date(now).toISOString()),
        source,
        detail,
        attempt,
        role,
      }),
    ),
  };
}

// ------------------------------------------------------- stop the line: reads

// Open stops, newest first.
export const openStops = (store) =>
  listOr(store, "flow_stops")
    .filter((s) => !s.closedAt)
    .sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));

// A task's transitive dependents along blocking edges.
export function dependentsOf(data, id) {
  const out = new Set(),
    next = [id];
  while (next.length) {
    const from = next.pop();
    for (const edge of data.edges)
      if (
        BLOCKING_EDGES.has(edge.kind) &&
        edge.from === from &&
        !out.has(edge.to)
      ) {
        out.add(edge.to);
        next.push(edge.to);
      }
  }
  return out;
}

// The tasks one stop pauses (R44.5): the culprit's transitive dependents,
// or with an unknown culprit (or scope repo) every task in the repository,
// or every task (scope all). Its fix task is never paused.
export function stopScope(store, data, stop) {
  // A pulled stop (R64.5) pauses everything in its scope, fix tasks too.
  if (stop.manual) {
    if (stop.scope === "all") return new Set(data.tasks.map((t) => t.id));
    if (stop.scope === "task")
      return new Set([stop.taskId, ...dependentsOf(data, stop.taskId)]);
    return new Set(
      data.tasks
        .filter((t) =>
          stop.scope === "spec"
            ? inPlan(t, { plan: stop.planId, spec: stop.spec })
            : taskRepository(t) === stop.repositoryId,
        )
        .map((t) => t.id),
    );
  }
  const fixes = new Set(
    listOr(store, "flow_stops")
      .map((s) => s.fixTaskId)
      .filter(Boolean),
  );
  let ids;
  if (stop.scope === "all") ids = new Set(data.tasks.map((t) => t.id));
  else if (stop.scope === "dependents" && stop.culprit)
    ids = dependentsOf(data, stop.culprit);
  else
    ids = new Set(
      data.tasks
        .filter((t) => taskRepository(t) === stop.repositoryId)
        .map((t) => t.id),
    );
  for (const id of fixes) ids.delete(id);
  if (stop.culprit) ids.delete(stop.culprit);
  return ids;
}

// Tasks no new dispatch may start while the line is stopped; Run anyway
// lifts a stop's pause while the stop stays open (R44.10).
export function linePausedTaskIds(store, data = store.read()) {
  const out = new Set();
  for (const stop of openStops(store))
    if (!stop.runAnyway)
      for (const id of stopScope(store, data, stop)) out.add(id);
  return out;
}

// Fix tasks go first in line for the next free slot (R44.7).
export const lineFirstIds = (store) =>
  openStops(store)
    .map((s) => s.fixTaskId)
    .filter(Boolean);

// The workspace's `.avoozl.json`, for a read outside the tick; an absent or
// invalid file reads as {}, so its flow settings are the defaults.
export function readFlowConfig(workspaceRoot) {
  try {
    const value = JSON.parse(
      fs.readFileSync(path.join(workspaceRoot, ".avoozl.json"), "utf8"),
    );
    flowPolicy(value);
    return value;
  } catch {
    return {};
  }
}

export const readFlowPolicy = (workspaceRoot) =>
  flowPolicy(readFlowConfig(workspaceRoot));
