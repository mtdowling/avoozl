// The engine (engine.ts): the tick moves to a green main commit, keeps the
// build before it, and rolls back a build that never finishes a pass.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Store } from "../../store/store.ts";
import { git, testRepository } from "../../test/git-repository.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import {
  ENGINE_REPOSITORY,
  checksState,
  enginePaths,
  engineNeedsYou,
  engineRunner,
  engineUpdateStep,
  readEngine,
  recordEngineRan,
  runnerOf,
} from "../engine.ts";
import { engineUpdateOn } from "../../settings/engine-config.ts";

const REQUIRED = ["test (ubuntu-latest)", "test (macos-latest)"];
const green = REQUIRED.map((name, id) => ({
  id,
  name,
  status: "completed",
  conclusion: "success",
}));

// A workspace whose one repository is a checkout of ENGINE_REPOSITORY, with
// a bare origin, a store and a machine's state and config folders.
function machine() {
  const root = temporaryDirectory("avoozl-engine-"),
    origin = path.join(root, "remote", `${ENGINE_REPOSITORY}.git`),
    checkout = path.join(root, "checkout");
  fs.mkdirSync(origin, { recursive: true });
  git(origin, ["init", "--bare", "-b", "main"]);
  testRepository(checkout, origin);
  fs.writeFileSync(
    path.join(checkout, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      repositories: { avoozl: { root: ".", baseBranch: "main" } },
      github: {
        repositories: {
          [ENGINE_REPOSITORY]: { baseBranch: "main", requiredChecks: REQUIRED },
        },
      },
    }),
  );
  git(checkout, ["add", ".avoozl.json"]);
  git(checkout, ["commit", "-m", "Configure"]);
  git(checkout, ["push", "-q", "origin", "main"]);
  const state = path.join(root, "state"),
    config = path.join(root, "config");
  fs.mkdirSync(state);
  fs.mkdirSync(config);
  return {
    checkout,
    state,
    configFile: path.join(config, "config.json"),
    store: new Store(path.join(root, "workspace.sqlite")),
    head: () => git(checkout, ["rev-parse", "HEAD"]),
    // A new commit on origin's main.
    advance(name: string) {
      fs.writeFileSync(path.join(checkout, name), name);
      git(checkout, ["add", name]);
      git(checkout, ["commit", "-m", name]);
      git(checkout, ["push", "-q", "origin", "main"]);
    },
  };
}

// A build that writes only a runner, as the real one leaves it.
const fakeBuild = ({ commit, builds }: { commit: string; builds: string }) => {
  const lib = path.join(builds, commit, "lib");
  fs.mkdirSync(path.dirname(runnerOf(lib)), { recursive: true });
  fs.writeFileSync(runnerOf(lib), "");
  return lib;
};

test("checksState needs every required name's newest run to pass", () => {
  assert.equal(checksState(green, REQUIRED), "green");
  assert.equal(checksState(green.slice(0, 1), REQUIRED), "waiting");
  assert.equal(
    checksState(
      [...green, { id: 9, name: REQUIRED[1], status: "in_progress" }],
      REQUIRED,
    ),
    "waiting",
  );
  assert.equal(
    checksState(
      [
        ...green,
        {
          id: 9,
          name: REQUIRED[0],
          status: "completed",
          conclusion: "failure",
        },
      ],
      REQUIRED,
    ),
    "red",
  );
});

test("engine.update is on by default and off only when false", () => {
  const { configFile } = machine();
  assert.equal(engineUpdateOn(configFile), true);
  fs.writeFileSync(
    configFile,
    JSON.stringify({ version: 1, engine: { update: false } }),
  );
  assert.equal(engineUpdateOn(configFile), false);
});

test("the tick moves to green main, keeps the one before, and waits on red", async () => {
  const m = machine();
  let runs: unknown[] = green;
  const step = (now: number) =>
    engineUpdateStep({
      store: m.store,
      github: { checkRuns: async () => runs as never[] },
      workspaceRoot: m.checkout,
      stateDirectory: m.state,
      configFile: m.configFile,
      now,
      build: fakeBuild,
    });
  const first = m.head();
  assert.deepEqual(await step(1e12), {
    commit: first,
    state: "switched",
    from: null,
  });
  assert.equal(readEngine(m.state)?.commit, first);
  // One look per five minutes.
  assert.equal(await step(1e12 + 60_000), null);

  m.advance("two");
  runs = [{ id: 1, name: REQUIRED[0], status: "queued" }];
  assert.equal((await step(1e12 + 6 * 60_000))?.state, "waiting");
  runs = green;
  const second = m.head();
  assert.equal((await step(1e12 + 12 * 60_000))?.state, "switched");
  const current = readEngine(m.state);
  assert.equal(current?.commit, second);
  assert.equal(current?.previous?.commit, first);
  assert.deepEqual(
    fs.readdirSync(enginePaths(m.state).builds).sort(),
    [first, second].sort(),
  );

  // A build that fails leaves the one in use and opens one Needs you row.
  m.advance("three");
  const third = m.head();
  const failed = await engineUpdateStep({
    store: m.store,
    github: { checkRuns: async () => green },
    workspaceRoot: m.checkout,
    stateDirectory: m.state,
    configFile: m.configFile,
    now: 1e12 + 18 * 60_000,
    build: () => {
      throw Error("npm ci failed.");
    },
  });
  assert.equal(failed?.state, "failed");
  assert.equal(readEngine(m.state)?.commit, second);
  const rows = engineNeedsYou(m.store);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, `engine-failed:${third}`);
  // The failed commit is not tried again.
  assert.equal((await step(1e12 + 24 * 60_000))?.state, "current");
});

test("the cron starts the build in use, and rolls back one that never finishes a pass", () => {
  const { state } = machine(),
    own = "/installed/tick-runner.mjs",
    paths = enginePaths(state),
    lib = (commit: string) => path.join(paths.builds, commit, "lib"),
    a = "a".repeat(40),
    b = "b".repeat(40);
  assert.equal(engineRunner(state, own), own);
  for (const commit of [a, b]) fakeBuild({ commit, builds: paths.builds });
  fs.writeFileSync(
    paths.current,
    JSON.stringify({
      commit: b,
      lib: lib(b),
      at: "2026-01-01T00:00:00Z",
      previous: { commit: a, lib: lib(a), at: "2026-01-01T00:00:00Z" },
    }),
  );
  // A finished pass keeps it in use.
  for (let i = 0; i < 8; i++) {
    assert.equal(engineRunner(state, own), runnerOf(lib(b)));
    recordEngineRan(state, runnerOf(lib(b)));
  }
  // Five starts with no finished pass: back to the one before.
  fs.writeFileSync(
    paths.ran,
    JSON.stringify({ runner: runnerOf(lib(b)), at: "2000-01-01T00:00:00Z" }),
  );
  fs.rmSync(paths.launches);
  for (let i = 0; i < 5; i++)
    assert.equal(engineRunner(state, own), runnerOf(lib(b)));
  assert.equal(engineRunner(state, own), runnerOf(lib(a)));
  assert.equal(readEngine(state)?.commit, a);
  assert.equal(JSON.parse(fs.readFileSync(paths.failed, "utf8")).commit, b);
  // With no build left, the installed copy.
  fs.rmSync(path.join(paths.builds, a), { recursive: true });
  assert.equal(engineRunner(state, own), own);
});
