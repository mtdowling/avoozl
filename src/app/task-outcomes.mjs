// Task outcomes and branch progress (Requirement 102.3-102.5, design §4.32.1).
//
// An outcome is a durable record bound to a spec, a task, the approved
// revision hash and the task's definition digest, plus its commit and
// evidence. Only the latest valid outcome counts. Checkmarks on a working
// branch are progress, never outcomes; a tick on the base branch completes
// the task (spec-ticks.mjs). Marks stay outside the revision hash
// (`withoutMarks` in spec-plans.mjs).
import { digest } from "../model.mjs";

export const OUTCOME_KINDS = [
  "landed",
  "landed-unverified",
  "done",
  "skipped",
  "refused",
  "reopened",
];
// The state each latest kind gives its task when its definition is current.
const STATE = {
  landed: "complete",
  done: "complete",
  skipped: "complete",
  "landed-unverified": "unverified",
  refused: "refused",
  reopened: "reopened",
};

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

// The digest of one task's manifest entry. Key order does not matter.
export function taskDefinition(entry) {
  return digest(JSON.stringify(canonical(entry ?? null)));
}

const text = (value) => typeof value === "string" && value.length > 0;

// A record the reducer may use. `landed` needs its exact commit and evidence
// (R102.5); reconcile writes `landed-unverified` when evidence is missing.
function validOutcome(outcome, { spec, task } = {}) {
  if (!outcome || !OUTCOME_KINDS.includes(outcome.kind)) return false;
  if (outcome.spec !== spec || outcome.task !== task) return false;
  if (!text(outcome.revision) || !text(outcome.definition)) return false;
  if (outcome.kind === "landed")
    return text(outcome.commit) && Boolean(outcome.evidence);
  return true;
}

// The task's state from its outcomes, in journal order (oldest first).
// `carried` is the current approval's explicit carry-forward list:
// [{task, definition}]. An outcome from an older revision counts only when
// that list names the task with the outcome's definition and the definition
// is unchanged. Anything else on an older revision or definition is stale.
// States: open, complete, unverified, refused, reopened, stale.
export function taskOutcome(
  outcomes,
  { spec, task, revision, definition, carried = [] },
) {
  const latest = [...(outcomes ?? [])]
    .reverse()
    .find((outcome) => validOutcome(outcome, { spec, task }));
  if (!latest) return { state: "open", outcome: null };
  const current =
    latest.definition === definition &&
    (latest.revision === revision ||
      carried.some(
        (entry) =>
          entry?.task === task && entry.definition === latest.definition,
      ));
  return { state: current ? STATE[latest.kind] : "stale", outcome: latest };
}

export const isComplete = (result) => result?.state === "complete";

// Whether a prerequisite lets a successor start (R102.4).
// - An accepted outcome releases successors in any spec.
// - A verified integration on the spec's working branch releases only
//   successors in the same spec, and only when the exact prerequisite
//   commit is available in every repository the successor needs.
// - An unfinished checkpoint or a branch checkmark releases nothing.
export function releases({
  outcome,
  branch = null,
  sameSpec = false,
  repositories = [],
}) {
  if (isComplete(outcome)) return true;
  if (!sameSpec || branch?.state !== "verified" || !text(branch.commit))
    return false;
  const available = branch.available ?? {};
  return repositories.every((repository) =>
    (available[repository] ?? []).includes(branch.commit),
  );
}
