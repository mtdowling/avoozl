// Migration reconciliation for an old workspace (design §10.2 steps 5–7).
// Step 5 gathers each partial task's evidence; step 6 scopes broad unfinished
// packages; step 7 gathers the evidence of runs left open in the old host.
// The verdicts and leaves themselves are proposals a planner writes as data;
// applyProposals only checks them against the snapshot and renders new leaf
// records. Nothing here writes the workspace.
import {
  completeStatuses,
  deliveryEpics,
  redactPaths,
} from "./migration-prep.mjs";

const COMMIT = /\b[0-9a-f]{9,40}\b/g;
// Commit-like words; an all-digit word is a number, not a hash.
const hashes = (text) =>
  unique((text.match(COMMIT) || []).filter((w) => /[a-f]/.test(w)));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
// Branch names in free text: words starting with one of the prefixes.
const branchPattern = (prefixes) =>
  new RegExp(
    "(?<![\\w/])(?:" +
      prefixes.map(escape).join("|") +
      ")[A-Za-z0-9._/-]*[A-Za-z0-9]",
    "g",
  );

const unique = (xs) => [...new Set(xs.filter(Boolean))];
const textOf = (...parts) =>
  parts.filter((x) => typeof x === "string").join(" ");

function sourceLines(task, readDocument) {
  const src = task.source;
  if (!src?.document || !readDocument) return [];
  return (readDocument(src.document) || []).slice(
    src.lineStart - 1,
    src.lineEnd,
  );
}

// Step 5 input: one evidence row per unfinished partial task. `commitRefs`
// answers which named refs contain a commit (null when it does not resolve);
// `branchExists` answers whether a named branch survives.
export function partialEvidence(
  data,
  {
    epicIds,
    runs = [],
    mapping,
    readDocument,
    commitRefs,
    branchExists,
    branchPrefixes = [],
  },
) {
  const BRANCH = branchPrefixes.length ? branchPattern(branchPrefixes) : null;
  const inEpic = new Set(deliveryEpics(data, epicIds).map((e) => e.id));
  const complete = completeStatuses(data);
  const entries = mapping?.entries || [];
  return data.tasks
    .filter(
      (t) =>
        inEpic.has(t.epic) && t.status === "partial" && !complete.has(t.status),
    )
    .map((t) => {
      const lines = sourceLines(t, readDocument);
      const text = textOf(
        t.summary,
        t.nextAction,
        t.notes,
        t.activity?.summary,
        lines.join(" "),
      );
      const commits = hashes(text).map((sha) => {
        const refs = commitRefs ? commitRefs(sha) : null;
        return { sha, resolved: refs !== null, refs: refs || [] };
      });
      const branches = unique([
        ...((BRANCH && text.match(BRANCH)) || []),
        t.activity?.branch,
      ]).map((name) => ({
        name,
        exists: branchExists ? !!branchExists(name) : null,
      }));
      return {
        id: t.id,
        epic: t.epic,
        title: t.title,
        status: t.status,
        summary: redactPaths(t.summary),
        nextAction: t.nextAction ? redactPaths(t.nextAction) : null,
        acceptance: t.acceptance || [],
        evidence: t.evidence || [],
        source: t.source
          ? {
              document: t.source.document,
              lineStart: t.source.lineStart,
              lineEnd: t.source.lineEnd,
              checked: t.source.checked ?? null,
              open: lines.filter((l) => /^\s*- \[ \]/.test(l)).length,
              done: lines.filter((l) => /^\s*- \[x\]/i.test(l)).length,
            }
          : null,
        activity: t.activity
          ? {
              state: t.activity.state,
              branch: t.activity.branch ?? null,
              summary: redactPaths(t.activity.summary ?? ""),
            }
          : null,
        runs: runs
          .filter((r) => r.taskId === t.id)
          .map((r) => ({ id: r.id, state: r.state })),
        commits,
        branches,
        entries: entries
          .filter((e) => e.task === t.id)
          .map((e) => ({ id: e.id, result: e.result })),
      };
    });
}

// Step 6 input: unfinished packages that are not partial (those are step 5's):
// broad or unbounded planned, blocked and deferred tasks.
export function broadScope(data, kinds, { mapping } = {}) {
  const byId = new Map(data.tasks.map((t) => [t.id, t]));
  const entries = mapping?.entries || [];
  return kinds.tasks
    .filter(
      (k) =>
        k.kind === "package" &&
        k.status !== "partial" &&
        !completeStatuses(data).has(k.status),
    )
    .map((k) => {
      const t = byId.get(k.id);
      return {
        id: k.id,
        epic: k.epic,
        title: t.title,
        status: k.status,
        reason: k.reason,
        children: data.tasks
          .filter((c) => c.parentId === k.id)
          .map((c) => c.id),
        summary: redactPaths(t.summary),
        source: t.source
          ? { document: t.source.document, lineStart: t.source.lineStart }
          : null,
        entries: entries
          .filter((e) => e.task === k.id)
          .map((e) => ({ id: e.id, result: e.result })),
      };
    });
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// What each verdict needs. Leaves must be bounded (acceptance), R5.5.
export const RULES = {
  "complete-pending-acceptance": { acceptance: true },
  partial: { leaves: true },
  stale: {},
  leaf: { acceptance: true },
  package: { leaves: true },
  hold: {},
};

// Check a planner's proposals against the scope rows and render the new
// leaves. Every scoped task gets exactly one proposal with a reason; leaf IDs
// are `<task-id>.<slug>`, new, and unique; checklist entries named on a leaf
// must be entries mapped to its task (they become its acceptance, never a
// new task, R23.5).
export function applyProposals(
  scope,
  proposals,
  { verdicts, existingIds = [] },
) {
  const errors = [];
  const rows = new Map(scope.map((r) => [r.id, r]));
  const seen = new Set();
  const taken = new Set(existingIds);
  const leaves = [];
  const decided = [];
  for (const p of proposals) {
    const row = rows.get(p.task);
    if (!row) {
      errors.push(`${p.task}: not in scope`);
      continue;
    }
    if (seen.has(p.task)) errors.push(`${p.task}: more than one proposal`);
    seen.add(p.task);
    const rule = verdicts.includes(p.verdict) ? RULES[p.verdict] : null;
    if (!rule) {
      errors.push(`${p.task}: verdict must be one of ${verdicts.join(", ")}`);
      continue;
    }
    if (!p.reason?.trim()) errors.push(`${p.task}: reason is required`);
    const acceptance = p.acceptance || [];
    if (rule.acceptance && !acceptance.length)
      errors.push(`${p.task}: ${p.verdict} needs acceptance`);
    const list = p.leaves || [];
    if (rule.leaves && !list.length)
      errors.push(`${p.task}: ${p.verdict} needs leaves`);
    if (!rule.leaves && list.length)
      errors.push(`${p.task}: ${p.verdict} takes no leaves`);
    const mapped = new Set(row.entries.map((e) => e.id));
    for (const leaf of list) {
      const id = `${p.task}.${leaf.slug}`;
      if (!SLUG.test(leaf.slug || ""))
        errors.push(`${id}: slug must be lowercase words joined by -`);
      if (taken.has(id)) errors.push(`${id}: ID already used`);
      taken.add(id);
      if (!leaf.title?.trim()) errors.push(`${id}: title is required`);
      if (!leaf.acceptance?.length)
        errors.push(`${id}: acceptance is required`);
      for (const e of leaf.entries || [])
        if (!mapped.has(e))
          errors.push(`${id}: entry ${e} is not mapped to ${p.task}`);
      leaves.push({
        id,
        parentId: p.task,
        epic: row.epic,
        kind: "leaf",
        status: "planned",
        title: leaf.title,
        acceptance: leaf.acceptance || [],
        entries: leaf.entries || [],
        basis: leaf.basis || null,
      });
    }
    decided.push({
      ...row,
      verdict: p.verdict,
      reason: p.reason,
      acceptance,
      leaves: list.map((l) => `${p.task}.${l.slug}`),
      proposal: true,
    });
  }
  for (const id of rows.keys())
    if (!seen.has(id)) errors.push(`${id}: no proposal`);
  return { rows: decided, leaves, errors };
}

export const DRAIN_STATES = [
  "starting",
  "running",
  "waiting-input",
  "waiting-approval",
  "observing",
  "interrupted",
  "disconnected",
];

// Step 7: evidence of each run the old host left open. Events are the
// store's flattened rows ({ runId, kind, at, ...body }). Messages are the
// run's own final message texts and the owner's queued deliveries; tool
// output and token deltas stay in the archive.
export function runEvidence(
  data,
  {
    runs,
    events = [],
    deliveries = [],
    archived = {},
    commitRefs,
    present = {},
  },
) {
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  return runs
    .filter((r) => DRAIN_STATES.includes(r.state))
    .map((r) => {
      const own = events.filter((e) => e.runId === r.id);
      const task = tasks.get(r.taskId);
      const summary = task?.activity?.summary ?? "";
      const commits = hashes(summary).map((sha) => {
        const refs = commitRefs ? commitRefs(sha) : null;
        return { sha, resolved: refs !== null, refs: refs || [] };
      });
      return {
        id: r.id,
        taskId: r.taskId,
        taskStatus: task?.status ?? null,
        provider: r.provider ?? null,
        mode: r.mode ?? null,
        external: !!r.external,
        state: r.state,
        createdAt: r.createdAt ?? null,
        lastEventAt: own.length ? own[own.length - 1].at : null,
        branch: r.branch ?? null,
        worktree: r.worktree ? redactPaths(r.worktree) : null,
        worktreePresent: present[r.id]?.worktree ?? null,
        transcriptPresent: present[r.id]?.transcript ?? null,
        prompt: r.prompt ? redactPaths(r.prompt) : null,
        messages: own
          .filter((e) => e.kind === "message" && typeof e.text === "string")
          .map((e) => ({ at: e.at, text: redactPaths(e.text) })),
        deliveries: deliveries
          .filter((d) => d.runId === r.id)
          .map((d) => ({
            at: d.createdAt ?? null,
            state: d.state,
            text: redactPaths(d.text),
          })),
        endedAs:
          own.filter((e) => e.kind === "turn.completed").at(-1)?.state ?? null,
        activity: task?.activity
          ? {
              state: task.activity.state,
              branch: task.activity.branch ?? null,
              summary: redactPaths(summary),
            }
          : null,
        commits,
        archivedAt: archived[r.id] ?? null,
      };
    });
}
