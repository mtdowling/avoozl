// Manual tasks (design §4.16, Requirement 61.9–61.15): a leaf only a person
// does. It is never dispatched; a person marks it done (Done, Skipped or
// Refused) or reopens it, from the page or the CLI. Done and Skipped
// release its dependents; Refused is a no-go and keeps them held. Operations.perform refuses both
// over MCP (mcp-policy.mjs) before this runs.
import { statusComplete } from "../../model.mjs";
import { isManual, supersedingTask } from "../../work-model.mjs";
import { putSpan } from "../flow/flow.mjs";
import {
  NOTE_LIMITS,
  entryFields,
  newEntry,
  putEntry,
  screenEntries,
  taskNotes,
} from "./task-notes.mjs";
import { fail } from "../store/store.mjs";

const CHOICES = Object.freeze(["done", "skipped", "refused"]);

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
    .map((t) => t?.manualDone?.at || t?.integration?.at || t?.updatedAt || null)
    .filter(Boolean)
    .sort();
  return times.at(-1) || task.createdAt || null;
}

// task.manual.complete: {taskId, choice, links?: [{url, label}]}. Tasks keep
// no notes (owner, 2026-11-17), so a `note` is refused rather than dropped.
// `by` is the person's name for the record.
export function completeManual(store, input = {}, { by = "person" } = {}) {
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
  screenEntries(store, task.id, entries, true);
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
      at,
      via: "avoozl",
    };
  const author = { author: "person" };
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
// dependents waits, running sessions are left alone. Reopening a refusal
// undoes it the same way.
export function reopenManual(store, input = {}, { by = "person" } = {}) {
  const data = store.read(),
    task = manualTask(data, input.taskId);
  if (!task.manualDone && !statusComplete(data, task.status))
    fail(`${task.id} is not done.`, 409);
  const at = new Date().toISOString();
  store.transaction(() => {
    const draft = structuredClone(store.read()),
      row = draft.tasks.find((t) => t.id === task.id);
    delete row.manualDone;
    row.status = "planned";
    row.updatedAt = at;
    store.commit(draft, `Reopen ${task.id}`);
    store.event(null, "task.manual.reopened", { taskId: task.id, by });
  });
  return { taskId: task.id, reopened: true };
}
