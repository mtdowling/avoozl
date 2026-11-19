// Held reconstruction of a spec from branches and its issue (Requirement
// 102.12 and 102.16, design §4.32.10, task 56.6). Nothing here reads the
// local database, so it works after the database is lost.
//
// 1. Replay the validated journal (spec-journal.mjs). A held journal
//    (missing or changed record, conflict) leaves everything unresolved.
// 2. Fetch every qualified working head and checkpoint the journal or an
//    open pull request names (working-heads.mjs). A deleted or unreadable
//    fork, a rewritten branch or a head that moved is unresolved, never
//    done, and its task is held.
// 3. Reconcile actual landings against the fetched base: outstanding
//    intents (driver-generations.mjs) and `Avoozl-Task` trailers. A
//    candidate on the base whose outcome record is missing (a lost tail)
//    comes back as landed by its intent's evidence, waiting to be recorded;
//    a trailer without evidence is landed-unverified for a person.
// 4. Restore grants, controls, voids and person outcomes from the journal.
// 5. Private controls and spend come only from the private handoff export
//    (driver.mjs buildExport). Without it they are unknown, never zero.
//
// The result is always held. Only a person's Resume lifts it, and Resume
// still leaves unresolved work held.
import { git } from "./git.mjs";
import {
  driverState,
  outstandingIntents,
  parseTrailers,
  trailerOutcome,
} from "./driver-generations.mjs";
import { EXPORT_FORMAT } from "./driver.mjs";
import { journalOutcomes, replayJournal } from "./spec-journal.mjs";
import { taskOutcome } from "./task-outcomes.mjs";
import {
  discoverFromPullRequest,
  fetchExact,
  recoverWorkingHeads,
  refKey,
  workingBranch,
} from "./working-heads.mjs";
import { fail } from "./store.mjs";

const REBUILT_BASE = "refs/avoozl/rebuild/base";

async function isAncestor(root, older, newer) {
  try {
    await git(root, ["merge-base", "--is-ancestor", older, newer]);
    return true;
  } catch {
    return false;
  }
}

// The task a checkpoint branch belongs to (`avoozl/<spec>/task/<task>`),
// or null for the working branch and anything else.
const taskOfBranch = (spec, branch) =>
  branch?.startsWith(`avoozl/${spec}/task/`)
    ? branch.slice(`avoozl/${spec}/task/`.length)
    : null;

// Fetches the target base into a private ref; null when it cannot be read.
async function fetchBase(root, registry, target, env) {
  try {
    const { url } = registry.get(target.repository);
    await git(
      root,
      [
        "fetch",
        "--no-tags",
        "--quiet",
        url,
        `+refs/heads/${target.base}:${REBUILT_BASE}`,
      ],
      { env: { ...(env ?? process.env), GIT_TERMINAL_PROMPT: "0" } },
    );
    return await git(root, ["rev-parse", REBUILT_BASE]);
  } catch {
    return null;
  }
}

// Trailers on the base, newest first: [{task, definition, commit}].
async function baseTrailers(root, head) {
  const out = await git(root, [
    "log",
    "--format=%H%x1f%B%x1e",
    "--grep=^Avoozl-Task:",
    head,
  ]);
  return out
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [commit, message] = entry.split("\x1f");
      return parseTrailers(message).map((t) => ({ ...t, commit }));
    });
}

// The private handoff's spend and controls, or null when it is absent or
// not a driver export.
function privateFacts(handoff) {
  if (handoff?.format !== EXPORT_FORMAT || handoff.version !== 1) return null;
  return {
    usage: handoff.columns?.flow_usage ?? [],
    samples: handoff.columns?.usage_samples ?? [],
    machineLocal: handoff.machineLocal ?? [],
  };
}

// Rebuilds one spec. Inputs:
// - `root`: a checkout to fetch into; `registry`: sourceRegistry().
// - `spec`: the spec id the journal and branches use; `target`:
//   {repository, base}.
// - `entries` and `replayOptions` (with `permission`): the journal.
// - `revision` and `approved` (Map task -> definition): the approved spec.
// - `pulls`: open pull request numbers on the target; `github` to read them.
// - `handoff`: the parsed private handoff export, or null.
export async function rebuildSpec({
  root,
  registry,
  spec,
  target,
  entries,
  replayOptions = {},
  revision,
  approved,
  pulls = [],
  github = null,
  handoff = null,
  env,
}) {
  const replay = await replayJournal(entries, replayOptions),
    state = driverState(replay),
    unresolved = [],
    held = new Map(),
    hold = (task, reason) => {
      if (!held.has(task)) held.set(task, new Set());
      held.get(task).add(reason);
    };
  if (replay.held)
    unresolved.push({ kind: "journal", reasons: replay.reasons });

  // 2. Working heads and checkpoints.
  const recovered = await recoverWorkingHeads(root, replay, {
      spec,
      target: target.repository,
      base: target.base,
    }),
    refs = new Map(recovered.heads.map((ref) => [refKey(ref), ref]));
  for (const number of pulls) {
    const found = await discoverFromPullRequest(
      github,
      target.repository,
      number,
    );
    if (found.state === "found") refs.set(refKey(found.ref), found.ref);
    else unresolved.push({ kind: "pull", pr: number, reason: found.reason });
  }
  const heads = [];
  for (const ref of refs.values()) {
    const fetched = await fetchExact(root, ref, registry, { env }),
      task = taskOfBranch(spec, ref.source.branch),
      entry = {
        repository: ref.source.repository,
        branch: ref.source.branch,
        commit: ref.source.commit,
        ...(ref.pr ? { pr: ref.pr } : {}),
        task,
        state: fetched.state,
        retained: Boolean(fetched.retained),
        ...(fetched.head && fetched.head !== ref.source.commit
          ? { head: fetched.head }
          : {}),
      };
    heads.push(entry);
    if (fetched.state !== "exact") {
      unresolved.push({
        kind: "head",
        repository: entry.repository,
        branch: entry.branch,
        state: fetched.state,
        retained: entry.retained,
        task,
      });
      if (task) hold(task, `head-${fetched.state}`);
    }
  }
  const branchProgress =
    !replay.held &&
    !unresolved.some(
      (item) => item.kind === "head" && item.branch === workingBranch(spec),
    );

  // 3. Landings against the base.
  const baseHead = await fetchBase(root, registry, target, env),
    landings = [];
  if (!baseHead) unresolved.push({ kind: "base", state: "unavailable" });
  for (const intent of outstandingIntents(state)) {
    const candidate = intent.refs.at(-1).commit,
      landed = baseHead && (await isAncestor(root, candidate, baseHead)),
      result = landed
        ? "landed"
        : !baseHead
          ? "unknown"
          : baseHead !== intent.base
            ? "void-allowed"
            : "wait";
    landings.push({ op: intent.op, state: result, candidate });
    for (const t of intent.tasks) hold(t.task, `intent-${result}`);
  }
  const outcomes = journalOutcomes(replay);
  if (baseHead) {
    const known = new Set([
      ...approved.values(),
      ...outcomes.map((o) => o.definition),
      ...[...state.intents.values()].flatMap((i) =>
        i.tasks.map((t) => t.definition),
      ),
    ]);
    for (const trailer of await baseTrailers(root, baseHead)) {
      // Trailers of other specs' tasks are not this spec's landings.
      if (!approved.has(trailer.task) || !known.has(trailer.definition))
        continue;
      const verdict = trailerOutcome(trailer, { approved, state });
      if (verdict.kind === "skip") continue;
      landings.push({
        trailer: trailer.task,
        commit: trailer.commit,
        ...verdict,
      });
      if (verdict.kind === "landed-unverified")
        hold(trailer.task, "landed-unverified");
    }
  }

  // 4. Tasks, grants and decisions.
  const tasks = {};
  for (const [task, definition] of approved)
    tasks[task] = taskOutcome(outcomes, {
      spec,
      task,
      revision,
      definition,
    }).state;
  const grants = [],
    decisions = [];
  for (const { id, record } of replay.records) {
    if (record.kind === "grant")
      for (const t of record.tasks)
        grants.push({
          task: t.task,
          generation: record.generation,
          record: id,
        });
    else if (record.kind === "void")
      decisions.push({ kind: "void", intent: record.voids, record: id });
    else if (record.kind === "outcome")
      for (const o of record.outcomes)
        if (["done", "skipped", "refused", "reopened"].includes(o.kind))
          decisions.push({ kind: o.kind, task: o.task, record: id });
  }

  // 5. Private controls and spend: the handoff, or unknown.
  const facts = privateFacts(handoff),
    privateControls = [...state.controls]
      .filter(([, flag]) => flag === "budget")
      .map(([id]) => id);
  if (!facts)
    for (const id of privateControls)
      unresolved.push({ kind: "private-control", id, state: "unknown" });

  return {
    held: true,
    spec,
    generation: state.generation,
    driver: state.driver,
    tasks,
    heads,
    landings,
    grants,
    controls: Object.fromEntries(state.controls),
    decisions,
    branchProgress,
    spend: facts
      ? {
          state: "known",
          source: "private-handoff",
          usage: facts.usage,
          samples: facts.samples,
        }
      : { state: "unknown" },
    unresolved,
    heldTasks: Object.fromEntries(
      [...held].map(([task, reasons]) => [task, [...reasons].sort()]),
    ),
  };
}

// A person's Resume after reviewing a rebuild. Refuses a held journal (a
// person reconciles it first) and unknown spend unless the person says
// they accept it unknown. Unresolved work stays held after resume; an
// intent whose candidate landed is listed for reconcileIntents to record.
export function resumeRebuild(
  rebuilt,
  { by, acceptUnknownSpend = false } = {},
) {
  if (by?.kind !== "person")
    fail("Resume after a rebuild is a person's action.", 403);
  if (rebuilt.unresolved.some((item) => item.kind === "journal"))
    fail("The journal is held; reconcile it before resuming.", 409);
  if (rebuilt.spend.state === "unknown" && !acceptUnknownSpend)
    fail(
      "Spend and private controls are unknown without the private handoff. Import it, or resume accepting them as unknown.",
      409,
    );
  return {
    held: false,
    by: by.login ?? null,
    stillHeld: rebuilt.heldTasks,
    branchProgress: rebuilt.branchProgress,
    spend: rebuilt.spend,
    reconcile: rebuilt.landings
      .filter((landing) => landing.op && landing.state === "landed")
      .map((landing) => landing.op),
  };
}
