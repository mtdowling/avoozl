import { createHash, randomUUID } from "node:crypto";
import { fail } from "./store.mjs";

// Plan review findings (Requirement 104, design §4.33): severity, a quote
// anchor that survives edits, a derived state, and the person's decisions.
// Everything here reads or writes the workspace database only.

export const FINDING_SEVERITIES = ["info", "warn", "blocker"];
// Requirement 99 values, read as the new ones. Stored rows are not rewritten.
const OLD_SEVERITY = {
  blocking: "blocker",
  important: "warn",
  suggestion: "info",
  question: "info",
};
export const FINDING_ACTIONS = [
  "accept",
  "reject",
  "defer",
  "resolve",
  "reopen",
];
const CLOSING = { reject: "rejected", defer: "deferred", resolve: "resolved" };
// plan.review.dispose wrote these before decisions existed.
const DISPOSED = {
  accepted: "accepted",
  rejected: "rejected",
  deferred: "deferred",
  resolved: "resolved",
};
export const MAX_QUOTE = 500;

export function findingSeverity(value) {
  if (FINDING_SEVERITIES.includes(value)) return value;
  return OLD_SEVERITY[value] ?? "info";
}

const collapse = (text) => text.replace(/\s+/g, " ").trim();

export function quoteHash(quote) {
  return createHash("sha256").update(collapse(quote)).digest("hex");
}

// Where `quote` sits in `text`, comparing with whitespace runs collapsed.
// Returns {lineStart, lineEnd}, or null when it is missing or not unique.
export function quoteLines(text, quote) {
  const needle = collapse(quote || "");
  if (!needle || typeof text !== "string") return null;
  // The collapsed text, with each of its characters' offsets in `text`.
  let flat = "";
  const at = [];
  let space = false;
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) {
      space = true;
      continue;
    }
    if (space && flat) {
      flat += " ";
      at.push(i - 1);
    }
    space = false;
    flat += text[i];
    at.push(i);
  }
  const first = flat.indexOf(needle);
  if (first < 0 || flat.indexOf(needle, first + 1) >= 0) return null;
  const line = (offset) => text.slice(0, offset).split("\n").length;
  return {
    lineStart: line(at[first]),
    lineEnd: line(at[first + needle.length - 1]),
  };
}

// The stored anchor. Rows written before Requirement 104 have only a file
// and a line, and no quote.
export function findingAnchor(thread) {
  if (thread.anchor) return thread.anchor;
  return {
    file: thread.file,
    lineStart: thread.line,
    lineEnd: thread.line,
    quote: null,
    quoteHash: null,
  };
}

// The anchor's lines in `files` of revision `revisionHash`, worked out on
// read; the stored anchor never changes. A quote found zero or several
// times, or a row with no quote at another revision, is moved.
// shortcut: only the same file is searched, so text moved to another file
// reads as moved. Upgrade if split files show it often.
export function anchorAt(thread, files, revisionHash) {
  const anchor = findingAnchor(thread),
    stored = {
      file: anchor.file,
      lineStart: anchor.lineStart,
      lineEnd: anchor.lineEnd,
    };
  if (revisionHash === thread.revisionHash) return stored;
  const lines = anchor.quote
    ? quoteLines(files?.[anchor.file], anchor.quote)
    : null;
  if (!lines)
    return { ...stored, moved: true, revisionHash: thread.revisionHash };
  return { file: anchor.file, ...lines };
}

// The decision that stands: the last one after the last reopen.
export function standing(thread) {
  const decisions = thread.decisions || [];
  const last = decisions.at(-1);
  if (last && last.action !== "reopen") return last;
  if (!last && thread.state === "closed" && DISPOSED[thread.disposition])
    return { action: thread.disposition, at: thread.disposedAt };
  return null;
}

// The planner owes this finding an answer: it has none, or a person
// accepted it after the planner's last answer (R104.7).
export function needsAnswer(thread) {
  if (!thread.answer) return true;
  const decision = standing(thread);
  return (
    decision?.action === "accept" &&
    String(decision.at || "") >= String(thread.answer.at || "")
  );
}

// A person rejected or resolved it, so a reviewer must not raise it again.
export function settledByPerson(thread) {
  return ["reject", "resolve", "rejected", "resolved"].includes(
    standing(thread)?.action,
  );
}

// One of open, fixed, answered, for you, accepted, rejected, deferred,
// resolved. `hashes` holds the plan's stored revision hashes; `busy` is
// true while a round or planner turn runs for the plan.
export function findingState(thread, { hashes, busy = false }) {
  const decision = standing(thread),
    answer = thread.answer,
    fixed =
      answer?.action === "fixed" &&
      hashes.has(answer.revisionHash) &&
      (decision?.action !== "accept" ||
        String(answer.at || "") > String(decision.at || ""));
  if (decision && decision.action !== "accept")
    return CLOSING[decision.action] ?? DISPOSED[decision.action];
  if (fixed) return "fixed";
  if (busy)
    return decision
      ? "accepted"
      : answer?.action === "answered"
        ? "answered"
        : "open";
  return "for you";
}

export const answerReceiptId = (roundId) => "plan-answer:" + roundId;

const planHashes = (plan) =>
  new Set([plan.hash, ...(plan.history || []).map((entry) => entry.hash)]);

// What findingState needs for one plan: its stored revision hashes, and
// whether a review round or a planner answer turn is running for it.
export function findingContext(store, plan) {
  const rounds = store
    .list("review_rounds")
    .filter((round) => round.spec && round.planId === plan.id);
  const busy = rounds.some(
    (round) =>
      round.state === "running" ||
      ["queued", "running"].includes(
        store.get("receipts", answerReceiptId(round.id))?.state,
      ),
  );
  return { hashes: planHashes(plan), busy };
}

// The revision's files: the current ones, or a stored earlier revision's.
export function filesAt(plan, revisionHash) {
  if (revisionHash === plan.hash) return plan.files;
  return (plan.history || []).find((entry) => entry.hash === revisionHash)
    ?.files;
}

// A finding as a read shows it: the Requirement 104 severity, its state,
// and its anchor at `revisionHash`. Reads only.
export function findingFields(thread, plan, context, revisionHash) {
  return {
    severity: findingSeverity(thread.severity),
    category: thread.kind,
    state: findingState(thread, context),
    quote: findingAnchor(thread).quote,
    anchor: anchorAt(thread, filesAt(plan, revisionHash), revisionHash),
    decisions: thread.decisions || [],
  };
}

// Appends a person's action to a plan-review finding. Defer also stores a
// follow-up; it makes no task and no issue. Only a person reaches this:
// plan.review.finding.decide and plan.review.dispose are in PERSON_ONLY.
export function recordFindingDecision(
  store,
  { id, action, revisionHash, note, by, at = new Date().toISOString() },
) {
  const thread = store.get("review_threads", id);
  if (!thread || thread.source !== "plan-review")
    fail("Review finding not found.", 404);
  if (!FINDING_ACTIONS.includes(action))
    fail("Choose accept, reject, defer, resolve or reopen.");
  if (typeof revisionHash !== "string" || !revisionHash)
    fail("Name the revision on screen.");
  const plan = store.get("plans", thread.planId);
  if (!plan || plan.deletedAt) fail("Spec plan not found.", 404);
  if (!planHashes(plan).has(revisionHash))
    fail("That revision is not one of this spec's stored revisions.", 409);
  const text = typeof note === "string" ? note.trim() : "";
  if (text.length > 10000) fail("Keep the note under 10,000 characters.");
  if (action === "reject" && !text) fail("Give a reason to reject a finding.");
  const current = standing(thread);
  if (action === "reopen" && !current)
    fail("This finding is not decided.", 409);
  if (action !== "reopen" && current?.action === action)
    fail("This finding already has that decision.", 409);
  const decision = {
    action,
    by: by || "Local operator",
    at,
    revisionHash,
    note: text,
  };
  return store.transaction(() => {
    const next = {
      ...thread,
      decisions: [...(thread.decisions || []), decision],
      // Older readers still see closed findings as closed.
      state: CLOSING[action] ? "closed" : "open",
      updatedAt: at,
    };
    if (CLOSING[action]) next.disposition = CLOSING[action];
    else delete next.disposition;
    store.put("review_threads", next);
    if (action === "defer")
      store.put("review_followups", {
        id: "followup-" + randomUUID(),
        planId: thread.planId,
        spec: thread.spec ?? plan.spec ?? null,
        findingId: thread.id,
        revisionHash,
        note: text,
        by: decision.by,
        at,
      });
    return next;
  });
}
