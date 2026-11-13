// Retro memory across workspaces (design §4.18, Requirements 69 and 70).
// One SQLite file on this machine, under the Avoozl config folder, holds
// lessons: summaries of what a retro proposal changed and whether it helped.
// It is never written to a repository, GitHub, or a driver export. Lessons
// heal: drift marks them `stale` or `needs re-check` and the mark clears by
// itself when its cause does or fresh runs confirm the lesson. Rewriting,
// merging and retiring need a person, and no lesson is ever deleted.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { STAGES } from "./flow.mjs";
import { fail } from "./store.mjs";

export const LESSON_OUTCOMES = Object.freeze(["untested", "kept", "undone"]);
export const LESSON_STATES = Object.freeze([
  "ok",
  "stale",
  "needs re-check",
  "retired",
]);
export const CHECK_KINDS = Object.freeze([
  "test",
  "lint",
  "build",
  "typecheck",
  "format",
  "other",
]);
export const LESSON_DEFAULTS = Object.freeze({
  share: true,
  read: true,
  untestedDays: 90,
  confirmDays: 180,
  reviewEvery: 5,
});
export const LESSONS_FILE = "avoozl-lessons.json";
const MAX_FIELD = 300;
const BRIEF_LESSONS = 10;
const DAY = 24 * 3600_000;
// shortcut: fixed confidence steps; fit them to real data after P42.
const CONFIDENCE = {
  start: 0.5,
  kept: 0.8,
  step: 0.05,
  top: 0.95,
  drop: 0.2,
  low: 0.3,
};

const sha = (text) => createHash("sha256").update(String(text)).digest("hex");
const record = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

export const lessonsPath = (configDirectory) =>
  path.join(configDirectory, "lessons.sqlite");

// ------------------------------------------------------------ traits

const LANGUAGES = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  rb: "ruby",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  swift: "swift",
  zig: "zig",
  php: "php",
  scala: "scala",
};
export const BUILD_FILES = Object.freeze([
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "requirements.txt",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Makefile",
  "CMakeLists.txt",
  "Gemfile",
  "build.zig",
]);

// A repository's traits from a fixed list, so no free text leaks: up to 3
// languages by file count, build files present, GitHub mode, and CI.
export function repositoryTraits(root, { mode = "local" } = {}) {
  const traits = new Set([`mode:${mode}`]);
  let files = [];
  try {
    files = execFileSync("git", ["-C", root, "ls-files"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    try {
      files = fs.readdirSync(root);
    } catch {
      files = [];
    }
  }
  const counts = new Map();
  for (const file of files) {
    const lang = LANGUAGES[path.extname(file).slice(1).toLowerCase()];
    if (lang) counts.set(lang, (counts.get(lang) || 0) + 1);
  }
  for (const [lang] of [...counts]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 3))
    traits.add(`lang:${lang}`);
  for (const name of BUILD_FILES)
    if (fs.existsSync(path.join(root, name))) traits.add(`build:${name}`);
  if (fs.existsSync(path.join(root, ".github", "workflows")))
    traits.add("ci:github");
  return [...traits].sort();
}

export function checkKind(command) {
  const text = String(command || "").toLowerCase();
  if (/\b(lint|eslint|clippy|ruff|flake8|pylint)\b/.test(text)) return "lint";
  if (/\b(format|fmt|prettier|black)\b/.test(text)) return "format";
  if (/\b(tsc|typecheck|mypy|pyright)\b/.test(text)) return "typecheck";
  if (/\btest|pytest|jest|vitest\b/.test(text)) return "test";
  if (/\bbuild|compile|make\b/.test(text)) return "build";
  return "other";
}
export const commandTool = (command) =>
  String(command || "")
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9._-]/g, "") || null;

// ------------------------------------------------------------ validation

const URL_LIKE = /\bhttps?:\/\/|\bwww\./i;
const PATH_LIKE =
  /(?:^|[\s(`'"])(?:~|\.{1,2})?\/?[\w.-]+\/[\w./-]+|\b[\w-]+\.(?:mjs|cjs|js|jsx|ts|tsx|py|rs|go|md|json|toml|ya?ml|sh|java|kt|rb|c|h|cpp|hpp|cs|swift|zig|txt|lock)\b/i;
const NUMBER_LIKE =
  /#\d+|\b(?:pr|pull request|issue|ticket)\s*#?\d+\b|\b\d+\.\d+(?:\.\d+)*\b/i;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Why a lesson's text is not summaries only, or null (R69.4). `known` holds
// names that must not appear: task IDs, repository IDs and GitHub names.
export function lessonTextProblem(text, { known = [] } = {}) {
  if (typeof text !== "string" || !text.trim()) return "is empty";
  if (text.length > MAX_FIELD) return `is longer than ${MAX_FIELD} characters`;
  if (URL_LIKE.test(text)) return "holds a URL";
  if (PATH_LIKE.test(text)) return "holds a file path";
  if (NUMBER_LIKE.test(text))
    return "holds an issue, pull request or task number";
  for (const name of known)
    if (
      name &&
      String(name).length > 1 &&
      new RegExp(`(?:^|[^\\w-])${escape(String(name))}(?:$|[^\\w-])`, "i").test(
        text,
      )
    )
      return "holds a task ID or repository name";
  return null;
}

// Check the `lesson` a retro proposal carries: {pattern, finding}.
export function lessonProblem(lesson, { known = [] } = {}) {
  if (!record(lesson)) return "the lesson is not an object";
  const pattern = lesson.pattern;
  if (!record(pattern)) return "the lesson has no pattern";
  if (pattern.stage != null && !STAGES.includes(pattern.stage))
    return `the lesson's stage must be one of ${STAGES.join(", ")}`;
  if (pattern.check != null && !CHECK_KINDS.includes(pattern.check))
    return `the lesson's check must be one of ${CHECK_KINDS.join(", ")}`;
  if (
    pattern.tool != null &&
    !/^[a-z0-9][a-z0-9._-]{0,39}$/.test(String(pattern.tool))
  )
    return "the lesson's tool is a command's first word";
  const problem = lessonTextProblem(lesson.finding, { known });
  return problem ? `the lesson's finding ${problem}` : null;
}

// ------------------------------------------------------------ the store

export class Lessons {
  // A missing file reads as no lessons and is created on the first write.
  constructor(file) {
    this.file = file;
    this.db = null;
  }
  open(create) {
    if (this.db) return this.db;
    if (!create && !fs.existsSync(this.file)) return null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(this.file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS lessons(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    try {
      fs.chmodSync(this.file, 0o600);
    } catch {
      // A file system without modes keeps its own.
    }
    return this.db;
  }
  close() {
    this.db?.close();
    this.db = null;
  }
  list() {
    const db = this.open(false);
    if (!db) return [];
    return db
      .prepare("SELECT body FROM lessons ORDER BY id")
      .all()
      .map((r) => JSON.parse(r.body));
  }
  get(id) {
    const db = this.open(false),
      row = db?.prepare("SELECT body FROM lessons WHERE id=?").get(id);
    return row ? JSON.parse(row.body) : null;
  }
  put(lesson) {
    this.open(true)
      .prepare(
        "INSERT INTO lessons VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      )
      .run(lesson.id, JSON.stringify(lesson));
    return lesson;
  }
  getMeta(key) {
    const row = this.open(false)
      ?.prepare("SELECT value FROM meta WHERE key=?")
      .get(key);
    return row ? JSON.parse(row.value) : null;
  }
  setMeta(key, value) {
    this.open(true)
      .prepare(
        "INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
}

const iso = (now) => new Date(now).toISOString();
const history = (lesson, entry) => ({
  ...lesson,
  history: [...(lesson.history || []), entry],
});

// Write one lesson as `untested` when a person approves its proposal
// (R69.3). Returns the lesson, or {refused} when its text is not summaries
// only; the proposal stands either way.
export function writeLesson(
  lessons,
  {
    pattern,
    finding,
    change,
    evidence,
    context,
    source,
    shared = true,
    by,
    now = Date.now(),
  },
  { known = [] } = {},
) {
  const problem =
    lessonProblem({ pattern, finding }, { known }) ||
    (change?.summary
      ? (() => {
          const p = lessonTextProblem(change.summary, { known });
          return p ? `the change summary ${p}` : null;
        })()
      : null);
  if (problem) return { refused: problem };
  const date = iso(now),
    id =
      "L-" +
      sha(`${source}\0${finding}\0${JSON.stringify(change)}\0${date}`).slice(
        0,
        6,
      );
  return {
    lesson: lessons.put({
      id,
      pattern: {
        stage: pattern.stage ?? null,
        check: pattern.check ?? null,
        tool: pattern.tool ?? null,
        traits: [...(pattern.traits || [])].sort(),
      },
      finding,
      change,
      outcome: "untested",
      evidence,
      context,
      confidence: CONFIDENCE.start,
      confirmedAt: null,
      state: "ok",
      marks: {},
      staleReason: null,
      source,
      shared,
      readOnly: false,
      date,
      history: [{ at: date, by, what: "written", outcome: "untested" }],
    }),
  };
}

// The PDCA result for a lesson's change (R69.3): helped keeps it; a revert
// approved after it did not help undoes it.
export function setOutcome(
  lessons,
  id,
  outcome,
  { now = Date.now(), after = null, by = "pdca" } = {},
) {
  const lesson = lessons.get(id);
  if (!lesson || lesson.readOnly) return null;
  const next = history(
    {
      ...lesson,
      outcome,
      evidence:
        after === null ? lesson.evidence : { ...lesson.evidence, after },
      confidence:
        outcome === "kept"
          ? Math.max(lesson.confidence, CONFIDENCE.kept)
          : lesson.confidence,
      confirmedAt: outcome === "kept" ? iso(now) : lesson.confirmedAt,
    },
    { at: iso(now), by, what: "outcome", outcome },
  );
  return lessons.put(withState(next));
}

// ------------------------------------------------------------ healing

function withState(lesson) {
  const marks = Object.values(lesson.marks || {});
  const state =
    lesson.state === "retired"
      ? "retired"
      : marks.some((m) => m.state === "stale")
        ? "stale"
        : marks.length
          ? "needs re-check"
          : "ok";
  return {
    ...lesson,
    state,
    staleReason:
      state === "retired"
        ? lesson.staleReason
        : marks.map((m) => m.reason).join("; ") || null,
  };
}

// Set the marks a lesson should carry now; record each one added or
// cleared in its history. `sticky` causes clear only on confirmation.
function remark(lesson, wanted, { now, sticky = ["pdca", "pack"] }) {
  const marks = { ...(lesson.marks || {}) },
    at = iso(now);
  let next = lesson;
  for (const [cause, mark] of Object.entries(wanted))
    if (!marks[cause] || marks[cause].reason !== mark.reason) {
      marks[cause] = { ...mark, at };
      next = history(next, {
        at,
        by: "avoozl",
        what: "marked",
        state: mark.state,
        reason: mark.reason,
      });
    }
  for (const cause of Object.keys(marks))
    if (!wanted[cause] && !sticky.includes(cause)) {
      next = history(next, {
        at,
        by: "avoozl",
        what: "cleared",
        reason: marks[cause].reason,
      });
      delete marks[cause];
    }
  return withState({ ...next, marks });
}

const expired = (lesson, untestedDays, now) =>
  lesson.outcome === "untested" &&
  !lesson.readOnly &&
  Date.parse(lesson.date) + untestedDays * DAY < now;

// Drift checks (R70.2, R70.3), run at each retrospective and when lessons
// are read. `env` describes this workspace now: {workspaceId, models (Kiro
// Crew's list, or null when unknown), versions (target → version), checks
// and tools of matching repositories, traits}. Context checks apply to this
// workspace's own lessons and imported packs; the model list and the
// confirmation age apply to all. Writes only a lesson whose marks changed.
export function healLessons(
  lessons,
  env,
  { now = Date.now(), confirmDays = LESSON_DEFAULTS.confirmDays } = {},
) {
  const changed = [];
  for (const lesson of lessons.list()) {
    if (lesson.state === "retired") continue;
    const own = lesson.source === env.workspaceId || lesson.readOnly,
      context = lesson.context || {},
      wanted = {};
    if (Array.isArray(env.models))
      for (const model of context.models || [])
        if (model && model !== "auto" && !env.models.includes(model))
          wanted[`model:${model}`] = {
            state: "needs re-check",
            reason: `model ${model} is no longer listed`,
          };
    if (own) {
      for (const [target, version] of Object.entries(context.versions || {}))
        if (env.versions?.[target] && env.versions[target] !== version)
          wanted[`version:${target}`] = {
            state: "needs re-check",
            reason: `${target} changed from ${version} to ${env.versions[target]}`,
          };
      if (Array.isArray(env.checks))
        for (const check of context.checks || [])
          if (!env.checks.includes(check))
            wanted[`check:${check}`] = {
              state: "stale",
              reason: `check \`${check}\` was removed`,
            };
      if (Array.isArray(env.tools))
        for (const tool of context.tools || [])
          if (!env.tools.includes(tool))
            wanted[`tool:${tool}`] = {
              state: "stale",
              reason: `tool ${tool} is no longer used`,
            };
      if (
        Array.isArray(env.traits) &&
        Array.isArray(context.traits) &&
        context.traits.join(",") !== [...env.traits].sort().join(",")
      )
        wanted.traits = {
          state: "needs re-check",
          reason: "the repositories' traits changed",
        };
    }
    const since = Date.parse(lesson.confirmedAt || lesson.date);
    if (lesson.outcome === "kept" && since + confirmDays * DAY < now)
      wanted.age = {
        state: "stale",
        reason: `not confirmed in ${confirmDays} days`,
      };
    if (lesson.confidence < CONFIDENCE.low)
      wanted.confidence = {
        state: "needs re-check",
        reason: `confidence ${lesson.confidence.toFixed(2)} is low`,
      };
    // A pack lesson's version mark stays until the pack is imported again.
    if (lesson.marks?.pack) wanted.pack = lesson.marks.pack;
    if (lesson.marks?.pdca) wanted.pdca = lesson.marks.pdca;
    const next = remark(lesson, wanted, { now });
    if (JSON.stringify(next.marks) !== JSON.stringify(lesson.marks || {})) {
      lessons.put(next);
      changed.push(next.id);
    }
  }
  return changed;
}

// A fresh window confirms a lesson (R70.3): confidence up one step, the
// context refreshed to what ran, and every mark cleared.
export function confirmLesson(
  lessons,
  id,
  { now = Date.now(), context = null } = {},
) {
  const lesson = lessons.get(id);
  if (!lesson || lesson.state === "retired") return null;
  const at = iso(now);
  let next = history(
    {
      ...lesson,
      confidence: Math.min(
        CONFIDENCE.top,
        Math.round((lesson.confidence + CONFIDENCE.step) * 100) / 100,
      ),
      confirmedAt: at,
      context: context ? { ...lesson.context, ...context } : lesson.context,
    },
    { at, by: "pdca", what: "confirmed" },
  );
  for (const mark of Object.values(next.marks || {}))
    next = history(next, {
      at,
      by: "pdca",
      what: "cleared",
      reason: mark.reason,
    });
  return lessons.put(withState({ ...next, marks: {} }));
}

// A newer PDCA result for the same pattern and change disagrees (R70.2).
export function disagree(lessons, id, { now = Date.now(), reason }) {
  const lesson = lessons.get(id);
  if (!lesson || lesson.state === "retired") return null;
  const at = iso(now),
    next = history(
      {
        ...lesson,
        confidence: Math.max(
          0,
          Math.round((lesson.confidence - CONFIDENCE.drop) * 100) / 100,
        ),
        marks: {
          ...(lesson.marks || {}),
          pdca: { state: "needs re-check", reason, at },
        },
      },
      { at, by: "pdca", what: "marked", state: "needs re-check", reason },
    );
  return lessons.put(withState(next));
}

const sameChange = (a, b) =>
  a?.type === b?.type &&
  a?.target === b?.target &&
  (a?.key ?? null) === (b?.key ?? null);
const samePattern = (a, b) =>
  (a?.stage ?? null) === (b?.stage ?? null) &&
  (a?.check ?? null) === (b?.check ?? null) &&
  (a?.tool ?? null) === (b?.tool ?? null);

// Lessons a PDCA result for `lesson` disagrees with: same pattern and change,
// another lesson, and the other outcome.
export function contradicted(lessons, lesson, outcome) {
  return lessons
    .list()
    .filter(
      (l) =>
        l.id !== lesson.id &&
        l.state !== "retired" &&
        l.outcome !== "untested" &&
        l.outcome !== outcome &&
        samePattern(l.pattern, lesson.pattern) &&
        sameChange(l.change, lesson.change),
    );
}

// ------------------------------------------------------------ reading

const visible = (lesson, { workspaceId, read }) =>
  lesson.source === workspaceId || (read && lesson.shared !== false);

const matches = (lesson, { traits, stage }) =>
  (!stage || !lesson.pattern?.stage || lesson.pattern.stage === stage) &&
  (!lesson.pattern?.traits?.length ||
    !traits?.length ||
    lesson.pattern.traits.some((t) => traits.includes(t)));

export const briefLesson = (l) => ({
  id: l.id,
  pattern: {
    stage: l.pattern.stage,
    check: l.pattern.check,
    tool: l.pattern.tool,
  },
  finding: l.finding,
  change: {
    type: l.change?.type ?? null,
    target: l.change?.target ?? null,
    summary: l.change?.summary ?? null,
  },
  outcome: l.outcome,
  confidence: l.confidence,
  evidence: {
    tasks: l.evidence?.tasks ?? null,
    metric: l.evidence?.metric ?? null,
    before: l.evidence?.before ?? null,
    after: l.evidence?.after ?? null,
  },
});

// A retro brief's lessons (R69.5): up to 10 citable ones that match this
// workspace's traits and stage, ranked kept first, then confidence, then
// evidence, then date; and a "did not work" list of undone, retired and
// expired ones. `allow(lesson)` runs the reading workspace's content rules.
export function lessonsForBrief(
  lessons,
  {
    workspaceId,
    traits = [],
    stage = null,
    read = true,
    untestedDays = LESSON_DEFAULTS.untestedDays,
    allow = () => true,
    now = Date.now(),
  },
) {
  const pool = lessons
      .list()
      .filter(
        (l) =>
          visible(l, { workspaceId, read }) && matches(l, { traits, stage }),
      )
      .filter((l) => allow(l)),
    didNotWork = pool.filter(
      (l) =>
        l.outcome === "undone" ||
        l.state === "retired" ||
        expired(l, untestedDays, now),
    ),
    citable = pool
      .filter((l) => !didNotWork.includes(l) && l.state === "ok")
      .sort(
        (a, b) =>
          (b.outcome === "kept") - (a.outcome === "kept") ||
          b.confidence - a.confidence ||
          (b.evidence?.tasks || 0) - (a.evidence?.tasks || 0) ||
          (a.date < b.date ? 1 : -1),
      )
      .slice(0, BRIEF_LESSONS);
  return {
    lessons: citable.map(briefLesson),
    didNotWork: didNotWork.slice(0, BRIEF_LESSONS).map((l) => ({
      id: l.id,
      finding: l.finding,
      change: briefLesson(l).change,
      why:
        l.state === "retired"
          ? "retired"
          : l.outcome === "undone"
            ? "undone"
            : "expired untested",
    })),
  };
}

// The lessons review (R70.4): marked lessons and lessons that share a
// pattern and change, for a retro that may propose rewrites, merges and
// retirements.
export function reviewLessons(lessons, { workspaceId, read = true }) {
  const pool = lessons
      .list()
      .filter(
        (l) =>
          l.state !== "retired" &&
          visible(l, { workspaceId, read }) &&
          !l.readOnly,
      ),
    marked = pool.filter((l) => l.state !== "ok"),
    similar = pool.filter((l) =>
      pool.some(
        (o) =>
          o.id !== l.id &&
          samePattern(o.pattern, l.pattern) &&
          sameChange(o.change, l.change),
      ),
    );
  return [...new Set([...marked, ...similar])].slice(0, 20).map((l) => ({
    ...briefLesson(l),
    state: l.state,
    staleReason: l.staleReason,
  }));
}

// ------------------------------------------------------------ person edits

// A person's rewrite, merge or retire (R70.4). Never a delete: a merged-away
// or retired lesson stays as history and counts as "did not work".
export function editLesson(
  lessons,
  edit,
  { by, now = Date.now(), known = [] },
) {
  const at = iso(now),
    ids = Array.isArray(edit.lessons) ? edit.lessons : [],
    found = ids.map((id) => lessons.get(id));
  if (!ids.length || found.some((l) => !l))
    fail("Name lessons that exist.", 404);
  if (found.some((l) => l.readOnly))
    fail(
      "A lesson from a plugin pack is read-only; change the pack instead.",
      409,
    );
  if (edit.kind === "rewrite") {
    const problem = lessonTextProblem(edit.finding, { known });
    if (problem) fail(`The new finding ${problem}.`, 400);
    const l = found[0];
    return [
      lessons.put(
        history(
          { ...l, finding: edit.finding },
          { at, by, what: "rewritten", from: l.finding },
        ),
      ),
    ];
  }
  if (edit.kind === "merge") {
    if (ids.length < 2)
      fail("A merge names the lesson to keep, then the others.", 400);
    const [keep, ...away] = found;
    if (edit.finding !== undefined) {
      const problem = lessonTextProblem(edit.finding, { known });
      if (problem) fail(`The merged finding ${problem}.`, 400);
    }
    const kept = lessons.put(
      history(
        {
          ...keep,
          finding: edit.finding ?? keep.finding,
          evidence: {
            ...keep.evidence,
            tasks: away.reduce(
              (n, l) => n + (l.evidence?.tasks || 0),
              keep.evidence?.tasks || 0,
            ),
          },
        },
        { at, by, what: "merged", from: away.map((l) => l.id) },
      ),
    );
    const gone = away.map((l) =>
      lessons.put(
        withState(
          history(
            {
              ...l,
              state: "retired",
              staleReason: `merged into ${keep.id}`,
              mergedInto: keep.id,
            },
            { at, by, what: "retired", reason: `merged into ${keep.id}` },
          ),
        ),
      ),
    );
    return [kept, ...gone];
  }
  if (edit.kind === "retire") {
    const reason =
      typeof edit.reason === "string" && edit.reason.trim()
        ? edit.reason.trim().slice(0, 300)
        : "retired by a person";
    return found.map((l) =>
      lessons.put(
        withState(
          history(
            { ...l, state: "retired", staleReason: reason },
            { at, by, what: "retired", reason },
          ),
        ),
      ),
    );
  }
  fail("Choose rewrite, merge or retire.", 400);
}

// ------------------------------------------------------------ packs

// A plugin's lessons pack: {version, lessons: [{id, pattern, finding,
// change, outcome, evidence}]}, each checked like a written lesson.
export function validateLessonsPack(value, { known = [] } = {}) {
  if (!record(value)) fail(`${LESSONS_FILE} must be an object.`, 400);
  if (
    typeof value.version !== "string" ||
    !/^[0-9A-Za-z.+-]{1,40}$/.test(value.version)
  )
    fail(`${LESSONS_FILE} needs a version.`, 400);
  if (!Array.isArray(value.lessons) || value.lessons.length > 200)
    fail(`${LESSONS_FILE} lessons must be a list of at most 200.`, 400);
  const seen = new Set();
  return {
    version: value.version,
    lessons: value.lessons.map((l, i) => {
      if (
        !record(l) ||
        typeof l.id !== "string" ||
        !/^[a-z0-9][a-z0-9-]{0,39}$/.test(l.id) ||
        seen.has(l.id)
      )
        fail(`lessons[${i}] needs a unique lowercase id.`, 400);
      seen.add(l.id);
      const problem = lessonProblem(l, { known });
      if (problem) fail(`lessons[${i}]: ${problem}.`, 400);
      const summary = l.change?.summary;
      if (summary !== undefined && lessonTextProblem(summary, { known }))
        fail(
          `lessons[${i}]: the change summary ${lessonTextProblem(summary, { known })}.`,
          400,
        );
      return {
        id: l.id,
        pattern: {
          stage: l.pattern.stage ?? null,
          check: l.pattern.check ?? null,
          tool: l.pattern.tool ?? null,
          traits: Array.isArray(l.pattern.traits)
            ? l.pattern.traits
                .filter(
                  (t) =>
                    typeof t === "string" && /^[a-z]+:[\w.+-]{1,40}$/.test(t),
                )
                .sort()
            : [],
        },
        finding: l.finding,
        change: {
          type: ["settings", "plan", "prompt", "skill"].includes(l.change?.type)
            ? l.change.type
            : null,
          target:
            typeof l.change?.target === "string"
              ? l.change.target.slice(0, 100)
              : null,
          summary: summary ?? null,
        },
        outcome: LESSON_OUTCOMES.includes(l.outcome) ? l.outcome : "untested",
        evidence: record(l.evidence)
          ? {
              tasks: Number.isInteger(l.evidence.tasks)
                ? l.evidence.tasks
                : null,
              metric:
                typeof l.evidence.metric === "string"
                  ? l.evidence.metric.slice(0, 40)
                  : null,
              before:
                typeof l.evidence.before === "number"
                  ? l.evidence.before
                  : null,
              after:
                typeof l.evidence.after === "number" ? l.evidence.after : null,
            }
          : {},
      };
    }),
  };
}

export const packHash = (plugin, pack) =>
  sha(JSON.stringify({ plugin, ...pack }));
const packLessonId = (plugin, id) =>
  "L-" + sha(`pack\0${plugin}\0${id}`).slice(0, 6);
const contentOf = (l) =>
  sha(JSON.stringify([l.pattern, l.finding, l.change, l.outcome, l.evidence]));

// What importing `pack` from `plugin` would add, change and retire.
export function packPreview(lessons, plugin, pack) {
  const current = lessons.list().filter((l) => l.pack?.plugin === plugin),
    rows = pack.lessons.map((l) => {
      const id = packLessonId(plugin, l.id),
        old = current.find((c) => c.id === id);
      return {
        id,
        packId: l.id,
        finding: l.finding,
        outcome: l.outcome,
        action: !old
          ? "add"
          : old.pack.content !== contentOf(l)
            ? "change"
            : "keep",
      };
    }),
    removed = current
      .filter(
        (c) =>
          c.state !== "retired" &&
          !pack.lessons.some((l) => packLessonId(plugin, l.id) === c.id),
      )
      .map((c) => ({
        id: c.id,
        packId: c.pack.id,
        finding: c.finding,
        action: "retire",
      }));
  return {
    plugin,
    version: pack.version,
    rows: [...rows, ...removed],
    hash: packHash(plugin, pack),
  };
}

// Import a pack a person previewed (R69.7): read-only lessons named by the
// plugin and its version.
export function importPack(lessons, plugin, pack, { by, now = Date.now() }) {
  const at = iso(now),
    source = `pack:${plugin}@${pack.version}`;
  for (const l of pack.lessons) {
    const id = packLessonId(plugin, l.id),
      old = lessons.get(id),
      content = contentOf(l),
      base =
        old && old.pack.content === content
          ? old
          : {
              ...(old || {
                history: [],
                marks: {},
                confidence: CONFIDENCE.start,
                confirmedAt: null,
              }),
              id,
              pattern: l.pattern,
              finding: l.finding,
              change: l.change,
              outcome: l.outcome,
              evidence: l.evidence,
              context: old?.context || {},
              confidence:
                l.outcome === "kept"
                  ? Math.max(old?.confidence ?? 0, CONFIDENCE.kept)
                  : (old?.confidence ?? CONFIDENCE.start),
              date: old?.date || at,
            };
    const marks = { ...(base.marks || {}) };
    delete marks.pack;
    lessons.put(
      withState(
        history(
          {
            ...base,
            marks,
            source,
            shared: true,
            readOnly: true,
            state: base.state === "retired" ? "ok" : base.state,
            pack: { plugin, id: l.id, version: pack.version, content },
          },
          {
            at,
            by,
            what: old ? "imported again" : "imported",
            version: pack.version,
          },
        ),
      ),
    );
  }
  for (const c of lessons
    .list()
    .filter((x) => x.pack?.plugin === plugin && x.state !== "retired"))
    if (!pack.lessons.some((l) => packLessonId(plugin, l.id) === c.id))
      retireRemoved(lessons, c, pack.version, at);
  return packPreview(lessons, plugin, pack);
}

function retireRemoved(lessons, lesson, version, at) {
  const reason = `removed from the ${lesson.pack.plugin} pack in version ${version}`;
  lessons.put(
    withState(
      history(
        { ...lesson, state: "retired", staleReason: reason },
        { at, by: "avoozl", what: "retired", reason },
      ),
    ),
  );
}

// A plugin's pack changed version (R70.6): changed lessons need a re-check
// until it is imported; removed ones are retired with that reason.
export function packChanged(lessons, plugin, pack, { now = Date.now() } = {}) {
  const at = iso(now),
    out = [];
  for (const lesson of lessons
    .list()
    .filter((l) => l.pack?.plugin === plugin && l.state !== "retired")) {
    if (lesson.pack.version === pack.version) continue;
    const next = pack.lessons.find(
      (l) => packLessonId(plugin, l.id) === lesson.id,
    );
    if (!next) {
      retireRemoved(lessons, lesson, pack.version, at);
      out.push(lesson.id);
    } else if (contentOf(next) !== lesson.pack.content && !lesson.marks?.pack) {
      const reason = `the ${plugin} pack version ${pack.version} changed it; import the pack to use it`;
      lessons.put(
        withState(
          history(
            {
              ...lesson,
              marks: {
                ...(lesson.marks || {}),
                pack: { state: "needs re-check", reason, at },
              },
            },
            {
              at,
              by: "avoozl",
              what: "marked",
              state: "needs re-check",
              reason,
            },
          ),
        ),
      );
      out.push(lesson.id);
    }
  }
  return out;
}

// The pack file a person exports (R69.8): the same shape a plugin ships.
export function exportPack(lessons, { workspaceId }) {
  return {
    version: new Date().toISOString().slice(0, 10),
    lessons: lessons
      .list()
      .filter(
        (l) =>
          !l.readOnly &&
          l.state !== "retired" &&
          (l.source === workspaceId || l.shared !== false),
      )
      .map((l) => ({
        id: l.id.toLowerCase(),
        pattern: l.pattern,
        finding: l.finding,
        change: {
          type: l.change?.type ?? null,
          target: l.change?.target ?? null,
          summary: l.change?.summary ?? null,
        },
        outcome: l.outcome,
        evidence: briefLesson(l).evidence,
      })),
  };
}
