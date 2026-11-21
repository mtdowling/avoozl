// @ts-nocheck: typing debt
// One isolation setting per repository, used for its checks. A repository's
// `isolation` is {run, network, readable, writable, prepare}:
//
//   run       "sandbox" (the default): the process sandbox (sandbox.mjs)
//             with write roots of the check's folder, its own temp folder,
//             the repository's cache folder and `writable`.
//             "unconfined": as before sandboxes, and only with this
//             machine's opt-in. A machine with no sandbox runs a "sandbox"
//             check unconfined, and its record says so.
//   network   "off" (the default) or "on".
//   readable  absolute paths a sandboxed check may also read.
//   writable  absolute paths it may also write.
//   prepare   argv run once per worktree and commit before its checks,
//             outside isolation, with the checks' environment allowlist.
//
// Every check record names the isolation it ran under.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fail } from "../store/store.ts";
import { HARNESS_UNCONFINED } from "../executors/harness-definitions.ts";
import { machineAvoozlPaths } from "../settings/host-config.ts";
import {
  catalogWorkspaceRoots,
  confineChild,
  sandboxKind,
  sandboxNetwork,
  sandboxSecretPaths,
} from "../executors/sandbox.ts";

export const ISOLATION_KEYS = Object.freeze([
  "run",
  "network",
  "readable",
  "writable",
  "prepare",
]);
const ISOLATION_RUNS = Object.freeze(["sandbox", "unconfined"]);
// The key in harness-unconfined.json that lets checks run unconfined on
// this machine.
export const CHECKS_UNCONFINED = "checks";
const MAX_PATHS = 50;

const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isArgv = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((part) => typeof part === "string" && part.length > 0);

function paths(value, label) {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length > MAX_PATHS ||
    value.some((item) => typeof item !== "string" || !path.isAbsolute(item))
  )
    fail(`${label} must be at most ${MAX_PATHS} absolute paths.`);
  return value.map((item) => path.resolve(item));
}

// The stored setting after validation. `label` names it in errors.
export function isolationSetting(value, label = "isolation") {
  if (value === undefined) return undefined;
  if (!record(value)) fail(`${label} must be an object.`);
  for (const key of Object.keys(value))
    if (!ISOLATION_KEYS.includes(key))
      fail(`Unknown isolation setting ${label}.${key}.`);
  const run = value.run ?? "sandbox";
  if (!ISOLATION_RUNS.includes(run))
    fail(`${label}.run must be sandbox or unconfined.`);
  if (value.network !== undefined && !["off", "on"].includes(value.network))
    fail(`${label}.network must be off or on.`);
  if (value.prepare !== undefined && !isArgv(value.prepare))
    fail(`${label}.prepare must be command arguments.`);
  const readable = paths(value.readable, `${label}.readable`),
    writable = paths(value.writable, `${label}.writable`);
  return {
    run,
    network: value.network ?? "off",
    ...(readable ? { readable } : {}),
    ...(writable ? { writable } : {}),
    ...(value.prepare ? { prepare: [...value.prepare] } : {}),
  };
}

// A repository's isolation with its defaults.
const isolationOf = (repository) =>
  isolationSetting(repository?.isolation ?? {}, "isolation");

// Whether this machine lets checks run unconfined (the per-machine opt-in
// file harness opt-ins use).
export function checksUnconfinedAllowed(configDirectory) {
  if (!configDirectory) return false;
  const file = path.join(path.resolve(configDirectory), HARNESS_UNCONFINED);
  try {
    return (
      JSON.parse(fs.readFileSync(file, "utf8"))[CHECKS_UNCONFINED] === true
    );
  } catch {
    return false;
  }
}

// The repository's cache folder for its checks: under Avoozl's state area,
// beside the state folder a check must not reach.
function checkCacheDirectory(repositoryId, stateDirectory) {
  const state = stateDirectory ?? machineAvoozlPaths().stateDirectory;
  return path.join(
    path.dirname(path.resolve(state)),
    "avoozl-check-cache",
    String(repositoryId || "repository").replace(/[^A-Za-z0-9._-]/g, "_"),
  );
}

// How one check runs in `dir`: {argv, env, isolation, cleanup} for the
// process to start, or {refused} when the setting cannot run here. `env`
// is the checks' allowlisted environment. A plugin check passes its own
// `network` (true or false, never the repository's) and `readable` folders
// (its plugin folder, read-only) (plugin-checks D4).
export function isolatedCheck(
  repository,
  dir,
  argv,
  env,
  {
    kind = sandboxKind(),
    paths: machine = machineAvoozlPaths(),
    network,
    readable: extra = [],
  } = {},
) {
  const base = isolationOf(repository),
    setting = {
      ...base,
      network: network === undefined ? base.network : network ? "on" : "off",
      readable: [...(base.readable ?? []), ...extra],
    },
    configDirectory = machine.configDirectory;
  if (setting.run === "unconfined" || !kind) {
    if (
      setting.run === "unconfined" &&
      !checksUnconfinedAllowed(configDirectory)
    )
      return {
        refused:
          "isolation is unconfined, and this machine has not allowed unconfined checks",
      };
    return { argv: [...argv], env, isolation: "unconfined" };
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-check-tmp-")),
    cache = checkCacheDirectory(repository?.id, machine.stateDirectory);
  fs.mkdirSync(cache, { recursive: true });
  const confined = confineChild(argv, {
    definition: { name: "checks", hash: "" },
    configDirectory,
    writeRoots: [dir, temp, cache, ...(setting.writable ?? [])],
    secrets: sandboxSecretPaths({
      env: process.env,
      configDirectory,
      stateDirectory: machine.stateDirectory,
      workspaceRoots: catalogWorkspaceRoots(machine.catalogPath),
    }),
    readable: setting.readable ?? [],
    network:
      setting.network === "on" ? { mode: "on", ports: [] } : sandboxNetwork(),
    // The checks' allowlist already took out every credential.
    env: { ...env, TMPDIR: temp, XDG_CACHE_HOME: cache },
    kind,
  });
  return {
    argv: confined.argv,
    // confineChild drops credential names; keep the allowlist as built,
    // with the temp and cache folders.
    env: { ...env, TMPDIR: temp, XDG_CACHE_HOME: cache },
    isolation: "sandbox",
    cleanup: () => fs.rmSync(temp, { recursive: true, force: true }),
  };
}

// The commandEvidence options for a repository check in `dir`: its
// environment allowlist and its isolation.
export const checkOptions = (repository, dir) => ({
  env: repository?.checksEnv,
  isolate: (argv, env) => isolatedCheck(repository, dir, argv, env),
});

const prepared = new Set();
// Run the repository's `prepare` once per worktree and commit, outside
// isolation, with the checks' environment allowlist. Returns null when
// there is nothing to run (or it already ran here), else its result; a
// failed prepare runs again next time.
export async function prepareChecks(repository, dir, { run } = {}) {
  const setting = isolationOf(repository);
  if (!setting.prepare) return null;
  const { commandEvidence, git } = await import("../git/git.ts"),
    head = await git(dir, ["rev-parse", "HEAD"]).catch(() => ""),
    key = [repository?.id, path.resolve(dir), head, ...setting.prepare].join(
      "\0",
    );
  if (prepared.has(key)) return null;
  const result = await (run ?? commandEvidence)(dir, setting.prepare, {
    env: repository?.checksEnv,
  });
  if (result.exitCode === 0) prepared.add(key);
  return result;
}
