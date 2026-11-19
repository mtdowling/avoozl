import { kirocrewRequest } from "./executors/kirocrew.mjs";
import { kirocrewSession } from "./executors/kirocrew.mjs";
import { roleRun } from "./role-table.mjs";
// Retrospectives and PDCA (design §4.11, Requirement 47). Now and then the
// tick starts one session of the tool-less avoozl-retro agent with the
// window's timing. It names the biggest bottleneck and proposes at most
// three typed changes. Nothing is applied by it: each proposal waits for the
// owner's Approve or Reject, and an approved change is measured before and
// after (plan, do, check, act). A change that did not help gets a typed
// revert proposal in the next retrospective.
import {
  CI_CLASSES,
  FLOW_KEYS,
  finishedAt,
  flowPolicy,
  flowView,
  listOr,
  readKey,
  taskTiming,
} from "./flow.mjs";
import { fail } from "./store.mjs";
import {
  BUILD_METRIC,
  CI_METRIC,
  CI_RUNS,
  PR_CI,
  ciBrief,
  buildMinutesPerPullRequest,
  ciMinutesPerPullRequest,
  ciTriggers,
  lastEffectiveCIConfig,
  seenWorkflows,
} from "./flow-ci.mjs";
import {
  BUILD_PART_METRIC,
  NOT_ENOUGH_BUILDS,
  buildBrief,
  buildPartMinutes,
  keyAndPartProblem,
} from "./build-breakdown.mjs";
import { briefAllowed } from "./delivery.mjs";
import { taskRepository } from "../work-model.mjs";
import {
  BRIEF_SKILLS,
  SKILL_TEXT_MAX,
  contentBlocks,
  currentPrompts,
  overridesFile,
  retroMemory,
  skillText,
} from "./retro-memory.mjs";
import {
  approveSection,
  revertPrompt,
  rolePrompt,
  sectionDiffProblem,
  seedOverrides,
  sha256,
  shippedPrompts,
} from "./prompts.mjs";
import { contentBinding } from "./content-rules.mjs";
import { applyDiff, reverseDiff } from "./text-diff.mjs";
import {
  retroCorrections,
  ruleAgain,
  ruleChangeBody,
  ruleProblem,
  ruleRepository,
} from "./corrections.mjs";

const RETRO_AGENT = "avoozl-retro";
const RETRO_TIMEOUT_MS = 10 * 60_000;
// The most one tick adds to a retro's wait. A tick that comes back after the
// laptop slept or the app was closed counts this much, not the whole gap, so
// the session gets its time to answer before the retro is failed.
export const RETRO_TICK_CAP_MS = 5 * 60_000;
// shortcut: fixed one-hour gap between a spike-triggered retro and the last
// one; make it a setting if retrospectives run too often.
const SPIKE_GAP_MS = 60 * 60_000;
const CI_FALLBACK_MS = 30 * 60_000;
const SPIKES = new Set(["slow", "retry", "ci"]);
export const METRICS = Object.freeze([
  "lead time",
  "flow efficiency",
  "first-pass rate",
  "time to fix",
  "change failure rate",
  // Measured on closed pull requests by class, not on tasks (R100.5).
  CI_METRIC,
  BUILD_METRIC,
  // Measured on builds with one comparison key (R101.11).
  BUILD_PART_METRIC,
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
  /protectedPaths/,
];
// Settings a proposal may change: the Flow group and delivery's own limits
// and review roles, all of which the Settings page edits.
// Lanes are a machine setting (R6.3), so no proposal writes concurrency.
const DELIVERY_KEYS = new Set(["delivery.retries", "delivery.reviewers"]);
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
function metricOver(store, data, metric, n) {
  const view = flowView(store, data, { window: n });
  return view.metrics[METRIC_KEY[metric]] ?? null;
}

// The repositories with CI rows, when the tick did not name them.
const ciRows = (store) => [
  ...new Set(
    [...listOr(store, PR_CI), ...listOr(store, CI_RUNS)].map(
      (row) => row.repository,
    ),
  ),
];

// What should start a retrospective now (R47.1), as new trigger records.
function triggers(
  store,
  data,
  config,
  s,
  now,
  ciRepositories = null,
  ciConfig = config,
) {
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
  // Steady CI waste (R100.3): fixed limits over every pull request, once per
  // repository, kind and window, never held by the spike gap.
  for (const [kind, key, detail] of ciTriggers(
    store,
    ciConfig,
    ciRepositories ?? ciRows(store),
    { now },
  ))
    add(kind, key, detail);
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

// What a retro sees of prompts and skills (design §4.18): every unlocked
// section of the five prompts with its hash, and the text of up to 3 skill
// files the window's sessions loaded. `seen` keeps the hashes shown, so a
// reply can only build on them. Null without a bound memory. Lessons were
// removed (RC30.4); retros propose rules instead.
export function memoryBrief(store, data) {
  const m = retroMemory(store);
  if (!m) return null;
  const prompts = currentPrompts(store),
    view = flowView(store, data, {}),
    finished = new Set(
      view.tasks.filter((t) => t.finishedAt).map((t) => t.taskId),
    ),
    counts = new Map();
  for (const d of listOr(store, "task_deliveries"))
    if (finished.has(d.taskId))
      for (const a of d.attempts || [])
        for (const target of Object.keys(a.skills || {}))
          counts.set(target, (counts.get(target) || 0) + 1);
  const skills = [...counts]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([target]) => ({ target, read: skillText(store, target) }))
    .filter((s) => s.read)
    .slice(0, BRIEF_SKILLS)
    .map(({ target, read }) => ({
      target,
      sha256: read.sha256,
      text: read.text.slice(0, SKILL_TEXT_MAX),
      ...(read.text.length > SKILL_TEXT_MAX ? { truncated: true } : {}),
    }));
  const payload = {
    prompts: Object.values(prompts).map((p) => ({
      target: p.target,
      version: p.version,
      sections: p.sections
        .filter((s) => !s.locked)
        .map((s) => ({ name: s.name, sha256: s.sha256, text: s.body })),
    })),
    skills,
  };
  return {
    payload,
    seed: seedOverrides(prompts, "agent.retro"),
    seen: {
      prompts: Object.fromEntries(
        Object.values(prompts).map((p) => [
          p.target,
          Object.fromEntries(
            p.sections.filter((s) => !s.locked).map((s) => [s.name, s.sha256]),
          ),
        ]),
      ),
      skills: Object.fromEntries(skills.map((s) => [s.target, s.sha256])),
    },
  };
}

// The brief: the window's numbers and earlier results only, no transcripts.
export function retroBrief(
  store,
  data,
  retro,
  memory = null,
  {
    config = {},
    ciConfig = lastEffectiveCIConfig(store, config),
    ciRepositories = null,
    now = Date.now(),
  } = {},
) {
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
    builds = buildBrief(store, ciRepositories ?? ciRows(store), { now }),
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
      // How much finished work was bug fixes (§4.11, R79.3).
      fixWork: view.metrics.fixWork ?? null,
      // Corrections since the last retro (§4.24, R78.2): a person told an
      // agent it got something wrong. Two or more alike may become a rule.
      corrections: retroCorrections(
        store,
        data,
        retro.correctionsSince ?? null,
      ),
      // Rules that landed, and whether the corrected thing happened again.
      rules: landedRules(store),
      // CI per repository over every pull request (§4.30, R100.5): minutes
      // by class, wait share, repeat runs and workflow files. Other pull
      // requests are a number, author and classes only.
      ci: ciBrief(store, ciConfig, ciRepositories ?? ciRows(store), { now }),
      // Build breakdowns by comparison key (§4.31); absent with no builds.
      ...(builds ? { builds } : {}),
      ...(memory?.payload || {}),
    };
  return [
    `Avoozl retro ${retro.id}. Answer with one JSON object only, as your instructions say.`,
    memory?.seed || null,
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
    : p.type === "prompt" || p.type === "skill"
      ? { target: p.target, ...(p.section ? { section: p.section } : {}) }
      : p.type === "rule"
        ? { text: p.text, corrections: p.corrections }
        : {
            spec: p.spec,
            change: p.change,
            ...(p.workflow
              ? { repository: p.repository, workflow: p.workflow }
              : {}),
          }),
  metric: p.metric,
  direction: p.direction,
  status: p.status,
  ...(p.pdca?.result ? { pdca: p.pdca.result } : {}),
});

// Why a retro that waited too long failed: what became of its chat.
function retroFailure(store, retro, waitedMs) {
  const waited = `${Math.round(waitedMs / 60_000)} minutes`,
    binding = store
      .list("session_bindings")
      .filter((b) => b.taskId === retro.id && b.role === "retro")
      .at(-1);
  if (!binding)
    return {
      kind: "never-started",
      error: `the chat never started: no session was opened for this retro in ${waited}`,
    };
  if (["gone", "lost"].includes(binding.status))
    return {
      kind: "lost",
      error:
        binding.executor === "process"
          ? `the process session was lost before it replied (waited ${waited})`
          : `the chat was lost: Kiro Crew no longer lists it (waited ${waited})`,
    };
  if (["working", "queued"].includes(binding.status))
    return {
      kind: "timeout",
      error: `timed out: the chat was still working after ${waited}`,
    };
  return {
    kind: "no-reply",
    error: `the chat started but never replied (waited ${waited})`,
  };
}

// Run again (a failed retro's button): queue the same triggers, which the
// next tick turns into a new retro. Nothing else is written.
export function runRetroAgain(store, id) {
  const retro = store.get("flow_retros", id);
  if (retro?.state !== "failed")
    fail("Only a failed retro can run again.", 409);
  const s = store.getMeta("flow.retro.state") || {
      seen: [],
      pending: [],
      reverts: [],
    },
    have = new Set(s.pending.map((t) => t.key));
  store.setMeta("flow.retro.state", {
    ...s,
    pending: [
      ...s.pending,
      ...(retro.triggers?.length
        ? retro.triggers
        : [{ kind: "manual", detail: "started by hand" }]
      )
        .filter((t) => !have.has(t.key))
        .map(({ waitsForCount: _waits, ...t }) => ({
          ...t,
          at: new Date().toISOString(),
        })),
    ],
  });
  return { queued: true };
}

// The tick's retro step (script cron only): close a timed-out retro, check
// PDCA results, and start one retro when a trigger is due. Returns the
// dispatch for the cron. Writes only when something changes.
export function retroStep(
  store,
  config,
  {
    now = Date.now(),
    repository = null,
    ciRepositories = null,
    ciConfig = lastEffectiveCIConfig(store, config),
  } = {},
) {
  const data = store.read(),
    notify = [],
    dispatch = [];
  let s = state(store),
    changed = false;
  const retros = listOr(store, "flow_retros"),
    running = retros.find((r) => r.state === "running");
  if (running) {
    const since = now - Date.parse(running.checkedAt ?? running.startedAt),
      waitedMs =
        (running.waitedMs ?? 0) +
        Math.min(Math.max(0, since), RETRO_TICK_CAP_MS),
      failure =
        waitedMs > RETRO_TIMEOUT_MS && retroFailure(store, running, waitedMs);
    // Counted at most once a minute, so a quiet tick writes nothing.
    if (failure || since >= 60_000) {
      store.put(
        "flow_retros",
        failure
          ? {
              ...running,
              state: "failed",
              error: failure.error,
              failure: failure.kind,
              waitedMs,
              finishedAt: new Date(now).toISOString(),
            }
          : { ...running, waitedMs, checkedAt: new Date(now).toISOString() },
      );
      changed = true;
    }
  }
  // PDCA (R47.7): measure each approved change after `everyTasks` more. A
  // prompt or skill change compares tasks that ran on its old and new
  // versions (R68.13).
  const finished = finishedTasks(store, data).length;
  for (const listed of listOr(store, "flow_retros"))
    for (const proposal of listed.proposals || []) {
      const p = proposal.pdca;
      if (proposal.status !== "approved" || !p || p.result) continue;
      // A rule (R78.5): did the corrected thing happen again?
      if (proposal.type === "rule") {
        if (finished < p.at) continue;
        const again = ruleAgain(store, data, proposal, p.approvedAt),
          retro = store.get("flow_retros", listed.id);
        store.put("flow_retros", {
          ...retro,
          proposals: retro.proposals.map((q) =>
            q.id === proposal.id
              ? {
                  ...q,
                  pdca: {
                    ...p,
                    again: again.map((c) => c.id),
                    result: again.length ? "no change" : "helped",
                    measuredAt: new Date(now).toISOString(),
                  },
                }
              : q,
          ),
        });
        changed = true;
        continue;
      }
      // CI minutes per pull request (R100.5): as many closed pull requests
      // of the repository and class after approval as before it.
      if (closedMetric(proposal.metric)) {
        const save = (pdca) => {
          const retro = store.get("flow_retros", listed.id);
          store.put("flow_retros", {
            ...retro,
            proposals: retro.proposals.map((q) =>
              q.id === proposal.id ? { ...q, pdca } : q,
            ),
          });
          changed = true;
        };
        const before =
          p.before ??
          measureClosed(store, proposal, {
            n: p.window,
            at: p.approvedAt,
          });
        if (before === null) {
          const pendingReason = ciBaselineReason(proposal, p.window);
          if (p.pendingReason !== pendingReason) save({ ...p, pendingReason });
          continue;
        }
        const { pendingReason: _pendingReason, ...baseline } = { ...p, before };
        const after = measureClosed(store, proposal, {
          n: p.window,
          at: p.approvedAt,
          after: true,
        });
        if (after === null) {
          if (p.before !== before || p.pendingReason) save(baseline);
          continue;
        }
        const retro = store.get("flow_retros", listed.id),
          result = pdcaResult(before, after, proposal.direction);
        save({
          ...baseline,
          after,
          result,
          measuredAt: new Date(now).toISOString(),
        });
        if (result !== "helped")
          s = { ...s, reverts: [...s.reverts, revertOf(retro, proposal)] };
        changed = true;
        continue;
      }
      // Build part minutes (R101.11): the same key and part, as many builds
      // after approval as before it. Fewer on either side is no verdict.
      if (proposal.metric === BUILD_PART_METRIC) {
        const save = (pdca) => {
          const retro = store.get("flow_retros", listed.id);
          store.put("flow_retros", {
            ...retro,
            proposals: retro.proposals.map((q) =>
              q.id === proposal.id ? { ...q, pdca } : q,
            ),
          });
          changed = true;
        };
        const measure = (after) =>
          buildPartMinutes(store, {
            repository: proposal.repository,
            key: proposal.key,
            part: proposal.part,
            n: p.window,
            at: p.approvedAt,
            after,
          });
        const before = p.before ?? measure(false);
        if (before === null) {
          if (p.pendingReason !== NOT_ENOUGH_BUILDS)
            save({ ...p, pendingReason: NOT_ENOUGH_BUILDS });
          continue;
        }
        const { pendingReason: _pending, ...baseline } = { ...p, before },
          after = measure(true);
        if (after === null) {
          if (p.before !== before || p.pendingReason !== NOT_ENOUGH_BUILDS)
            save({ ...baseline, pendingReason: NOT_ENOUGH_BUILDS });
          continue;
        }
        const retro = store.get("flow_retros", listed.id),
          result = pdcaResult(before, after, proposal.direction);
        save({
          ...baseline,
          after,
          result,
          measuredAt: new Date(now).toISOString(),
        });
        if (result !== "helped")
          s = { ...s, reverts: [...s.reverts, revertOf(retro, proposal)] };
        changed = true;
        continue;
      }
      const versioned = p.version ? versionWindow(store, data, p) : null;
      if (versioned ? versioned.length < p.window : finished < p.at) continue;
      // Read again: an earlier proposal of this retro may have just been
      // measured, and its result must not be lost.
      const retro = store.get("flow_retros", listed.id),
        after = versioned
          ? metricOn(store, data, versioned, proposal.metric, p.window)
          : metricOver(store, data, proposal.metric, p.window),
        result = pdcaResult(p.before, after, proposal.direction),
        // A window another change took effect in is "mixed" (R68.13).
        mixed =
          proposal.type === "prompt" || proposal.type === "skill"
            ? otherChangeIn(
                store,
                data,
                listed.id,
                proposal.id,
                versioned ||
                  newestFirst(store, data)
                    .slice(0, p.window)
                    .map((t) => t.id),
              )
            : false;
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
                  ...(mixed ? { mixed: true } : {}),
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
  const found = triggers(store, data, config, s, now, ciRepositories, ciConfig),
    last = retros
      .filter((r) => r.startedAt)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0],
    // A slow-task, retry, or CI trigger within an hour of the last retro
    // waits for the next count trigger (R47.2); one found later starts one.
    recent = last && now - Date.parse(last.startedAt) < SPIKE_GAP_MS,
    pending = [
      ...s.pending,
      ...found.out.map((t) =>
        recent && SPIKES.has(t.kind) ? { ...t, waitsForCount: true } : t,
      ),
    ];
  if (found.out.length) changed = true;
  s = { ...s, seen: found.seen, pending };
  const busy = listOr(store, "flow_retros").some((r) => r.state === "running"),
    due = pending.length && !busy && pending.some((t) => !t.waitsForCount);
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
    const memory = memoryBrief(store, data);
    if (memory) retro.seen = memory.seen;
    // The corrections this retro is shown; a rule may cite only these.
    retro.correctionsSince = last?.startedAt ?? null;
    retro.seen = {
      ...(retro.seen || {}),
      corrections: retroCorrections(store, data, retro.correctionsSince).map(
        (c) => c.id,
      ),
    };
    const brief = retroBrief(store, data, retro, memory, {
        config,
        ciRepositories,
        ciConfig,
        now,
      }),
      model = flowPolicy(config || {}).workspace.retro.model,
      // The brief passes the content rules at the brief boundary (R47.3).
      allowed = briefAllowed(store, { taskId: retro.id, role: "retro", brief });
    store.put(
      "flow_retros",
      allowed
        ? { ...retro, briefLength: brief.length, model: model || "auto" }
        : {
            ...retro,
            state: "failed",
            error: "the brief matched a content rule",
            finishedAt: retro.startedAt,
          },
    );
    s = { ...s, pending: [], reverts: [], finishedCount: found.finishedCount };
    changed = true;
    if (repository && allowed) {
      // R97.3: a `process` project's retro runs as a read-only child in a
      // scratch folder the drain makes; its reply comes back as the result
      // file.
      const project = store.get("projects", repository);
      // Settings › Models' retro harness (R98.3), else the project's.
      const run = roleRun("retro", { config, project });
      dispatch.push(
        kirocrewRequest(store, {
          task: retro.id,
          role: "retro",
          attempt: 1,
          title: `avoozl:${retro.id} retro`,
          ...run,
          ...(run.executor === "process"
            ? { repository }
            : { ...kirocrewSession(repository), agent: RETRO_AGENT }),
          ...(model && model !== "auto" ? { model } : {}),
          brief,
        }),
      );
    }
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

// The two metrics measured on closed pull requests by class (R100.5, R101.12).
const closedMetric = (metric) =>
  metric === CI_METRIC || metric === BUILD_METRIC;
const measureClosed = (store, proposal, options) =>
  (proposal.metric === BUILD_METRIC
    ? buildMinutesPerPullRequest
    : ciMinutesPerPullRequest)(store, {
    repository: proposal.repository,
    cls: proposal.class,
    ...(proposal.phase ? { phase: proposal.phase } : {}),
    ...options,
  });

function ciBaselineReason(proposal, count) {
  const cls = proposal.class === "all" ? "" : `${proposal.class} `;
  return `CI comparison pending: fewer than ${count} closed ${cls}pull requests in ${proposal.repository} were recorded before approval.`;
}

// ------------------------------------------------------------ versions

// The version of a prompt or skill target the finishing attempt of a task
// ran on (R68.12).
function usedVersion(store, taskId, { kind, target }) {
  const attempts = store.get("task_deliveries", taskId)?.attempts || [],
    last = attempts.at(-1);
  return kind === "prompt" ? last?.prompts?.[target] : last?.skills?.[target];
}

const newestFirst = (store, data) => finishedTasks(store, data).reverse();

// Finished tasks, newest first, that ran on the old version of a change
// (`from`), up to `n`.
function oldWindow(store, data, version, n) {
  return newestFirst(store, data)
    .filter((t) => usedVersion(store, t.id, version) === version.from)
    .slice(0, n)
    .map((t) => t.id);
}

// Finished tasks, newest first, that ran on the new version: `to` when it is
// known, else any version other than `from` (an external skill whose next
// pin Avoozl cannot predict).
function versionWindow(store, data, pdca) {
  const v = pdca.version;
  return newestFirst(store, data)
    .filter((t) => {
      const used = usedVersion(store, t.id, v);
      return v.to ? used === v.to : Boolean(used) && used !== v.from;
    })
    .slice(0, pdca.window)
    .map((t) => t.id);
}

function metricOn(store, data, ids, metric, n) {
  const only = new Set(ids),
    view = flowView(
      store,
      { ...data, tasks: data.tasks.filter((t) => only.has(t.id)) },
      { window: n },
    );
  return view.metrics[METRIC_KEY[metric]] ?? null;
}

// Another approved change took effect inside this window (R68.13).
function otherChangeIn(store, data, retroId, proposalId, ids) {
  const tasks = data.tasks.filter((t) => ids.includes(t.id));
  if (!tasks.length) return false;
  const starts = tasks
      .map((t) => taskTiming(store, t).startedAt)
      .filter(Boolean)
      .sort(),
    ends = tasks
      .map((t) => finishedAt(t))
      .filter(Boolean)
      .sort(),
    from = starts[0],
    to = ends.at(-1);
  return listOr(store, "flow_retros").some((r) =>
    (r.proposals || []).some(
      (q) =>
        !(r.id === retroId && q.id === proposalId) &&
        q.status === "approved" &&
        q.pdca?.approvedAt &&
        q.pdca.approvedAt > from &&
        q.pdca.approvedAt < to,
    ),
  );
}

function revertOf(retro, proposal) {
  if (proposal.type === "prompt" || proposal.type === "skill")
    return {
      type: proposal.type,
      target: proposal.target,
      ...(proposal.section ? { section: proposal.section } : {}),
      ...(proposal.type === "skill"
        ? { diff: reverseDiff(proposal.diff) }
        : {}),
      revert: true,
      metric: proposal.metric,
      direction: proposal.direction,
      evidence: `PDCA: the ${proposal.type} change to ${proposal.target} from ${retro.id} did not help (${proposal.metric} ${proposal.pdca?.result ?? "no change"}).`,
      revertOf: `${retro.id}:${proposal.id}`,
    };
  return proposal.type === "settings"
    ? {
        type: "settings",
        file: proposal.file,
        ...(proposal.repository ? { repository: proposal.repository } : {}),
        key: proposal.key,
        from: proposal.to,
        to: proposal.from,
        metric: proposal.metric,
        ...(proposal.class ? { class: proposal.class } : {}),
        ...(proposal.phase ? { phase: proposal.phase } : {}),
        direction: proposal.direction,
        evidence: `PDCA: ${proposal.key} ${JSON.stringify(proposal.from)} → ${JSON.stringify(proposal.to)} from ${retro.id} did not help (${proposal.metric} ${proposal.pdca?.result ?? "no change"}).`,
        revertOf: `${retro.id}:${proposal.id}`,
      }
    : {
        type: "plan",
        spec: proposal.spec,
        change: `Undo: ${proposal.change}`,
        ...(proposal.repository ? { repository: proposal.repository } : {}),
        ...(proposal.workflow ? { workflow: proposal.workflow } : {}),
        metric: proposal.metric,
        ...(proposal.class ? { class: proposal.class } : {}),
        ...(proposal.phase ? { phase: proposal.phase } : {}),
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
  "class",
  "phase",
  "direction",
  "evidence",
  "revertOf",
];
const PLAN_FIELDS = [
  "type",
  "spec",
  "change",
  // A CI change names the repository and a workflow file seen (§4.30).
  "repository",
  "workflow",
  // A Build part minutes change names a comparison key and a part (§4.31).
  "key",
  "part",
  "metric",
  "class",
  "phase",
  "direction",
  "evidence",
  "revertOf",
];
const shortText = (v, max = 1000) =>
  typeof v === "string" && v.trim() && v.length <= max;

const CHANGE_FIELDS = [
  "type",
  "target",
  "section",
  "base",
  "diff",
  "metric",
  "direction",
  "evidence",
  "revert",
  "revertOf",
];
const RUN = /^[A-Za-z0-9][\w.:/-]{0,199}#\d{1,4}$/;
const SKILL_TARGET = /^(?:repo|external):[A-Za-z0-9][\w.-]{0,99}:[^\0]{1,400}$/;

// A prompt or skill proposal (R68.2-R68.5): one target, a diff against the
// exact text the retro saw with that text's hash, and structured evidence of
// at least 3 runs. A revert Avoozl owes carries no base.
function changeProblem(p, retro, store) {
  if (Object.keys(p).some((k) => !CHANGE_FIELDS.includes(k)))
    return `unknown field in a ${p.type} proposal`;
  if (p.revert === true) {
    if (typeof p.revertOf !== "string") return "a revert names what it reverts";
    if (!shortText(p.evidence)) return "evidence is missing";
    return null;
  }
  const e = p.evidence;
  if (!e || typeof e !== "object" || Array.isArray(e))
    return "evidence is missing";
  if (
    !Array.isArray(e.runs) ||
    e.runs.length < 3 ||
    e.runs.length > 50 ||
    !e.runs.every((r) => typeof r === "string" && RUN.test(r))
  )
    return "evidence names at least 3 runs as task#attempt";
  if (!(typeof e.value === "number" || shortText(e.value, 100)))
    return "evidence gives the metric's current value";
  if (!shortText(e.effect, 300)) return "evidence gives the expected effect";
  if (typeof p.diff !== "string" || !p.diff.trim())
    return "the diff is missing";
  if (typeof p.base !== "string" || !/^[0-9a-f]{64}$/.test(p.base))
    return "base is the sha256 of the text the diff is against";
  if (!store || !retroMemory(store))
    return `${p.type} proposals need this machine's Avoozl settings folder`;
  if (p.type === "prompt") {
    if (typeof p.section !== "string")
      return "a prompt proposal names one section";
    const seen = retro?.seen?.prompts?.[p.target]?.[p.section];
    const problem = sectionDiffProblem(currentPrompts(store), p);
    if (problem) return problem;
    if (seen !== p.base)
      return `base is not the text of ${p.target} § ${p.section} this retro saw`;
    return null;
  }
  if (p.section !== undefined) return "a skill proposal names no section";
  if (typeof p.target !== "string" || !SKILL_TARGET.test(p.target))
    return "target is repo:<repository>:<path> or external:<source>:<path>";
  if (retro?.seen?.skills?.[p.target] !== p.base)
    return `base is not the text of ${p.target} this retro saw`;
  const current = skillText(store, p.target);
  if (!current) return `${p.target} cannot be read now`;
  if (current.sha256 !== p.base)
    return `base is not the current text of ${p.target}`;
  if (applyDiff(current.text, p.diff) === null)
    return `the diff does not apply to ${p.target}`;
  return null;
}

// Check one proposal (R47.4, R47.5, R68.4): the reason it is dropped, or null.
export function proposalProblem(p, retro = null, store = null) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return "not an object";
  // A rule from repeated corrections needs no metric (R78.2).
  if (p.type === "rule")
    return store
      ? ruleProblem(p, retro, store, store.read())
      : "rule proposals need the workspace";
  if (!METRICS.includes(p.metric))
    return `metric must be one of ${METRICS.join(", ")}`;
  if (!["up", "down"].includes(p.direction))
    return "direction must be up or down";
  if (closedMetric(p.metric)) {
    if (p.type !== "settings" && p.type !== "plan")
      return `${p.metric} is measured for settings and plan proposals`;
    if (!["all", ...CI_CLASSES].includes(p.class))
      return `a ${p.metric} proposal names a class: all, ${CI_CLASSES.join(", ")}`;
    if (!shortText(p.repository, 100))
      return `a ${p.metric} proposal names the repository`;
  } else if (p.class !== undefined)
    return `class is only for ${CI_METRIC} and ${BUILD_METRIC}`;
  if (
    p.phase !== undefined &&
    (p.metric !== BUILD_METRIC || !shortText(p.phase, 80))
  )
    return `phase is only for ${BUILD_METRIC}, at most 80 characters`;
  if (p.metric === BUILD_PART_METRIC) {
    if (p.type !== "plan")
      return `${BUILD_PART_METRIC} is measured for plan proposals`;
    if (!shortText(p.repository, 100))
      return `a ${BUILD_PART_METRIC} proposal names the repository`;
    if (!shortText(p.key, 1000) || !shortText(p.part, 80))
      return `a ${BUILD_PART_METRIC} proposal names a key and a part from the brief`;
    const problem =
      store && keyAndPartProblem(store, p.repository, p.key, p.part);
    if (problem || !store) return problem || "the builds are not available";
  } else if ((p.key !== undefined && p.type === "plan") || p.part !== undefined)
    return `key and part are only for ${BUILD_PART_METRIC}`;
  if (p.type === "prompt" || p.type === "skill")
    return changeProblem(p, retro, store);
  if (!shortText(p.evidence)) return "evidence is missing";
  if (p.type === "plan") {
    if (Object.keys(p).some((k) => !PLAN_FIELDS.includes(k)))
      return "unknown field in a plan proposal";
    if (!shortText(p.spec, 200) || !shortText(p.change))
      return "a plan proposal names a spec and the change";
    if (p.workflow !== undefined) {
      if (!shortText(p.repository, 100))
        return "a CI plan proposal names the repository";
      if (
        typeof p.workflow !== "string" ||
        !p.workflow.startsWith(".github/workflows/") ||
        !store ||
        !seenWorkflows(store, p.repository).has(p.workflow)
      )
        return `${p.workflow} is not a workflow file seen in ${p.repository}`;
    } else if (p.repository !== undefined && !shortText(p.repository, 100))
      return "repository must be a repository name";
    return null;
  }
  if (p.type !== "settings")
    return "type must be settings, plan, prompt, skill or rule";
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
      replied = Array.isArray(reply.proposals) ? reply.proposals : [],
      offered = [...replied, ...(retro.reverts || [])];
    let fromReply = 0;
    for (const [i, p] of offered.entries()) {
      // At most 3 of the agent's own, of every type together; the typed
      // reverts Avoozl owes come on top (R47.4, R47.7, R68.1).
      const own = i < replied.length,
        problem =
          proposalProblem(p, retro, store) ||
          (own && fromReply >= 3 ? "more than 3 proposals" : null) ||
          (own ? blockedProposal(store, retroId, i, p) : null);
      if (problem)
        dropped.push({
          index: i,
          key: p?.key ?? p?.target ?? null,
          ...(p?.type ? { type: p.type } : {}),
          reason: problem,
        });
      else {
        if (own) fromReply += 1;
        proposals.push({
          ...p,
          id: `p${proposals.length + 1}`,
          status: "open",
          ...(removesCheck(p) ? { removesCheck: true } : {}),
        });
      }
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

// The content rules at the `proposal` boundary (R68.6): the reason a
// proposal is dropped, naming the rule and never the matched text.
function blockedProposal(store, retroId, index, p) {
  if (!contentBinding(store)?.workspaceRoot) return null;
  const text = [
    p.diff,
    p.change,
    p.text,
    p.key,
    typeof p.evidence === "string"
      ? p.evidence
      : JSON.stringify(p.evidence ?? null),
  ]
    .filter((v) => typeof v === "string")
    .join("\n");
  const blocks = contentBlocks(
    store,
    "proposal",
    `proposal:${retroId}:${index}`,
    text,
  );
  return blocks.length
    ? `content rules blocked it: ${blocks.join("; ")}`
    : null;
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

// flow.retro.decide: Approve or Reject one proposal (R47.6, R68.7). A person
// only. Approve writes a settings change through `apply` (the Settings
// operation, with an expected hash), opens a planner draft through `draft`,
// writes a prompt override version through `prompt`, lands a skill change
// through `skill` (a leaf, or a note for an external skill), or opens a
// rule's leaf through `rule`.
export async function decideProposal(
  store,
  input = {},
  {
    apply,
    draft,
    prompt,
    skill,
    rule,
    config,
    ciConfig = lastEffectiveCIConfig(store, config),
    by = "person",
    now = Date.now(),
  } = {},
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
      every = flowPolicy(
        (closedMetric(proposal.metric) ? ciConfig : config) || {},
      ).workspace.retro.everyTasks,
      done = finishedTasks(store, data).length;
    let pdca =
      proposal.type === "rule"
        ? { approvedAt: at, window: every, at: done + every }
        : {
            before: closedMetric(proposal.metric)
              ? measureClosed(store, proposal, { n: every, at })
              : proposal.metric === BUILD_PART_METRIC
                ? buildPartMinutes(store, {
                    repository: proposal.repository,
                    key: proposal.key,
                    part: proposal.part,
                    n: every,
                    at,
                  })
                : metricOver(store, data, proposal.metric, every),
            window: every,
            at: done + every,
            approvedAt: at,
          };
    if (closedMetric(proposal.metric) && pdca.before === null)
      pdca.pendingReason = ciBaselineReason(proposal, every);
    if (proposal.metric === BUILD_PART_METRIC && pdca.before === null)
      pdca.pendingReason = NOT_ENOUGH_BUILDS;
    if (proposal.type === "settings") await apply(proposal, input.expectedHash);
    else if (proposal.type === "plan")
      update = { draft: (await draft(proposal)) ?? null };
    else if (proposal.type === "prompt") {
      const override = await (prompt || promptChange(store, retro, { by, at }))(
        proposal,
      );
      update = { override };
      // Worker briefs and skills are measured on the tasks that ran each
      // version; the other prompts on the next window of finished tasks.
      pdca = proposal.revert
        ? null
        : proposal.target === "brief.worker"
          ? versionedPdca(
              store,
              data,
              pdca,
              {
                kind: "prompt",
                target: proposal.target,
                from: override.from,
                to: override.to,
              },
              proposal,
            )
          : { ...pdca, versions: { from: override.from, to: override.to } };
    } else if (proposal.type === "skill") {
      const landed = await skillChange(store, retro, proposal, {
        deliver: skill,
        at,
      });
      if (proposal.revert) pdca = null;
      update = { ...landed };
      if (!proposal.revert)
        pdca = versionedPdca(
          store,
          data,
          pdca,
          {
            kind: "skill",
            target: proposal.target,
            from: proposal.base,
            to: landed.note ? null : landed.resultSha,
          },
          proposal,
        );
    } else if (proposal.type === "rule") {
      // One leaf, source retro, that edits the steering rules file (R78.3).
      if (!rule) fail("Rules need the Deliver this path.", 409);
      const repository = ruleRepository(store, data, proposal);
      if (!repository) fail("The rule's repository is gone.", 409);
      update = {
        repository,
        leaf: await rule({
          retro: retro.id,
          proposal: proposal.id,
          repository,
          title: "Add a rule from repeated corrections",
          body: ruleChangeBody(
            proposal.text,
            `A person approved this rule from retro ${retro.id}. It rests on ${proposal.corrections.length} corrections.`,
          ),
        }),
      };
    } else fail("Unknown proposal type.", 400);
    update = {
      ...(update || {}),
      status: "approved",
      decidedAt: at,
      decidedBy: by,
      ...(pdca ? { pdca } : {}),
    };
  } else fail("Choose decision approve or reject.");
  const latest = store.get("flow_retros", retro.id),
    next = {
      ...latest,
      proposals: latest.proposals.map((p) =>
        p.id === proposal.id ? { ...p, ...update } : p,
      ),
    };
  store.transaction(() => store.put("flow_retros", next));
  return { retro: next };
}

// A prompt proposal's approval: override version N for its section, or one
// step back for a revert Avoozl proposed (R68.8, R68.9).
function promptChange(store, retro, { by, at }) {
  return async (p) => {
    const m = retroMemory(store),
      file = overridesFile(store);
    if (!m || !file)
      fail(
        "This machine has no Avoozl settings folder for prompt overrides.",
        409,
      );
    const shipped = m.shipped || shippedPrompts();
    if (p.revert)
      return revertPrompt(file, { target: p.target, by, at }, shipped);
    return approveSection(
      file,
      {
        target: p.target,
        section: p.section,
        base: p.base,
        diff: p.diff,
        proposal: { retro: retro.id, id: p.id },
        by,
        at,
      },
      shipped,
    );
  };
}

// A skill proposal's approval (R68.10, R68.11): a repository skill becomes
// one leaf through `deliver`; an external skill becomes a note for its
// owner, with nothing sent and no plugin edited.
async function skillChange(store, retro, p, { deliver, at }) {
  const current = skillText(store, p.target),
    [kind, owner, ...rest] = p.target.split(":"),
    file = rest.join(":");
  if (!current && !p.revert) fail(`${p.target} cannot be read now.`, 409);
  if (!p.revert && current.sha256 !== p.base)
    fail(
      `${p.target} changed since the retro saw it; this proposal is stale.`,
      409,
    );
  const text = current ? applyDiff(current.text, p.diff) : null;
  if (text === null && !p.revert)
    fail(`The diff no longer applies to ${p.target}.`, 409);
  const resultSha = text === null ? null : sha256(text),
    summary =
      typeof p.evidence === "string"
        ? p.evidence
        : `${p.metric} ${p.evidence?.value ?? ""}, expected ${p.direction}: ${p.evidence?.effect ?? ""} (${(p.evidence?.runs || []).length} runs)`;
  if (kind === "repo") {
    if (!deliver)
      fail("Repository skill changes need the Deliver this path.", 409);
    const leaf = await deliver({
      retro: retro.id,
      proposal: p.id,
      repository: owner,
      file,
      diff: p.diff,
      summary,
    });
    return { leaf, resultSha };
  }
  return {
    note: {
      plugin: owner === "local" ? null : owner,
      file,
      diff: p.diff,
      summary,
      at,
      sent: false,
    },
    resultSha,
  };
}

// PDCA for a prompt or skill change compares runs on its old version with
// as many on its new one (R68.13).
function versionedPdca(store, data, pdca, version, proposal) {
  const old = oldWindow(store, data, version, pdca.window);
  return {
    ...pdca,
    version,
    before: old.length
      ? metricOn(store, data, old, proposal.metric, pdca.window)
      : pdca.before,
    beforeTasks: old.length,
  };
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
// Approved rules and their PDCA results, for the next retro (R78.5).
function landedRules(store) {
  return listOr(store, "flow_retros").flatMap((r) =>
    (r.proposals || [])
      .filter((p) => p.type === "rule" && p.status === "approved")
      .map((p) => ({
        retro: r.id,
        text: p.text,
        approvedAt: p.decidedAt ?? null,
        happenedAgain: p.pdca?.again ?? null,
      })),
  );
}

export function retroPrompt() {
  try {
    return rolePrompt("retro");
  } catch {
    return null;
  }
}
