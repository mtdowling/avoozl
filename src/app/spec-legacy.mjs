// The old spec layout (tasks.md plus avoozl/manifest.json), read only from
// records Avoozl stored before Requirement 111: an approval receipt or a
// plan revision in SQLite. Nothing reads the file from disk any more; a
// leftover one there is a lint error (spec-plans.mjs). Folding the stored
// manifest into Facts bullets lets one reader parse old and new revisions,
// so an approval can be carried across a pure conversion (design §4.40).
import { factsLines, summaryLines, withDefaults } from "./spec-facts.mjs";
import { specItems } from "./spec-plans.mjs";
import { repeatsTitle } from "./title-repeat.mjs";

const OLD_MANIFEST = "avoozl/manifest.json";
const MANIFEST = OLD_MANIFEST;
const key = (value) => JSON.stringify(value);

function mode(values) {
  values = values.filter((value) => value !== undefined);
  const counts = new Map();
  for (const value of values)
    counts.set(key(value), (counts.get(key(value)) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? { value: JSON.parse(best[0]), count: best[1] } : null;
}

// Folds `files[MANIFEST]` into `files["tasks.md"]`. Returns the new files
// (no manifest) and the spec-wide defaults it hoisted to front-matter.
// `exact: false` sorts each task's keys first, so more defaults fold away;
// use it only where no approval pins the hash.
export function foldManifest(files, { defaults = true, exact = true } = {}) {
  const manifest = JSON.parse(files[MANIFEST]);
  if (!exact)
    for (const [id, entry] of Object.entries(manifest.tasks))
      manifest.tasks[id] = withDefaults({}, entry);
  const text = files["tasks.md"],
    eol = text.includes("\r\n") ? "\r\n" : "\n",
    rows = text.split("\n").map((row) => row.replace(/\r$/, "")),
    items = specItems("x", text).filter((item) => item.key),
    epic = manifest.kind === "epic",
    entries = structuredClone(manifest.tasks),
    front = [];
  // A manual leaf completes by a person without saying so, and every task
  // runs its repository's checks, so a stored task's own list is dropped.
  for (const entry of Object.values(entries)) {
    if (entry.manual === true && entry.completion === "person")
      delete entry.completion;
    delete entry.checks;
  }
  const leaves = Object.values(entries).filter(
    (entry) => !epic && entry.kind !== "package",
  );
  const hoisted = {};
  if (defaults && leaves.length > 1) {
    // A manual leaf takes no completion default.
    const checked = leaves.filter((entry) => entry.manual !== true);
    for (const [name, among] of [
      ["repository", leaves],
      ["completion", checked],
    ]) {
      const top = mode(among.map((entry) => entry[name]));
      if (
        top &&
        top.value !== undefined &&
        among.length &&
        among.every((entry) => entry[name] !== undefined)
      )
        hoisted[name] = top.value;
    }
  }
  const names = { repository: "repo", completion: "completion" };
  for (const [name, value] of Object.entries(hoisted))
    front.push(`${names[name]}: ${value}`);
  if (epic) front.push("kind: epic");
  for (const field of [
    "ship",
    "integrationBranch",
    "integrationSync",
    "forwardTarget",
    "publicBranch",
  ])
    if (manifest[field] !== undefined)
      front.push(`${field}: ${manifest[field]}`);
  for (const [id, phase] of Object.entries(manifest.phases ?? {}))
    front.push(`phase-${id}: ${phase.title}`);
  for (const [id, group] of Object.entries(manifest.batches ?? {})) {
    front.push(`batch-${id}: ${group.reason}`);
    for (const task of group.tasks) entries[task].batch = id;
  }
  const out = [],
    byLine = new Map(items.map((item) => [item.line, item]));
  rows.forEach((row, index) => {
    out.push(row);
    const item = byLine.get(index + 1),
      entry = item && entries[item.key];
    if (!entry) return;
    // A task has no summary fact: an old one is the item's summary.
    const { summary, ...facts } = entry;
    // Leave out a key the defaults give back in the same place.
    let own = facts;
    const drop = (name, value) => {
      if (key(own[name]) !== key(value)) return;
      const { [name]: _gone, ...rest } = own;
      if (
        key(Object.keys(withDefaults(rest, { [name]: value }))) ===
        key(Object.keys(own))
      )
        own = rest;
    };
    if (!epic) drop("kind", "leaf");
    if (!epic && own.kind !== "package")
      for (const [name, value] of Object.entries(hoisted))
        if (!(own.manual === true && name !== "repository")) drop(name, value);
    const indent = /^\s*/.exec(row)[0].length + 2;
    out.push(
      ...factsLines(own, { indent }),
      // One that only repeats the title adds nothing and is left out.
      ...(repeatsTitle(summary, item.title)
        ? []
        : summaryLines(summary, { indent })),
    );
  });
  const next = { ...files };
  delete next[MANIFEST];
  next["tasks.md"] =
    (front.length ? ["---", ...front, "---", ""].join(eol) : "") +
    out.join(eol);
  return { files: next, hoisted };
}

const FENCE = /^\s*(```|~~~)/;
const BULLET = /^(\s*)([-*+])[ \t]+(.*?)\s*$/;
const indentOf = (raw) => /^\s*/.exec(raw)[0].length;

// tasks.md with each `Facts:` block, the layout from Requirement 111 until
// 2026-11-19, written as `$key:` bullets in its place: a nested `done` list
// is one `$done:` bullet per result, another nested list one comma list.
// The text without facts and the parsed facts stay the same, so the
// revision hash does too.
export function foldFactsBlocks(text) {
  const rows = String(text).split("\n"),
    out = [];
  let fenced = false;
  for (let at = 0; at < rows.length; at++) {
    const raw = rows[at].replace(/\r$/, ""),
      cr = rows[at].endsWith("\r") ? "\r" : "",
      bullet = BULLET.exec(raw);
    if (FENCE.test(raw)) fenced = !fenced;
    if (fenced || bullet?.[3] !== "Facts:") {
      out.push(rows[at]);
      continue;
    }
    const [, pad, marker] = bullet,
      put = (key, value) =>
        out.push(`${pad}${marker} $${key}:${value ? ` ${value}` : ""}${cr}`);
    let fact = null,
      child = null;
    const flush = () => {
      if (!fact) return;
      const { key, inline, nested } = fact;
      if (key !== "done")
        put(key, nested.length ? nested.join(", ") : inline.trim());
      else
        for (const item of nested.length ? nested : inline.split(","))
          if (item.trim()) put(key, item.trim());
      fact = null;
    };
    for (; at + 1 < rows.length; at++) {
      const row = rows[at + 1].replace(/\r$/, "");
      if (!row.trim()) {
        // A blank line inside the block is dropped; one after it is kept.
        const next = rows.slice(at + 2).find((line) => line.trim());
        if (next === undefined || indentOf(next) <= pad.length) break;
        continue;
      }
      if (indentOf(row) <= pad.length) break;
      child ??= indentOf(row);
      const inner = BULLET.exec(row);
      if (indentOf(row) > child) {
        fact?.nested.push(inner ? inner[3] : row.trim());
        continue;
      }
      flush();
      const match =
        inner && /^([A-Za-z][A-Za-z0-9]*):[ \t]*(.*)$/.exec(inner[3]);
      if (match)
        fact = {
          key: match[1] === "Built" ? "built" : match[1],
          inline: match[2],
          nested: [],
        };
      else out.push(`${pad}${row.slice(child)}${cr}`);
    }
    flush();
  }
  return out.join("\n");
}

// Whether tasks.md on disk still has a `Facts:` block, which lint refuses.
export const hasFactsBlocks = (text) =>
  typeof text === "string" &&
  text.includes("Facts:") &&
  foldFactsBlocks(text) !== text;

// Stored files in the layout the reader reads: an old record's manifest
// folded into its tasks.md, and its `Facts:` blocks into `$` bullets,
// anything else as it is. A manifest that cannot be folded reads as no
// facts, which lint then reports.
export function currentFiles(files = {}) {
  if (files[MANIFEST] === undefined)
    return hasFactsBlocks(files["tasks.md"])
      ? { ...files, "tasks.md": foldFactsBlocks(files["tasks.md"]) }
      : files;
  try {
    return foldManifest(files, { defaults: false }).files;
  } catch {
    const { [MANIFEST]: _old, ...rest } = files;
    return rest;
  }
}
