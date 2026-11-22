// GitHub sources (design §4.39, Requirement 110): a GitHub repository whose
// issues may start work is one `intake.sources` entry with `via: "github"`,
// beside plugin and MCP sources.
import { fail } from "../store/store.ts";

export const GITHUB_VIA = "github";
export const GITHUB_SOURCE_KEYS = Object.freeze([
  "via",
  "repository",
  "executionRepository",
  "workspaceRepository",
  "assignee",
  "autoStart",
  "provider",
  "model",
]);
// The settings a GitHub source stands for.
export interface SourceSettings {
  repositoryId: string;
  workspaceRepositoryId?: string;
  assignee: string;
  enabled?: boolean;
  autoStart: boolean;
  provider: string | null;
  model: string | null;
}
type Json = Record<string, unknown>;

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const record = (value: unknown): value is Json =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const lower = (value: unknown) => String(value).toLowerCase();

function text(value: unknown, label: string, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === ""))
    return null;
  if (typeof value !== "string" || !value.trim())
    return fail(`${label} is required.`);
  return value.trim();
}

// The `github_repositories` settings a GitHub source stands for, in the
// shape the settings diff compares (appliedActions in repository-settings).
function settings(fields: Json, where: string): SourceSettings {
  return {
    repositoryId: String(
      text(fields.repositoryId, `${where} execution repository`),
    ),
    ...(fields.workspaceRepositoryId &&
    fields.workspaceRepositoryId !== fields.repositoryId
      ? {
          workspaceRepositoryId: String(
            text(fields.workspaceRepositoryId, `${where} workspace repository`),
          ),
        }
      : {}),
    assignee: String(text(fields.assignee, `${where} assignee`)),
    enabled: true,
    autoStart: Boolean(fields.autoStart),
    provider: text(fields.provider, `${where} provider`, { nullable: true }),
    model: text(fields.model, `${where} model`, { nullable: true }),
  };
}

// One `via: "github"` entry, checked. Returns its repository and settings.
export function validateGitHubSource(value: unknown, where: string) {
  if (!record(value)) return fail(`${where} must be an object.`);
  for (const key of Object.keys(value))
    if (!GITHUB_SOURCE_KEYS.includes(key))
      fail(`${where}.${key} is not a GitHub source setting.`);
  if (
    typeof value.repository !== "string" ||
    !REPOSITORY.test(value.repository)
  )
    return fail(`${where}.repository must be an owner/name GitHub repository.`);
  return {
    repository: value.repository,
    settings: settings(
      {
        ...value,
        repositoryId: value.executionRepository,
        workspaceRepositoryId: value.workspaceRepository,
      },
      where,
    ),
  };
}

// The source entry `settings` are written as.
function sourceEntry(repository: string, value: SourceSettings) {
  return {
    via: GITHUB_VIA,
    repository,
    executionRepository: value.repositoryId,
    ...(value.workspaceRepositoryId &&
    value.workspaceRepositoryId !== value.repositoryId
      ? { workspaceRepository: value.workspaceRepositoryId }
      : {}),
    assignee: value.assignee,
    autoStart: Boolean(value.autoStart),
    provider: value.provider || null,
    model: value.model || null,
  };
}

// `github-<owner>-<name>` in a source id's letters, unique among `taken`.
export function githubSourceId(repository: string, taken = new Set<string>()) {
  const base = `github-${lower(repository).replace(/[^a-z0-9-]+/g, "-")}`
    .replace(/-+/g, "-")
    .replace(/-$/, "")
    .slice(0, 58);
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

const sourcesOf = (value: Json | null | undefined): Json => {
  const intake = value?.intake;
  return record(intake) && record(intake.sources) ? intake.sources : {};
};

// Every GitHub source of a `.avoozl.json` value by GitHub
// repository: [{id, repository, entry, settings}]. A second source
// for one repository is left out (intake.mjs lists it with its error).
export function githubSources(value: Json | null | undefined) {
  const found = new Map<
      string,
      { id: string; entry: Json; repository: string; settings: SourceSettings }
    >(),
    taken = new Set(Object.keys(sourcesOf(value)));
  for (const [id, entry] of Object.entries(sourcesOf(value))) {
    if (!record(entry) || entry.via !== GITHUB_VIA) continue;
    const checked = validateGitHubSource(entry, `intake.sources.${id}`),
      key = lower(checked.repository);
    if (!found.has(key)) found.set(key, { id, entry, ...checked });
  }
  return [...found.values()];
}

// `upsert` (repository and settings) added or replaced and every source of `remove` (GitHub
// repositories) dropped. Changes `value` in place and returns it.
export function writeGitHubSources(
  value: Json,
  {
    upsert = null,
    remove = [],
  }: {
    upsert?: { repository: string; settings: SourceSettings } | null;
    remove?: string[];
  } = {},
) {
  const sources = { ...sourcesOf(value) };
  const drop = new Set(
    [...remove, upsert?.repository].filter(Boolean).map(lower),
  );
  let keep: string | null = null;
  for (const [id, entry] of Object.entries(sources))
    if (
      record(entry) &&
      entry.via === GITHUB_VIA &&
      drop.has(lower(entry.repository))
    ) {
      if (upsert && lower(entry.repository) === lower(upsert.repository))
        keep ??= id;
      delete sources[id];
    }
  if (upsert)
    sources[
      keep ?? githubSourceId(upsert.repository, new Set(Object.keys(sources)))
    ] = sourceEntry(upsert.repository, upsert.settings);
  const intake = record(value.intake) ? value.intake : {};
  if (Object.keys(sources).length) value.intake = { ...intake, sources };
  else if (record(value.intake)) {
    const { sources: _gone, ...rest } = intake;
    if (Object.keys(rest).length) value.intake = rest;
    else delete value.intake;
  }
  return value;
}
