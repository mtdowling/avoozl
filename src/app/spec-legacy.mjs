// The old spec layout (tasks.md plus avoozl/manifest.json), read only from
// records Avoozl stored before Requirement 111: an approval receipt or a
// plan revision in SQLite. Nothing reads the file from disk any more; a
// leftover one there is a lint error (spec-plans.mjs). Folding the stored
// manifest into Facts bullets lets one reader parse old and new revisions,
// so an approval can be carried across a pure conversion (design §4.40).
import { factsLines, proseLines, withDefaults } from "./spec-facts.mjs";
import { specItems } from "./spec-plans.mjs";

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

const inline = (items) =>
  items.every((item) => typeof item === "string" && !/[,\r\n]/.test(item));

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
  const leaves = Object.values(entries).filter(
    (entry) => !epic && entry.kind !== "package",
  );
  const hoisted = {};
  if (defaults && leaves.length > 1) {
    for (const name of ["repository", "completion"]) {
      const top = mode(leaves.map((entry) => entry[name]));
      if (
        top &&
        top.value !== undefined &&
        leaves.every((entry) => entry[name] !== undefined)
      )
        hoisted[name] = top.value;
    }
    const checked = leaves.filter((entry) => entry.manual !== true),
      top = mode(checked.map((entry) => entry.checks));
    if (
      top &&
      Array.isArray(top.value) &&
      top.value.length &&
      top.count * 2 > checked.length &&
      checked.every((entry) => Array.isArray(entry.checks))
    )
      hoisted.checks = top.value;
  }
  const names = {
    repository: "repo",
    completion: "completion",
    checks: "checks",
  };
  for (const [name, value] of Object.entries(hoisted)) {
    if (name === "checks" && !inline(value)) {
      front.push("checks:", ...value.map((item) => `  - ${item}`));
    } else
      front.push(
        `${names[name]}: ${Array.isArray(value) ? value.join(", ") : value}`,
      );
  }
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
    // A task has no summary fact: an old one is the item's prose.
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
        if (!(name === "checks" && own.manual === true)) drop(name, value);
    const indent = /^\s*/.exec(row)[0].length + 2;
    out.push(
      ...factsLines(own, { indent }),
      ...proseLines(summary, { indent }),
    );
  });
  const next = { ...files };
  delete next[MANIFEST];
  next["tasks.md"] =
    (front.length ? ["---", ...front, "---", ""].join(eol) : "") +
    out.join(eol);
  return { files: next, hoisted };
}

// Stored files in the layout the reader reads: an old record's manifest
// folded into its tasks.md, anything else as it is. A manifest that cannot be
// folded reads as no facts, which lint then reports.
export function currentFiles(files = {}) {
  if (files[MANIFEST] === undefined) return files;
  try {
    return foldManifest(files, { defaults: false }).files;
  } catch {
    const { [MANIFEST]: _old, ...rest } = files;
    return rest;
  }
}
