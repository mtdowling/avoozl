// The engine: the Avoozl build this machine's tick runs (tick, checks,
// landing). The Kiro Crew app's cron starts the machine tick from the app's
// installed copy, which only a person's Update refreshes. So the tick builds
// Avoozl's own newest main, once Linux, macOS and Windows pass on that exact
// commit, into a folder under this machine's state, and the cron starts the
// tick from there instead (startTickPass). The page, app backend and MCP
// server stay the installed copy's.
//
//   <state>/engine/current.json   the build in use: {commit, lib, at, previous}
//   <state>/engine/builds/<sha>/  each kept build (the one in use and the
//                                 last good one before it)
//   <state>/engine/ran.json       the runner of the last pass that finished
//   <state>/engine/launches.json  starts of the build in use since its last
//                                 finished pass
//   <state>/engine/failed.json    the last commit that did not build, start
//                                 or finish a pass, and why
//
// `engine.update` in this machine's config turns it off (on by default).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { writeMachineFile } from "./crews.ts";
import { engineUpdateOn, validateEngine } from "../settings/engine-config.ts";
import { readGitHubPolicyOrNull } from "../github/github-policy.ts";
import { loadLayeredConfig } from "../settings/layered-config.ts";
import { git, remoteGit, repositoryEnvironment } from "../git/git.ts";
import type { Store } from "../store/store.ts";

// The repository whose main this machine follows.
export const ENGINE_REPOSITORY = "mtdowling/avoozl";
// Least time between two looks at main (a fetch and a check-run read).
const LOOK_EVERY_MS = 5 * 60_000;
// Starts of a new build with no finished pass before it is rolled back.
const STRIKES = 5;
const COMMIT = /^[0-9a-f]{40}$/;
const LOOKED = "engine.lookedAt";
const FAILED = "engine.failed";

type Build = { commit: string; lib: string; at: string };
type Current = Build & { previous?: Build | null };
type Failure = { commit: string; error: string; at: string };

export const enginePaths = (stateDirectory: string) => {
  const root = path.join(stateDirectory, "engine");
  return {
    root,
    builds: path.join(root, "builds"),
    current: path.join(root, "current.json"),
    ran: path.join(root, "ran.json"),
    launches: path.join(root, "launches.json"),
    failed: path.join(root, "failed.json"),
  };
};

// The tick runner inside a build's lib folder (the bundle keeps source paths).
export const runnerOf = (lib: string) =>
  path.join(lib, "src", "app", "tick", "tick-runner.mjs");

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const pending = `${file}.${process.pid}.pending`;
  fs.writeFileSync(pending, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(pending, file);
}

// Node starts a script at its real path, so runners compare by real path.
const real = (file: string) => {
  try {
    return fs.realpathSync.native(file);
  } catch {
    return path.resolve(file);
  }
};

const isBuild = (value: unknown): value is Build =>
  Boolean(value) &&
  COMMIT.test(String((value as Build).commit)) &&
  typeof (value as Build).lib === "string";

// The build in use, or null for the installed copy.
export function readEngine(stateDirectory: string): Current | null {
  const value = readJson<Current>(enginePaths(stateDirectory).current);
  return isBuild(value) ? value : null;
}

export function writeEngineSetting(configFile: string, value: unknown) {
  validateEngine(value, "This machine's config");
  writeMachineFile(configFile, (file) => {
    file.engine = value;
  });
}

// What `avoozl status` and Settings show: the switch, the build in use
// (null: the installed copy) and the last failure.
export function engineStatus(stateDirectory: string, configFile: string) {
  const current = readEngine(stateDirectory),
    failed = readJson<Failure>(enginePaths(stateDirectory).failed);
  return {
    update: engineUpdateOn(configFile),
    commit: current?.commit ?? null,
    since: current?.at ?? null,
    previous: current?.previous?.commit ?? null,
    failed: failed?.commit ? failed : null,
  };
}

function rollBack(stateDirectory: string, current: Current, error: string) {
  const paths = enginePaths(stateDirectory);
  writeJson(paths.failed, {
    commit: current.commit,
    error,
    at: new Date().toISOString(),
  });
  if (isBuild(current.previous))
    writeJson(paths.current, { ...current.previous, previous: null });
  else fs.rmSync(paths.current, { force: true });
  fs.rmSync(paths.launches, { force: true });
}

// The runner the machine tick starts: the build in use, or `own` (the copy
// this code was loaded from). A build that is gone, or that started STRIKES
// times without a finished pass, is rolled back to the one before it.
export function engineRunner(stateDirectory: string, own: string): string {
  const paths = enginePaths(stateDirectory),
    current = readEngine(stateDirectory);
  if (!current) return own;
  const runner = runnerOf(current.lib);
  if (!fs.existsSync(runner)) {
    rollBack(stateDirectory, current, `Its runner ${runner} is missing.`);
    return engineRunner(stateDirectory, own);
  }
  const now = new Date().toISOString(),
    ran = readJson<{ runner?: string; at?: string }>(paths.ran),
    before = readJson<{ commit?: string; since?: string; count?: number }>(
      paths.launches,
    ),
    mine = before?.commit === current.commit ? before : null,
    since = mine?.since ?? now,
    finished =
      typeof ran?.runner === "string" &&
      real(ran.runner) === real(runner) &&
      Date.parse(String(ran.at)) >= Date.parse(since);
  const count = finished ? 1 : (mine?.count ?? 0) + 1;
  if (count > STRIKES) {
    rollBack(
      stateDirectory,
      current,
      `It started ${STRIKES} times without finishing a pass; see tick-runner.log.`,
    );
    return engineRunner(stateDirectory, own);
  }
  writeJson(paths.launches, {
    commit: current.commit,
    since: finished ? now : since,
    count,
  });
  return runner;
}

// Run by each finished pass, with its own runner's path.
export function recordEngineRan(stateDirectory: string, runner: string) {
  writeJson(enginePaths(stateDirectory).ran, {
    runner,
    at: new Date().toISOString(),
  });
}

// The local checkout of ENGINE_REPOSITORY among the workspace's
// repositories, or null.
function engineCheckout(workspaceRoot: string) {
  const repositories = (loadLayeredConfig({ workspaceRoot }).config
    .repositories ?? {}) as Record<string, { root?: unknown }>;
  const named = new RegExp(
    `[/:]${ENGINE_REPOSITORY.replace("/", "\\/")}(\\.git)?/?$`,
    "i",
  );
  for (const entry of Object.values(repositories)) {
    if (typeof entry?.root !== "string") continue;
    const root = path.resolve(workspaceRoot, entry.root),
      url = spawnSync("git", ["-C", root, "remote", "get-url", "origin"], {
        encoding: "utf8",
      });
    // A local remote on Windows is a path with backslashes.
    if (url.status === 0 && named.test(url.stdout.trim().replaceAll("\\", "/")))
      return root;
  }
  return null;
}

// One command, or throw naming it with the end of its output.
function run(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeout?: number },
) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: "utf8",
    timeout: options.timeout ?? 15 * 60_000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    // npm is npm.cmd on Windows (link-global.ts). The arguments are fixed.
    shell: command === "npm" && process.platform === "win32",
  });
  if (result.status !== 0)
    throw Error(
      `${[command, ...args].join(" ")} failed: ${String(
        result.error?.message || result.stderr || result.stdout,
      )
        .trim()
        .slice(-500)}`,
    );
  return result.stdout.trim();
}

type CheckRun = {
  id?: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
};

// "green", "waiting" or "red" for the newest run of each required name.
export function checksState(runs: CheckRun[], required: string[]) {
  let state = "green";
  for (const name of required) {
    const newest = runs
      .filter((run) => run.name === name)
      .sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))[0];
    if (newest?.status === "completed" && newest.conclusion !== "success")
      return "red";
    if (newest?.status !== "completed") state = "waiting";
  }
  return state;
}

// Build `commit` from `checkout` into builds/<commit>/lib and start it once.
function buildEngine({
  checkout,
  commit,
  workspaceRoot,
  builds,
  env,
}: {
  checkout: string;
  commit: string;
  workspaceRoot: string;
  builds: string;
  env: NodeJS.ProcessEnv;
}) {
  const target = path.join(builds, commit),
    source = path.join(builds, `${commit}.source`),
    archive = path.join(builds, `${commit}.tar`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.rmSync(source, { recursive: true, force: true });
  fs.mkdirSync(source, { recursive: true });
  try {
    run("git", ["-C", checkout, "archive", "-o", archive, commit], {
      cwd: builds,
      env,
    });
    run("tar", ["-xf", archive, "-C", source], { cwd: builds, env });
    // No install scripts: postinstall would link the global avoozl command.
    run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: source,
      env,
    });
    run("npm", ["run", "build:kirocrew-app"], { cwd: source, env });
    fs.mkdirSync(target);
    const lib = path.join(target, "lib");
    fs.renameSync(path.join(source, "hosts", "kirocrew", "bin", "lib"), lib);
    if (!fs.existsSync(runnerOf(lib)))
      throw Error("The build has no tick runner.");
    // It must start and read this workspace before the tick switches to it.
    run(
      process.execPath,
      [path.join(lib, "cli.mjs"), "status", "--workspace", workspaceRoot],
      { cwd: target, env, timeout: 2 * 60_000 },
    );
    return lib;
  } catch (error) {
    fs.rmSync(target, { recursive: true, force: true });
    throw error;
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(archive, { force: true });
  }
}

// Each kept build: the one in use and the one before it.
function prune(builds: string, keep: string[]) {
  for (const name of fs.readdirSync(builds))
    if (!keep.includes(name))
      fs.rmSync(path.join(builds, name), { recursive: true, force: true });
}

type EngineGitHub = {
  checkRuns(repository: string, ref: string): Promise<CheckRun[]>;
};

// The tick's step in the workspace that holds ENGINE_REPOSITORY: when its
// base branch has moved and every required check passed on that commit,
// build it, start it once, and switch the machine tick to it. Keeps the
// Needs you row in step with failed.json. Returns what it did, or null.
export async function engineUpdateStep({
  store,
  github,
  workspaceRoot,
  stateDirectory,
  configFile,
  env = process.env,
  now = Date.now(),
  build = buildEngine,
}: {
  store: Store;
  github: EngineGitHub | null | undefined;
  workspaceRoot: string;
  stateDirectory: string;
  configFile: string;
  env?: NodeJS.ProcessEnv;
  now?: number;
  build?: typeof buildEngine;
}) {
  const policy =
    readGitHubPolicyOrNull(workspaceRoot)?.repositories?.[ENGINE_REPOSITORY];
  if (!policy) return null;
  const paths = enginePaths(stateDirectory),
    failure = () => readJson<Failure>(paths.failed),
    keepNeed = () => {
      const failed = failure();
      if (
        JSON.stringify(store.getMeta(FAILED) ?? null) !== JSON.stringify(failed)
      )
        store.setMeta(FAILED, failed);
    };
  keepNeed();
  const required = (policy.requiredChecks ?? []) as string[];
  if (!engineUpdateOn(configFile) || !github || !required.length) return null;
  if (now - Number(store.getMeta<number>(LOOKED) ?? 0) < LOOK_EVERY_MS)
    return null;
  store.setMeta(LOOKED, now);
  const checkout = engineCheckout(workspaceRoot);
  if (!checkout) return { skipped: `No checkout of ${ENGINE_REPOSITORY}.` };
  const base = String(policy.baseBranch ?? "main"),
    clean = repositoryEnvironment(env);
  await remoteGit(checkout, ["fetch", "--quiet", "origin", base], {
    repository: ENGINE_REPOSITORY,
    job: "check-in",
    env: clean,
  });
  const commit = (
      await git(checkout, ["rev-parse", `refs/remotes/origin/${base}^{commit}`])
    ).trim(),
    current = readEngine(stateDirectory);
  if (commit === current?.commit || commit === failure()?.commit)
    return { commit, state: "current" };
  const state = checksState(
    await github.checkRuns(ENGINE_REPOSITORY, commit),
    required,
  );
  if (state !== "green") return { commit, state };
  let lib: string;
  try {
    lib = build({
      checkout,
      commit,
      workspaceRoot,
      builds: paths.builds,
      env: clean,
    });
  } catch (error) {
    writeJson(paths.failed, {
      commit,
      error: (error as Error).message,
      at: new Date(now).toISOString(),
    });
    keepNeed();
    return { commit, state: "failed", error: (error as Error).message };
  }
  writeJson(paths.current, {
    commit,
    lib,
    at: new Date(now).toISOString(),
    previous: current ? { ...current, previous: undefined } : null,
  });
  fs.rmSync(paths.failed, { force: true });
  fs.rmSync(paths.launches, { force: true });
  keepNeed();
  prune(paths.builds, [commit, ...(current ? [current.commit] : [])]);
  return { commit, state: "switched", from: current?.commit ?? null };
}

// The Needs you row for the last engine failure, while there is one.
export function engineNeedsYou(store: Store) {
  const failed = store.getMeta<Failure>(FAILED);
  if (!failed?.commit) return [];
  return [
    {
      kind: "needs-human",
      reason: "engine-failed",
      id: `engine-failed:${failed.commit}`,
      taskId: null,
      title: `The tick could not move to Avoozl ${failed.commit.slice(0, 9)}`,
      detail: `${failed.error} The tick keeps running the build before it and tries again when main moves. Turn this off with engine.update: false in this machine's config.`,
      openedAt: failed.at,
    },
  ];
}
