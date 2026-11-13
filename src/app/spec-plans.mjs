// Kiro spec folders as Avoozl plans (Requirement 30, design §6.8).
//
//   <planning root>/.kiro/specs/<name>/
//     requirements.md or bugfix.md, design.md, tasks.md
//     avoozl/manifest.json   one entry per tasks.md ID: kind, repository,
//                            edges, checks, completion, acceptance
//     avoozl/critique.md     planner critique, outside the revision hash
//
// The reader turns tasks.md plus the manifest into the proposals lintPlan and
// approvePlan already check. Validation is deterministic: the same files give
// the same diagnostics, each with its file and line.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { digest } from "../model.mjs";
import { fail } from "./store.mjs";
import { validateProposal, writeRevision } from "./plans.mjs";
import { lintPlan } from "./plan-quality.mjs";
import { frontMatter, withoutFrontMatter } from "../front-matter.mjs";
import { resolveTaskId } from "../task-identity.mjs";
import { validateManifestBudget } from "./budget.mjs";

export const SPECS_DIRECTORY = path.join(".kiro", "specs");
export const MANIFEST = "avoozl/manifest.json";
export const CRITIQUE = "avoozl/critique.md";
// The files a revision hash covers. The critique is about a revision, so it
// is read beside it and never changes it.
const REVISION_FILES = [
  "requirements.md",
  "bugfix.md",
  "design.md",
  "tasks.md",
  MANIFEST,
];
const NAME = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_FILE_BYTES = 1000000;
// `1`, `2.14`, Kiro's own numbering; a trailing period is Kiro's style.
const NUMBERED = /^\d+(?:\.\d+)*\.?$/;
// Any other ID has a separator, so a plain first word is not read as an ID.
const NAMED = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
// `P1`, `P2b`: a proof or other lettered item, namespaced like a number.
const LETTERED = /^[A-Z]\d+[a-z]?$/;
const CHECKBOX = /^\s*[-*+] \[([ xX~-])\]\*?[ \t]+(.*)$/;
// A "Built:" line under a checked item names the work that already landed.
const BUILT = /^\s+(?:[-*+]\s+)?Built:\s*(.+?)\s*$/;
export const TITLE_LIMIT = 240;
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

export function specHash(files) {
  return digest(
    REVISION_FILES.filter((file) => files[file] !== undefined)
      .map((file) => {
        const text =
          file === "tasks.md" ? withoutMarks(files[file]) : files[file];
        return `${file}\0${text}\0`;
      })
      .join(""),
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
      `Spec folder .kiro/specs/${name}/ exists in more than one repository: ${found.map((spec) => spec.root).join(", ")}. Rename one.`,
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
  const directory = path.join(root, SPECS_DIRECTORY, name),
    folder = `.kiro/specs/${name}/`;
  let real;
  try {
    real = fs.realpathSync(directory);
  } catch {
    return { name, folder, exists: false, files: {}, hash: null };
  }
  if (!inside(fs.realpathSync(root), real) || !fs.statSync(real).isDirectory())
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
  const files = {};
  for (const file of REVISION_FILES) {
    const text = read(file);
    if (text !== undefined) files[file] = text;
  }
  return {
    name,
    folder,
    exists: true,
    files,
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
        fs.statSync(path.join(root, SPECS_DIRECTORY, specName(name), file))
          .mtimeMs,
      );
    } catch {
      // A file removed since the read has no time.
    }
  return latest ? new Date(latest).toISOString() : null;
}

export function listSpecFolders(root) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, SPECS_DIRECTORY), {
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
    id: `${code}:${file}:${line}:${extra.taskId || ""}`,
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
      [token = "", ...rest] = match[2].trim().split(/\s+/),
      line = index + 1,
      title = rest.join(" "),
      indent = /^\s*/.exec(raw)[0].length;
    while (open.length && open.at(-1).indent >= indent) open.pop();
    const parent = open.at(-1)?.item ?? null;
    let item;
    if (NUMBERED.test(token) || LETTERED.test(token)) {
      const key = token.replace(/\.$/, "");
      item = { key, id: `${name}.${key}`, title, line };
    } else if (NAMED.test(token)) item = { key: token, id: token, title, line };
    else item = { key: null, id: null, title: match[2].trim(), line };
    items.push({ ...item, mark, parent });
    open.push({ indent, item });
  });
  return items;
}

// Items checked [x] in tasks.md, with the first "Built:" line under each.
// Only an approval of the stored revision reads these (plans.mjs): [~] and
// [-] are Kiro's queued and running marks and stay planned.
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

// An item longer than the title limit keeps its first clause as the title,
// ending at the first ". ", "; ", ": ", ", " or " — " outside backticks; the
// whole line becomes the summary (spec-plans parseSpec).
export function shortTitle(text) {
  if (text.length <= TITLE_LIMIT) return text;
  let code = false;
  for (let at = 0; at < text.length - 1; at++) {
    const char = text[at];
    if (char === "`") code = !code;
    if (code || at === 0) continue;
    if (
      ((".;:,".includes(char) && text[at + 1] === " ") ||
        (char === " " && "—–".includes(text[at + 1]))) &&
      at <= TITLE_LIMIT
    )
      return text.slice(0, at).trim();
  }
  const cut = text.slice(0, TITLE_LIMIT - 1),
    space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut).trimEnd() + "…";
}

// The manifest line that names a key, for diagnostics.
function manifestLine(text, key) {
  const quoted = JSON.stringify(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    at = text.search(new RegExp(quoted + "\\s*:"));
  return at < 0 ? 1 : text.slice(0, at).split("\n").length;
}

// shortcut: the line comes from the runtime's error message, which names a
// position for most errors but not all; otherwise this reports line 1. Add a
// scanner if authors need exact lines for every JSON error.
function jsonErrorLine(text, error) {
  const line = /line (\d+)/.exec(error.message)?.[1];
  if (line) return Number(line);
  const position = /position (\d+)/.exec(error.message)?.[1];
  return position ? text.slice(0, Number(position)).split("\n").length : 1;
}

// The clauses under bugfix.md's "Unchanged Behavior" heading, Kiro's
// regression-prevention list, without their numbering or list markers.
export function unchangedClauses(text) {
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

// Structure, IDs, and manifest coverage. Returns the diagnostics and the
// proposals built from items that have a valid manifest entry.
export function parseSpec({
  name,
  folder = `.kiro/specs/${name}/`,
  exists,
  files,
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
  else if (!feature && !bugfix)
    diagnostics.push(
      diagnostic(
        "spec.missing-file",
        "requirements.md",
        1,
        "Add requirements.md for a feature spec or bugfix.md for a bugfix spec.",
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
  for (const file of ["design.md", "tasks.md", MANIFEST])
    if (files[file] === undefined)
      diagnostics.push(
        diagnostic("spec.missing-file", file, 1, `Add ${folder}${file}.`),
      );

  const items = specItems(name, files["tasks.md"] || ""),
    byKey = new Map();
  for (const item of items) {
    if (!item.key) {
      diagnostics.push(
        diagnostic(
          "task.missing-id",
          "tasks.md",
          item.line,
          `Start this item with a task ID, such as "- [ ] 1.2 ${item.title.slice(0, 60)}".`,
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

  const text = files[MANIFEST];
  let entries = null,
    specBudget;
  if (text !== undefined) {
    try {
      const manifest = JSON.parse(text);
      if (
        !manifest ||
        typeof manifest !== "object" ||
        !manifest.tasks ||
        typeof manifest.tasks !== "object" ||
        Array.isArray(manifest.tasks)
      )
        diagnostics.push(
          diagnostic(
            "manifest.schema",
            MANIFEST,
            1,
            'The manifest is one JSON object with a "tasks" object keyed by tasks.md ID.',
          ),
        );
      else {
        entries = manifest.tasks;
        // The spec's per-task cap, and never prices (§4.17, R67.2).
        try {
          specBudget = validateManifestBudget(manifest);
        } catch (error) {
          diagnostics.push(
            diagnostic(
              "manifest.schema",
              MANIFEST,
              manifestLine(
                text,
                manifest.prices !== undefined ? "prices" : "budget",
              ),
              error.message,
            ),
          );
        }
      }
    } catch (error) {
      diagnostics.push(
        diagnostic(
          "manifest.json",
          MANIFEST,
          jsonErrorLine(text, error),
          `The manifest is not valid JSON: ${error.message}`,
        ),
      );
    }
  }
  // A bugfix spec's unchanged behavior is acceptance on every fix leaf
  // (design §6.8), so a regression fails the leaf, not only Kiro's tests.
  const unchanged =
    bugfix && !feature ? unchangedClauses(files["bugfix.md"]) : [];
  if (entries) {
    for (const key of Object.keys(entries))
      if (!byKey.has(key))
        diagnostics.push(
          diagnostic(
            "manifest.unknown-task",
            MANIFEST,
            manifestLine(text, key),
            `Manifest entry "${key}" has no tasks.md item.`,
          ),
        );
    for (const item of byKey.values()) {
      const entry = entries[item.key];
      if (entry === undefined) {
        diagnostics.push(
          diagnostic(
            "manifest.missing-entry",
            "tasks.md",
            item.line,
            `Task "${item.key}" has no entry in ${MANIFEST}.`,
            { taskId: item.id },
          ),
        );
        continue;
      }
      if (!item.title) continue;
      // A nested item is a child of the item above it (R13.7), which must
      // be an epic or package: only those project as parent issues. Nesting
      // is the only way to name a parent, so the manifest never holds one.
      if (entry && typeof entry === "object" && "parent" in entry)
        diagnostics.push(
          diagnostic(
            "manifest.schema",
            MANIFEST,
            manifestLine(text, item.key),
            `Manifest entry "${item.key}" names a parent. Nest the item under its parent in tasks.md instead.`,
            { taskId: item.id },
          ),
        );
      const parentKey = item.parent?.key,
        parentOk =
          parentKey && ["epic", "package"].includes(entries[parentKey]?.kind);
      if (parentKey && !parentOk)
        diagnostics.push(
          diagnostic(
            "task.parent-kind",
            "tasks.md",
            item.line,
            `Task "${item.key}" is nested under "${parentKey}", which is not an epic or package. Mark "${parentKey}" as an epic or package in ${MANIFEST}, or stop nesting this item.`,
            { taskId: item.id },
          ),
        );
      const local = (reference) => byKey.get(reference)?.id ?? reference;
      try {
        const title = shortTitle(item.title),
          fields = {
            ...structuredClone(entry),
            title,
            ...(specBudget && !["epic", "package"].includes(entry?.kind)
              ? { specBudget }
              : {}),
          };
        if (title !== item.title)
          fields.summary = [item.title, entry?.summary]
            .filter((text) => typeof text === "string" && text.trim())
            .join("\n\n");
        delete fields.parent;
        const proposal = validateProposal(fields);
        for (const field of ["requires", "sequence", "supports"])
          if (proposal[field]) proposal[field] = proposal[field].map(local);
        if (proposal.conditions)
          proposal.conditions = Object.fromEntries(
            Object.entries(proposal.conditions).map(([key, value]) => [
              local(key),
              value,
            ]),
          );
        if (unchanged.length && !["epic", "package"].includes(proposal.kind))
          proposal.acceptance = [
            ...new Set([...(proposal.acceptance || []), ...unchanged]),
          ];
        proposals.push({
          ...proposal,
          id: item.id,
          specKey: item.key,
          ...(parentOk ? { parent: item.parent.id } : {}),
          lineStart: item.line,
          lineEnd: item.line,
        });
      } catch (error) {
        diagnostics.push(
          diagnostic(
            "manifest.schema",
            MANIFEST,
            manifestLine(text, item.key),
            `Manifest entry "${item.key}": ${error.message}`,
            { taskId: item.id },
          ),
        );
      }
    }
  }
  return {
    type: bugfix && !feature ? "bugfix" : feature && !bugfix ? "feature" : null,
    items,
    diagnostics,
    proposals,
  };
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
}) {
  const data = { tasks: [], ...given },
    parsed = parseSpec(spec),
    graph = lintPlan({
      text: spec.files["tasks.md"] || "",
      plan,
      data,
      proposals: parsed.proposals,
    }),
    diagnostics = [
      ...parsed.diagnostics,
      ...graph.diagnostics.map((item) => ({ file: "tasks.md", ...item })),
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
    diagnostics,
    proposals: parsed.proposals,
  };
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
  const prose = spec.files["requirements.md"] ?? spec.files["bugfix.md"] ?? "";
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
export function createSpecPlan(store, { id, prompt, context = {} }, spec) {
  requireFolder(spec);
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
      !plan.documentId?.startsWith(`.kiro/specs/${spec.name}/`)
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
// manifest entry, then the folder is stored as the next draft revision. This
// is a proposal: nothing is approved or dispatched.
export function proposeSpecWork(store, { id, proposal, expectedHash }, read) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal))
    fail("Describe one proposed task as a JSON object.");
  const { id: given, title, ...entry } = proposal;
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
  validateProposal({ ...structuredClone(entry), title });
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
    const tasks = spec.files["tasks.md"],
      manifestText = spec.files[MANIFEST];
    if (tasks === undefined || manifestText === undefined)
      fail("Add tasks.md and avoozl/manifest.json before proposing work.", 409);
    let manifest;
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      fail("Fix avoozl/manifest.json before proposing work.", 409);
    }
    if (!manifest?.tasks || typeof manifest.tasks !== "object")
      fail("Fix avoozl/manifest.json before proposing work.", 409);
    if (
      manifest.tasks[key] !== undefined ||
      specItems(plan.spec, tasks).some((item) => item.key === key)
    )
      fail("Repeated local task ID " + key);
    manifest.tasks[key] = entry;
    const directory = path.join(spec.root, SPECS_DIRECTORY, plan.spec),
      eol = tasks.includes("\r\n") ? "\r\n" : "\n",
      nextTasks =
        tasks +
        (tasks && !tasks.endsWith("\n") ? eol : "") +
        `- [ ] ${key} ${title}${eol}`;
    writeAtomically(path.join(directory, "tasks.md"), nextTasks);
    writeAtomically(
      path.join(directory, MANIFEST),
      JSON.stringify(manifest, null, 2) + "\n",
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
