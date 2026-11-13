// What a workspace's retros need from this machine (design §4.18): the
// prompt override file, the lessons store, skill files the sessions loaded,
// the workspace's traits, and the content rules at the `proposal` and
// `lesson` boundaries. Operations binds it once per store; without a
// binding (old callers, most tests) retros run as before Phase 28.
import fs from "node:fs";
import path from "node:path";
import { check as checkContent, findingText } from "./content-rules.mjs";
import { workspaceIdentity } from "./identity.mjs";
import {
  LESSONS_FILE,
  LESSON_DEFAULTS,
  Lessons,
  lessonsPath,
  packChanged,
  repositoryTraits,
  validateLessonsPack,
} from "./lessons.mjs";
import { fail } from "./store.mjs";
import {
  historicTexts,
  overridesPath,
  promptState,
  seedOverrides,
  sha256,
  shippedPrompts,
} from "./prompts.mjs";
import { readGitHubPolicyOrNull } from "./github-policy.mjs";

const bound = new WeakMap();
export const SKILL_TEXT_MAX = 8000;
export const BRIEF_SKILLS = 3;

export function bindRetroMemory(
  store,
  {
    configDirectory,
    workspaceRoot = null,
    loadPluginFolders = null,
    shipped = null,
    models = null,
  } = {},
) {
  if (!configDirectory) return null;
  const previous = bound.get(store);
  if (previous?.configDirectory === configDirectory) {
    Object.assign(previous, {
      workspaceRoot,
      loadPluginFolders,
      ...(shipped ? { shipped } : {}),
      ...(models ? { models } : {}),
    });
    return previous;
  }
  previous?.lessons.close();
  const binding = {
    configDirectory,
    workspaceRoot,
    // () => [{id, location}] of declared plugins with a folder.
    loadPluginFolders,
    shipped,
    // () => list of model IDs Kiro Crew offers, or null when unknown.
    models,
    lessons: new Lessons(lessonsPath(configDirectory)),
  };
  bound.set(store, binding);
  return binding;
}

export const retroMemory = (store) => bound.get(store) || null;

export function workspaceId(store) {
  return workspaceIdentity(store);
}

export function overridesFile(store) {
  const m = retroMemory(store);
  return m ? overridesPath(m.configDirectory, workspaceId(store)) : null;
}

// The prompts sessions get now: overrides from this workspace's file, or
// the shipped text when nothing is bound.
export function currentPrompts(store) {
  const m = retroMemory(store),
    shipped = m?.shipped || shippedPrompts();
  return promptState(m ? overridesFile(store) : null, shipped);
}

export function promptVersions(store) {
  return Object.fromEntries(
    Object.entries(currentPrompts(store)).map(([target, s]) => [
      target,
      s.version,
    ]),
  );
}

// An agent prompt's overridden sections, appended to a session's seed.
export function withSeed(store, brief, target) {
  const seed = seedOverrides(currentPrompts(store), target);
  return seed ? `${brief}\n\n${seed}` : brief;
}

// The steering text New plan writes, and the older Avoozl texts it may
// replace (design §4.18).
export function steeringOptions(store) {
  const m = retroMemory(store),
    shipped = m?.shipped || shippedPrompts(),
    text = currentPrompts(store)["steering.specs"].text;
  return {
    text,
    older: historicTexts(
      m ? overridesFile(store) : null,
      "steering.specs",
      shipped,
    ).filter((t) => t !== text),
  };
}

// Which built-in prompt a session role runs on.
export function roleTarget(role) {
  if (role === "worker") return "brief.worker";
  if (typeof role === "string" && role.startsWith("review:"))
    return "brief.review";
  if (role === "planner") return "agent.planner";
  if (role === "retro") return "agent.retro";
  return null;
}

// --------------------------------------------------------------- skills

// Either separator, so a Windows path reads the same (P42 on Windows).
const SKILL_FILE = /(?:^|[\\/])SKILL\.md$|[\\/]skills[\\/][^\\/]+\.md$/;
export const isSkillPath = (file) =>
  typeof file === "string" && SKILL_FILE.test(file);

const inside = (root, file) => {
  if (!root) return null;
  const rel = path.relative(root, file);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel)
    ? rel.split(path.sep).join("/")
    : null;
};

function pluginFolders(store) {
  const m = retroMemory(store);
  try {
    return m?.loadPluginFolders?.() || [];
  } catch {
    return [];
  }
}

// A skill file's target (design §4.18): `repo:<repository>:<path>` inside a
// registered repository or the task's worktree, `external:<plugin>:<path>`
// inside a plugin folder, else `external:local:<folder>/<file>`. The full
// path stays in this workspace's database, never in a proposal.
export function skillTarget(store, file, taskId = null) {
  if (!isSkillPath(file) || !path.isAbsolute(file)) return null;
  const projects = store.list("projects").filter((p) => p.root),
    worktree = taskId ? store.get("task_worktrees", taskId) : null;
  if (worktree?.path) {
    const rel = inside(worktree.path, file),
      project =
        projects.find((p) => p.id === worktree.projectId) ||
        projects.find((p) => worktree.path.includes(p.id));
    if (rel && project) return `repo:${project.id}:${rel}`;
  }
  for (const project of projects) {
    const rel = inside(project.root, file);
    if (rel) return `repo:${project.id}:${rel}`;
  }
  for (const { id, location } of pluginFolders(store)) {
    const rel = inside(location, file);
    if (rel) return `external:${id}:${rel}`;
  }
  const target = `external:local:${path.basename(path.dirname(file))}/${path.basename(file)}`;
  const paths = store.getMeta("skills.paths") || {};
  if (paths[target] !== file)
    store.setMeta("skills.paths", { ...paths, [target]: file });
  return target;
}

// The file a target names, read now: {text, sha256} or null.
export function skillText(store, target) {
  const [kind, owner, ...rest] = String(target).split(":"),
    rel = rest.join(":");
  let file = null;
  if (kind === "repo") {
    const project = store.get("projects", owner);
    if (project?.root) file = path.join(project.root, rel);
  } else if (kind === "external" && owner === "local") {
    file = (store.getMeta("skills.paths") || {})[target] || null;
  } else if (kind === "external") {
    const folder = pluginFolders(store).find((p) => p.id === owner);
    if (folder) file = path.join(folder.location, rel);
  }
  if (!file || !isSkillPath(file)) return null;
  try {
    const text = fs.readFileSync(file, "utf8");
    return { text, sha256: sha256(text), file };
  } catch {
    return null;
  }
}

// The hash of each skill file a session read, by target.
export function skillHashes(store, files, taskId) {
  const out = {};
  for (const file of files) {
    const target = skillTarget(store, file, taskId),
      read = target && skillText(store, target);
    if (read) out[target] = read.sha256;
  }
  return out;
}

// ---------------------------------------------------------------- traits

export function workspaceTraits(store) {
  const m = retroMemory(store);
  let mode = "local";
  try {
    mode = readGitHubPolicyOrNull(m?.workspaceRoot)?.mode || "local";
  } catch {
    mode = "local";
  }
  const traits = new Set();
  for (const project of store
    .list("projects")
    .filter((p) => p.root && !p.planning))
    for (const t of repositoryTraits(project.root, { mode })) traits.add(t);
  if (!traits.size) traits.add(`mode:${mode}`);
  return [...traits].sort();
}

// Declared checks of every repository with a checkout.
export const workspaceChecks = (store) => [
  ...new Set(
    store
      .list("projects")
      .flatMap((p) => (Array.isArray(p.checks) ? p.checks : [])),
  ),
];

// Names a lesson must not hold (R69.4): task IDs and repository names.
export function knownNames(store) {
  const data = store.read();
  return [
    ...data.tasks.map((t) => t.id),
    ...store
      .list("projects")
      .flatMap((p) => [p.id, p.github, p.github?.split("/").at(-1)]),
  ].filter((v) => typeof v === "string" && v.length > 2);
}

export const lessonSettings = (policy) => ({
  ...LESSON_DEFAULTS,
  ...(policy?.workspace?.lessons || {}),
});

// Content rules on a proposal or lesson (R68.6, R69.4): the rules that
// block it, named without the matched text, or [] when it may stand. An
// unavailable set blocks too (it fails closed).
export function contentBlocks(store, boundary, target, text) {
  const result = checkContent(store, { boundary, target, text });
  return [
    ...result.findings.filter((f) => f.action !== "report").map(findingText),
    ...result.unavailable.map((u) => `${u.set} is unavailable`),
  ];
}

export const lessonText = (l) =>
  [l.finding, l.change?.summary].filter(Boolean).join("\n");

// A plugin folder's lessons pack, checked like a written lesson and through
// this workspace's content rules (R69.7).
export function readLessonsPack(store, folder) {
  let value;
  try {
    value = JSON.parse(
      fs.readFileSync(path.join(folder.location, LESSONS_FILE), "utf8"),
    );
  } catch (error) {
    fail(
      error.code === "ENOENT"
        ? `The plugin has no ${LESSONS_FILE}.`
        : `${LESSONS_FILE} is not JSON: ${error.message}`,
      409,
    );
  }
  const pack = validateLessonsPack(value, { known: knownNames(store) });
  for (const l of pack.lessons) {
    const blocks = contentBlocks(
      store,
      "lesson",
      `pack:${folder.id}:${l.id}`,
      lessonText(l),
    );
    if (blocks.length)
      fail(
        `Lesson ${l.id} of the pack matched a content rule: ${blocks.join("; ")}.`,
        422,
      );
  }
  return pack;
}

// Each plugin's lessons pack against what was imported from it (R70.6): a
// new version marks changed lessons and retires removed ones. A pack that
// cannot be read is left for its preview to report.
export function checkPacks(store, { now = Date.now() } = {}) {
  const m = retroMemory(store);
  if (!m) return [];
  const imported = new Set(
      m.lessons
        .list()
        .map((l) => l.pack?.plugin)
        .filter(Boolean),
    ),
    changed = [];
  for (const folder of m.loadPluginFolders?.() || []) {
    if (!imported.has(folder.id) || !folder.provides?.includes("lessons"))
      continue;
    try {
      changed.push(
        ...packChanged(m.lessons, folder.id, readLessonsPack(store, folder), {
          now,
        }),
      );
    } catch {
      // Reported when a person previews the pack.
    }
  }
  return changed;
}
