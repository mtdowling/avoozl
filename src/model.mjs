import { resolveTaskId, taskSourceRefs } from "./task-identity.mjs";
import { activityErrors } from "./activity.mjs";
import { edgeErrors, workModelErrors } from "./work-model.mjs";
import { createHash } from "node:crypto";
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const sourceKey = (title) =>
  digest(title.replace(/^\s*[-*]\s*\[[ xX]\]\s*/, "").trim()).slice(0, 16);
export function blocks(text) {
  const lines = text.split("\n"),
    result = [],
    headings = [],
    occurrences = new Map();
  let epic = "";
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^(#{1,6}) (.+)/);
    if (heading) {
      headings.length = heading[1].length - 1;
      headings.push(heading[2]);
    }
    if (/^### W[1-7]\./.test(lines[i])) epic = lines[i].match(/^### (W\d)/)[1];
    const match = lines[i].match(/^\s*[-*]\s*\[([ xX])\]\s*(.*)/);
    if (!match) continue;
    let end = i + 1;
    while (
      end < lines.length &&
      !/^\s*[-*]\s*\[[ xX]\]/.test(lines[end]) &&
      !/^#{1,4} /.test(lines[end])
    )
      end++;
    while (end > i + 1 && !lines[end - 1].trim()) end--;
    const base = digest(headings.join("/") + "|" + sourceKey(lines[i])).slice(
        0,
        16,
      ),
      occurrence = occurrences.get(base) || 0;
    occurrences.set(base, occurrence + 1);
    result.push({
      key: base + (occurrence ? "-" + occurrence : ""),
      title: match[2],
      checked: match[1].toLowerCase() === "x",
      epic,
      lineStart: i + 1,
      lineEnd: end,
      context: lines.slice(i, end).join("\n"),
    });
  }
  return result;
}
// A task's section as a reader sees what it asks: link targets, Markdown
// document paths and the checkbox mark removed, whitespace collapsed. Moving a
// plan, fixing a link or ticking the box leaves it the same. Code paths stay,
// since naming another file can change the work.
export function sectionText(context) {
  return context
    .replace(/^(\s*[-*]\s*)\[[ xX]\]/, "$1[ ]")
    .replace(/\]\([^)]*\)/g, "]()")
    .replace(/(?:[\w.@~-]*\/)*[\w.@~-]+\.md(?:#[\w-]*)?/g, "<doc>")
    .replace(/\s+/g, " ")
    .trim();
}
// Where a source reference's section is now, and whether its text changed,
// given the document before (`before`, may be null) and after. A key that no
// longer parses (its checkbox line or headings were rewritten) is matched by
// unchanged section text when exactly one section has it. Without the old
// text, the stored hash is compared as it was.
export function matchSection(ref, before, after) {
  const old = before?.find((b) => b.key === ref.key) ?? null;
  let block = after.find((b) => b.key === ref.key) ?? null;
  if (!block && old) {
    const same = after.filter(
      (b) => sectionText(b.context) === sectionText(old.context),
    );
    if (same.length === 1) block = same[0];
  }
  if (!block) return { block: null, changed: true };
  if (old)
    return {
      block,
      changed: sectionText(old.context) !== sectionText(block.context),
    };
  return {
    block,
    changed: Boolean(ref.hash) && ref.hash !== digest(block.context),
  };
}
// A plan's own reference: it moves, and is reviewed, through plan approval
// (a changed plan is a draft whose re-approval flags changed tasks), never
// through indexing.
export function planOwned(task, ref) {
  return Boolean(ref.planId || (ref === task.source && task.planId));
}
// Done, recorded, archived and superseded tasks are never sent back for review
// by a document edit.
export function reviewSettled(data, task) {
  const status = (data.statuses || []).find((s) => s.id === task.status);
  return (
    Boolean(status?.complete || status?.archived) ||
    ["recorded", "archived", "superseded"].includes(task.status)
  );
}
export { statusComplete, graphNeighbors, queryTasks } from "./query.mjs";
export function validate(data) {
  const errors = [];
  if (data.schemaVersion !== 1) errors.push("Unsupported schemaVersion");
  const ids = new Set(),
    statuses = new Set(data.statuses.map((s) => s.id));
  for (const task of data.tasks) {
    errors.push(...activityErrors(task), ...workModelErrors(task));
    if (ids.has(task.id)) errors.push("Repeated task " + task.id);
    ids.add(task.id);
    if (!statuses.has(task.status)) errors.push("Unknown status " + task.id);
    if (!task.title) errors.push("Missing title " + task.id);
    if (task.source && !data.documents[task.source.document])
      errors.push("Missing document " + task.id);
  }
  for (const [alias, target] of Object.entries(data.taskAliases || {})) {
    try {
      if (ids.has(alias) || !ids.has(resolveTaskId(data, target)))
        errors.push("Invalid task alias " + alias);
    } catch (e) {
      errors.push(e.message);
    }
  }
  for (const task of data.tasks)
    for (const ref of taskSourceRefs(task))
      if (!data.documents[ref.document])
        errors.push("Missing source reference " + task.id + " " + ref.document);
  const edgeIds = new Set();
  for (const e of data.edges) {
    if (e.id && edgeIds.has(e.id)) errors.push("Repeated edge " + e.id);
    if (e.id) edgeIds.add(e.id);
  }
  const graph = new Map();
  for (const edge of data.edges) {
    errors.push(...edgeErrors(edge));
    if (!ids.has(edge.from) || !ids.has(edge.to))
      errors.push("Dangling edge " + edge.from + " → " + edge.to);
    if (edge.from === edge.to) errors.push("Self edge " + edge.from);
    if (edge.kind === "requires") {
      if (!graph.has(edge.from)) graph.set(edge.from, []);
      graph.get(edge.from).push(edge.to);
    }
  }
  const seen = new Set(),
    active = new Set();
  function walk(id) {
    if (active.has(id)) {
      errors.push("Dependency cycle " + id);
      return;
    }
    if (seen.has(id)) return;
    active.add(id);
    for (const x of graph.get(id) || []) walk(x);
    active.delete(id);
    seen.add(id);
  }
  for (const id of ids) walk(id);
  return errors;
}
// One line for a failed write: errors of one kind are counted, with the
// first as the example, so 140 repeated edges read as one clause.
export function summarizeErrors(errors) {
  const groups = new Map();
  for (const error of errors) {
    const kind = error.split(" ").slice(0, 2).join(" ");
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push(error);
  }
  return [...groups]
    .map(([kind, list]) =>
      list.length === 1
        ? list[0]
        : `${kind} ×${list.length}, e.g. ${list[0].slice(kind.length + 1)}`,
    )
    .join("; ");
}
