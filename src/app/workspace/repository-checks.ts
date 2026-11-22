// A repository's checks: the only checks there are. A repository's `checks`
// maps a name to an argv array, or to {run: argv, paths: [glob, ...]}; a
// check with paths runs only for a change that touches one of them. Tasks
// never name checks. An older setting, a list of argv arrays, still loads:
// each check is named by its argv joined with spaces and has no paths.
import { fail } from "../store/store.ts";
import { matchesPath } from "../delivery/verify.ts";

export const CHECK_NAME = /^[a-z][a-z0-9-]{0,39}$/;
// The keys of a check written as an object. A test holds the config schema
// to this list.
export const CHECK_KEYS = Object.freeze(["run", "paths"]);
const MAX_CHECKS = 50;
const MAX_PATHS = 50;

// The part of a repository record its checks come from.
interface CheckedRepository {
  id?: string;
  github?: string | null;
  checks?: unknown;
}

// One check a change runs. A plugin check carries more (its step, MCP
// mapping, environment and so on), which its runners read.
export interface RepositoryCheck {
  name: string;
  argv: string[];
  paths: string[] | null;
  source: string;
  stage: string;
  // A plugin check's plugin (see PluginCheck).
  plugin?: { id: string; [key: string]: unknown };
  [key: string]: unknown;
}

// An approved plugin check, as approvedPluginChecks makes it.
export interface PluginCheck extends RepositoryCheck {
  repos: string[];
  plugin: { id: string; [key: string]: unknown };
}

// A check result or a declared check, keyed by name or by its command.
interface Keyed {
  name?: string;
  command?: string;
}

const isArgv = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((part) => typeof part === "string" && part.length > 0);

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// The stored setting after validation, as given. `label` names it in errors.
export function checksSetting(value: unknown, label = "checks") {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    if (!value.every(isArgv))
      fail(`${label} must be arrays of command arguments.`);
    return structuredClone(value);
  }
  if (!record(value))
    fail(`${label} must map a check name to its command arguments.`);
  const names = Object.keys(value);
  if (names.length > MAX_CHECKS)
    fail(`${label} holds at most ${MAX_CHECKS} checks.`);
  for (const name of names) {
    if (!CHECK_NAME.test(name))
      fail(
        `${label}: "${name}" is not a check name. Use lowercase letters, digits and dashes, starting with a letter, at most 40 characters.`,
      );
    const entry = value[name];
    if (isArgv(entry)) continue;
    if (!record(entry) || !isArgv(entry.run))
      fail(
        `${label}.${name} must be command arguments, or {"run": [command arguments], "paths": [globs]}.`,
      );
    for (const key of Object.keys(entry))
      if (!CHECK_KEYS.includes(key))
        fail(`Unknown check setting ${label}.${name}.${key}.`);
    if (
      entry.paths !== undefined &&
      (!Array.isArray(entry.paths) ||
        entry.paths.length > MAX_PATHS ||
        entry.paths.some(
          (glob) =>
            typeof glob !== "string" || !glob.trim() || glob.length > 200,
        ))
    )
      fail(
        `${label}.${name}.paths must be at most ${MAX_PATHS} path globs of 1 to 200 characters.`,
      );
  }
  return structuredClone(value);
}

// The repository's own checks as [{name, argv, paths}], in written order.
// `paths` is null for a check that runs on every change.
function ownChecks(
  repository: CheckedRepository | null | undefined,
): RepositoryCheck[] {
  const value = repository?.checks,
    own = (
      name: string,
      argv: string[],
      paths: string[] | null = null,
    ): RepositoryCheck => ({
      name,
      argv: [...argv],
      paths,
      source: "repository",
      stage: "task",
    });
  if (Array.isArray(value))
    return value.filter(isArgv).map((argv) => own(argv.join(" "), argv));
  if (!record(value)) return [];
  return Object.entries(value).flatMap(([name, entry]) => {
    if (isArgv(entry)) return [own(name, entry)];
    if (!record(entry) || !isArgv(entry.run)) return [];
    const paths = entry.paths as string[] | undefined;
    return [own(name, entry.run, paths?.length ? [...paths] : null)];
  });
}

// The name a plugin check's `repos` globs match: owner/name, else the ID.
export const repositoryName = (
  repository: CheckedRepository | null | undefined,
) => String(repository?.github || repository?.id || "").toLowerCase();

const appliesTo = (
  check: Pick<PluginCheck, "repos">,
  repository: CheckedRepository | null | undefined,
) =>
  check.repos.some((glob) =>
    matchesPath(glob.toLowerCase(), repositoryName(repository)),
  );

// Plugin checks against one repository (plugin-checks D3, PK2.3, PK2.4):
// those whose `repos` match, minus a name the repository's own checks
// use (shadowed) and a name two plugins define (a clash, both held).
export function pluginCheckConflicts<
  C extends Pick<PluginCheck, "name" | "repos" | "plugin">,
>(repository: CheckedRepository | null | undefined, plugins: C[] = []) {
  const names = new Set(ownChecks(repository).map((check) => check.name)),
    mine = plugins.filter((check) => appliesTo(check, repository)),
    owners = new Map<string, C[]>();
  for (const check of mine)
    owners.set(check.name, [...(owners.get(check.name) ?? []), check]);
  return {
    kept: mine.filter(
      (check) => !names.has(check.name) && owners.get(check.name)?.length === 1,
    ),
    shadowed: mine
      .filter((check) => names.has(check.name))
      .map((check) => ({ name: check.name, plugin: check.plugin.id })),
    clashes: [...owners]
      .filter(([name, list]) => list.length > 1 && !names.has(name))
      .map(([name, list]) => ({
        name,
        plugins: list.map((check) => check.plugin.id),
      })),
  };
}

// Every check of a repository (plugin-checks D3): its own, as written,
// then the approved plugin checks (`plugins`, approvedPluginChecks) that
// apply to it, by plugin id and name. Each entry names its `source` and
// `stage`. Every caller passes the plugin list; a caller that runs only
// the repository's own commands says so with an empty list.
export function repositoryChecks(
  repository: CheckedRepository | null | undefined,
  plugins?: PluginCheck[] | null,
): RepositoryCheck[] {
  return [
    ...ownChecks(repository),
    ...pluginCheckConflicts(repository, plugins ?? []).kept,
  ];
}

// Whether a check runs for a change that touches `files`: one without
// paths always does; one with paths when a file matches one of them.
// Without a file list every check runs.
export const checkApplies = (
  check: { paths?: string[] | null },
  files: string[] | null | undefined,
) =>
  !check.paths ||
  !Array.isArray(files) ||
  files.some((file) => check.paths?.some((glob) => matchesPath(glob, file)));

// The checks of one stage a change runs (`files`: its changed paths, or
// null for all).
export const selectedChecks = (
  repository: CheckedRepository | null | undefined,
  files: string[] | null = null,
  plugins: PluginCheck[] = [],
  stage = "task",
) =>
  repositoryChecks(repository, plugins).filter(
    (check) => check.stage === stage && checkApplies(check, files),
  );

// The command text a check shows, for display.
export const checkCommand = (check: { argv: string[] }) => check.argv.join(" ");

// What a check result or a declared check is keyed by: its name, else the
// command of a record written before checks had names.
export const checkKey = (entry: string | Keyed | null | undefined) =>
  (typeof entry === "string" ? entry : (entry?.name ?? entry?.command)) ?? null;

// The result in `results` for one declared check, by name, falling back to
// its command for a record written before checks had names.
export const resultFor = <T extends Keyed>(
  results: T[] | null | undefined,
  check: { name: string; argv: string[] },
) =>
  (results || []).find(
    (entry) =>
      checkKey(entry) === check.name ||
      (entry?.name === undefined && entry?.command === checkCommand(check)),
  );
