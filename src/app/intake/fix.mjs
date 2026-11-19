// A fix: one change with no spec files (triage-agent TA9, design §D5). Its
// definition is its text (an issue's title and body as they read when it
// started, or what a person typed), its repository and two acceptance
// lines. Starting it is the approval, so a fix is a ready leaf at once. It
// runs, is checked and lands like any other task.
//
// - From an issue (Fix on the Issues page, Deliver this): the journal is
//   that issue, as for every GitHub intake task (github-intake.mjs).
// - From text (New fix, `avoozl fix "TEXT" --repo ID`): the record is the
//   task in the workspace database; nothing goes to GitHub.
// - Make this a spec: a fix that grew becomes a spec folder holding its
//   text, and the fix is archived with a link to it.
import fs from "node:fs";
import path from "node:path";
import { digest } from "../../model.mjs";
import { canonical, fail } from "../store/store.mjs";
import { ensureInbox, patchTask } from "./intake.mjs";
import { takeOverSpec } from "../specs/spec-takeover.mjs";
import { workspaceRepositories } from "../workspace/workspace-repositories.mjs";
import {
  SPECS_DIRECTORY,
  lintSpec,
  readSpecFolder,
  taskToken,
} from "../specs/spec-plans.mjs";

export const FIX_VERSION = 2;
export const FIX_ACCEPTANCE = Object.freeze([
  "Does what the text asks.",
  "The repository's checks pass on the exact head that lands.",
]);
const TEXT_LIMIT = 20000;
const TITLE_LIMIT = 120;
const FIX_ID = /^fix-(\d+)$/;
const lower = (value) => String(value ?? "").toLowerCase();

// The record. `definition` digests every other field, so changed text is a
// changed definition. `source` is {issue: {repository, number}} or
// {text, by}; `title` and `body` are the issue's, or the text alone.
export function fixRecord({
  issue = null,
  text = null,
  by = "person",
  title = "",
  body = "",
}) {
  const fields = {
    v: FIX_VERSION,
    source: issue
      ? { issue: { repository: issue.repository, number: issue.number } }
      : { text, by },
    snapshot: digest(issue ? `${title}\n\n${body || ""}` : text),
    acceptance: [...FIX_ACCEPTANCE],
  };
  return { ...fields, definition: digest(canonical(fields)) };
}

// A stored fix as version 2. A version 1 record (`kind: "bounded-fix"`,
// written by Deliver this before fixes had a text source) loads with its
// issue as the source; its own acceptance and definition stay, since they
// are what was started.
export function loadFix(fix) {
  if (!fix || typeof fix !== "object") return null;
  if (fix.v === FIX_VERSION) return fix;
  if (fix.v === 1 && fix.kind === "bounded-fix" && fix.issue) {
    const { kind: _kind, issue, ...rest } = fix;
    return { ...rest, v: FIX_VERSION, source: { issue } };
  }
  return null;
}

// The issue a fix came from, or null for a fix from text.
export const fixIssue = (task) => loadFix(task?.fix)?.source?.issue ?? null;

// A fix lands like a spec's task: through a driver journal, so a landing
// intent is written before every push (merge-batch.mjs). A fix has no spec,
// so its journal is its own, local and named by the task: the "spec" a
// landing entry names is the task's plan, or the fix itself.
export const landingSpecOf = (task) =>
  task?.planId ?? (loadFix(task?.fix) ? task.id : null);
const fixTask = (store, id) =>
  store
    .read()
    .tasks.find(
      (task) => task.id === id && !task.planId && loadFix(task.fix),
    ) ?? null;
export const isFixSpec = (store, id) => Boolean(fixTask(store, id));
// The revision a landing intent records: the plan's hash, or the fix's
// definition.
export const specRevision = (store, spec) =>
  store.get("plans", spec)?.hash ??
  loadFix(fixTask(store, spec)?.fix)?.definition ??
  null;

// The fix's local journal, taken over here so this workspace drives it.
// `actor` is the person who started it; a retry writes nothing.
export async function openFixJournal(store, { workspaceRoot, actor }, taskId) {
  if (!workspaceRoot) fail("A fix needs a workspace root to land from.", 409);
  const id = `spec-journal:${taskId}`;
  if (!store.get("receipts", id))
    store.put("receipts", {
      id,
      kind: "spec-journal",
      planId: taskId,
      home: "local",
    });
  return takeOverSpec(
    store,
    { workspaceRoot, actor: actor || "owner" },
    taskId,
  );
}

function oneTitle(text) {
  const line = text.split(/\r?\n/).find((entry) => entry.trim()) || "";
  const title = line.trim().replace(/\s+/g, " ");
  return title.length > TITLE_LIMIT
    ? `${title.slice(0, TITLE_LIMIT - 1).trimEnd()}…`
    : title;
}

const nextFixNumber = (tasks) =>
  1 +
  Math.max(0, ...tasks.map((task) => Number(FIX_ID.exec(task.id)?.[1] ?? 0)));

// `fix.start`: a fix from what a person typed. `repository` is a registered
// repository's id (or its GitHub name) with a local checkout. `context` is
// {workspaceRoot, actor}, for the fix's journal.
export async function startFix(store, input = {}, context = {}) {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) fail("Say what the fix should do.");
  if (text.length > TEXT_LIMIT)
    fail(`A fix's text is at most ${TEXT_LIMIT} characters.`);
  const wanted = typeof input.repository === "string" ? input.repository : "",
    repository = workspaceRepositories(store).find(
      (entry) =>
        entry.id === wanted ||
        (entry.github && lower(entry.github) === lower(wanted)),
    );
  if (!wanted || !repository)
    fail(`${wanted || "That"} is not a registered repository.`, 404);
  if (!repository.localCheckout)
    fail(
      `Repository ${repository.id} has no local checkout, so Avoozl cannot code it.`,
      409,
    );
  const fix = fixRecord({ text, by: input.by || "person" });
  let id = null;
  store.mutate("Start a fix", (data) => {
    ensureInbox(data);
    const now = new Date().toISOString();
    id = `fix-${nextFixNumber(data.tasks)}`;
    data.tasks.push({
      id,
      title: oneTitle(text),
      summary: text,
      acceptance: [...fix.acceptance],
      checks: [],
      status: "planned",
      scope: "runtime",
      kind: "leaf",
      authority: "local",
      repository: repository.id,
      track: "catalog",
      tags: ["fix"],
      // Starting it is the approval: the definition is pinned here.
      approvedSource: { hash: fix.definition, text },
      fix,
      dispatch: {
        ready: true,
        state: "authorized",
        reason: "Started as a fix by a person.",
      },
      needsReview: false,
      createdAt: now,
      updatedAt: now,
    });
  });
  await openFixJournal(store, context, id);
  return { taskId: id, fix };
}

function specFiles(task, name) {
  const text = task.approvedSource?.text || task.summary || task.title,
    from = fixIssue(task);
  const origin = from
    ? `It started as a fix for ${from.repository}#${from.number}.`
    : "It started as a fix from text.";
  return {
    "requirements.md": [
      `# Requirements: ${task.title}`,
      "",
      "## Introduction",
      "",
      `This spec holds fix ${task.id}, which grew past one change. ${origin}`,
      "",
      "## The text",
      "",
      ...text.split(/\r?\n/).map((line) => (line ? `> ${line}` : ">")),
      "",
    ].join("\n"),
    "design.md": [
      `# Design: ${task.title}`,
      "",
      "The design is still to write. Start from the text in the requirements.",
      "",
    ].join("\n"),
    "tasks.md": [
      "---",
      `repo: ${task.repository}`,
      "---",
      `# Tasks: ${task.title}`,
      "",
      "## Phase 1",
      "",
      `- [ ] ${taskToken(`${name}.1`)} ${task.title}`,
      `  - $done: ${FIX_ACCEPTANCE[0]} ${FIX_ACCEPTANCE[1]}`,
      `  - Build what the requirements' text asks; it began as fix ${task.id} and grew past one change.`,
      "",
    ].join("\n"),
  };
}

// `fix.spec` (Make this a spec): write `.kiro/specs/fix-<n>/` with the text
// as requirements.md and one task, check it lints clean, and archive the
// fix with a link to the folder. The spec is a draft; approving it is a
// person's separate act.
export function fixToSpec(store, workspaceRoot, input = {}) {
  if (!workspaceRoot) fail("Make this a spec needs a workspace root.", 409);
  const task = store.read().tasks.find((entry) => entry.id === input.taskId);
  if (!task || !loadFix(task.fix)) fail(`No fix ${input.taskId}.`, 404);
  if (task.archivedAt) fail(`${task.id} is already archived.`, 409);
  const name = task.id,
    folder = path.join(workspaceRoot, SPECS_DIRECTORY, name);
  if (fs.existsSync(folder)) fail(`Spec folder ${name} already exists.`, 409);
  fs.mkdirSync(folder, { recursive: true });
  for (const [file, text] of Object.entries(specFiles(task, name)))
    fs.writeFileSync(path.join(folder, file), text);
  const spec = readSpecFolder(workspaceRoot, name),
    errors = lintSpec({
      spec,
      plan: { id: name },
      data: store.read(),
    }).diagnostics.filter((entry) => entry.severity === "error");
  if (errors.length) {
    for (const file of Object.keys(spec.files || {}))
      fs.rmSync(path.join(folder, file), { force: true });
    fs.rmdirSync(folder);
    fail(
      `The spec folder did not lint clean: ${errors.map((entry) => entry.message).join("; ")}`,
      500,
    );
  }
  const at = new Date().toISOString(),
    link = path.join(SPECS_DIRECTORY, name);
  patchTask(store, task.id, `Make ${task.id} a spec`, (next) => {
    next.archivedAt = at;
    next.archivedReason = `Made into spec ${name}`;
    next.fixSpec = { spec: name, folder: link, at };
    next.dispatch = {
      ...(next.dispatch || {}),
      ready: false,
      state: "withdrawn",
      reason: `Made into spec ${name}.`,
    };
    next.updatedAt = at;
  });
  return { taskId: task.id, spec: name, folder: link };
}
