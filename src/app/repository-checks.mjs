// A repository's checks: the only checks there are. A project's `checks`
// maps a name to an argv array, or to {run: argv, paths: [glob, ...]}; a
// check with paths runs only for a change that touches one of them. Tasks
// never name checks. An older setting, a list of argv arrays, still loads:
// each check is named by its argv joined with spaces and has no paths.
import { fail } from "./store.mjs";
import { matchesPath } from "./verify.mjs";

export const CHECK_NAME = /^[a-z][a-z0-9-]{0,39}$/;
// The keys of a check written as an object. A test holds the config schema
// to this list.
export const CHECK_KEYS = Object.freeze(["run", "paths"]);
const MAX_CHECKS = 50;
const MAX_PATHS = 50;

const isArgv = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((part) => typeof part === "string" && part.length > 0);

const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// The stored setting after validation, as given. `label` names it in errors.
export function checksSetting(value, label = "checks") {
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

// The repository's checks as [{name, argv, paths}], in their written order.
// `paths` is null for a check that runs on every change.
export function repositoryChecks(project) {
  const value = project?.checks;
  if (Array.isArray(value))
    return value
      .filter(isArgv)
      .map((argv) => ({ name: argv.join(" "), argv: [...argv], paths: null }));
  if (!record(value)) return [];
  return Object.entries(value).flatMap(([name, entry]) => {
    if (isArgv(entry)) return [{ name, argv: [...entry], paths: null }];
    if (!record(entry) || !isArgv(entry.run)) return [];
    return [
      {
        name,
        argv: [...entry.run],
        paths: entry.paths?.length ? [...entry.paths] : null,
      },
    ];
  });
}

// Whether a check runs for a change that touches `files`: one without
// paths always does; one with paths when a file matches one of them.
// Without a file list every check runs.
export const checkApplies = (check, files) =>
  !check.paths ||
  !Array.isArray(files) ||
  files.some((file) => check.paths.some((glob) => matchesPath(glob, file)));

// The checks a change runs (`files`: its changed paths, or null for all).
export const selectedChecks = (project, files = null) =>
  repositoryChecks(project).filter((check) => checkApplies(check, files));

// The command text a check shows, for display.
export const checkCommand = (check) => check.argv.join(" ");

// What a check result or a declared check is keyed by: its name, else the
// command of a record written before checks had names.
export const checkKey = (entry) =>
  (typeof entry === "string" ? entry : (entry?.name ?? entry?.command)) ?? null;

// The result in `results` for one declared check, by name, falling back to
// its command for a record written before checks had names.
export const resultFor = (results, check) =>
  (results || []).find(
    (entry) =>
      checkKey(entry) === check.name ||
      (entry?.name === undefined && entry?.command === checkCommand(check)),
  );
