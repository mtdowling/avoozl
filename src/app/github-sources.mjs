// GitHub sources (design §4.39, Requirement 110): a GitHub repository whose
// issues may start work is one `intake.sources` entry with `via: "github"`,
// beside plugin and MCP sources. It holds what `github.issueIntake` held.
//
// Old files still load: each `github.issueIntake` entry reads as the source
// it describes, and `github.queue` is ignored (it never let anyone start
// work). The settings writer moves old entries into `intake.sources` on its
// first write and drops both old keys; nothing writes them after that.
import { fail } from "./store.mjs";

export const GITHUB_VIA = "github";
export const GITHUB_SOURCE_KEYS = Object.freeze([
  "via",
  "repository",
  "project",
  "workspaceRepository",
  "label",
  "managedLabel",
  "assignee",
  "autoStart",
  "provider",
  "model",
  "allowedActors",
  "minimumPermission",
]);
const PERMISSIONS = ["write", "maintain", "admin"];
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export const ISSUE_INTAKE_KEYS = Object.freeze([
  "projectId",
  "workspaceRepositoryId",
  "assignee",
  "label",
  "managedLabel",
  "enabled",
  "autoStart",
  "provider",
  "model",
  "allowedActors",
  "minimumPermission",
]);
const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const lower = (value) => String(value).toLowerCase();

function text(value, label, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === ""))
    return null;
  if (typeof value !== "string" || !value.trim()) fail(`${label} is required.`);
  return value.trim();
}

function actors(value, where) {
  const list = value ?? [];
  if (
    !Array.isArray(list) ||
    list.some((actor) => typeof actor !== "string" || !actor.trim())
  )
    fail(`${where} allowedActors must be names.`);
  return [...new Set(list.map((actor) => actor.trim()))].sort();
}

function permission(value, where) {
  const chosen = value || "write";
  if (!PERMISSIONS.includes(chosen))
    fail(`${where} minimumPermission must be write, maintain or admin.`);
  return chosen;
}

// The `github_repositories` settings a GitHub source stands for, in the
// shape the settings diff compares (appliedActions in repository-settings).
function settings(fields, where) {
  return {
    projectId: text(fields.projectId, `${where} project`),
    ...(fields.workspaceRepositoryId &&
    fields.workspaceRepositoryId !== fields.projectId
      ? {
          workspaceRepositoryId: text(
            fields.workspaceRepositoryId,
            `${where} workspace repository`,
          ),
        }
      : {}),
    assignee: text(fields.assignee, `${where} assignee`),
    label: text(fields.label || "avoozl:ready", `${where} label`),
    managedLabel: text(
      fields.managedLabel || "avoozl:managed",
      `${where} managed label`,
    ),
    enabled: true,
    autoStart: Boolean(fields.autoStart),
    provider: text(fields.provider, `${where} provider`, { nullable: true }),
    model: text(fields.model, `${where} model`, { nullable: true }),
    allowedActors: actors(fields.allowedActors, where),
    minimumPermission: permission(fields.minimumPermission, where),
  };
}

// One `via: "github"` entry, checked. Returns its repository and settings.
export function validateGitHubSource(value, where) {
  if (!record(value)) fail(`${where} must be an object.`);
  for (const key of Object.keys(value))
    if (!GITHUB_SOURCE_KEYS.includes(key))
      fail(`${where}.${key} is not a GitHub source setting.`);
  if (typeof value.repository !== "string" || !REPOSITORY.test(value.repository))
    fail(`${where}.repository must be an owner/name GitHub repository.`);
  return {
    repository: value.repository,
    settings: settings(
      {
        ...value,
        projectId: value.project,
        workspaceRepositoryId: value.workspaceRepository,
      },
      where,
    ),
  };
}

// An old `github.issueIntake` entry, checked as before; null when disabled.
function legacySettings(value, repository) {
  const where = `GitHub issue intake ${repository}`;
  if (!record(value)) fail(`${where} must contain a JSON object.`);
  for (const key of Object.keys(value))
    if (!ISSUE_INTAKE_KEYS.includes(key))
      fail(`Unknown GitHub issue intake setting ${repository}.${key}.`);
  const checked = settings(value, where);
  return value.enabled === false ? null : checked;
}

// The source entry `settings` are written as.
export function sourceEntry(repository, value) {
  return {
    via: GITHUB_VIA,
    repository,
    project: value.projectId,
    ...(value.workspaceRepositoryId &&
    value.workspaceRepositoryId !== value.projectId
      ? { workspaceRepository: value.workspaceRepositoryId }
      : {}),
    label: value.label || "avoozl:ready",
    ...(value.managedLabel && value.managedLabel !== "avoozl:managed"
      ? { managedLabel: value.managedLabel }
      : {}),
    assignee: value.assignee,
    autoStart: Boolean(value.autoStart),
    provider: value.provider || null,
    model: value.model || null,
    allowedActors: [...new Set(value.allowedActors || [])].sort(),
    minimumPermission: value.minimumPermission || "write",
  };
}

// `github-<owner>-<name>` in a source id's letters, unique among `taken`.
export function githubSourceId(repository, taken = new Set()) {
  const base = `github-${lower(repository).replace(/[^a-z0-9-]+/g, "-")}`
    .replace(/-+/g, "-")
    .replace(/-$/, "")
    .slice(0, 58);
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

const sourcesOf = (value) =>
  record(value?.intake) && record(value.intake.sources)
    ? value.intake.sources
    : {};

// Every GitHub source of a `.avoozl.json` value, declared or old, by GitHub
// repository: [{id, repository, entry, settings, legacy}]. A second source
// for one repository is left out (intake.mjs lists it with its error).
export function githubSources(value) {
  const found = new Map(),
    taken = new Set(Object.keys(sourcesOf(value)));
  for (const [id, entry] of Object.entries(sourcesOf(value))) {
    if (entry?.via !== GITHUB_VIA) continue;
    const checked = validateGitHubSource(entry, `intake.sources.${id}`),
      key = lower(checked.repository);
    if (!found.has(key))
      found.set(key, { id, entry, legacy: false, ...checked });
  }
  const legacy = record(value?.github) ? value.github.issueIntake : undefined;
  if (legacy !== undefined && !record(legacy))
    fail("GitHub issue intake must contain a JSON object.");
  for (const [repository, old] of Object.entries(legacy || {})) {
    if (!REPOSITORY.test(repository))
      fail("GitHub issue intake must be an owner/repository name.");
    const checked = legacySettings(old, repository);
    if (!checked || found.has(lower(repository))) continue;
    const id = githubSourceId(repository, taken);
    taken.add(id);
    found.set(lower(repository), {
      id,
      repository,
      settings: checked,
      entry: sourceEntry(repository, checked),
      legacy: true,
    });
  }
  return [...found.values()];
}

// The old keys moved into `intake.sources`, then `upsert` (repository and
// settings) added or replaced and every source of `remove` (GitHub
// repositories) dropped. Changes `value` in place and returns it.
export function writeGitHubSources(value, { upsert = null, remove = [] } = {}) {
  const moved = githubSources(value).filter((source) => source.legacy),
    sources = { ...sourcesOf(value) };
  for (const source of moved) sources[source.id] = source.entry;
  if (record(value.github)) {
    delete value.github.issueIntake;
    delete value.github.queue;
    if (!Object.keys(value.github).length) delete value.github;
  }
  const drop = new Set(
    [...remove, upsert?.repository].filter(Boolean).map(lower),
  );
  let keep = null;
  for (const [id, entry] of Object.entries(sources))
    if (entry?.via === GITHUB_VIA && drop.has(lower(entry.repository))) {
      if (upsert && lower(entry.repository) === lower(upsert.repository))
        keep ??= id;
      delete sources[id];
    }
  if (upsert)
    sources[keep ?? githubSourceId(upsert.repository, new Set(Object.keys(sources)))] =
      sourceEntry(upsert.repository, upsert.settings);
  const intake = record(value.intake) ? value.intake : {};
  if (Object.keys(sources).length) value.intake = { ...intake, sources };
  else if (record(value.intake)) {
    const { sources: _gone, ...rest } = intake;
    if (Object.keys(rest).length) value.intake = rest;
    else delete value.intake;
  }
  return value;
}
