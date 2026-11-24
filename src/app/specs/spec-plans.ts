// Kiro spec folders as Avoozl plans (Requirement 30, design §6.8).
//
//   <planning root>/<specs.path>/<name>/   (specs-path.mjs, .kiro/specs)
//     tasks.md               the task list; each task's facts are
//                            `$key:` bullets (spec-facts.mjs, Requirement 111)
//     requirements.md or bugfix.md, design.md
//                            optional Kiro prose that refs point into
//     <other>.md             optional spec text; with no tasks.md, the one
//                            file whose `## Tasks` section is the task list
//                            (spec-tasks.mjs)
//     avoozl/critique.md     planner critique, outside the revision hash
//
// The reader turns the task list and its fact bullets into the proposals lintPlan and
// approvePlan already check. Validation is deterministic: the same files give
// the same diagnostics, each with its file and line.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { digest } from "../../model.ts";
import { fail } from "../store/store.ts";
import { TASK_KINDS } from "../../work-model.ts";
import { lintPlan } from "./plan-quality.ts";
import { specFolderPath, specsDirectory } from "./specs-path.ts";
import {
  factName,
  factsText,
  itemBullets,
  readFacts,
  withoutFacts,
} from "./spec-facts.ts";
import { frontMatter, withoutFrontMatter } from "../../front-matter.ts";
import {
  SPEC_TEXT,
  TASKS_FILE,
  addTaskLines,
  specTasks,
  taskFile,
  taskFiles,
  tasksSection,
} from "./spec-tasks.ts";
import { integrationOf } from "../epics/integration-branch.ts";
import {
  linkDefinitions,
  linkProblems,
  isManual,
  orderProblems,
  specGroupOf,
  waitsOf,
  withoutManual,
} from "./order.ts";
import { graphBlockProblems } from "./graph.ts";
import {
  LETTERED,
  NUMBERED,
  TASK_ID,
  resolveRefs,
  splitRefs,
  taskToken,
} from "./spec-refs.ts";
import type { Store } from "../store/store.ts";
import type { Proposal } from "./plan-quality.ts";
import type { LinkedReader } from "./order.ts";

// A spec folder as read from disk.
export interface SpecFolder {
  name: string;
  folder?: string;
  exists: boolean;
  files: Record<string, string>;
  hash?: string | null;
  leftover?: boolean;
  factsBlocks?: boolean;
  critique?: string | null;
  root?: string;
}
// A ref as resolveRefs resolves it.
type ResolvedRef = ReturnType<typeof resolveRefs>["refs"][number];
// One checklist item of a task list.
export interface SpecItem {
  key: string | null;
  id: string | null;
  title: string;
  refs?: { requirements: string[]; design: string[] };
  // The task text after the ID, refs and tags included: what a lease or
  // another runner names the task by (Workflow v1 15.10). `title` drops
  // the refs for display.
  text?: string;
  line: number;
  tagBeforeRefs?: boolean;
  mark: string;
  parent: Omit<SpecItem, "mark" | "parent"> | null;
  spec?: string | null;
  resolvedRefs?: ResolvedRef[];
}
// One spec lint finding, with its file and line.
export interface SpecDiagnostic {
  id: string;
  code: string;
  severity: string;
  message: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  [key: string]: unknown;
}
// One row of an epic folder.
interface Member {
  key: string;
  plan: string;
  step: string;
  summary: string;
  title: string;
  line: number;
}
// What parseSpec reads.
interface Parsed {
  type: string | null;
  kind?: string;
  items: SpecItem[];
  diagnostics: SpecDiagnostic[];
  proposals: Proposal[];
  members?: Member[];
}
// A stored plan, as these functions read and write it.
export interface PlanRow {
  id: string;
  kind?: string;
  spec?: string;
  title?: string;
  prompt?: string;
  text: string;
  files?: Record<string, string>;
  hash: string;
  revision: number;
  state: string;
  context?: unknown;
  createdAt?: string;
  updatedAt: string;
  history: unknown[];
  documentId?: string;
  reviewHeld?: string[];
  deletedAt?: string;
  [key: string]: unknown;
}
// What a revision reads from its folder.
type Revision = { hash: string; files: Record<string, string>; title: string };

// The field rules every proposed task meets, whichever file it came from.
// Normalizes `requires` conditions in place.
export function validateProposal(
  item: Record<string, unknown>,
): Record<string, unknown> {
  if (!item || typeof item !== "object" || Array.isArray(item))
    return fail("Describe each task as a JSON object.");
  if (
    typeof item.title !== "string" ||
    !item.title.trim() ||
    item.title.length > 240
  )
    fail("Each task needs a title of 1–240 characters.");
  if (
    item.kind !== undefined &&
    (typeof item.kind !== "string" || !TASK_KINDS.includes(item.kind))
  )
    fail(
      item.kind === "epic"
        ? 'kind "epic" is not a task kind: write "package". An epic is its own spec folder that lists plans.'
        : "kind must be package or leaf.",
    );
  if (item.epic !== undefined)
    fail(
      'A task names no epic: its plan does. Use "phase" to group tasks inside a plan.',
    );
  // A step only a person does (R61.9); its other rules are lint's.
  if (item.manual !== undefined && item.manual !== true)
    fail("manual may only be true.");
  // Packages complete from their children; leaves are checked.
  const parent = item.kind === "package";
  if (
    (!parent || item.acceptance !== undefined) &&
    (!Array.isArray(item.acceptance) ||
      !item.acceptance.length ||
      item.acceptance.some((x: unknown) => typeof x !== "string" || !x.trim()))
  )
    fail("Each proposed task needs observable acceptance criteria.");
  for (const field of ["requires", "checks"]) {
    const value = item[field];
    if (
      value !== undefined &&
      (!Array.isArray(value) || value.some((x) => typeof x !== "string"))
    )
      fail(field + " must be a list of strings.");
  }
  // Every task runs its repository's checks: a stored proposal's own list
  // is ignored.
  delete item.checks;
  // A proposal stored while the field was named `prose` loads as summary.
  if (item.prose !== undefined) {
    item.summary ??= item.prose;
    delete item.prose;
  }
  for (const field of ["summary", "repository"])
    if (item[field] !== undefined && typeof item[field] !== "string")
      fail(field + " must be text.");
  // A spec's type comes from its folder.
  if (item.specType !== undefined && item.specType !== "bugfix")
    fail('specType may only be "bugfix".');
  if (
    item.paths !== undefined &&
    (!Array.isArray(item.paths) ||
      item.paths.some((x: unknown) => typeof x !== "string"))
  )
    fail("paths must be a list of strings.");
  // A type word (R53.1).
  if (
    item.type !== undefined &&
    (typeof item.type !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(item.type))
  )
    fail("type must be one lowercase word, such as test.");
  return item;
}

// One revision of the design document. An amended approved plan no longer
// matches its approval receipt, so its tasks require review until the next
// explicit approval. A spec plan's revision is its folder's files and hash.
function writeRevision(
  store: Store,
  plan: PlanRow,
  text: string,
  summary: string,
  spec: Revision | null = null,
) {
  plan.history.push({
    revision: plan.revision,
    hash: plan.hash,
    text: plan.text,
    ...(plan.files ? { files: plan.files } : {}),
    at: plan.updatedAt,
    state: plan.state,
  });
  plan.revision++;
  plan.text = text;
  plan.hash = spec ? spec.hash : digest(text);
  if (spec) plan.files = spec.files;
  plan.title = spec?.title || text.match(/^# (.+)$/m)?.[1] || plan.title;
  plan.state = "draft";
  plan.updatedAt = new Date().toISOString();
  store.put("plans", plan);
  if (plan.documentId) {
    const data = structuredClone(store.read()),
      held = new Set<string>(plan.reviewHeld || []);
    for (const task of data.tasks.filter((t) => t.planId === plan.id)) {
      if (!task.needsReview) held.add(task.id);
      task.needsReview = true;
    }
    // Approval releases the tasks this draft held if their entry is unchanged.
    plan.reviewHeld = [...held];
    store.put("plans", plan);
    store.commit(data, summary + plan.title);
  }
  store.event(null, "plan.changed", { planId: plan.id, hash: plan.hash });
  return plan;
}

export { taskToken };

// Whether tasks.md has a `Facts:` bullet outside a fence: the layout
// before `$key:` bullets, which lint refuses and nothing reads.
export function hasFactsBlocks(text: unknown) {
  if (typeof text !== "string" || !text.includes("Facts:")) return false;
  let fenced = false;
  for (const row of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(row)) fenced = !fenced;
    else if (!fenced && /^\s*[-*+][ \t]+Facts:\s*$/.test(row)) return true;
  }
  return false;
}

// The old facts file. Nothing reads it; a leftover one is a lint error.
export const MANIFEST = "avoozl/manifest.json";
const CRITIQUE = "avoozl/critique.md";
// Kiro's files, in the order a revision hash reads them. Only tasks.md is
// required. Every other Markdown file directly in the folder is spec text:
// hashed after these, sorted by name, and read by workers. The critique is
// about a revision, so it is read beside it and never changes it.
const KIRO_FILES = ["requirements.md", "bugfix.md", "design.md", "tasks.md"];
// At most this many spec files in one folder.
const MAX_SPEC_FILES = 50;

// Whether a file name directly in a spec folder is part of the spec.
export const isSpecFile = (file: unknown): file is string =>
  typeof file === "string" && SPEC_TEXT.test(file);

// The spec files of `files`, in hash order: Kiro's, then the rest by name.
export function revisionFiles(files: Record<string, unknown> = {}) {
  const others = Object.keys(files)
    .filter((file) => isSpecFile(file) && !KIRO_FILES.includes(file))
    .sort();
  return [...KIRO_FILES.filter((file) => files[file] !== undefined), ...others];
}
const NAME = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_FILE_BYTES = 1000000;
const CHECKBOX = /^\s*[-*+] \[([ xX~-])\]\*?[ \t]+(.*)$/;
// A "Built:" note under a checked item names the work that already landed.
const BUILT = /^\s+(?:[-*+]\s+)?Built:\s*(.+?)\s*$/;
const TITLE_LIMIT = 240;
// An epic row's lifecycle step (Requirement 59.1, design §4.32.6).
const EPIC_STEPS = ["design", "review", "implement"];
const FENCE = /^\s*(```|~~~)/;

export function specName(value: unknown): string {
  if (typeof value !== "string" || !NAME.test(value))
    return fail(
      "Name one spec folder: lowercase letters, digits, and hyphens, up to 80 characters.",
    );
  return value;
}

// Kiro marks items done, queued, or running in tasks.md ([x], [~], [-]).
// Those marks are not Avoozl state, so the revision hash reads every
// checkbox as open and a mark alone never changes an approved revision.
export function withoutMarks(text: string) {
  let fenced = false;
  return text
    .split("\n")
    .map((line) => {
      if (FENCE.test(line)) fenced = !fenced;
      return fenced ? line : line.replace(/^(\s*[-*+] \[)[xX~-]\]/, "$1 ]");
    })
    .join("\n");
}

const STATUS = /^Status:[ \t]*([A-Za-z]+)[ \t]*$/;
const STATUS_WINDOW = 20;

// The Status line of a file: the first line equal to `Status: <Word>` in its
// first 20 lines, or -1.
function statusIndex(lines: string[]) {
  return lines.slice(0, STATUS_WINDOW).findIndex((line) => STATUS.test(line));
}

// The text the revision hash reads: no Status line. Avoozl writes none
// (approval is a commit, git-approvals.mjs); a person's own stays outside
// the hash.
function withoutStatus(text: string) {
  const lines = String(text).split("\n"),
    at = statusIndex(lines);
  if (at < 0) return text;
  lines.splice(at, 1);
  return lines.join("\n");
}

// The hash covers each prose file without its Status line, tasks.md without
// checkbox marks, Facts bullets and front-matter, and the parsed facts as
// `factsText` writes them. Layout is outside it, content is inside it
// (Requirement 111.6).
export function specHash(files: Record<string, string>) {
  const tasks = specTasks(files);
  return digest(
    [
      ...revisionFiles(files).map((file) => {
        const raw = files[file],
          text = withoutStatus(
            file === TASKS_FILE
              ? withoutMarks(withoutFacts(raw, specItems("x", raw)))
              : file === tasks?.file
                ? sectionHashText(raw, tasks.text)
                : raw,
          );
        return `${file}\0${text}\0`;
      }),
      ...(tasks === null
        ? []
        : [
            `${MANIFEST}\0${factsText(
              readFacts(tasks.text, specItems("x", tasks.text)).manifest,
            )}\0`,
          ]),
    ].join(""),
  );
}

// A single-file spec's text as the hash reads it: the whole file, with the
// task list's checkbox marks open and its facts and front-matter left out.
// `text` is its task text (spec-tasks.mjs), line for line.
function sectionHashText(raw: string, text: string) {
  const open = withoutMarks(text).split("\n"),
    shown = text.split("\n"),
    { skip } = readFacts(text, specItems("x", text));
  return raw
    .split("\n")
    .map((row, index) =>
      open[index] === shown[index]
        ? row
        : row.replace(/^(\s*[-*+] \[)[xX~-]\]/, "$1 ]"),
    )
    .filter((_, index) => !skip.has(index + 1))
    .join("\n");
}

// Where a mode keeps its spec folders (Requirement 30.3): the planning
// repository in plans-repo mode and with no GitHub mode, every code
// repository in single-repo mode.
export function specRoots({
  mode = null,
  planningRoot = null,
  codeRoots = [],
}: {
  mode?: string | null;
  planningRoot?: string | null;
  codeRoots?: (string | null | undefined)[];
}): string[] {
  if (mode === "single-repo") {
    const roots = [
      ...new Set(codeRoots.filter((root): root is string => Boolean(root))),
    ];
    if (!roots.length)
      fail(
        "Single-repo mode reads spec folders from a code repository. Register one first.",
        409,
      );
    return roots;
  }
  if (mode !== null && mode !== "plans-repo")
    fail(`Unknown GitHub mode ${mode}.`, 409);
  if (!planningRoot)
    return fail(
      "This workspace has no planning repository for spec folders.",
      409,
    );
  return [planningRoot];
}

// One folder name across the mode's roots. A name found in two code
// repositories is refused, so a plan never reads another repository's spec.
export function findSpecFolder(roots: string[], name: string) {
  const found = roots
    .map((root) => ({ ...readSpecFolder(root, name), root }))
    .filter((spec) => spec.exists);
  if (found.length > 1)
    fail(
      `Spec folder ${found[0].folder} exists in more than one repository: ${found.map((spec) => spec.root).join(", ")}. Rename one.`,
      409,
    );
  return found[0] || { ...readSpecFolder(roots[0], name), root: roots[0] };
}

function inside(root: string, target: string) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

// Read one folder from disk. Only regular files inside the planning root are
// read: a symlink out of it reads as a missing file.
export function readSpecFolder(root: string, name: string): SpecFolder {
  specName(name);
  const directory = path.join(specsDirectory(root), name),
    folder = specFolderPath(root, name);
  let real: string;
  try {
    real = fs.realpathSync.native(directory);
  } catch {
    return { name, folder, exists: false, files: {}, hash: null };
  }
  if (
    !inside(fs.realpathSync.native(root), real) ||
    !fs.statSync(real).isDirectory()
  )
    return { name, folder, exists: false, files: {}, hash: null };
  const read = (file: string) => {
    const target = path.join(real, file);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(target);
    } catch {
      return undefined;
    }
    if (!stat.isFile()) return undefined;
    if (stat.size > MAX_FILE_BYTES) fail(`${folder}${file} is too large.`, 413);
    return fs.readFileSync(target, "utf8");
  };
  const files: Record<string, string> = {},
    names = fs.readdirSync(real).filter(isSpecFile).sort();
  if (names.length > MAX_SPEC_FILES)
    fail(
      `${folder} holds ${names.length} Markdown files; a spec holds at most ${MAX_SPEC_FILES}.`,
      413,
    );
  for (const file of names) {
    const text = read(file);
    if (text !== undefined) files[file] = text;
  }
  return {
    name,
    folder,
    exists: true,
    files,
    // Not read and not hashed: lint says to delete it.
    ...(read(MANIFEST) !== undefined ? { leftover: true } : {}),
    ...(hasFactsBlocks(specTasks(files)?.text) ? { factsBlocks: true } : {}),
    hash: specHash(files),
    critique: read(CRITIQUE) ?? null,
  };
}

// When a folder's revision files last changed on disk, as an ISO time, or
// null when none can be read.
export function specModifiedAt(root: string, name: string, files: string[]) {
  let latest = 0;
  for (const file of files)
    try {
      latest = Math.max(
        latest,
        fs.statSync(path.join(specsDirectory(root), specName(name), file))
          .mtimeMs,
      );
    } catch {
      // A file removed since the read has no time.
    }
  return latest ? new Date(latest).toISOString() : null;
}

export function listSpecFolders(root: string) {
  const directory = specsDirectory(root);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, {
      withFileTypes: true,
    });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function diagnostic(
  code: string,
  file: string,
  line: number,
  message: string,
  extra: { taskId?: string | null; ref?: string; [key: string]: unknown } = {},
): SpecDiagnostic {
  return {
    id: `${code}:${file}:${line}:${extra.taskId || ""}${extra.ref ? `:${extra.ref}` : ""}`,
    code,
    severity: "error",
    message,
    file,
    lineStart: line,
    lineEnd: line,
    ...extra,
  };
}

// Checklist items outside code fences, with their tasks.md line. An item
// indented under another is its child, as Kiro nests sub-tasks: `parent` is
// the nearest item above it with less indent, or null.
export function specItems(name: string, text: string): SpecItem[] {
  const items: SpecItem[] = [],
    open: { indent: number; item: Omit<SpecItem, "mark" | "parent"> }[] = [];
  let fenced = false;
  text.split("\n").forEach((raw, index) => {
    if (FENCE.test(raw)) fenced = !fenced;
    if (fenced) return;
    const match = raw.replace(/\r$/, "").match(CHECKBOX);
    if (!match) return;
    const mark = match[1].toLowerCase(),
      text = match[2].trim(),
      // The ID is a code span (Workflow v1 2.1); a bare first word is none.
      quoted = /^`([^`\s]+)`(?:\s+|$)(.*)$/.exec(text),
      token = quoted && TASK_ID.test(quoted[1]) ? quoted[1] : null,
      rest = token ? (quoted?.[2] ?? "") : text,
      line = index + 1,
      {
        title,
        tagBeforeRefs,
        ...refs
      }: ReturnType<typeof splitRefs> & {
        tagBeforeRefs?: boolean;
      } = splitRefs(rest),
      indent = (/^\s*/.exec(raw)?.[0] ?? "").length;
    while (open.length && open[open.length - 1].indent >= indent) open.pop();
    const parent = open[open.length - 1]?.item ?? null,
      // Numbers and lettered items are namespaced by the spec.
      item: Omit<SpecItem, "mark" | "parent"> = !token
        ? { key: null, id: null, title: text, line }
        : {
            key: token,
            id:
              NUMBERED.test(token) || LETTERED.test(token)
                ? `${name}.${token}`
                : token,
            title,
            text: rest.trim(),
            refs,
            line,
            ...(tagBeforeRefs ? { tagBeforeRefs } : {}),
          };
    items.push({ ...item, mark, parent });
    open.push({ indent, item });
  });
  return items;
}

// The phase each tasks.md line sits under (Requirement 59.5): the nearest
// heading of level 2 or lower above it, outside code fences. A heading's
// text is the phase title; its slug is the ID, made unique within the plan
// with a -2, -3 suffix. Returns line -> { id, title }; a line under no such
// heading is absent (No phase).
export function headingPhases(text: string) {
  const byLine = new Map<number | undefined, { id: string; title: string }>(),
    used = new Map<string, number>();
  let fenced = false,
    current: { id: string; title: string } | null = null;
  withoutFrontMatter(text)
    .split("\n")
    .forEach((raw, index) => {
      if (FENCE.test(raw)) fenced = !fenced;
      if (fenced) return;
      const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw.replace(/\r$/, ""));
      if (heading) {
        if (heading[1].length < 2) {
          current = null;
          return;
        }
        const title = heading[2].trim(),
          base =
            title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")
              .slice(0, 60) || "phase",
          count = (used.get(base) || 0) + 1;
        used.set(base, count);
        current = { id: count > 1 ? `${base}-${count}` : base, title };
        return;
      }
      if (current) byLine.set(index + 1, current);
    });
  return byLine;
}

// Items checked [x] in tasks.md, with the first "Built:" note under each.
// Approval reads these for tasks it creates (plans.mjs); a tick on the base
// branch completes an existing task (spec-ticks.mjs). [~] and [-] are Kiro's
// queued and running marks and stay planned.
export function checkedItems(name: string, text: string) {
  const lines = text.split("\n"),
    items = specItems(name, text),
    starts = new Set(items.map((item) => item.line)),
    checked = new Map<
      string | null,
      { key: string; line: number; built: string | null }
    >();
  for (const item of items) {
    if (!item.key || item.mark !== "x") continue;
    let built: string | null = null;
    for (let at = item.line; at < lines.length; at++) {
      if (starts.has(at + 1) || FENCE.test(lines[at])) break;
      const match = BUILT.exec(lines[at].replace(/\r$/, ""));
      if (match) {
        built = match[1];
        break;
      }
    }
    checked.set(item.id, { key: item.key, line: item.line, built });
  }
  return checked;
}

// The clauses under bugfix.md's "Unchanged Behavior" heading, Kiro's
// regression-prevention list, without their numbering or list markers.
function unchangedClauses(text: string) {
  const clauses: string[] = [];
  let inside = false,
    fenced = false;
  for (const raw of withoutFrontMatter(text).split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (FENCE.test(line)) fenced = !fenced;
    if (fenced) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      inside = /^unchanged behaviou?r\b/i.test(heading[1].trim());
      continue;
    }
    const clause = line
      .trim()
      .replace(/^(?:[-*+]\s+)?(?:\d+(?:\.\d+)*\.?\s+)?/, "")
      .trim();
    if (inside && clause) clauses.push(clause);
  }
  return clauses;
}

// Structure, IDs, and Facts coverage. Returns the diagnostics and the
// proposals built from items that have valid facts.
export function parseSpec({
  name,
  folder = specFolderPath(null, name),
  exists,
  files,
  leftover = false,
  factsBlocks = false,
  // linkedReader (order.mjs): the other specs, so a spec group reaches into
  // the spec it links. Without it a parse reads this spec alone.
  linked = null,
}: SpecFolder & { linked?: LinkedReader | null }): Parsed {
  const diagnostics: SpecDiagnostic[] = [],
    proposals: Proposal[] = [];
  if (!exists) {
    diagnostics.push(
      diagnostic(
        "spec.missing-folder",
        folder,
        1,
        `Spec folder ${folder} does not exist.`,
      ),
    );
    return { type: null, items: [], diagnostics, proposals };
  }
  const feature = files["requirements.md"] !== undefined,
    bugfix = files["bugfix.md"] !== undefined;
  if (feature && bugfix)
    diagnostics.push(
      diagnostic(
        "spec.kind",
        "bugfix.md",
        1,
        "A spec has requirements.md or bugfix.md, not both. Remove one.",
      ),
    );
  // The plan's category lives in YAML front-matter at the top of its prose
  // (Requirement 30.9). A block a person must fix is a warning: it changes
  // only how the plan is grouped, never what is delivered.
  for (const file of ["requirements.md", "bugfix.md"]) {
    const problem = frontMatter(files[file]).problem;
    if (problem)
      diagnostics.push(
        diagnostic("spec.front-matter", file, problem.line, problem.message, {
          severity: "warning",
        }),
      );
  }
  // The task list is in tasks.md or one file's `## Tasks` section
  // (spec-tasks.mjs); the prose files are optional.
  const holders = taskFiles(files),
    tasksFile = taskFile(files),
    tasksText = specTasks(files)?.text ?? "";
  if (!holders.length)
    diagnostics.push(
      diagnostic(
        "spec.missing-file",
        TASKS_FILE,
        1,
        `Add ${folder}tasks.md, or a ## Tasks section to the spec's one file.`,
      ),
    );
  if (holders.length > 1)
    diagnostics.push(
      diagnostic(
        "spec.tasks-twice",
        holders[1],
        tasksSection(files[holders[1]])?.start ?? 1,
        `${holders.join(" and ")} both hold a task list. Keep the tasks in one file: tasks.md, or one file's ## Tasks section.`,
      ),
    );
  // The manifest is gone (Requirement 111.1): a leftover file is an error
  // and nothing reads it.
  if (leftover)
    diagnostics.push(
      diagnostic(
        "spec.manifest-left",
        MANIFEST,
        1,
        `Delete ${folder}${MANIFEST}. Task facts are $key: bullets in tasks.md now.`,
      ),
    );
  // So are `Facts:` blocks: nothing reads one.
  if (factsBlocks)
    diagnostics.push(
      diagnostic(
        "facts.block",
        tasksFile,
        1,
        "Write each task fact as a `$key: value` bullet directly under its task, in place of its Facts: bullet.",
      ),
    );

  const items = specItems(name, tasksText),
    byKey = new Map<string, SpecItem>();
  for (const item of items) {
    if (!item.key) {
      // A tick completes the task it names (spec-ticks.mjs): with no ID it
      // names none. A first word that could be an ID is one not yet in a
      // code span (Workflow v1 2.1).
      const word = item.title.split(/\s+/)[0],
        bare = TASK_ID.test(word) && /[\d._-]/.test(word),
        ticked = item.mark === "x" && !bare;
      diagnostics.push(
        diagnostic(
          ticked ? "task.ticked-unknown-id" : "task.missing-id",
          tasksFile,
          item.line,
          bare
            ? `Write task ID "${word}" as a code span: ${taskToken(word.replace(/^(\d+(?:\.\d+)*)\.$/, "$1"))}.`
            : ticked
              ? `This item is ticked [x] but has no task ID, so it completes no task. Start it with a task ID, such as "- [x] \`1.2\` ${item.title.slice(0, 60)}".`
              : `Start this item with a task ID, such as "- [ ] \`1.2\` ${item.title.slice(0, 60)}".`,
        ),
      );
      continue;
    }
    const first = byKey.get(item.key);
    if (first)
      diagnostics.push(
        diagnostic(
          "task.duplicate-id",
          tasksFile,
          item.line,
          `Task ID "${item.key}" is already used at ${tasksFile} line ${first.line}.`,
          { taskId: item.id },
        ),
      );
    else byKey.set(item.key, item);
    const resolved = resolveRefs(item, files);
    item.resolvedRefs = resolved.refs;
    for (const found of resolved.problems)
      diagnostics.push(
        diagnostic(found.code, tasksFile, item.line, found.message, {
          taskId: item.id,
          ref: found.ref,
        }),
      );
    if (!item.title)
      diagnostics.push(
        diagnostic(
          "task.schema",
          tasksFile,
          item.line,
          `Give task "${item.key}" a title.`,
          {
            taskId: item.id,
          },
        ),
      );
  }

  // A title's link to another spec makes its task a spec group (§D19.2).
  const definitions = linkDefinitions(tasksText),
    taskLines = tasksText.split("\n");
  for (const item of items)
    if (item.key) item.spec = specGroupOf(name, item, definitions, taskLines);
  const facts = readFacts(tasksText, items),
    bullets = itemBullets(tasksText, items),
    manifest = facts.manifest,
    entries = manifest.tasks,
    problem = (
      code: string,
      line: number,
      message: string,
      extra?: Record<string, unknown>,
    ) => diagnostics.push(diagnostic(code, tasksFile, line, message, extra));
  for (const found of facts.problems)
    problem(found.code, found.line, found.message);
  // An integration branch (RC16.1); a spec without it is as before.
  try {
    integrationOf(manifest);
  } catch (error) {
    problem(
      "facts.schema",
      facts.frontLine(
        manifest.integrationBranch === undefined
          ? "integrationSync"
          : "integrationBranch",
      ),
      (error as Error).message,
    );
  }
  // A spec with no bugfix.md is a feature spec.
  const type = bugfix && !feature ? "bugfix" : bugfix ? null : "feature";
  // An epic folder lists member plans, not tasks (Requirement 59.1).
  if (facts.isEpic) {
    if (bugfix)
      diagnostics.push(
        diagnostic(
          "spec.epic-bugfix",
          "bugfix.md",
          1,
          "An epic folder states its goal in requirements.md. Remove bugfix.md.",
        ),
      );
    const members: Member[] = [],
      named = new Map<string, string>();
    for (const [key, item] of byKey) {
      const entry = entries[key];
      if (entry === undefined) {
        diagnostics.push(
          diagnostic(
            "facts.missing",
            tasksFile,
            item.line,
            `Item "${item.key}" has no facts. Name its member plan in "$plan:".`,
            { taskId: item.id },
          ),
        );
        continue;
      }
      const line = facts.lineOf(item.key),
        extra = Object.keys(entry).filter(
          (key) => !["plan", "step"].includes(key),
        );
      if (extra.length)
        diagnostics.push(
          diagnostic(
            "spec.epic-task-fields",
            tasksFile,
            line,
            `Epic entry "${item.key}" holds ${extra.map((key) => `"${factName(key)}"`).join(", ")}. An epic entry holds only "plan" and "step".`,
            { entry: item.key },
          ),
        );
      if (typeof entry.plan !== "string" || !NAME.test(entry.plan)) {
        diagnostics.push(
          diagnostic(
            "facts.schema",
            tasksFile,
            line,
            `Epic entry "${item.key}" needs "plan": the member plan's spec folder name.`,
            { entry: item.key },
          ),
        );
        continue;
      }
      // A row's lifecycle step (R59.1); a row without one is implement.
      if (
        entry.step !== undefined &&
        (typeof entry.step !== "string" || !EPIC_STEPS.includes(entry.step))
      ) {
        diagnostics.push(
          diagnostic(
            "facts.schema",
            tasksFile,
            line,
            `Epic entry "${item.key}": step must be ${EPIC_STEPS.join(", ")}.`,
            { entry: item.key },
          ),
        );
        continue;
      }
      const step = String(entry.step ?? "implement"),
        pair = `${entry.plan}\0${step}`;
      if (named.has(pair)) {
        diagnostics.push(
          diagnostic(
            "spec.epic-member-twice",
            tasksFile,
            line,
            `Epic entry "${item.key}" names plan ${entry.plan} for step ${step}, which entry "${named.get(pair)}" already names. Keep one.`,
            { entry: item.key },
          ),
        );
        continue;
      }
      named.set(pair, key);
      members.push({
        key,
        plan: entry.plan,
        step,
        summary: (bullets.get(item.line) ?? [])
          .map((bullet) => bullet.text)
          .join("\n"),
        title: item.title,
        line,
      });
    }
    return { type, kind: "epic", items, diagnostics, proposals, members };
  }
  const headings = headingPhases(tasksText);
  // A bugfix spec's unchanged behavior is acceptance on every fix leaf
  // (design §6.8), so a regression fails the leaf, not only Kiro's tests.
  const unchanged =
    bugfix && !feature ? unchangedClauses(files["bugfix.md"]) : [];
  for (const [key, item] of byKey) {
    const entry = entries[key];
    if (!item.title) continue;
    const line = facts.lineOf(item.key);
    // A nested item is a child of the item above it (R13.7), which is a
    // package because it has sub-items.
    const parentKey = item.parent?.key;
    const local = (reference: string) => byKey.get(reference)?.id ?? reference;
    try {
      // The item's whole line is its title. One over the limit is refused;
      // its cut form only keeps the other checks from failing on it.
      // The item's description bullets are its summary.
      let own = bullets.get(item.line) ?? [];
      const rest: Record<string, unknown> = structuredClone(entry);
      // A leaf's plain bullets are its results, one each (§D20).
      if (rest.kind === "leaf") {
        if (!own.length) {
          // A leaf whose only bullets are removed `$` facts is reported
          // once, as those facts.
          if (
            !facts.problems.some(
              (p) => p.code === "facts.removed-key" && p.key === item.key,
            )
          )
            diagnostics.push(
              diagnostic(
                "done.missing",
                tasksFile,
                item.line,
                `Task "${item.key}" has no done bullet. Add a plain bullet under it for each result someone can check.`,
                { taskId: item.id },
              ),
            );
          continue;
        }
        // Each bullet's text, without its list marker or the indent of its
        // following lines.
        rest.acceptance = own.map((bullet) =>
          bullet.text
            .replace(/^[-*+]\s+/, "")
            .split("\n")
            .map((row) => row.trim())
            .join(" "),
        );
        own = [];
      } else if (rest.kind !== "leaf" && own.length)
        diagnostics.push(
          diagnostic(
            "group.bullets",
            "tasks.md",
            own[0].line ?? item.line,
            `Group "${item.key}" has a bullet of its own. A group's tasks say what is done; move the bullet into a task or delete it.`,
            { taskId: item.id },
          ),
        );
      // A person's task ends its title with the tag (§D20).
      const manual = isManual(item.title);
      // A group with the tag is manual.group (order.mjs); only a leaf is a
      // person's task.
      if (manual && rest.kind === "leaf") rest.manual = true;
      const summary = own.map((bullet) => bullet.text).join("\n"),
        title = (manual ? withoutManual(item.title) : item.title).slice(
          0,
          TITLE_LIMIT,
        ),
        fields = {
          ...rest,
          title,
          ...(summary ? { summary } : {}),
          // A bugfix spec's type reaches each leaf (§4.11).
          ...(bugfix && !feature && entry.kind !== "package"
            ? { specType: "bugfix" }
            : {}),
        };
      if (item.title.length > TITLE_LIMIT)
        diagnostics.push(
          diagnostic(
            "task.title-length",
            tasksFile,
            item.line,
            `Task "${item.key}" has a title of ${item.title.length} characters; the limit is ${TITLE_LIMIT}. Shorten it and move the rest into a bullet under the item.`,
            { taskId: item.id },
          ),
        );
      const proposal = validateProposal(fields) as Proposal;
      if (proposal.requires) proposal.requires = proposal.requires.map(local);
      if (unchanged.length && proposal.kind !== "package")
        proposal.acceptance = [
          ...new Set([...(proposal.acceptance || []), ...unchanged]),
        ];
      // Its phase: the heading above it, else No phase (Requirement 59.5).
      proposals.push({
        ...proposal,
        specKey: item.key,
        phase: headings.get(item.line) ?? null,
        id: String(item.id),
        ...(parentKey ? { parent: item.parent?.id } : {}),
        ...(item.resolvedRefs?.length ? { refs: item.resolvedRefs } : {}),
        lineStart: item.line,
        lineEnd: item.line,
      });
    } catch (error) {
      diagnostics.push(
        diagnostic(
          "facts.schema",
          tasksFile,
          line,
          `Task "${item.key}": ${(error as Error).message}`,
          { taskId: item.id },
        ),
      );
    }
  }
  // Order from the list: waitsOf gives every wait. A
  // repeated ID is refused above, and would only wait on itself here.
  if (!diagnostics.some((d) => d.code === "task.duplicate-id")) {
    const waits = new Map<string, string[]>();
    for (const { from, to } of waitsOf(name, tasksText, linked))
      waits.set(to, [...(waits.get(to) ?? []), from]);
    for (const proposal of proposals)
      if (waits.has(proposal.id)) proposal.requires = waits.get(proposal.id);
  }
  diagnostics.push(
    ...[
      ...orderProblems(items),
      ...linkProblems(items, linked),
      // A parent's block holds its linked specs, so it is checked only
      // when the other specs can be read.
      ...(linked || !items.some((item) => item.spec)
        ? graphBlockProblems(name, tasksText, linked)
        : []),
    ].map(
      (found: {
        code: string;
        line: number;
        message: string;
        taskId?: string | null;
      }) =>
        diagnostic(found.code, tasksFile, found.line, found.message, {
          taskId: found.taskId,
        }),
    ),
  );
  return { type, kind: "plan", items, diagnostics, proposals };
}

// The front-matter block of a tasks.md, or "".
const frontBlock = (text: string) =>
  /^\uFEFF?---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(
    text,
  )?.[1] ?? "";

// Spec structure plus lintPlan's graph and boundedness checks. Any error
// blocks approval.
//
// approved is the plan's last approval receipt. An ID it approved whose item
// text now differs is refused unless retitled names it: a renumbered item
// must not silently move an issue to other work.
export function lintSpec({
  spec,
  plan = {},
  data: given = {},
  approved = null,
  retitled = [],
  namespace = null,
  declaredTasks = [],
}: {
  spec: SpecFolder & { linked?: LinkedReader | null };
  plan?: { id?: string; [key: string]: unknown };
  data?: {
    tasks?: { id: string; planId?: unknown; [key: string]: unknown }[];
    repositories?: { id: string; [key: string]: unknown }[];
    [key: string]: unknown;
  };
  approved?: { files?: Record<string, string> } | null;
  retitled?: string[];
  namespace?: ((name: string) => SpecFolder | null) | null;
  declaredTasks?: { id?: string; requires?: string[] }[];
}) {
  const data = { tasks: [], ...given } as {
      tasks: { id: string; planId?: unknown; [key: string]: unknown }[];
      repositories?: { id: string; [key: string]: unknown }[];
      [key: string]: unknown;
    },
    parsed = parseSpec(spec),
    tasksFile = taskFile(spec.files),
    graph =
      parsed.kind === "epic"
        ? { diagnostics: [] }
        : lintPlan({
            plan,
            data: data as Parameters<typeof lintPlan>[0]["data"],
            proposals: parsed.proposals,
            declaredTasks,
          }),
    diagnostics = [
      ...parsed.diagnostics,
      ...graph.diagnostics.map((item) => ({ file: tasksFile, ...item })),
      ...(namespace ? epicDiagnostics(spec, parsed, namespace) : []),
    ];
  // A spec changes one repository (§D20): with more than one in the
  // workspace, its front matter names it.
  if (
    (data.repositories?.length ?? 0) > 1 &&
    parsed.proposals.some((p) => p.kind === "leaf" && !p.repository) &&
    !/^repo:\s*\S/m.test(frontBlock(spec.files["tasks.md"] || ""))
  )
    diagnostics.push(
      diagnostic(
        "frontmatter.repo",
        "tasks.md",
        1,
        "This workspace has more than one repository: name the one this spec changes with `repo:` in the front matter of tasks.md.",
      ),
    );
  // That one error stands for each leaf's missing repository.
  if (diagnostics.some((d) => d.code === "frontmatter.repo"))
    for (let at = diagnostics.length - 1; at >= 0; at--)
      if (diagnostics[at].code === "leaf.repository") diagnostics.splice(at, 1);
  // An ID is unique across the workspace, not only inside one tasks.md.
  for (const proposal of parsed.proposals) {
    const owner = (data.tasks || []).find(
      (task) =>
        task.id === proposal.id && task.planId && task.planId !== plan.id,
    );
    if (owner)
      diagnostics.push(
        diagnostic(
          "task.duplicate-id",
          tasksFile,
          proposal.lineStart ?? 1,
          `Task ID "${proposal.id}" is already used by plan ${owner.planId}.`,
          { taskId: proposal.id },
        ),
      );
  }
  const approvedTasks = approved?.files && specTasks(approved.files)?.text;
  if (approvedTasks !== undefined) {
    const before = new Map(
        specItems(spec.name, approvedTasks)
          .filter((item) => item.key)
          .map((item) => [item.key, item.title]),
      ),
      allowed = new Set(retitled);
    for (const item of parsed.items) {
      const title = before.get(item.key);
      if (
        item.key &&
        title !== undefined &&
        title !== item.title &&
        !allowed.has(item.key) &&
        !allowed.has(String(item.id))
      )
        diagnostics.push(
          diagnostic(
            "task.changed-text",
            tasksFile,
            item.line,
            `Task "${item.key}" was approved as "${title}" and now reads "${item.title}". Give new work a new ID, or approve the new text by naming "${item.key}" in retitled.`,
            { taskId: item.id },
          ),
        );
    }
  }
  const counts: Record<string, number> = { error: 0, warning: 0, info: 0 };
  for (const item of diagnostics) counts[item.severity]++;
  return {
    canApprove: counts.error === 0,
    counts,
    taskCount: parsed.proposals.length,
    type: parsed.type,
    kind: parsed.kind ?? null,
    epic: specEpic(spec.files),
    ...(parsed.kind === "epic"
      ? {
          members: (parsed.members ?? []).map(
            ({ key, plan, step, summary, title }) => ({
              key,
              plan,
              step,
              summary,
              title,
            }),
          ),
        }
      : {}),
    diagnostics,
    proposals: parsed.proposals,
  };
}

// The facts of a folder's tasks.md, keyed as the manifest was: {tasks,
// integrationBranch, ...}. Diagnostics are lintSpec's.
export function specFacts(files: Record<string, string> = {}) {
  const text = specTasks(files)?.text ?? "";
  return readFacts(text, specItems("x", text)).manifest;
}

// Whether a folder's tasks.md front-matter says `kind: epic` (Requirement
// 59.1, 111.4).
export function isEpicFolder(files: Record<string, string> = {}) {
  const text = specTasks(files)?.text;
  return typeof text === "string" && readFacts(text, []).isEpic;
}

// The epic a plan's front-matter names, or null (Requirement 59.2).
export function specEpic(files: Record<string, string | undefined> = {}) {
  return frontMatter(files["requirements.md"] ?? files["bugfix.md"]).epic;
}

// The epic's member plans, by spec folder name, in its tasks.md order. A
// plan with rows for several steps is one member.
export function epicMembers(files: Record<string, string> = {}) {
  return [...new Set(epicRowsOf(files).map((member) => member.plan))];
}

// The epic's rows, in its tasks.md order: {key, plan, step, summary, title}.
export function epicRowsOf(files: Record<string, string> = {}) {
  const parsed = parseSpec({ name: "epic", exists: true, files });
  return parsed.kind === "epic"
    ? (parsed.members ?? []).map(({ key, plan, step, summary, title }) => ({
        key,
        plan,
        step,
        summary,
        title,
      }))
    : [];
}

// Membership needs both sides (design §6.9). `namespace(name)` reads one
// spec folder of the mode's roots, or null. An epic's entry the member does
// not confirm is an error on the epic; a plan's epic: the epic does not list
// is a warning on the plan.
function epicDiagnostics(
  spec: SpecFolder,
  parsed: Parsed,
  namespace: (name: string) => SpecFolder | null,
) {
  const read = (name: string) => {
      try {
        const folder = namespace(name);
        return folder?.exists ? folder : null;
      } catch {
        return null;
      }
    },
    out: SpecDiagnostic[] = [],
    tasksFile = taskFile(spec.files);
  if (parsed.kind === "epic") {
    for (const member of parsed.members ?? []) {
      const folder = member.plan === spec.name ? spec : read(member.plan);
      if (!folder)
        out.push(
          diagnostic(
            "spec.epic-member-missing",
            tasksFile,
            member.line,
            `Epic entry "${member.key}" names plan ${member.plan}, which has no spec folder ${(spec.folder ?? specFolderPath(null, spec.name)).replace(/[^/]+\/$/, "")}${member.plan}/. Create it or remove the entry.`,
            { entry: member.key },
          ),
        );
      else if (isEpicFolder(folder.files))
        out.push(
          diagnostic(
            "spec.epic-nested",
            tasksFile,
            member.line,
            `Epic entry "${member.key}" names ${member.plan}, which is an epic. An epic lists plans only.`,
            { entry: member.key },
          ),
        );
      else if (specEpic(folder.files) !== spec.name) {
        const named = specEpic(folder.files);
        out.push(
          diagnostic(
            "spec.epic-member-unconfirmed",
            tasksFile,
            member.line,
            named
              ? `Epic entry "${member.key}" lists plan ${member.plan}, whose front-matter names epic ${named}. Change its "epic:" to ${spec.name}, or remove the entry.`
              : `Epic entry "${member.key}" lists plan ${member.plan}, whose front-matter names no epic. Add "epic: ${spec.name}" to its front-matter, or remove the entry.`,
            { entry: member.key },
          ),
        );
      }
    }
    return out;
  }
  const front = frontMatter(
      spec.files["requirements.md"] ?? spec.files["bugfix.md"],
    ),
    file =
      spec.files["requirements.md"] !== undefined
        ? "requirements.md"
        : "bugfix.md";
  if (!front.epic) return out;
  const epic = front.epic === spec.name ? null : read(front.epic);
  const listed =
    epic &&
    isEpicFolder(epic.files) &&
    epicMembers(epic.files).includes(spec.name);
  if (!listed)
    out.push(
      diagnostic(
        "spec.epic-unknown",
        file,
        front.epicLine ?? 1,
        !epic || !isEpicFolder(epic.files)
          ? `Front-matter names epic ${front.epic}, which is not an epic folder. This plan shows under No epic.`
          : `Front-matter names epic ${front.epic}, which does not list this plan. Add it to the epic's tasks.md, or this plan shows under No epic.`,
        { severity: "warning" },
      ),
    );
  return out;
}

// The critique file: a `Reviewed: <folder> <hash>` line, then one fenced
// `finding` JSON block per finding.
export function readCritique(
  text: string | null | undefined,
  hash: string | null | undefined,
) {
  if (text === null || text === undefined) return null;
  const reviewedHash =
      /^Reviewed:.*?\b([0-9a-f]{64})\b/m.exec(text)?.[1] || null,
    findings: {
      kind: string;
      task: string | null;
      text: string;
      line: number;
    }[] = [];
  const blocks = /^```finding\s*\r?\n([\s\S]*?)^```\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = blocks.exec(text))) {
    const line = text.slice(0, match.index).split("\n").length;
    try {
      const value = JSON.parse(match[1]);
      findings.push({
        kind: typeof value?.kind === "string" ? value.kind : "finding",
        task: typeof value?.task === "string" ? value.task : null,
        text: typeof value?.text === "string" ? value.text : "",
        line,
      });
    } catch {
      findings.push({
        kind: "unreadable",
        task: null,
        text: "This finding is not valid JSON.",
        line,
      });
    }
  }
  return {
    reviewedHash,
    current: Boolean(hash) && reviewedHash === hash,
    findings,
  };
}

// The category written in the spec's front-matter, or null. Avoozl reads it
// and never writes it, and never guesses one (Requirement 30.9).
export function specCategory(files: Record<string, string | undefined> = {}) {
  return frontMatter(files["requirements.md"] ?? files["bugfix.md"]).category;
}

export function specTitle(spec: {
  name: string;
  files: Record<string, string>;
}) {
  const prose =
    spec.files["requirements.md"] ??
    spec.files["bugfix.md"] ??
    spec.files[taskFile(spec.files)] ??
    "";
  return (
    withoutFrontMatter(prose)
      .match(/^# (.+)$/m)?.[1]
      ?.trim()
      .slice(0, 240) || spec.name
  );
}

function requireFolder(spec: SpecFolder) {
  if (!spec.exists) fail(`Spec folder ${spec.folder} does not exist.`, 404);
}

// Store one revision of a folder as a draft plan. The plan ID defaults to the
// folder name, which is also the namespace of its numbered task IDs.
export function createSpecPlan(
  store: Store,
  {
    id,
    prompt,
    context = {},
  }: { id?: string; prompt?: unknown; context?: unknown },
  spec: SpecFolder,
) {
  requireFolder(spec);
  id ??= spec.name;
  if (
    prompt !== undefined &&
    (typeof prompt !== "string" || prompt.length > 20000)
  )
    fail("Describe the plan in at most 20000 characters.");
  return store.transaction(() => {
    const previous = store.get<PlanRow>("plans", id);
    if (previous) {
      if (previous.spec === spec.name) return previous;
      fail("Plan ID already exists.", 409);
    }
    const now = new Date().toISOString(),
      plan: PlanRow = {
        id: String(id),
        kind: "plan",
        spec: spec.name,
        title: specTitle(spec),
        prompt:
          (typeof prompt === "string" && prompt.trim()) || `Spec ${spec.name}`,
        text: specTasks(spec.files)?.text ?? "",
        files: spec.files,
        hash: String(spec.hash),
        revision: 1,
        state: "draft",
        context,
        createdAt: now,
        updatedAt: now,
        history: [],
      };
    store.put("plans", plan);
    store.event(null, "plan.created", { planId: id, hash: plan.hash });
    return plan;
  });
}

// Reload the folder from disk as the next revision. An unchanged folder
// writes nothing.
export function saveSpecPlan(
  store: Store,
  { id, expectedHash }: { id: string; expectedHash?: unknown },
  spec: SpecFolder,
) {
  requireFolder(spec);
  return store.transaction(() => {
    const plan = store.get<PlanRow>("plans", id);
    if (!plan || plan.deletedAt) return fail("Plan not found.", 404);
    if (plan.hash !== expectedHash)
      fail("This draft changed. Reload before saving.", 409);
    if (spec.hash === plan.hash) return plan;
    return writeRevision(
      store,
      plan,
      specTasks(spec.files)?.text ?? "",
      "Review amended spec: ",
      {
        hash: String(spec.hash),
        files: spec.files,
        title: specTitle(spec),
      },
    );
  });
}

function writeAtomically(target: string, text: string) {
  const temporary = `${target}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, target);
}

// Adjacent work found while implementing: one new tasks.md item and its
// Facts bullet, then the folder is stored as the next draft revision. This
// is a proposal: nothing is approved or dispatched.
export function proposeSpecWork(
  store: Store,
  {
    id,
    proposal,
    expectedHash,
  }: { id: string; proposal?: unknown; expectedHash?: unknown },
  read: (name: string) => SpecFolder,
) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal))
    return fail("Describe one proposed task as a JSON object.");
  // Its summary goes under the item as bullets.
  // A task never names checks; an older caller's list is ignored.
  const {
    id: key,
    title,
    summary,
    checks: _checks,
    ...entry
  } = proposal as Record<string, unknown>;
  if (typeof key !== "string" || !TASK_ID.test(key))
    fail(
      'Give the proposed task an ID of letters, digits, ".", "_" or "-", such as "cache-invalidation".',
    );
  if (typeof title !== "string" || /[\r\n]/.test(title))
    fail("Each task needs a title of 1–240 characters on one line.");
  validateProposal({ ...structuredClone(entry), title, summary });
  return store.transaction(() => {
    const plan = store.get<PlanRow>("plans", id);
    if (!plan || plan.deletedAt) return fail("Plan not found.", 404);
    if (expectedHash !== undefined && plan.hash !== expectedHash)
      fail("This plan changed. Reload before proposing work.", 409);
    const spec = read(String(plan.spec));
    requireFolder(spec);
    if (spec.hash !== plan.hash)
      fail(
        "The spec folder changed on disk. Reload it before proposing work.",
        409,
      );
    const found = specTasks(spec.files);
    if (!found)
      return fail(
        "Add tasks.md or a ## Tasks section before proposing work.",
        409,
      );
    const { file } = found,
      tasks = spec.files[file];
    if (
      specItems(String(plan.spec), found.text).some((item) => item.key === key)
    )
      fail("Repeated local task ID " + key);
    const directory = path.join(
        specsDirectory(String(spec.root)),
        String(plan.spec),
      ),
      eol = tasks.includes("\r\n") ? "\r\n" : "\n";
    // A leaf's results are its plain bullets; a summary has
    // no place in the list form.
    const facts = ((entry.acceptance as string[] | undefined) ?? []).map(
      (result) => `  - ${result}`,
    );
    if (!facts.length) fail("A proposed task needs at least one result.");
    writeAtomically(
      path.join(directory, file),
      addTaskLines(
        file,
        tasks,
        [
          `- [ ] ${taskToken(key)} ${title}${entry.manual ? " (**MANUAL**)" : ""}`,
          ...facts,
        ],
        eol,
      ),
    );
    const next = read(String(plan.spec)),
      written = writeRevision(
        store,
        plan,
        specTasks(next.files)?.text ?? "",
        "Review proposed work: ",
        {
          hash: String(next.hash),
          files: next.files,
          title: specTitle(next),
        },
      );
    return {
      ...written,
      proposalId: key,
      proposalCount: specItems(
        String(plan.spec),
        specTasks(next.files)?.text ?? "",
      ).length,
      approved: false,
      policy:
        "Proposed work is not executable. This spec no longer matches its approval receipt and its tasks need review; an authorized plan.approve converts this proposal alongside the existing ones.",
    };
  });
}
