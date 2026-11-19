// Task IDs and the requirement and design refs on a tasks.md item
// (Requirement 115, design §4.43). A named ID may be bare or a code span.
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
const FENCE = /^\s*(```|~~~)/;
// Task IDs. `1`, `2.14`: Kiro's own numbering, written bare; a trailing
// period is Kiro's style.
export const NUMBERED = /^\d+(?:\.\d+)*\.?$/;
// Any other ID has a separator, so a plain first word is not read as an ID.
// Read bare or as a code span; Avoozl writes `cache-invalidation`.
export const NAMED = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
// `P1`, `P2b`: a proof or other lettered item, namespaced like a number.
export const LETTERED = /^[A-Z]\d+[a-z]?$/;

// How Avoozl writes an item's ID in tasks.md.
export const taskToken = (key) =>
  NUMBERED.test(key) || LETTERED.test(key) ? key : `\`${key}\``;
// The first entry of a trailing [...] or (...) that is read as refs. Any
// other trailing brackets are title text.
const REF_START = /^(?:§|[A-Z]+\d)/;
const RANGE = /\s*(?:–|\bto\b)\s*/;
const FORM = {
  requirement: /^[A-Z]+\d+(?:\.\d+[a-z]?)?$/,
  design: /^(?:§(?:[A-Z]+\d+|\d+)(?:\.\d+)*|F\d+)$/,
};
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const REQUIREMENT = /^Requirement\s+([A-Z]*)(\d+)\s*(?::|\.|$)/;
const CRITERION = /^(\d+[a-z]?)\.\s/;
const FACT_ROW = /^\|\s*(F\d+)\s*\|/;
const SECTION = /^§?((?:[A-Z]+\d+|\d+)(?:\.\d+)*)\.?(?:\s|$)/;

function trailing(text, open, close) {
  if (!text.endsWith(close)) return null;
  const at = text.lastIndexOf(open),
    inner = at < 0 ? "" : text.slice(at + 1, -1);
  if (at < 0 || inner.includes(close)) return null;
  const entries = inner.split(",").map((entry) => entry.trim());
  if (!REF_START.test(entries[0])) return null;
  return { before: text.slice(0, at).trimEnd(), entries };
}

// An item's title without its refs, and the refs as written.
export function splitRefs(text) {
  let title = String(text).trim(),
    design = [],
    requirements = [];
  const designs = trailing(title, "(", ")");
  if (designs) ({ before: title, entries: design } = designs);
  const named = trailing(title, "[", "]");
  if (named) ({ before: title, entries: requirements } = named);
  return { title, requirements, design };
}

// The lines of a text outside code fences, numbered from 1.
function* unfenced(text) {
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
export function requirementIds(text) {
  const ids = new Map();
  let current = null;
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
    if (criterion && !ids.has(`${current.id}.${criterion[1]}`))
      ids.set(`${current.id}.${criterion[1]}`, line);
  }
  return ids;
}

// Ref -> line, for each section and fact a design file defines.
export function designIds(text) {
  const ids = new Map();
  for (const [raw, line] of unfenced(text)) {
    const heading = HEADING.exec(raw),
      section = heading && SECTION.exec(heading[2]),
      fact = FACT_ROW.exec(raw);
    if (section && !ids.has(`§${section[1]}`)) ids.set(`§${section[1]}`, line);
    if (fact) ids.set(fact[1], line);
  }
  return ids;
}

const ENDS = (entry) => {
  const [first, second, ...extra] = entry.split(RANGE);
  if (extra.length) return null;
  if (second === undefined) return [first];
  // `R47.1–47.6`: the second end takes the first end's letters.
  const prefix = /^§?[A-Z]*/.exec(first)[0];
  return [first, /^\d/.test(second) ? prefix + second : second];
};

const WRITE = {
  requirement:
    "Write a requirement as R12 or R12.3 (DL2 or DL2.3 where its heading is Requirement DL2), or a fact as F13.",
  design:
    "Write a design section as § and its heading's number, such as §4.26 or §D1, or a fact as F13.",
};

// The refs of one item, resolved against the spec's files: each is
// {kind, ref, file, line}; line is null for a ref that names nothing. A
// problem is {code, message} for lint.
export function resolveRefs(item, files) {
  const prose =
      files["requirements.md"] !== undefined ? "requirements.md" : "bugfix.md",
    kinds = {
      requirement: {
        entries: item.refs?.requirements ?? [],
        file: prose,
        ids: requirementIds(files[prose]),
      },
      design: {
        entries: item.refs?.design ?? [],
        file: "design.md",
        ids: designIds(files["design.md"]),
      },
    },
    refs = [],
    problems = [];
  for (const [kind, { entries, file, ids }] of Object.entries(kinds))
    for (const entry of entries) {
      // Only tasks.md is required: a ref is checked against its file when
      // the spec has one, and names the missing file when it does not.
      if (files[file] === undefined) {
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
  return { refs, problems };
}
