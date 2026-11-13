// avoozl/manifest.json built from tasks.md alone, for specs Spec Builder
// writes (it writes only requirements.md, design.md and tasks.md). The
// steering file (spec-steering.mjs) asks for a few bullet lines under each
// task; this reads them. Deterministic: the same tasks.md and repositories
// give the same manifest. Lint then checks it like any other.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fail } from "./store.mjs";
import { MANIFEST, SPECS_DIRECTORY, specItems } from "./spec-plans.mjs";

const FENCE = /^\s*(```|~~~)/;
const CHECKBOX = /^\s*[-*+] \[[ xX~-]\]/;
const BULLET = /^\s*[-*+]\s+(.*\S)\s*$/;
// `_Key: value_` or `*Key: value*`, Kiro's style for its Requirements line.
const MARKER = /^[_*]([A-Za-z]+)(?::\s*(.*?))?[_*]$/;
const list = (value) =>
  value
    .split(/[,;]/)
    .map((part) =>
      part
        .trim()
        .replace(/^`+|`+$/g, "")
        .trim(),
    )
    .filter(Boolean);

// The bullet lines under each item, up to the next item, heading or fence.
function details(text) {
  const lines = text.split("\n"),
    found = new Map();
  let current = null,
    fenced = false;
  lines.forEach((raw, index) => {
    const line = raw.replace(/\r$/, "");
    if (FENCE.test(line)) {
      fenced = !fenced;
      current = null;
      return;
    }
    if (fenced) return;
    if (CHECKBOX.test(line)) {
      current = index + 1;
      found.set(current, []);
      return;
    }
    if (/^#{1,6}\s/.test(line)) current = null;
    const bullet = current && BULLET.exec(line);
    if (bullet) found.get(current).push(bullet[1]);
  });
  return found;
}

// `repositories`: the plan's repository IDs; with exactly one, every task
// that names none is in it.
export function draftManifest(name, tasksText, { repositories = [] } = {}) {
  const items = specItems(name, tasksText).filter((item) => item.key),
    under = details(tasksText),
    children = new Map();
  for (const item of items)
    if (item.parent?.key)
      children.set(item.parent.key, [
        ...(children.get(item.parent.key) || []),
        item.key,
      ]);
  const tasks = {};
  for (const item of items) {
    if (tasks[item.key]) continue;
    const kids = children.get(item.key);
    if (kids) {
      tasks[item.key] = {
        kind: "package",
        summary: item.title,
        requires: kids,
      };
      continue;
    }
    const entry = { kind: "leaf", summary: item.title },
      acceptance = [];
    for (const line of under.get(item.line) || []) {
      const marker = MARKER.exec(line);
      const key = marker?.[1].toLowerCase(),
        value = marker?.[2] ?? "";
      if (key === "repository" && value) entry.repository = value.trim();
      else if (key === "requires") entry.requires = list(value);
      else if (key === "checks") entry.checks = list(value);
      else if (key === "manual") entry.manual = true;
      else if (key === "requirements") continue;
      else acceptance.push(line);
    }
    if (!entry.repository && repositories.length === 1)
      entry.repository = repositories[0];
    entry.acceptance = acceptance.length ? acceptance : [item.title];
    // Requirement 61.9: a manual leaf completes by a person and runs no checks.
    if (entry.manual) {
      entry.completion = "person";
      delete entry.checks;
    }
    if (entry.requires && !entry.requires.length) delete entry.requires;
    tasks[item.key] = entry;
  }
  return JSON.stringify({ tasks }, null, 2) + "\n";
}

// Write the manifest into a folder readSpecFolder found (so it is inside its
// root). A symlink at avoozl/ or the manifest is refused, not followed.
export function writeSpecManifest(spec, text) {
  if (!spec?.exists) fail(`No spec folder ${spec?.folder || ""}.`, 404);
  const directory = path.join(spec.root, SPECS_DIRECTORY, spec.name, "avoozl"),
    target = path.join(directory, path.basename(MANIFEST));
  for (const file of [directory, target]) {
    let stat = null;
    try {
      stat = fs.lstatSync(file);
    } catch {
      // Missing: written below.
    }
    if (stat && (file === directory ? !stat.isDirectory() : !stat.isFile()))
      fail(
        `${spec.folder}${MANIFEST} is not a plain file; Avoozl left it.`,
        409,
      );
  }
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, target);
}
