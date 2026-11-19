// Kiro spec folders as Avoozl plans (Requirement 30, design §6.8).
//
//   <planning root>/<specs.path>/<name>/   (specs-path.mjs, .kiro/specs)
//     tasks.md               the one required file; each task's facts are
//                            `$key:` bullets (spec-facts.mjs, Requirement 111)
//     requirements.md or bugfix.md, design.md
//                            optional Kiro prose that refs point into
//     <other>.md             optional spec text
//     avoozl/critique.md     planner critique, outside the revision hash
//
// The reader turns tasks.md and its fact bullets into the proposals lintPlan and
// approvePlan already check. Validation is deterministic: the same files give
// the same diagnostics, each with its file and line.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { digest } from "../../model.mjs";
import { fail } from "../store/store.mjs";
import { validateProposal, writeRevision } from "./plans.mjs";
import { lintPlan } from "./plan-quality.mjs";
import { specFolderPath, specsDirectory } from "./specs-path.mjs";
import {
  factName,
  factsLines,
  factsText,
  itemBullets,
  summaryLines,
  readFacts,
  withoutFacts,
} from "./spec-facts.mjs";
import { frontMatter, withoutFrontMatter } from "../../front-matter.mjs";
import { resolveTaskId } from "../../task-identity.mjs";
import { integrationOf } from "../epics/integration-branch.mjs";
import { repeatsTitle } from "../tasks/title-repeat.mjs";
import {
  LETTERED,
  NAMED,
  NUMBERED,
  resolveRefs,
  splitRefs,
  taskToken,
} from "./spec-refs.mjs";

export { taskToken };

// Whether tasks.md has a `Facts:` bullet outside a fence: the layout
// before `$key:` bullets, which lint refuses and nothing reads.
export function hasFactsBlocks(text) {
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
export const CRITIQUE = "avoozl/critique.md";
// Kiro's files, in the order a revision hash reads them. Only tasks.md is
// required. Every other Markdown file directly in the folder is spec text:
// hashed after these, sorted by name, and read by workers. The critique is
// about a revision, so it is read beside it and never changes it.
export const KIRO_FILES = [
  "requirements.md",
  "bugfix.md",
  "design.md",
  "tasks.md",
];
const SPEC_TEXT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.md$/;
// At most this many spec files in one folder.
export const MAX_SPEC_FILES = 50;

// Whether a file name directly in a spec folder is part of the spec.
export const isSpecFile = (file) =>
  typeof file === "string" && SPEC_TEXT.test(file);

// The spec files of `files`, in hash order: Kiro's, then the rest by name.
export function revisionFiles(files = {}) {
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

export function specName(value) {
  if (typeof value !== "string" || !NAME.test(value))
    fail(
      "Name one spec folder: lowercase letters, digits, and hyphens, up to 80 characters.",
    );
  return value;
}

// Kiro marks items done, queued, or running in tasks.md ([x], [~], [-]).
// Those marks are not Avoozl state, so the revision hash reads every
// checkbox as open and a mark alone never changes an approved revision.
export function withoutMarks(text) {
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
function statusIndex(lines) {
  return lines.slice(0, STATUS_WINDOW).findIndex((line) => STATUS.test(line));
}

// The text the revision hash reads: no Status line. Avoozl writes none
// (approval is a commit, git-approvals.mjs); a person's own stays outside
// the hash.
export function withoutStatus(text) {
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
export function specHash(files) {
  return digest(
    [
      ...revisionFiles(files).map((file) => {
        const raw = files[file],
          text = withoutStatus(
            file === "tasks.md"
              ? withoutMarks(withoutFacts(raw, specItems("x", raw)))
              : raw,
          );
        return `${file}\0${text}\0`;
      }),
      ...(files["tasks.md"] === undefined
        ? []
        : [
            `${MANIFEST}\0${factsText(
              readFacts(files["tasks.md"], specItems("x", files["tasks.md"]))
                .manifest,
            )}\0`,
          ]),
    ].join(""),
  );
}

// Where a mode keeps its spec folders (Requirement 30.3): the planning
// repository in plans-repo mode and with no GitHub mode, every code
// repository in single-repo mode.
export function specRoots({
  mode = null,
  planningRoot = null,
  codeRoots = [],
}) {
  if (mode === "single-repo") {
    const roots = [...new Set(codeRoots.filter(Boolean))];
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
    fail("This workspace has no planning repository for spec folders.", 409);
  return [planningRoot];
}

// One folder name across the mode's roots. A name found in two code
// repositories is refused, so a plan never reads another repository's spec.
export function findSpecFolder(roots, name) {
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

function inside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

// Read one folder from disk. Only regular files inside the planning root are
// read: a symlink out of it reads as a missing file.
export function readSpecFolder(root, name) {
  specName(name);
  const directory = path.join(specsDirectory(root), name),
    folder = specFolderPath(root, name);
  let real;
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
  const read = (file) => {
    const target = path.join(real, file);
    let stat;
    try {
      stat = fs.lstatSync(target);
    } catch {
      return undefined;
    }
    if (!stat.isFile()) return undefined;
    if (stat.size > MAX_FILE_BYTES) fail(`${folder}${file} is too large.`, 413);
    return fs.readFileSync(target, "utf8");
  };
  const files = {},
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
    ...(hasFactsBlocks(files["tasks.md"]) ? { factsBlocks: true } : {}),
    hash: specHash(files),
    critique: read(CRITIQUE) ?? null,
  };
}

// When a folder's revision files last changed on disk, as an ISO time, or
// null when none can be read.
export function specModifiedAt(root, name, files) {
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

export function listSpecFolders(root) {
  const directory = specsDirectory(root);
  let entries;
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

function diagnostic(code, file, line, message, extra = {}) {
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
export function specItems(name, text) {
  const items = [],
    open = [];
  let fenced = false;
  text.split("\n").forEach((raw, index) => {
    if (FENCE.test(raw)) fenced = !fenced;
    if (fenced) return;
    const match = raw.replace(/\r$/, "").match(CHECKBOX);
    if (!match) return;
    const mark = match[1].toLowerCase(),
      text = match[2].trim(),
      // An ID may be a code span, `dl-1`, or bare; Avoozl writes a named
      // one as a code span (taskToken).
      quoted = /^`([^`\s]+)`(?:\s+|$)(.*)$/.exec(text),
      [token = "", ...rest] = quoted
        ? [quoted[1], quoted[2]]
        : text.split(/\s+/),
      line = index + 1,
      { title, ...refs } = splitRefs(rest.join(" ")),
      indent = /^\s*/.exec(raw)[0].length;
    while (open.length && open.at(-1).indent >= indent) open.pop();
    const parent = open.at(-1)?.item ?? null;
    let item;
    if (NUMBERED.test(token) || LETTERED.test(token)) {
      const key = token.replace(/\.$/, "");
      item = { key, id: `${name}.${key}`, title, refs, line };
    } else if (NAMED.test(token))
      item = { key: token, id: token, title, refs, line };
    else item = { key: null, id: null, title: text, line };
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
export function headingPhases(text) {
  const byLine = new Map(),
    used = new Map();
  let fenced = false,
    current = null;
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
export function checkedItems(name, text) {
  const lines = text.split("\n"),
    items = specItems(name, text),
    starts = new Set(items.map((item) => item.line)),
    checked = new Map();
  for (const item of items) {
    if (!item.key || item.mark !== "x") continue;
    let built = null;
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
function unchangedClauses(text) {
  const clauses = [];
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
}) {
  const diagnostics = [],
    proposals = [];
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
  // tasks.md is the one required file; the prose files are optional.
  if (files["tasks.md"] === undefined)
    diagnostics.push(
      diagnostic("spec.missing-file", "tasks.md", 1, `Add ${folder}tasks.md.`),
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
        "tasks.md",
        1,
        "Write each task fact as a `$key: value` bullet directly under its task, in place of its Facts: bullet.",
      ),
    );

  const items = specItems(name, files["tasks.md"] || ""),
    byKey = new Map();
  for (const item of items) {
    if (!item.key) {
      // A tick completes the task it names (spec-ticks.mjs): with no ID it
      // names none.
      const ticked = item.mark === "x";
      diagnostics.push(
        diagnostic(
          ticked ? "task.ticked-unknown-id" : "task.missing-id",
          "tasks.md",
          item.line,
          ticked
            ? `This item is ticked [x] but has no task ID, so it completes no task. Start it with a task ID, such as "- [x] 1.2 ${item.title.slice(0, 60)}".`
            : `Start this item with a task ID, such as "- [ ] 1.2 ${item.title.slice(0, 60)}".`,
        ),
      );
      continue;
    }
    const first = byKey.get(item.key);
    if (first)
      diagnostics.push(
        diagnostic(
          "task.duplicate-id",
          "tasks.md",
          item.line,
          `Task ID "${item.key}" is already used at tasks.md line ${first.line}.`,
          { taskId: item.id },
        ),
      );
    else byKey.set(item.key, item);
    const resolved = resolveRefs(item, files);
    item.resolvedRefs = resolved.refs;
    for (const found of resolved.problems)
      diagnostics.push(
        diagnostic(found.code, "tasks.md", item.line, found.message, {
          taskId: item.id,
          ref: found.ref,
        }),
      );
    if (!item.title)
      diagnostics.push(
        diagnostic(
          "task.schema",
          "tasks.md",
          item.line,
          `Give task "${item.key}" a title.`,
          {
            taskId: item.id,
          },
        ),
      );
  }

  const facts = readFacts(files["tasks.md"] || "", items),
    bullets = itemBullets(files["tasks.md"] || "", items),
    manifest = facts.manifest,
    entries = manifest.tasks,
    problem = (code, line, message, extra) =>
      diagnostics.push(diagnostic(code, "tasks.md", line, message, extra));
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
      error.message,
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
    const members = [],
      named = new Map();
    for (const item of byKey.values()) {
      const entry = entries[item.key];
      if (entry === undefined) {
        diagnostics.push(
          diagnostic(
            "facts.missing",
            "tasks.md",
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
            "tasks.md",
            line,
            `Epic entry "${item.key}" holds ${extra.map((key) => `"${factName(key)}"`).join(", ")}. An epic entry holds only "plan" and "step".`,
            { entry: item.key },
          ),
        );
      if (typeof entry.plan !== "string" || !NAME.test(entry.plan)) {
        diagnostics.push(
          diagnostic(
            "facts.schema",
            "tasks.md",
            line,
            `Epic entry "${item.key}" needs "plan": the member plan's spec folder name.`,
            { entry: item.key },
          ),
        );
        continue;
      }
      // A row's lifecycle step (R59.1); a row without one is implement.
      if (entry.step !== undefined && !EPIC_STEPS.includes(entry.step)) {
        diagnostics.push(
          diagnostic(
            "facts.schema",
            "tasks.md",
            line,
            `Epic entry "${item.key}": step must be ${EPIC_STEPS.join(", ")}.`,
            { entry: item.key },
          ),
        );
        continue;
      }
      const step = entry.step ?? "implement",
        pair = `${entry.plan}\0${step}`;
      if (named.has(pair)) {
        diagnostics.push(
          diagnostic(
            "spec.epic-member-twice",
            "tasks.md",
            line,
            `Epic entry "${item.key}" names plan ${entry.plan} for step ${step}, which entry "${named.get(pair)}" already names. Keep one.`,
            { entry: item.key },
          ),
        );
        continue;
      }
      named.set(pair, item.key);
      members.push({
        key: item.key,
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
  const headings = headingPhases(files["tasks.md"] || "");
  // A bugfix spec's unchanged behavior is acceptance on every fix leaf
  // (design §6.8), so a regression fails the leaf, not only Kiro's tests.
  const unchanged =
    bugfix && !feature ? unchangedClauses(files["bugfix.md"]) : [];
  for (const item of byKey.values()) {
    const entry = entries[item.key];
    if (!item.title) continue;
    const line = facts.lineOf(item.key);
    // A nested item is a child of the item above it (R13.7), which is a
    // package because it has sub-items.
    const parentKey = item.parent?.key;
    const local = (reference) => byKey.get(reference)?.id ?? reference;
    try {
      // The item's whole line is its title. One over the limit is refused;
      // its cut form only keeps the other checks from failing on it.
      // The item's description bullets are its summary. One that repeats
      // the title is refused and left out.
      let own = (bullets.get(item.line) ?? []).filter((bullet) => {
        if (!repeatsTitle(bullet.text, item.title)) return true;
        diagnostics.push(
          diagnostic(
            "task.summary-repeats-title",
            "tasks.md",
            bullet.line,
            "This repeats the title; say what the title does not, or delete it.",
            { taskId: item.id },
          ),
        );
        return false;
      });
      const rest = structuredClone(entry);
      // A leaf with no `$done` gives its results as plain bullets: each
      // one is a result, and it has no summary.
      if (rest.kind === "leaf" && rest.acceptance === undefined) {
        if (!own.length) {
          diagnostics.push(
            diagnostic(
              "facts.missing",
              "tasks.md",
              item.line,
              `Task "${item.key}" has no results. Add a "$done:" bullet under it for each result.`,
              { taskId: item.id },
            ),
          );
          continue;
        }
        rest.acceptance = own.map((bullet) => bullet.text);
        own = [];
      }
      const summary = own.map((bullet) => bullet.text).join("\n"),
        title = item.title.slice(0, TITLE_LIMIT),
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
            "tasks.md",
            item.line,
            `Task "${item.key}" has a title of ${item.title.length} characters; the limit is ${TITLE_LIMIT}. Shorten it and move the rest into a bullet under the item.`,
            { taskId: item.id },
          ),
        );
      const proposal = validateProposal(fields);
      if (proposal.requires) proposal.requires = proposal.requires.map(local);
      if (unchanged.length && proposal.kind !== "package")
        proposal.acceptance = [
          ...new Set([...(proposal.acceptance || []), ...unchanged]),
        ];
      // Its phase: the heading above it, else No phase (Requirement 59.5).
      proposals.push({
        ...proposal,
        id: item.id,
        specKey: item.key,
        phase: headings.get(item.line) ?? null,
        ...(parentKey ? { parent: item.parent.id } : {}),
        ...(item.resolvedRefs.length ? { refs: item.resolvedRefs } : {}),
        lineStart: item.line,
        lineEnd: item.line,
      });
    } catch (error) {
      diagnostics.push(
        diagnostic(
          "facts.schema",
          "tasks.md",
          line,
          `Task "${item.key}": ${error.message}`,
          { taskId: item.id },
        ),
      );
    }
  }
  return { type, kind: "plan", items, diagnostics, proposals };
}

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
}) {
  const data = { tasks: [], ...given },
    parsed = parseSpec(spec),
    graph =
      parsed.kind === "epic"
        ? { diagnostics: [] }
        : lintPlan({
            text: spec.files["tasks.md"] || "",
            plan,
            data,
            proposals: parsed.proposals,
            declaredTasks,
          }),
    diagnostics = [
      ...parsed.diagnostics,
      ...graph.diagnostics.map((item) => ({ file: "tasks.md", ...item })),
      ...(namespace ? epicDiagnostics(spec, parsed, namespace) : []),
    ];
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
          "tasks.md",
          proposal.lineStart,
          `Task ID "${proposal.id}" is already used by plan ${owner.planId}.`,
          { taskId: proposal.id },
        ),
      );
  }
  const approvedTasks = approved?.files?.["tasks.md"];
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
        !allowed.has(item.id)
      )
        diagnostics.push(
          diagnostic(
            "task.changed-text",
            "tasks.md",
            item.line,
            `Task "${item.key}" was approved as "${title}" and now reads "${item.title}". Give new work a new ID, or approve the new text by naming "${item.key}" in retitled.`,
            { taskId: item.id },
          ),
        );
    }
  }
  const counts = { error: 0, warning: 0, info: 0 };
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
          members: parsed.members.map(
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
export function specFacts(files = {}) {
  const text = files["tasks.md"] ?? "";
  return readFacts(text, specItems("x", text)).manifest;
}

// Whether a folder's tasks.md front-matter says `kind: epic` (Requirement
// 59.1, 111.4).
export function isEpicFolder(files = {}) {
  const text = files["tasks.md"];
  return typeof text === "string" && readFacts(text, []).isEpic;
}

// The epic a plan's front-matter names, or null (Requirement 59.2).
export function specEpic(files = {}) {
  return frontMatter(files["requirements.md"] ?? files["bugfix.md"]).epic;
}

// The epic's member plans, by spec folder name, in its tasks.md order. A
// plan with rows for several steps is one member.
export function epicMembers(files = {}) {
  return [...new Set(epicRowsOf(files).map((member) => member.plan))];
}

// The epic's rows, in its tasks.md order: {key, plan, step, summary, title}.
export function epicRowsOf(files = {}) {
  const parsed = parseSpec({ name: "epic", exists: true, files });
  return parsed.kind === "epic"
    ? parsed.members.map(({ key, plan, step, summary, title }) => ({
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
function epicDiagnostics(spec, parsed, namespace) {
  const read = (name) => {
      try {
        const folder = namespace(name);
        return folder?.exists ? folder : null;
      } catch {
        return null;
      }
    },
    out = [];
  if (parsed.kind === "epic") {
    for (const member of parsed.members) {
      const folder = member.plan === spec.name ? spec : read(member.plan);
      if (!folder)
        out.push(
          diagnostic(
            "spec.epic-member-missing",
            "tasks.md",
            member.line,
            `Epic entry "${member.key}" names plan ${member.plan}, which has no spec folder ${(spec.folder ?? specFolderPath(null, spec.name)).replace(/[^/]+\/$/, "")}${member.plan}/. Create it or remove the entry.`,
            { entry: member.key },
          ),
        );
      else if (isEpicFolder(folder.files))
        out.push(
          diagnostic(
            "spec.epic-nested",
            "tasks.md",
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
            "tasks.md",
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
export function readCritique(text, hash) {
  if (text === null || text === undefined) return null;
  const reviewedHash =
      /^Reviewed:.*?\b([0-9a-f]{64})\b/m.exec(text)?.[1] || null,
    findings = [];
  const blocks = /^```finding\s*\r?\n([\s\S]*?)^```\s*$/gm;
  let match;
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
export function specCategory(files = {}) {
  return frontMatter(files["requirements.md"] ?? files["bugfix.md"]).category;
}

export function specTitle(spec) {
  const prose =
    spec.files["requirements.md"] ??
    spec.files["bugfix.md"] ??
    spec.files["tasks.md"] ??
    "";
  return (
    withoutFrontMatter(prose)
      .match(/^# (.+)$/m)?.[1]
      ?.trim()
      .slice(0, 240) || spec.name
  );
}

function requireFolder(spec) {
  if (!spec.exists) fail(`Spec folder ${spec.folder} does not exist.`, 404);
}

// Store one revision of a folder as a draft plan. The plan ID defaults to the
// folder name, which is also the namespace of its numbered task IDs.
export function createSpecPlan(
  store,
  { id, prompt, context = {}, home },
  spec,
) {
  requireFolder(spec);
  const sourceHome = spec.home ?? home,
    sourceRef = spec.ref ?? spec.plansRef,
    sourceRepository = spec.specRepository ?? spec.repository;
  if (sourceHome !== undefined && !["main", "plansBranch"].includes(sourceHome))
    fail("A spec home is main or plansBranch.");
  id ??= spec.name;
  if (
    prompt !== undefined &&
    (typeof prompt !== "string" || prompt.length > 20000)
  )
    fail("Describe the plan in at most 20000 characters.");
  return store.transaction(() => {
    const previous = store.get("plans", id);
    if (previous) {
      if (previous.spec === spec.name) return previous;
      fail("Plan ID already exists.", 409);
    }
    const now = new Date().toISOString(),
      plan = {
        id,
        kind: "plan",
        spec: spec.name,
        // The reader owns location metadata; the input home remains a compatible
        // fallback for callers that read plain spec folders.
        ...(sourceHome ? { home: sourceHome } : {}),
        ...(sourceRef ? { ref: sourceRef } : {}),
        ...(sourceRepository ? { specRepository: sourceRepository } : {}),
        title: specTitle(spec),
        prompt: prompt?.trim() || `Spec ${spec.name}`,
        text: spec.files["tasks.md"] || "",
        files: spec.files,
        hash: spec.hash,
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
export function saveSpecPlan(store, { id, expectedHash }, spec) {
  requireFolder(spec);
  return store.transaction(() => {
    const plan = store.get("plans", id);
    if (!plan || plan.deletedAt) fail("Plan not found.", 404);
    if (plan.hash !== expectedHash)
      fail("This draft changed. Reload before saving.", 409);
    const sourceRef = spec.ref ?? spec.plansRef,
      sourceRepository = spec.specRepository ?? spec.repository;
    if (
      spec.home &&
      (plan.home !== spec.home ||
        plan.ref !== sourceRef ||
        (sourceRepository && plan.specRepository !== sourceRepository))
    ) {
      if (
        ((plan.home && plan.home !== spec.home) ||
          (plan.ref && plan.ref !== sourceRef) ||
          (plan.specRepository &&
            sourceRepository &&
            plan.specRepository !== sourceRepository)) &&
        spec.hash === plan.hash &&
        store
          .list("approvals")
          .some((a) => a.planId === id && a.hash === plan.hash)
      )
        fail(
          "Moving an approved spec to another home requires a changed revision and new approval.",
          409,
        );
      plan.home = spec.home;
      if (sourceRef) plan.ref = sourceRef;
      else delete plan.ref;
      if (sourceRepository) plan.specRepository = sourceRepository;
      store.put("plans", plan);
    }
    if (spec.hash === plan.hash) return plan;
    return writeRevision(
      store,
      plan,
      spec.files["tasks.md"] || "",
      "Review amended spec: ",
      {
        hash: spec.hash,
        files: spec.files,
        title: specTitle(spec),
      },
    );
  });
}

// Turn an old-style plan into a spec plan: its folder becomes the next draft
// revision under the same plan ID. The folder must belong to this plan, and
// every task the plan already mapped must be in tasks.md, so approval keeps
// the same task IDs, history and edges. Linking never approves.
export function linkSpecPlan(store, { id, expectedHash }, spec) {
  requireFolder(spec);
  return store.transaction(() => {
    const plan = store.get("plans", id);
    if (!plan || plan.deletedAt) fail("Plan not found.", 404);
    if (plan.kind === "conversation")
      fail("A conversation is not a plan. Create a spec plan instead.");
    if (plan.spec) fail("This plan already reads its spec folder.", 409);
    if (plan.hash !== expectedHash)
      fail("This draft changed. Reload before saving.", 409);
    if (
      store
        .list("plans")
        .some(
          (other) =>
            other.id !== id && !other.deletedAt && other.spec === spec.name,
        )
    )
      fail(`Spec ${spec.name} already belongs to another plan.`, 409);
    if (
      spec.name !== plan.id &&
      !plan.documentId?.startsWith(
        spec.folder ?? specFolderPath(null, spec.name),
      )
    )
      fail(
        `Spec ${spec.name} is not this plan's folder: the plan ID or its document must name it.`,
        409,
      );
    // Spec mapping keys are tasks.md IDs; old keys were block IDs.
    const data = store.read(),
      resolve = (taskId) => resolveTaskId(data, taskId),
      proposals = parseSpec(spec).proposals,
      mapping = {};
    for (const taskId of Object.values(plan.mapping || {})) {
      const proposal = proposals.find(
        (p) => resolve(p.taskId || p.id) === resolve(taskId),
      );
      if (!proposal)
        fail(
          `Task ${taskId} is missing from ${spec.name}/tasks.md. Add it or retire it before linking.`,
          409,
        );
      mapping[proposal.id] = taskId;
    }
    plan.mapping = mapping;
    plan.spec = spec.name;
    return writeRevision(
      store,
      plan,
      spec.files["tasks.md"] || "",
      "Review amended spec: ",
      { hash: spec.hash, files: spec.files, title: specTitle(spec) },
    );
  });
}

function writeAtomically(target, text) {
  const temporary = `${target}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, target);
}

// Adjacent work found while implementing: one new tasks.md item and its
// Facts bullet, then the folder is stored as the next draft revision. This
// is a proposal: nothing is approved or dispatched.
export function proposeSpecWork(store, { id, proposal, expectedHash }, read) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal))
    fail("Describe one proposed task as a JSON object.");
  // Its summary goes under the item as bullets.
  // A task never names checks; an older caller's list is ignored.
  const { id: given, title, summary, checks: _checks, ...entry } = proposal;
  if (
    typeof given !== "string" ||
    !(NAMED.test(given) || NUMBERED.test(given) || LETTERED.test(given))
  )
    fail(
      'Give the proposed task an ID with a separator, such as "cache-invalidation".',
    );
  const key = given.replace(/\.$/, "");
  if (typeof title !== "string" || /[\r\n]/.test(title))
    fail("Each task needs a title of 1–240 characters on one line.");
  validateProposal({ ...structuredClone(entry), title, summary });
  return store.transaction(() => {
    const plan = store.get("plans", id);
    if (!plan || plan.deletedAt) fail("Plan not found.", 404);
    if (expectedHash !== undefined && plan.hash !== expectedHash)
      fail("This plan changed. Reload before proposing work.", 409);
    const spec = read(plan.spec);
    requireFolder(spec);
    if (spec.hash !== plan.hash)
      fail(
        "The spec folder changed on disk. Reload it before proposing work.",
        409,
      );
    const tasks = spec.files["tasks.md"];
    if (tasks === undefined) fail("Add tasks.md before proposing work.", 409);
    if (specItems(plan.spec, tasks).some((item) => item.key === key))
      fail("Repeated local task ID " + key);
    const directory = path.join(specsDirectory(spec.root), plan.spec),
      eol = tasks.includes("\r\n") ? "\r\n" : "\n";
    let facts;
    try {
      facts = [...factsLines(entry), ...summaryLines(summary)];
    } catch (error) {
      fail(error.message);
    }
    writeAtomically(
      path.join(directory, "tasks.md"),
      tasks +
        (tasks && !tasks.endsWith("\n") ? eol : "") +
        `- [ ] ${taskToken(key)} ${title}${eol}` +
        facts.map((line) => line + eol).join(""),
    );
    const next = read(plan.spec),
      written = writeRevision(
        store,
        plan,
        next.files["tasks.md"],
        "Review proposed work: ",
        {
          hash: next.hash,
          files: next.files,
          title: specTitle(next),
        },
      );
    return {
      ...written,
      proposalId: key,
      proposalCount: specItems(plan.spec, next.files["tasks.md"]).length,
      approved: false,
      policy:
        "Proposed work is not executable. This spec no longer matches its approval receipt and its tasks need review; an authorized plan.approve converts this proposal alongside the existing ones.",
    };
  });
}
