// Setup's workflow check for `landing: train` (landing-trains LT1.8, D17).
// Batch branches must not start a branch CI run per branch: the train
// validates once. This reads each workflow file in `.github/workflows` and
// lists those whose `push` trigger would run on a batch branch, with the
// line to add. It never edits a workflow.
//
// shortcut: reads only the `on:` block's `push` trigger with a small
// indentation-based reader (flow lists, block lists, `[push]`, `push`), not
// full YAML; anchors, expressions and `paths` filters are ignored. Upgrade
// if a workflow's trigger is written another way and is missed.
import fs from "node:fs";
import path from "node:path";

const indent = (line) => line.match(/^ */)[0].length;
const strip = (line) => line.replace(/\s+#.*$/, "").replace(/\s+$/, "");
const unquote = (s) => s.trim().replace(/^(["'])(.*)\1$/, "$2");

function flowList(text) {
  const inner = text.trim().replace(/^\[/, "").replace(/\]$/, "");
  return inner
    .split(",")
    .map(unquote)
    .filter((s) => s !== "");
}

// The `push` trigger of a workflow: null when it has none, else
// {branches, branchesIgnore, tags} with null for a missing key.
export function pushTrigger(text) {
  const lines = text.split(/\r?\n/).map(strip),
    at = lines.findIndex((l) => /^["']?on["']?\s*:/.test(l));
  if (at < 0) return null;
  const rest = lines[at].replace(/^["']?on["']?\s*:\s*/, "");
  if (rest) {
    const events = rest.startsWith("[") ? flowList(rest) : [unquote(rest)];
    return events.includes("push")
      ? { branches: null, branchesIgnore: null, tags: null }
      : null;
  }
  // Block form: find `push:` at the first event indentation.
  let eventIndent = null,
    pushAt = -1;
  for (let i = at + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    if (indent(lines[i]) === 0) break;
    eventIndent ??= indent(lines[i]);
    if (indent(lines[i]) === eventIndent && /^\s*push\s*:/.test(lines[i])) {
      pushAt = i;
      break;
    }
  }
  if (pushAt < 0) return null;
  const trigger = { branches: null, branchesIgnore: null, tags: null },
    keys = {
      branches: "branches",
      "branches-ignore": "branchesIgnore",
      tags: "tags",
    };
  for (let i = pushAt + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (indent(line) <= eventIndent) break;
    const key = line.match(/^\s*([a-z-]+)\s*:\s*(.*)$/);
    if (!key || !keys[key[1]]) continue;
    const here = indent(line);
    let values;
    if (key[2].startsWith("[")) values = flowList(key[2]);
    else if (key[2]) values = [unquote(key[2])];
    else {
      values = [];
      for (let j = i + 1; j < lines.length; j++) {
        const item = lines[j].match(/^\s*-\s*(.*)$/);
        if (!lines[j].trim()) continue;
        if (!item || indent(lines[j]) < here) break;
        values.push(unquote(item[1]));
      }
    }
    trigger[keys[key[1]]] = values;
  }
  return trigger;
}

// GitHub's branch pattern: `*` matches within a path part, `**` across
// parts, `?` one character.
function globToRegExp(glob) {
  const parts = glob.split(/(\*\*|\*|\?)/).map((part) => {
    if (part === "**") return ".*";
    if (part === "*") return "[^/]*";
    if (part === "?") return "[^/]";
    return part.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  });
  return new RegExp(`^${parts.join("")}$`);
}
const matches = (glob, name) => globToRegExp(glob).test(name);

// Would this push trigger run on a push to `branch`?
export function runsOnBranch(trigger, branch) {
  if (!trigger) return false;
  if (trigger.branchesIgnore)
    return !trigger.branchesIgnore.some((g) => matches(g, branch));
  if (trigger.branches) {
    let included = false;
    for (const glob of trigger.branches)
      if (glob.startsWith("!")) {
        if (matches(glob.slice(1), branch)) included = false;
      } else if (matches(glob, branch)) included = true;
    return included;
  }
  // Only a `tags` filter: branch pushes do not run it.
  return trigger.tags === null;
}

// The workflows that would run on a batch branch, each with the line to
// add. Reads only; the files are never written.
export function batchBranchWorkflows(root, prefix = "avoozl-batch/") {
  const dir = path.join(root, ".github", "workflows"),
    probe = `${prefix}example-task`,
    pattern = `${prefix}**`;
  let names = [];
  try {
    names = fs
      .readdirSync(dir)
      .filter((n) => /\.ya?ml$/.test(n))
      .sort();
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const trigger = pushTrigger(fs.readFileSync(path.join(dir, name), "utf8"));
    if (!runsOnBranch(trigger, probe)) continue;
    const list = (items) => `[${items.map((i) => `'${i}'`).join(", ")}]`;
    out.push({
      workflow: `.github/workflows/${name}`,
      line: trigger.branches
        ? `branches: ${list([...trigger.branches, `!${pattern}`])}`
        : `branches-ignore: ${list([...(trigger.branchesIgnore ?? []), pattern])}`,
    });
  }
  return out;
}
