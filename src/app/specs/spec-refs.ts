// Task IDs and the requirement and design refs on a tasks.md item
// (Requirement 115, design §4.43). The ID is a code span.
// The title may end in `[R91.5, R94.4a]`, the requirements it builds, then
// `(§4.26)`, the design sections it follows:
//
//   - [ ] `dl-1` Open exact decisions from notices [DL2, DL3] (§D1, §D3)
//
// One rule per kind, each checked against the spec's own files:
//   requirement  `R<n>` for `Requirement <n>:`, `<P><n>` for
//                `Requirement <P><n>:`, plus `.<m>` for its numbered
//                criterion `<m>.` (`4a.` too); or a fact row `| F<n> |`
//                of requirements.md (bugfix.md in a bugfix spec).
//   design       `§<label>` for a heading that starts with that label
//                (`### 4.26 …`, `## D1. …`); or a fact row of design.md.
// A range `R47.1–R47.6` (or `NK1 to NK9`) checks both ends; the second end
// may leave out the first end's letters.
import { TASKS_FILE } from "./spec-tasks.ts";

const FENCE = /^\s*(```|~~~)/;
// Task IDs (Workflow v1 2.1). An ID is a code span holding TASK_ID:
// `parse`, `P-4`, `1.2` and `cache-invalidation` all are. IDs compare
// exactly. A bare first word is never an ID.
export const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// `1`, `2.14`: Kiro's numbering; with LETTERED, namespaced by the spec.
export const NUMBERED = /^\d+(?:\.\d+)*\.?$/;
// `P1`, `P2b`: a proof or other lettered item, namespaced like a number.
export const LETTERED = /^[A-Z]\d+[a-z]?$/;

// How Avoozl writes an item's ID in tasks.md: a code span (Workflow v1 2.1).
export const taskToken = (key: string) => `\`${key}\``;
// The first entry of a trailing [...] or (...) that is read as refs. Any
// other trailing brackets are title text.
const REF_START = /^(?:§|[A-Z]+\d)/;
const RANGE = /\s*(?:–|\bto\b)\s*/;
type Kind = "requirement" | "design";
const FORM: Record<Kind, RegExp> = {
  requirement: /^[A-Z]+\d+(?:\.\d+[a-z]?)?$/,
  design: /^(?:§(?:[A-Z]+\d+|\d+)(?:\.\d+)*|F\d+)$/,
};
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const REQUIREMENT = /^Requirement\s+([A-Z]*)(\d+)\s*(?::|\.|$)/;
const CRITERION = /^(\d+[a-z]?)\.\s/;
const FACT_ROW = /^\|\s*(F\d+)\s*\|/;
const SECTION = /^§?((?:[A-Z]+\d+|\d+)(?:\.\d+)*)\.?(?:\s|$)/;

function trailing(text: string, open: string, close: string) {
  if (!text.endsWith(close)) return null;
  const at = text.lastIndexOf(open),
    inner = at < 0 ? "" : text.slice(at + 1, -1);
  if (at < 0 || inner.includes(close)) return null;
  const entries = inner.split(",").map((entry) => entry.trim());
  if (!REF_START.test(entries[0])) return null;
  return { before: text.slice(0, at).trimEnd(), entries };
}

// The `(**MANUAL**)` or `(**PARALLEL**)` tag ending a title (Workflow v1
// 3.5, 4.2). Refs are part of the title, so the tag follows them.
const END_TAG = /\s*(\(\*\*(?:MANUAL|PARALLEL)\*\*\))$/;

// An item's title without its refs, and the refs as written. A tag after the
// refs stays at the end of the title. `tagBeforeRefs` is set when a tag
// stands before the refs instead, which lint refuses.
export function splitRefs(text: unknown) {
  let title = String(text).trim(),
    design: string[] = [],
    requirements: string[] = [];
  const tag = END_TAG.exec(title);
  if (tag) title = title.slice(0, tag.index);
  const designs = trailing(title, "(", ")");
  if (designs) ({ before: title, entries: design } = designs);
  const named = trailing(title, "[", "]");
  if (named) ({ before: title, entries: requirements } = named);
  const refs = { requirements, design };
  if (tag) return { title: `${title} ${tag[1]}`, ...refs };
  if ((designs || named) && END_TAG.test(title))
    return { title, ...refs, tagBeforeRefs: true };
  return { title, ...refs };
}

// The lines of a text outside code fences, numbered from 1.
function* unfenced(text: unknown): Generator<[string, number]> {
  let fenced = false,
    line = 0;
  for (const raw of String(text ?? "").split("\n")) {
    line++;
    if (FENCE.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) yield [raw.replace(/\r$/, ""), line];
  }
}

// Ref -> line, for each ID a requirements file defines.
export function requirementIds(text: unknown) {
  const ids = new Map<string, number>();
  let current: { id: string; level: number } | null = null;
  for (const [raw, line] of unfenced(text)) {
    const heading = HEADING.exec(raw);
    if (heading) {
      const level = heading[1].length,
        found = REQUIREMENT.exec(heading[2]);
      if (found) {
        current = { id: `${found[1] || "R"}${found[2]}`, level };
        ids.set(current.id, line);
      } else if (current && level <= current.level) current = null;
      continue;
    }
    const fact = FACT_ROW.exec(raw);
    if (fact) ids.set(fact[1], line);
    const criterion = current && CRITERION.exec(raw);
    if (current && criterion && !ids.has(`${current.id}.${criterion[1]}`))
      ids.set(`${current.id}.${criterion[1]}`, line);
  }
  return ids;
}

// Ref -> line, for each section and fact a design file defines.
export function designIds(text: unknown) {
  const ids = new Map<string, number>();
  for (const [raw, line] of unfenced(text)) {
    const heading = HEADING.exec(raw),
      section = heading && SECTION.exec(heading[2]),
      fact = FACT_ROW.exec(raw);
    if (section && !ids.has(`§${section[1]}`)) ids.set(`§${section[1]}`, line);
    if (fact) ids.set(fact[1], line);
  }
  return ids;
}

const ENDS = (entry: string) => {
  const [first, second, ...extra] = entry.split(RANGE);
  if (extra.length) return null;
  if (second === undefined) return [first];
  // `R47.1–47.6`: the second end takes the first end's letters.
  const prefix = /^§?[A-Z]*/.exec(first)?.[0] ?? "";
  return [first, /^\d/.test(second) ? prefix + second : second];
};

const WRITE: Record<Kind, string> = {
  requirement:
    "Write a requirement as R12 or R12.3 (DL2 or DL2.3 where its heading is Requirement DL2), or a fact as F13.",
  design:
    "Write a design section as § and its heading's number, such as §4.26 or §D1, or a fact as F13.",
};

// Keep original line numbers so a ref opens the heading or criterion in
// the spec file. A section ends at the next level-one or level-two heading.
function sectionText(text: string, title: string) {
  let start = 0;
  let end: number | undefined;
  for (const [raw, line] of unfenced(text)) {
    const heading = HEADING.exec(raw);
    if (!heading || heading[1].length > 2) continue;
    if (start) {
      end = line - 1;
      break;
    }
    if (heading[1] === "##" && heading[2] === title) start = line;
  }
  if (!start) return undefined;
  return "\n".repeat(start) + text.split("\n").slice(start, end).join("\n");
}

export function refSources(files: Record<string, string>, tasksFile: string) {
  const requirements =
    files["requirements.md"] !== undefined ? "requirements.md" : "bugfix.md";
  const combined = tasksFile === TASKS_FILE ? undefined : files[tasksFile];
  const requirementsSection =
    combined === undefined ? undefined : sectionText(combined, "Requirements");
  const designSection =
    combined === undefined ? undefined : sectionText(combined, "Design");
  const requirementText =
    tasksFile === requirements
      ? (requirementsSection ?? files[requirements])
      : (files[requirements] ?? requirementsSection);
  const designText =
    tasksFile === "design.md"
      ? (designSection ?? files["design.md"])
      : (files["design.md"] ?? designSection);
  return {
    requirement: {
      file:
        files[requirements] === undefined && requirementsSection !== undefined
          ? tasksFile
          : requirements,
      ids:
        requirementText === undefined ? null : requirementIds(requirementText),
    },
    design: {
      file:
        files["design.md"] === undefined && designSection !== undefined
          ? tasksFile
          : "design.md",
      ids: designText === undefined ? null : designIds(designText),
    },
  };
}

// The refs of one item, resolved to the file and line each one names.
export function resolveRefs(
  item: {
    key?: string | null;
    refs?: { requirements?: string[]; design?: string[] };
  },
  sources: ReturnType<typeof refSources>,
) {
  const entries = {
      requirement: item.refs?.requirements ?? [],
      design: item.refs?.design ?? [],
    },
    refs: { kind: Kind; ref: string; file: string; line: number | null }[] = [],
    problems: { code: string; ref: string; message: string }[] = [];
  for (const kind of ["requirement", "design"] as const) {
    const { file, ids } = sources[kind];
    for (const entry of entries[kind]) {
      if (!ids) {
        problems.push({
          code: "task.ref-file-missing",
          ref: entry,
          message: `Task "${item.key}" names ${kind} ref "${entry}", but this spec has no ${kind === "requirement" ? "requirements.md or bugfix.md" : "design.md"}. Add the file or remove the ref.`,
        });
        refs.push({ kind, ref: entry, file, line: null });
        continue;
      }
      const ends = ENDS(entry);
      if (!ends || ends.some((end) => !FORM[kind].test(end))) {
        problems.push({
          code: "task.ref-form",
          ref: entry,
          message: `Task "${item.key}" names ${kind} ref "${entry}". ${WRITE[kind]}`,
        });
        refs.push({ kind, ref: entry, file, line: null });
        continue;
      }
      const missing = ends.filter((end) => !ids.has(end));
      for (const end of missing)
        problems.push({
          code: "task.ref-unknown",
          ref: end,
          message: `Task "${item.key}" names ${kind} ${end}, which ${file} does not define.`,
        });
      refs.push({ kind, ref: entry, file, line: ids.get(ends[0]) ?? null });
    }
  }
  return { refs, problems };
}
