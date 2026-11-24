// Lint every spec folder under .kiro/specs/ with the checks approval runs
// (lintSpec). Exits 1 when any folder has an error. CI runs it on every
// change, including docs-only ones that skip the full suite.
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listSpecFolders,
  lintSpec,
  parseSpec,
  readSpecFolder,
  specItems,
} from "../../src/app/specs/spec-plans.ts";
import type { SpecFolder, SpecItem } from "../../src/app/specs/spec-plans.ts";
import { git } from "../../src/app/git/git.ts";
import { foreignCommits } from "../../src/app/specs/integration-lint.ts";
import { linkedReader } from "../../src/app/specs/order.ts";
import { specTasks } from "../../src/app/specs/spec-tasks.ts";

// The repository root, or the folder named as the first argument.
const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = false;
const names = listSpecFolders(root);
if (!names.length) {
  console.log(`No spec folders under ${root}/.kiro/specs/.`);
  process.exit(1);
}
// A `Status:` line repeats approval, which lives in Avoozl's workspace
// database, and goes stale (shortcut: checked here, not in lintSpec, so
// specs in other repositories still work).
const STATUS =
  "A `Status:` line is not allowed: approval lives in Avoozl, not in the spec files. Delete this line.";
function statusErrors(spec: SpecFolder) {
  return Object.entries(spec.files).flatMap(([file, text]) =>
    String(text)
      .split("\n")
      .flatMap((line, at) =>
        /^Status:/.test(line)
          ? [{ severity: "error", file, line: at + 1, message: STATUS }]
          : [],
      ),
  );
}
// A spec describes Avoozl as it is; git history keeps what changed. A task,
// requirement, criterion or section marked superseded or retired is old text
// left in place, so it is refused: a heading or task title that says so, or
// a line or criterion that starts with the word.
const RETIRED =
  "A task, requirement or section marked superseded or retired is not allowed: delete it. Git history keeps the old text.";
const RETIRED_WORD = /\b(?:superseded|retired)\b/i;
function retiredErrors(spec: SpecFolder) {
  return Object.entries(spec.files).flatMap(([file, text]) =>
    String(text)
      .split("\n")
      .flatMap((line, at) => {
        const body = line.replace(
          /^\s*(?:[-*]|\d+[a-z]?\.)\s+(?:\$\w+:\s*)?/,
          "",
        );
        const marked =
          (/^#{1,6}\s/.test(line) && RETIRED_WORD.test(line)) ||
          (/^\s*- \[[ x]\]\s/.test(line) && RETIRED_WORD.test(line)) ||
          /^(?:\*\*)?(?:superseded|retired)\b/i.test(body);
        return marked
          ? [{ severity: "error", file, line: at + 1, message: RETIRED }]
          : [];
      }),
  );
}
// Every spec, so a spec group reaches into the spec it links.
const folders = new Map(
  names.map((name) => [name, readSpecFolder(root, name)]),
);
const linked = linkedReader(
  [...folders].map(([name, spec]) => ({
    name,
    text: specTasks(spec.files ?? {})?.text ?? "",
  })),
);
// Workflow v1 rules lintSpec does not check, read across every spec
// (shortcut: checked here, not in lintSpec, so specs in other repositories
// still work; move them into lintSpec when a runner must refuse them).
// One error of these checks: its file, line and message.
type LintError = {
  severity: string;
  file: string;
  line: number;
  message: string;
};
const error = (file: string, line: number, message: string): LintError => ({
  severity: "error",
  file,
  line,
  message,
});
const itemsOf = new Map(
  [...folders].map(([name, spec]) => {
    const tasks = specTasks(spec.files ?? {});
    return [
      name,
      tasks ? { ...tasks, items: specItems(name, tasks.text) } : null,
    ];
  }),
);
// The first spec that holds each task ID (2.2), and the spec of each named
// ID, for a task that names another spec's task (6.5).
const firstSpecOf = new Map<string, string>();
for (const [name, tasks] of itemsOf)
  for (const item of tasks?.items ?? [])
    if (item.key && !firstSpecOf.has(item.key)) firstSpecOf.set(item.key, name);
const NAMED_ID = /(?<![\w.-])[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+(?![\w-]|\.\d)/g;
// A task's title and the plain sub-bullets under it.
function taskWords(lines: string[], item: SpecItem) {
  const indent = /^\s*/.exec(lines[item.line - 1] ?? "")?.[0].length ?? 0,
    words = [item.title];
  for (let at = item.line; at < lines.length; at++) {
    const row = lines[at];
    if (!row.trim()) continue;
    if (
      (/^\s*/.exec(row)?.[0].length ?? 0) <= indent ||
      /^\s*[-*+] \[/.test(row)
    )
      break;
    words.push(row);
  }
  return words.join("\n");
}
function workflowErrors(name: string, spec: SpecFolder) {
  const errors: LintError[] = [],
    tasks = itemsOf.get(name);
  // 5.1: the front matter of every file holds only `category` and `repo`.
  for (const [file, text] of Object.entries(spec.files ?? {})) {
    if (file === tasks?.file) continue;
    const rows = String(text).split("\n");
    if (!/^---\s*$/.test(rows[0])) continue;
    for (let at = 1; at < rows.length && !/^---\s*$/.test(rows[at]); at++) {
      const key = /^([^\s:#][^:]*):/.exec(rows[at])?.[1];
      if (key && key !== "category" && key !== "repo")
        errors.push(
          error(
            file,
            at + 1,
            `Front-matter key "${key}" is not allowed: a spec's front matter holds only category and repo. Delete this line.`,
          ),
        );
    }
  }
  if (!tasks) return errors;
  const lines = tasks.text.split("\n");
  for (const item of tasks.items) {
    if (!item.key) continue;
    // 2.2: an ID is unique across the repository's specs.
    const first = firstSpecOf.get(item.key);
    if (first !== name)
      errors.push(
        error(
          tasks.file,
          item.line,
          `Task ID "${item.key}" is already used by spec ${first}. Give this task a new ID.`,
        ),
      );
    // 6.5: a task names no task of another spec.
    for (const id of new Set(
      [...taskWords(lines, item).matchAll(NAMED_ID)].map(([id]) => id),
    )) {
      const owner = firstSpecOf.get(id);
      if (owner && owner !== name)
        errors.push(
          error(
            tasks.file,
            item.line,
            `Task "${item.key}" names task ${id} of spec ${owner}. Order across specs is the order of spec groups in a parent spec; say what is needed instead.`,
          ),
        );
    }
  }
  return errors;
}
// The default branch origin names, for integration.foreign.
const defaultBranch = await git(root, [
  "symbolic-ref",
  "--short",
  "refs/remotes/origin/HEAD",
]).then(
  (name) => name.replace(/^origin\//, ""),
  () => "main",
);
// A spec's task IDs and those of every spec it links, for the landings an
// integration branch may hold.
const taskIdsOf = (name: string, seen = new Set<string>()): string[] => {
  const folder = folders.get(name);
  if (seen.has(name) || !folder) return [];
  seen.add(name);
  const spec = { ...folder, linked },
    ids = parseSpec(spec).proposals.map((p) => p.id),
    children = [...folders.keys()].filter((other) =>
      linked.parents(other).some((parent) => parent.name === name),
    );
  return [...ids, ...children.flatMap((child) => taskIdsOf(child, seen))];
};
for (const [name, folder] of folders) {
  const spec = { ...folder, linked },
    result = lintSpec({ spec }),
    status = [
      ...statusErrors(spec),
      ...retiredErrors(spec),
      ...workflowErrors(name, spec),
    ],
    errors = [
      ...(result.diagnostics || []).filter((d) => d.severity === "error"),
      ...status,
    ],
    foreign = await foreignCommits(root, {
      spec: name,
      taskIds: taskIdsOf(name),
      defaultBranch,
    }).catch(() => []);
  result.counts.error += status.length;
  result.counts.warning += foreign.length;
  console.log(
    `${name}: ${result.counts.error} errors, ${result.counts.warning} warnings, ${result.taskCount} tasks`,
  );
  for (const { commit, subject } of foreign)
    console.log(
      `  warning integration.foreign: origin/${name} holds ${commit.slice(0, 12)} "${subject}", which is not this spec's work. Rename the branch or move the commit.`,
    );
  for (const d of errors)
    console.log(
      `  ${d.file ?? ""}:${"lineStart" in d ? d.lineStart : d.line} ${d.message}`,
    );
  if (result.counts.error) failed = true;
}
process.exit(failed ? 1 : 0);
