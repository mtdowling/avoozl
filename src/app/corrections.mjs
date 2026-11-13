// Corrections and the rules they lead to (design §4.24, Requirement 78,
// task 34.4).
//
// A correction is a person telling an agent it got something wrong: changes
// requested on its pull request, work sent back from a decision with a
// reason, a revert of an integrated agent commit, or Pick again with a
// reason. Each is one `corrections` row {id, taskId, by, kind, summary, at},
// keyed so the same event is recorded once. The summary is at most 300
// characters and passes the secret screen and the content rules first; a
// match is saved redacted, never with the matched text.
//
// The retro reads the corrections since the last retro. When it finds the
// same correction on two or more tasks it may propose a rule; a person's
// approval lands the rule as one leaf that edits the repository's
// `.kiro/steering/avoozl-rules.md`.
import { PUBLISH_RULES, check, secretReason } from "./content-rules.mjs";
import { git } from "./git.mjs";
import { taskRepository } from "../work-model.mjs";

export const TABLE = "corrections";
export const CORRECTION_KINDS = Object.freeze([
  "changes-requested",
  "sent-back",
  "reverted",
  "pick-again",
]);
export const RULES_FILE = ".kiro/steering/avoozl-rules.md";
export const REDACTED = "Redacted by content rules";
const SUMMARY = 300;
const RULE_TEXT = 500;
const WEEK = 7 * 86_400_000;

const list = (store) => {
  try {
    return store.list(TABLE);
  } catch {
    return [];
  }
};

function screened(store, text) {
  if (secretReason(text) || PUBLISH_RULES.some((r) => r.pattern.test(text)))
    return null;
  try {
    const result = check(store, {
      boundary: "activity",
      target: "correction",
      text,
    });
    return result.findings.length || result.unavailable.length ? null : text;
  } catch {
    return null;
  }
}

// Record one correction; the same key twice writes once. Returns the row,
// or null when it was already there or the store is read-only.
export function recordCorrection(
  store,
  { key, taskId, by = null, kind, summary, at = new Date().toISOString() },
) {
  if (!CORRECTION_KINDS.includes(kind))
    throw Error(`Correction kind must be ${CORRECTION_KINDS.join(", ")}.`);
  if (store.readOnly || typeof key !== "string" || !key || !taskId) return null;
  const id = key.slice(0, 300);
  if (store.get(TABLE, id)) return null;
  const text =
      String(summary ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, SUMMARY) || kind,
    safe = screened(store, text),
    row = {
      id,
      taskId,
      by: typeof by === "string" ? by.slice(0, 100) : null,
      kind,
      summary: safe ?? REDACTED,
      ...(safe ? {} : { redacted: true }),
      at,
    };
  // One row, so no transaction of its own: callers may hold one.
  store.put(TABLE, row);
  return row;
}

// Corrections since `since` (an ISO time, or null for all), oldest first.
export function correctionsSince(store, since = null) {
  return list(store)
    .filter((c) => !since || c.at > since)
    .sort((a, b) => (a.at < b.at ? -1 : 1));
}

// What the retro reads (R78.2): no person's name, so a rule cannot name one.
export function retroCorrections(store, data, since) {
  const byId = new Map(data.tasks.map((t) => [t.id, t]));
  return correctionsSince(store, since)
    .slice(-50)
    .map((c) => ({
      id: c.id,
      task: c.taskId,
      repository: taskRepository(byId.get(c.taskId)) || null,
      kind: c.kind,
      summary: c.summary,
      at: c.at,
    }));
}

// Corrections per ISO week, for Flow (R78.5).
export function correctionsByWeek(store, bucketOf) {
  const weeks = new Map();
  for (const c of list(store)) {
    const key = bucketOf(c.at, "week");
    weeks.set(key, (weeks.get(key) || 0) + 1);
  }
  return [...weeks.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, count]) => ({ key, count }));
}

export function correctionsPerWeek(store, now = Date.now()) {
  return list(store).filter((c) => now - Date.parse(c.at) <= WEEK).length;
}

// Why a rule proposal is dropped, or null (R78.2, R78.4). It rests on two
// or more corrections the retro was shown, on two or more tasks in one
// repository, and names no other repository, task ID, outside path or
// person.
export function ruleProblem(p, retro, store, data) {
  const allowed = [
    "type",
    "text",
    "corrections",
    "evidence",
    "metric",
    "direction",
  ];
  if (Object.keys(p).some((k) => !allowed.includes(k)))
    return "unknown field in a rule proposal";
  if (
    typeof p.text !== "string" ||
    !p.text.trim() ||
    p.text.length > RULE_TEXT ||
    /[\u0000-\u0008\u000b-\u001f\u007f]/.test(p.text)
  )
    return `a rule is 1–${RULE_TEXT} characters of text`;
  const shown = new Set(retro?.seen?.corrections || []);
  if (
    !Array.isArray(p.corrections) ||
    p.corrections.length < 2 ||
    p.corrections.length > 20 ||
    !p.corrections.every((id) => typeof id === "string" && shown.has(id))
  )
    return "a rule names at least 2 corrections this retro was shown";
  const rows = p.corrections.map((id) => store.get(TABLE, id)).filter(Boolean),
    tasks = new Set(rows.map((c) => c.taskId)),
    byId = new Map(data.tasks.map((t) => [t.id, t])),
    repositories = new Set(
      rows.map((c) => taskRepository(byId.get(c.taskId)) || null),
    );
  if (rows.length !== p.corrections.length) return "a correction is gone";
  if (tasks.size < 2) return "a rule rests on corrections on 2 or more tasks";
  if (repositories.size !== 1 || repositories.has(null))
    return "a rule's corrections are all in one repository";
  const text = p.text,
    [repository] = repositories,
    words = (value) =>
      new RegExp(
        `(^|[^A-Za-z0-9._-])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z0-9_-])`,
        "i",
      );
  for (const task of data.tasks)
    if (task.id.length >= 2 && words(task.id).test(text))
      return "a rule names no task ID";
  for (const project of store.list("projects"))
    if (project.id !== repository && words(project.id).test(text))
      return "a rule names no other repository";
  if (/\b[\w.-]+\/[\w.-]+#\d+|github\.com\/[\w.-]+\/[\w.-]+/i.test(text))
    return "a rule names no other repository";
  if (/(^|\s)(\/|~\/|[A-Za-z]:\\)|\.\.[\\/]/.test(text))
    return "a rule names no path outside the repository";
  const people = new Set(
    list(store)
      .map((c) => c.by)
      .filter((by) => typeof by === "string" && by.length > 1),
  );
  for (const person of people)
    if (words(person).test(text)) return "a rule names no person";
  if (/(^|\s)@[A-Za-z0-9-]+/.test(text)) return "a rule names no person";
  return null;
}

// The repository a rule lands in: the one its corrections share.
export function ruleRepository(store, data, p) {
  const row = store.get(TABLE, p.corrections[0]),
    task = row && data.tasks.find((t) => t.id === row.taskId);
  return taskRepository(task) || null;
}

// PDCA for a landed rule (R78.5): corrections of the same kind in the same
// repository since it was approved. shortcut: matched by kind and
// repository, not by meaning; the next retro reads the rows and judges.
export function ruleAgain(store, data, proposal, since) {
  const kinds = new Set(
      proposal.corrections
        .map((id) => store.get(TABLE, id)?.kind)
        .filter(Boolean),
    ),
    repository = proposal.repository,
    byId = new Map(data.tasks.map((t) => [t.id, t]));
  return correctionsSince(store, since).filter(
    (c) =>
      kinds.has(c.kind) &&
      taskRepository(byId.get(c.taskId)) === repository &&
      !proposal.corrections.includes(c.id),
  );
}

// Reverts of integrated agent commits on each repository's landing branch
// (R78.1): one correction per reverted commit. Reads the newest 50 revert
// commits; a repository that cannot be read is skipped this tick.
export async function revertCorrections(store) {
  const integrated = new Map();
  for (const d of store.list("task_deliveries"))
    if (d.state === "integrated")
      for (const sha of [d.integratedCommit, d.commit].filter(Boolean))
        integrated.set(sha, d.taskId);
  if (!integrated.size) return [];
  const found = [];
  for (const project of store.list("projects")) {
    if (!project.root) continue;
    const branch = project.integrationBranch || project.baseBranch;
    if (!branch || branch.startsWith("-")) continue;
    let log;
    try {
      log = await git(project.root, [
        "log",
        "-n",
        "50",
        "--grep=This reverts commit",
        "--format=%H%x1f%an%x1f%cI%x1f%B%x1e",
        "refs/heads/" + branch,
        "--",
      ]);
    } catch {
      continue;
    }
    for (const entry of log.split("\x1e")) {
      const [sha, author, at, body] = entry.trim().split("\x1f");
      const reverted = body?.match(/This reverts commit ([0-9a-f]{40})/)?.[1],
        taskId = reverted && integrated.get(reverted);
      if (!taskId) continue;
      const row = recordCorrection(store, {
        key: `revert:${project.id}:${sha}`,
        taskId,
        by: author || null,
        kind: "reverted",
        summary: body.split("\n")[0],
        at: at || new Date().toISOString(),
      });
      if (row) found.push(row);
    }
  }
  return found;
}

// The leaf body for an approved rule: add it to the rules file.
export function ruleChangeBody(text, summary) {
  return [
    String(summary || "").slice(0, 1000),
    `Add this rule to ${RULES_FILE} in this repository, creating the file if it is missing. Keep every rule already there. If the file starts with front matter, keep it; a new file starts with "---\\ninclusion: always\\n---", then a "# Rules from corrections" heading. Add the rule as one "- " list item, word for word, and change nothing else:`,
    "```text",
    text.replaceAll("```", "'''"),
    "```",
  ].join("\n\n");
}
