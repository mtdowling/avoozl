// Manual tasks (design §4.16, Requirement 61.9–61.15): a leaf only a person
// does. It is never dispatched; a person marks it done (Done, Skipped or
// Refused) or reopens it, from the page or the CLI. Done and Skipped
// release its dependents; Refused is a no-go and keeps them held. Operations.perform refuses both
// over MCP (mcp-policy.mjs) before this runs.
//
// In a GitHub mode Mark done closes the leaf's issue as the person's own
// login, refused when that login fails the repository's Who counts rule;
// a close on GitHub is read by the tick (github-close.mjs).
import { statusComplete } from "../model.mjs";
import { isManual, supersedingTask } from "../work-model.mjs";
import { actorAllowed } from "./github-policy.mjs";
import { codeRepository } from "./github-plans-repo.mjs";
import { putSpan } from "./flow.mjs";
import {
  NOTE_LIMITS,
  entryFields,
  newEntry,
  putEntry,
  screenEntries,
  taskNotes,
} from "./task-notes.mjs";
import { fail } from "./store.mjs";

const CHOICES = Object.freeze(["done", "skipped", "refused"]);
// The close reason each choice writes on GitHub, and back. A refusal closes
// as not planned too; the tick tells it from a skip by the refusal record
// (github-close.mjs).
const CLOSE_REASON = {
  done: "completed",
  skipped: "not_planned",
  refused: "not_planned",
};
function manualTask(data, taskId) {
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) fail(`No task ${taskId}.`, 404);
  if (!isManual(task))
    fail(
      `${taskId} is not a manual task; an agent delivers it and its checks prove it.`,
      409,
    );
  return task;
}

// When the leaf started waiting for a person: its last blocker's finish,
// else when it was approved. Flow counts the time from then to Mark done
// as waiting on a person (R61.15).
function waitingSince(data, task) {
  const byId = new Map(data.tasks.map((t) => [t.id, t]));
  const times = data.edges
    .filter(
      (e) => e.to === task.id && ["requires", "sequence"].includes(e.kind),
    )
    .map((e) => supersedingTask(byId, e.from))
    .map(
      (t) =>
        t?.manualDone?.at ||
        t?.integration?.at ||
        t?.githubVerdict?.mergedAt ||
        t?.githubVerdict?.at ||
        t?.updatedAt ||
        null,
    )
    .filter(Boolean)
    .sort();
  return times.at(-1) || task.createdAt || null;
}

// The person's GitHub login, checked against Who counts for the leaf's
// repository. Returns the login, or null outside a GitHub mode.
async function allowedLogin(store, github, policy, task) {
  if (!task.github?.number) return null;
  if (!github?.available?.())
    fail(
      `${task.id}'s issue is on GitHub, and Avoozl cannot reach GitHub to close it. Sign in with gh, then mark it done again.`,
      502,
    );
  const login = (await github.currentUser())?.login;
  if (!login) fail("Avoozl could not read your GitHub login.", 502);
  const code =
      codeRepository(store, task, policy.mode) || task.github.repository,
    repo = policy.repositories?.[code] || {},
    permission = repo.minimumPermission
      ? (await github.permission(code, login))?.permission || "none"
      : null,
    check = actorAllowed(repo, login, permission);
  if (!check.allowed)
    fail(
      `${code}'s Who counts rule does not let ${login} mark ${task.id} done: ${check.reason}`,
      403,
    );
  return login;
}

// task.manual.complete: {taskId, choice, links?: [{url, label}]}. Tasks keep
// no notes (owner, 2026-11-17), so a `note` is refused rather than dropped.
// `by` is the person's name for the record; `github` and `policy` close the
// issue in a GitHub mode.
export async function completeManual(
  store,
  input = {},
  { by = "person", github = null, policy = null } = {},
) {
  const data = store.read(),
    task = manualTask(data, input.taskId);
  if (!CHOICES.includes(input.choice))
    fail('choice must be "done", "skipped" or "refused".');
  if (task.manualDone || statusComplete(data, task.status))
    fail(
      `${task.id} is already ${task.manualDone?.choice === "refused" ? "refused" : "done"}. Reopen it first.`,
      409,
    );
  if (input.note != null && input.note !== "")
    fail("Tasks keep no notes: add the outcome as a link instead.");
  // Every outcome link is checked before anything is written.
  const entries = (Array.isArray(input.links) ? input.links : []).map((link) =>
    entryFields({ kind: "link", ...link }),
  );
  if (input.links !== undefined && !Array.isArray(input.links))
    fail("links must be a list of {url, label}.");
  if (taskNotes(store, task.id).length + entries.length > NOTE_LIMITS.entries)
    fail(`entries: a task holds at most ${NOTE_LIMITS.entries} links.`, 409);
  const login = await allowedLogin(store, github, policy || {}, task);
  screenEntries(store, task.id, entries, true);
  if (login)
    await github.updateIssue(task.github.repository, task.github.number, {
      state: "closed",
      state_reason: CLOSE_REASON[input.choice],
    });
  const at = new Date().toISOString(),
    refused = input.choice === "refused",
    // A refusal is not complete: it sits as Blocked, which holds its
    // dependents and shows in Needs you, until a person reopens it.
    status = refused
      ? data.statuses.some((s) => s.id === "blocked")
        ? "blocked"
        : "planned"
      : data.statuses.find((s) => s.complete)?.id || "done",
    since = waitingSince(data, task),
    record = {
      choice: input.choice,
      by,
      ...(login ? { login } : {}),
      at,
      via: "avoozl",
    };
  const author = { author: "person", ...(login ? { login } : {}) };
  store.transaction(() => {
    for (const fields of entries)
      putEntry(
        store,
        newEntry(task, fields, { author, outcome: true, now: at }),
      );
    const draft = structuredClone(store.read()),
      row = draft.tasks.find((t) => t.id === task.id);
    row.manualDone = record;
    row.status = status;
    row.updatedAt = at;
    store.commit(draft, `Mark ${task.id} ${input.choice}`);
    store.event(null, "task.manual.completed", {
      taskId: task.id,
      choice: input.choice,
      by,
      login: login || null,
    });
    if (since && since < at)
      putSpan(store, {
        id: `manual:${task.id}:${at}`,
        taskId: task.id,
        role: "person",
        stage: "waiting",
        startedAt: since,
        endedAt: at,
        source: "events",
        detail: "Waiting for a person",
      });
  });
  return { taskId: task.id, manualDone: record, entries: entries.length };
}

// task.manual.reopen: {taskId}. The leaf is open again: new dispatch of its
// dependents waits, running sessions are left alone. Its issue is reopened.
// Reopening a refusal undoes it the same way.
export async function reopenManual(
  store,
  input = {},
  { by = "person", github = null } = {},
) {
  const data = store.read(),
    task = manualTask(data, input.taskId);
  if (!task.manualDone && !statusComplete(data, task.status))
    fail(`${task.id} is not done.`, 409);
  if (task.github?.number) {
    if (!github?.available?.())
      fail(
        `${task.id}'s issue is on GitHub, and Avoozl cannot reach GitHub to reopen it.`,
        502,
      );
    await github.updateIssue(task.github.repository, task.github.number, {
      state: "open",
    });
  }
  const at = new Date().toISOString();
  store.transaction(() => {
    const draft = structuredClone(store.read()),
      row = draft.tasks.find((t) => t.id === task.id);
    delete row.manualDone;
    row.status = "planned";
    row.updatedAt = at;
    // The tick reads the reopened issue as open; nothing to restore.
    if (row.githubVerdict) row.githubVerdict = { state: "open", at };
    store.commit(draft, `Reopen ${task.id}`);
    store.event(null, "task.manual.reopened", { taskId: task.id, by });
  });
  return { taskId: task.id, reopened: true };
}
