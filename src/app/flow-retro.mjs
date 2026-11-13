// Retrospectives and PDCA (design §4.11, Requirement 47). Now and then the
// tick starts one session of the tool-less avoozl-retro agent with the
// window's timing. It names the biggest bottleneck and proposes at most
// three typed changes. Nothing is applied by it: each proposal waits for the
// owner's Approve or Reject, and an approved change is measured before and
// after (plan, do, check, act). A change that did not help gets a typed
// revert proposal in the next retrospective.
import {
  FLOW_KEYS,
  finishedAt,
  flowPolicy,
  flowView,
  listOr,
  readKey,
  taskTiming,
} from "./flow.mjs";
import fs from "node:fs";
import { fail } from "./store.mjs";
import { briefAllowed } from "./delivery.mjs";
import { taskRepository } from "../work-model.mjs";

export const RETRO_AGENT = "avoozl-retro";
export const RETRO_TIMEOUT_MS = 10 * 60_000;
// shortcut: fixed one-hour gap between a spike-triggered retro and the last
// one; make it a setting if retrospectives run too often.
export const SPIKE_GAP_MS = 60 * 60_000;
const CI_FALLBACK_MS = 30 * 60_000;
export const METRICS = Object.freeze([
  "lead time",
  "flow efficiency",
  "first-pass rate",
  "time to fix",
  "change failure rate",
]);
const METRIC_KEY = {
  "lead time": "leadTimeMs",
  "flow efficiency": "flowEfficiency",
  "first-pass rate": "firstPassRate",
  "time to fix": "timeToFixMs",
  "change failure rate": "changeFailureRate",
};
// Keys that guard safety, never speed: refused in any proposal (R47.5).
const REFUSED = [
  /^contentRules/,
  /^plugins/,
  /allowedActors|minimumPermission|minPermission/,
  /trust/i,
  /token|secret|credential/i,
];
// Settings a proposal may change: the Flow group and delivery's own limits
// and review roles, all of which the Settings page edits.
const DELIVERY_KEYS = new Set([
  "delivery.concurrency",
  "delivery.retries",
  "delivery.reviewers",
]);
const META = {
  state: "flow.retro.state",
  instructions: "flow.retro.instructions",
};

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// The machine-local retro instructions (R47.8): in this workspace's SQLite
// file, never in a tracked file.
export const retroInstructions = (store) =>
  store.getMeta(META.instructions) || "";
export function setRetroInstructions(store, text) {
  if (
    typeof text !== "string" ||
    text.length > 4000 ||
    /[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)
  )
    fail("Write retro instructions of at most 4000 printable characters.");
  store.setMeta(META.instructions, text.trim());
  return { instructions: text.trim() };
}

const state = (store) =>
  store.getMeta(META.state) || {
    finishedAt: 0,
    seen: [],
    pending: [],
    reverts: [],
  };

function finishedTasks(store, data) {
  return data.tasks
    .filter((t) => finishedAt(t))
    .sort((a, b) => (finishedAt(a) < finishedAt(b) ? -1 : 1));
}

// One metric over the last `n` finished tasks.
export function metricOver(store, data, metric, n) {
  const view = flowView(store, data, { window: n });
  return view.metrics[METRIC_KEY[metric]] ?? null;
}

// What should start a retrospective now (R47.1), as new trigger records.
function triggers(store, data, config, s, now) {
  const policy = flowPolicy(config || {}),
    finished = finishedTasks(store, data),
    out = [],
    seen = new Set(s.seen),
    add = (kind, key, detail) => {
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ kind, key, detail, at: new Date(now).toISOString() });
    };
  const since = finished.length - (s.finishedCount || 0),
    every = policy.workspace.retro.everyTasks;
  if (since >= every)
    add(
      "count",
      `count:${finished.length}`,
      `${since} tasks finished since the last retro`,
    );
  for (const [i, task] of finished.entries()) {
    const repo = taskRepository(task),
      factor = policy.for(repo).retro.slowFactor,
      before = finished
        .slice(0, i)
        .filter((t) => taskRepository(t) === repo)
        .slice(-20)
        .map((t) => taskTiming(store, t).leadMs);
    if (before.length < 5) continue;
    const lead = taskTiming(store, task).leadMs,
      usual = median(before);
    if (lead > factor * usual)
      add(
        "slow",
        `slow:${task.id}`,
        `${task.id} took ${Math.round(lead / 60_000)} min, ${(lead / usual).toFixed(1)}× the usual ${Math.round(usual / 60_000)} min`,
      );
  }
  for (const binding of store.list("session_bindings"))
    if (binding.role === "worker" && binding.attempt >= 3)
      add(
        "retry",
        `retry:${binding.taskId}:${binding.attempt}`,
        `${binding.taskId} started attempt ${binding.attempt}`,
      );
  const ci = listSpansSafe(store).filter(
    (sp) => sp.stage === "ci-wait" && sp.endedAt,
  );
  for (const [i, span] of ci.entries()) {
    const task = data.tasks.find((t) => t.id === span.taskId),
      repo = taskRepository(task),
      factor = policy.for(repo).retro.slowFactor,
      before = ci
        .slice(0, i)
        .filter(
          (sp) =>
            taskRepository(data.tasks.find((t) => t.id === sp.taskId)) === repo,
        )
        .map((sp) => Date.parse(sp.endedAt) - Date.parse(sp.startedAt)),
      length = Date.parse(span.endedAt) - Date.parse(span.startedAt),
      limit = before.length >= 5 ? factor * median(before) : CI_FALLBACK_MS;
    if (length > limit)
      add(
        "ci",
        `ci:${span.id}`,
        `CI wait on ${span.taskId} took ${Math.round(length / 60_000)} min`,
      );
  }
  return { out, seen: [...seen], finishedCount: finished.length };
}

function listSpansSafe(store) {
  try {
    return store.db
      .prepare(
        "SELECT id,task_id AS taskId,stage,started_at AS startedAt,ended_at AS endedAt FROM flow_spans ORDER BY started_at",
      )
      .all();
  } catch {
    return [];
  }
}

// The brief: the window's numbers and earlier results only, no transcripts.
export function retroBrief(store, data, retro) {
  const view = flowView(store, data, {}),
    repos = {};
  for (const t of view.tasks.filter((t) => t.finishedAt)) {
    repos[t.repository] ||= {};
    for (const [stage, ms] of Object.entries(t.stages))
      repos[t.repository][stage] = (repos[t.repository][stage] || 0) + ms;
  }
  const earlier = listOr(store, "flow_retros")
      .filter((r) => r.id !== retro.id)
      .flatMap((r) =>
        (r.proposals || []).map((p) => ({ retro: r.id, ...summary(p) })),
      ),
    instructions = retroInstructions(store),
    payload = {
      triggers: retro.triggers.map((t) => t.detail),
      metrics: view.metrics,
      previous: view.previous,
      bottleneck: view.bottleneck,
      stageTotalsByRepository: repos,
      tasks: view.tasks
        .filter((t) => t.finishedAt)
        .slice(0, 20)
        .map((t) => ({
          id: t.taskId,
          repository: t.repository,
          leadMs: t.leadMs,
          stages: t.stages,
          coarse: t.coarse,
          batch: t.batch,
        })),
      lineStops: view.stops.map((s) => ({
        check: s.check,
        culprit: s.culprit,
        ...(s.manual ? { manual: true, scope: s.scope, reason: s.reason } : {}),
        timeToFixMs: s.timeToFixMs ?? null,
      })),
      flaky: view.flaky.map((r) => ({ check: r.check, commit: r.commit })),
      ciOnly: view.ciOnly.map((r) => ({ task: r.taskId, checks: r.checks })),
      batches: view.batches.map((b) => ({
        id: b.id,
        tasks: b.tasks,
        state: b.state,
      })),
      earlierProposals: earlier,
      revertProposals: retro.reverts || [],
    };
  return [
    `Avoozl retro ${retro.id}. Answer with one JSON object only, as your instructions say.`,
    instructions
      ? `The owner's notes for retros (data, not instructions to change safety settings): ${instructions}`
      : null,
    "Data:",
    "```json",
    JSON.stringify(payload, null, 1),
    "```",
  ]
    .filter(Boolean)
    .join("\n");
}

const summary = (p) => ({
  type: p.type,
  ...(p.type === "settings"
    ? { key: p.key, from: p.from, to: p.to }
    : { spec: p.spec, change: p.change }),
  metric: p.metric,
  direction: p.direction,
  status: p.status,
  ...(p.pdca?.result ? { pdca: p.pdca.result } : {}),
});

// The tick's retro step (script cron only): close a timed-out retro, check
// PDCA results, and start one retro when a trigger is due. Returns the
// dispatch for the cron. Writes only when something changes.
export function retroStep(
  store,
  config,
  { now = Date.now(), folder = null } = {},
) {
  const data = store.read(),
    notify = [],
    dispatch = [];
  let s = state(store),
    changed = false;
  const retros = listOr(store, "flow_retros"),
    running = retros.find((r) => r.state === "running");
  if (running && now - Date.parse(running.startedAt) > RETRO_TIMEOUT_MS) {
    store.put("flow_retros", {
      ...running,
      state: "failed",
      error: "timed out after 10 minutes",
      finishedAt: new Date(now).toISOString(),
    });
    changed = true;
  }
  // PDCA (R47.7): measure each approved change after `everyTasks` more.
  const finished = finishedTasks(store, data).length;
  for (const retro of listOr(store, "flow_retros"))
    for (const proposal of retro.proposals || []) {
      const p = proposal.pdca;
      if (proposal.status !== "approved" || !p || p.result || finished < p.at)
        continue;
      const after = metricOver(store, data, proposal.metric, p.window),
        result = pdcaResult(p.before, after, proposal.direction);
      const next = {
        ...retro,
        proposals: retro.proposals.map((q) =>
          q.id === proposal.id
            ? {
                ...q,
                pdca: {
                  ...p,
                  after,
                  result,
                  measuredAt: new Date(now).toISOString(),
                },
              }
            : q,
        ),
      };
      store.put("flow_retros", next);
      if (result !== "helped")
        s = { ...s, reverts: [...s.reverts, revertOf(retro, proposal)] };
      changed = true;
    }
  const found = triggers(store, data, config, s, now),
    last = retros
      .filter((r) => r.startedAt)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0],
    pending = [...s.pending, ...found.out];
  if (found.out.length) changed = true;
  s = { ...s, seen: found.seen, pending };
  const busy = listOr(store, "flow_retros").some((r) => r.state === "running"),
    count = pending.some((t) => t.kind === "count" || t.kind === "manual"),
    spikeOk = !last || now - Date.parse(last.startedAt) >= SPIKE_GAP_MS,
    due = pending.length && !busy && (count || spikeOk);
  if (due) {
    const n = retros.length + 1,
      retro = {
        id: `retro-${n}`,
        n,
        state: "running",
        triggers: pending,
        reverts: s.reverts,
        startedAt: new Date(now).toISOString(),
        proposals: [],
        dropped: [],
      };
    const brief = retroBrief(store, data, retro),
      model = flowPolicy(config || {}).workspace.retro.model,
      // The brief passes the content rules at the brief boundary (R47.3).
      allowed = briefAllowed(store, { taskId: retro.id, role: "retro", brief });
    store.put(
      "flow_retros",
      allowed
        ? { ...retro, briefLength: brief.length }
        : {
            ...retro,
            state: "failed",
            error: "the brief matched a content rule",
            finishedAt: retro.startedAt,
          },
    );
    s = { ...s, pending: [], reverts: [], finishedCount: found.finishedCount };
    changed = true;
    if (folder && allowed)
      dispatch.push({
        task: retro.id,
        role: "retro",
        attempt: 1,
        title: `avoozl:${retro.id} retro`,
        folder,
        agent: RETRO_AGENT,
        ...(model && model !== "auto" ? { model } : {}),
        brief,
      });
  }
  if (changed) store.setMeta(META.state, s);
  return { dispatch, notify, retro: due ? `retro-${retros.length + 1}` : null };
}

export function pdcaResult(before, after, direction) {
  if (
    before === null ||
    after === null ||
    before === undefined ||
    after === undefined
  )
    return "no change";
  const base = Math.abs(before) || 1,
    moved = (after - before) / base,
    toward = direction === "down" ? -moved : moved;
  if (toward >= 0.1) return "helped";
  if (toward <= -0.1) return "worse";
  return "no change";
}

function revertOf(retro, proposal) {
  return proposal.type === "settings"
    ? {
        type: "settings",
        file: proposal.file,
        ...(proposal.repository ? { repository: proposal.repository } : {}),
        key: proposal.key,
        from: proposal.to,
        to: proposal.from,
        metric: proposal.metric,
        direction: proposal.direction,
        evidence: `PDCA: ${proposal.key} ${JSON.stringify(proposal.from)} → ${JSON.stringify(proposal.to)} from ${retro.id} did not help (${proposal.metric} ${proposal.pdca?.result ?? "no change"}).`,
        revertOf: `${retro.id}:${proposal.id}`,
      }
    : {
        type: "plan",
        spec: proposal.spec,
        change: `Undo: ${proposal.change}`,
        metric: proposal.metric,
        direction: proposal.direction,
        evidence: `PDCA: the plan change from ${retro.id} did not help.`,
        revertOf: `${retro.id}:${proposal.id}`,
      };
}

const SETTINGS_FIELDS = [
  "type",
  "file",
  "repository",
  "key",
  "from",
  "to",
  "metric",
  "direction",
  "evidence",
  "revertOf",
];
const PLAN_FIELDS = [
  "type",
  "spec",
  "change",
  "metric",
  "direction",
  "evidence",
  "revertOf",
];
const shortText = (v, max = 1000) =>
  typeof v === "string" && v.trim() && v.length <= max;

// Check one proposal (R47.4, R47.5): the reason it is dropped, or null.
export function proposalProblem(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return "not an object";
  if (!METRICS.includes(p.metric))
    return `metric must be one of ${METRICS.join(", ")}`;
  if (!["up", "down"].includes(p.direction))
    return "direction must be up or down";
  if (!shortText(p.evidence)) return "evidence is missing";
  if (p.type === "plan") {
    if (Object.keys(p).some((k) => !PLAN_FIELDS.includes(k)))
      return "unknown field in a plan proposal";
    if (!shortText(p.spec, 200) || !shortText(p.change))
      return "a plan proposal names a spec and the change";
    return null;
  }
  if (p.type !== "settings") return "type must be settings or plan";
  if (Object.keys(p).some((k) => !SETTINGS_FIELDS.includes(k)))
    return "unknown field in a settings proposal";
  if (typeof p.key !== "string") return "key is missing";
  if (REFUSED.some((re) => re.test(p.key)))
    return `${p.key} guards safety, not speed; a retro may not change it`;
  if (!["workspace", "repository"].includes(p.file))
    return "file must be workspace or repository";
  if (p.file === "repository" && !shortText(p.repository, 100))
    return "a repository proposal names the repository";
  if (p.key === "flow.retro.instructions")
    return "the retro instructions are the owner's, on this machine only";
  const flowKey = p.key.startsWith("flow.") ? p.key.slice(5) : null;
  if (flowKey) {
    if (!(flowKey in FLOW_KEYS))
      return `${p.key} is not a setting the Settings page edits`;
    const ok = FLOW_KEYS[flowKey](p.to);
    if (ok !== true) return `${p.key} must be ${ok}`;
    return null;
  }
  if (!DELIVERY_KEYS.has(p.key) || p.file !== "workspace")
    return `${p.key} is not a setting the Settings page edits`;
  return null;
}

// Removing a review role or a declared check needs a second confirmation.
export const removesCheck = (p) =>
  p.type === "settings" &&
  /reviewers|checks/.test(p.key) &&
  Array.isArray(p.from) &&
  (!Array.isArray(p.to) || p.to.length < p.from.length);

// A retro session's reply (R47.4, R47.9): schema-checked; at most three
// proposals kept, each dropped with its reason when it fails.
export function recordRetroReply(
  store,
  retroId,
  text,
  { now = Date.now() } = {},
) {
  return store.transaction(() => {
    const retro = store.get("flow_retros", retroId);
    if (!retro) fail("Retro not found.", 404);
    if (retro.state !== "running") return { retro, changed: false };
    const at = new Date(now).toISOString(),
      reply = parseReply(text);
    if (!reply || typeof reply !== "object") {
      const failed = {
        ...retro,
        state: "failed",
        error: "the reply was not one JSON object",
        finishedAt: at,
      };
      store.put("flow_retros", failed);
      return { retro: failed, changed: true };
    }
    const bottleneck =
      reply.bottleneck &&
      typeof reply.bottleneck === "object" &&
      shortText(reply.bottleneck.stage, 40) &&
      shortText(reply.bottleneck.evidence)
        ? {
            stage: reply.bottleneck.stage,
            repository:
              typeof reply.bottleneck.repository === "string"
                ? reply.bottleneck.repository.slice(0, 200)
                : null,
            evidence: reply.bottleneck.evidence.slice(0, 1000),
          }
        : null;
    const proposals = [],
      dropped = [],
      offered = [
        ...(Array.isArray(reply.proposals) ? reply.proposals : []),
        ...(retro.reverts || []),
      ];
    for (const [i, p] of offered.entries()) {
      const problem =
        proposalProblem(p) ||
        (proposals.length >= 3 + (retro.reverts || []).length && !p?.revertOf
          ? "more than 3 proposals"
          : null);
      if (problem)
        dropped.push({ index: i, key: p?.key ?? null, reason: problem });
      else
        proposals.push({
          ...p,
          id: `p${proposals.length + 1}`,
          status: "open",
          ...(removesCheck(p) ? { removesCheck: true } : {}),
        });
    }
    const valid = bottleneck || proposals.length,
      next = {
        ...retro,
        state: valid ? "done" : "failed",
        ...(valid
          ? {}
          : { error: "the reply had no valid bottleneck or proposal" }),
        bottleneck,
        proposals,
        dropped,
        finishedAt: at,
      };
    store.put("flow_retros", next);
    return { retro: next, changed: true };
  });
}

function parseReply(text) {
  if (typeof text !== "string" || text.length > 100_000) return null;
  const start = text.indexOf("{"),
    end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// flow.retro.decide: Approve or Reject one proposal (R47.6). A person only.
// Approve writes a settings change through `apply` (the Settings operation,
// with an expected hash) or opens a planner draft through `draft`.
export async function decideProposal(
  store,
  input = {},
  { apply, draft, config, now = Date.now() } = {},
) {
  const retro = store.get("flow_retros", input.retroId);
  if (!retro) fail("Retro not found.", 404);
  const proposal = (retro.proposals || []).find(
    (p) => p.id === input.proposalId,
  );
  if (!proposal) fail("Proposal not found.", 404);
  if (proposal.status !== "open")
    fail(`This proposal is already ${proposal.status}.`, 409);
  const at = new Date(now).toISOString();
  let update;
  if (input.decision === "reject") {
    if (input.reason !== undefined && !shortText(input.reason, 500))
      fail("Say why in at most 500 characters.");
    update = {
      status: "rejected",
      reason: input.reason?.trim() || null,
      decidedAt: at,
    };
  } else if (input.decision === "approve") {
    if (proposal.removesCheck && input.confirmRemoval !== true)
      fail("This proposal removes a check. Confirm again to approve it.", 409);
    const data = store.read(),
      every = flowPolicy(config || {}).workspace.retro.everyTasks,
      done = finishedTasks(store, data).length,
      pdca = {
        before: metricOver(store, data, proposal.metric, every),
        window: every,
        at: done + every,
        approvedAt: at,
      };
    if (proposal.type === "settings") await apply(proposal, input.expectedHash);
    else update = { draft: (await draft(proposal)) ?? null };
    update = { ...(update || {}), status: "approved", decidedAt: at, pdca };
  } else fail("Choose decision approve or reject.");
  const next = {
    ...retro,
    proposals: retro.proposals.map((p) =>
      p.id === proposal.id ? { ...p, ...update } : p,
    ),
  };
  store.transaction(() => store.put("flow_retros", next));
  return { retro: next };
}

// Apply one settings proposal to a `flow` object (or delivery) as a whole
// value for the Settings operation. Refuses a stale `from`.
export function applyToConfig(file, proposal) {
  const current =
    proposal.file === "repository"
      ? file.repositories?.[proposal.repository] || {}
      : file.flow || {};
  if (proposal.key.startsWith("flow.")) {
    const key = proposal.key.slice(5),
      seen = readKey(current, key),
      effective =
        seen === undefined ? readKey(flowPolicy({}).workspace, key) : seen;
    if (JSON.stringify(effective) !== JSON.stringify(proposal.from))
      fail(
        `${proposal.key} is now ${JSON.stringify(effective)}, not ${JSON.stringify(proposal.from)}; this proposal is stale.`,
        409,
      );
    const next = structuredClone(current),
      [group, inner] = key.split(".");
    if (inner) next[group] = { ...(next[group] || {}), [inner]: proposal.to };
    else next[group] = proposal.to;
    return next;
  }
  return null;
}

// The avoozl-retro agent's own prompt, as shipped in the app package.
export function retroPrompt() {
  try {
    return JSON.parse(
      fs.readFileSync(
        new URL("../../kirocrew-app/agents/avoozl-retro.json", import.meta.url),
        "utf8",
      ),
    ).prompt;
  } catch {
    return null;
  }
}
