// Task 43.3 (R90.4, R102.14): the driver reserves one grant ref in the spec's
// canonical namespace, then acknowledges; a worker starts only on its own
// acknowledgment. Comments are requests, never the lock.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { workspaceConfig } from "../config.mjs";
import { globalAvoozlConfigPath } from "../layered-config.mjs";
import { Operations } from "../operations.mjs";
import { githubJournal, appendRecord } from "../spec-journal.mjs";
import { Store } from "../store.mjs";
import {
  acknowledged,
  grantBranch,
  publishOffer,
  requestBody,
  reserveGrants,
} from "../worker-grants.mjs";
import { snapshot } from "./fixtures.mjs";
import { checkpointBranch } from "../working-heads.mjs";
import { workerResultsStep } from "../worker-result-step.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// The worker's machine config is written under this folder, never the real one.
delete process.env.KIROCREW_HOME;
process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-grant-home-");

const SPEC = "demo",
  DRIVER = "d".repeat(16),
  DEF = "b".repeat(64),
  OPTIONS = { visibility: "private" },
  OWNER = { login: "owner", from: "spec" },
  local = { local: true };
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

// One spec issue's comments and the grant repository's branches, acted on
// by `actor`. Branch creation refuses a name that exists, as GitHub does.
function world() {
  const comments = [],
    branches = new Map();
  const as = (actor) => ({
    available: () => true,
    currentUser: async () => ({ login: actor }),
    listIssueComments: async () =>
      comments.map((c) => ({
        id: c.id,
        body: c.body,
        user: { login: c.author },
      })),
    createIssueComment: async (_repo, _number, body) => {
      const id = 100 + comments.length * 3;
      comments.push({ id, body, author: actor });
      return { id };
    },
    permission: async (_repo, login) => ({
      permission: login === "owner" ? "admin" : "read",
    }),
    branch: async () => ({ commit: { sha: "c".repeat(40) } }),
    createBranch: async (repo, name) => {
      const key = `${repo}:${name}`;
      if (branches.has(key))
        throw Object.assign(Error("Reference already exists"), {
          status: 422,
        });
      branches.set(key, actor);
      return {};
    },
  });
  return { comments, branches, as };
}

async function started(w) {
  const github = w.as("owner"),
    journal = githubJournal(github, "example/plans", 1);
  await appendRecord(
    journal,
    {
      op: "generation-1",
      kind: "generation",
      spec: SPEC,
      generation: 1,
      driver: DRIVER,
    },
    OPTIONS,
  );
  return { github, journal };
}

const driving = (w, journal) => ({
  github: w.as("owner"),
  journal,
  options: OPTIONS,
  driver: DRIVER,
  owner: OWNER,
  login: "owner",
  spec: SPEC,
  grants: "example/code",
  base: "main",
});
const offerFor = (journal, worker, repository, task = "t1") =>
  publishOffer(
    journal,
    {
      driver: DRIVER,
      owner: OWNER,
      login: "owner",
      spec: SPEC,
      task,
      definition: DEF,
      worker,
      // Two forks with the same branch name are two different results.
      ref: {
        repository,
        branch: "avoozl/demo/work",
        commit: "a".repeat(40),
      },
      base: "a".repeat(40),
    },
    OPTIONS,
  );
const ask = (w, login, task = "t1", generation = 1) =>
  w
    .as(login)
    .createIssueComment(
      "example/plans",
      1,
      requestBody({ spec: SPEC, task, definition: DEF, generation }),
    );

test("two forks race for one task: one grant branch, one acknowledgment", async () => {
  const w = world(),
    { journal } = await started(w);
  await offerFor(journal, "worker-a", "fork-a/code");
  await offerFor(journal, "worker-b", "fork-b/code");
  await ask(w, "worker-b");
  await ask(w, "worker-a");
  const result = await reserveGrants(driving(w, journal));
  assert.equal(result.acknowledged.length, 1);
  assert.equal(result.acknowledged[0].task, "t1");
  assert.deepEqual(
    result.declined.map((d) => d.reason),
    ["granted"],
  );
  assert.equal([...w.branches.keys()].length, 1);
  assert.equal(
    [...w.branches.keys()][0],
    `example/code:${grantBranch(SPEC, "t1")}`,
  );
  // Only the winner may start; the loser's agent never opens.
  const offer = {
      spec: SPEC,
      task: "t1",
      generation: 1,
      driver: DRIVER,
      definition: DEF,
    },
    pools = [
      {
        spec: SPEC,
        repository: "example/plans",
        issue: 1,
        visibility: "private",
      },
    ],
    store = { getMeta: () => ({ k: { offer } }) },
    ready = async (login) =>
      (await acknowledged(store, { pools, github: w.as(login), login })).ready
        .length;
  assert.deepEqual(
    [await ready("worker-a"), await ready("worker-b")].sort(),
    [0, 1],
  );
  // A repeat pass writes and reserves nothing more.
  const again = await reserveGrants(driving(w, journal));
  assert.deepEqual(again.acknowledged, []);
  assert.equal(w.branches.size, 1);
});

test("a name already reserved elsewhere gets no acknowledgment", async () => {
  const w = world(),
    { journal } = await started(w);
  await offerFor(journal, "worker-a", "fork-a/code");
  await ask(w, "worker-a");
  w.branches.set(`example/code:${grantBranch(SPEC, "t1")}`, "someone");
  const result = await reserveGrants(driving(w, journal));
  assert.deepEqual(result.acknowledged, []);
  assert.deepEqual(
    result.declined.map((d) => d.reason),
    ["taken"],
  );
});

test("an unoffered author, a stale generation and an over-cap request are declined", async () => {
  const w = world(),
    { journal } = await started(w);
  await offerFor(journal, "worker-a", "fork-a/code", "t1");
  await offerFor(journal, "worker-a", "fork-a/code", "t2");
  await ask(w, "mallory", "t1");
  await ask(w, "worker-a", "t1", 0);
  await ask(w, "worker-a", "t1");
  await ask(w, "worker-a", "t2");
  const result = await reserveGrants(driving(w, journal));
  assert.deepEqual(
    result.acknowledged.map((a) => a.task),
    ["t1"],
  );
  assert.deepEqual(
    result.declined.map((d) => [d.task, d.reason]),
    [
      ["t1", "not-offered"],
      ["t2", "over-cap"],
    ],
  );
  const raised = await reserveGrants({ ...driving(w, journal), cap: 2 });
  assert.deepEqual(
    raised.acknowledged.map((a) => a.task),
    ["t2"],
  );
});

test("a displaced or stopped driver reserves nothing", async () => {
  const w = world(),
    { journal } = await started(w);
  await offerFor(journal, "worker-a", "fork-a/code");
  await ask(w, "worker-a");
  const wrong = await reserveGrants({
    ...driving(w, journal),
    driver: "e".repeat(16),
  });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, "displaced");
  await appendRecord(
    journal,
    {
      op: "hold-1",
      kind: "control",
      spec: SPEC,
      driver: DRIVER,
      controls: [{ flag: "hold", id: "h1" }],
    },
    OPTIONS,
  );
  const stopped = await reserveGrants(driving(w, journal));
  assert.equal(stopped.reason, "stopped");
  assert.equal(w.branches.size, 0);
});

function workerWorkspace(t, origin, repo, { lanes } = {}) {
  const root = temporaryDirectory("avoozl-grant-worker-");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      runner: {
        role: "worker",
        ...(lanes ? { lanes } : {}),
        checks: { pass: { argv: ["node", "-e", "process.exit(0)"] } },
        pools: [
          {
            spec: SPEC,
            repository: "example/plans",
            issue: 1,
            target: "example/code",
            base: "main",
            visibility: "private",
          },
        ],
      },
    }),
  );
  const file = globalAvoozlConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      runner: {
        repos: { app: { path: repo } },
        sources: {
          "example/code": { url: origin },
          "fork-a/code": { url: origin, parent: "example/code" },
        },
      },
    }),
  );
  const { dbPath } = workspaceConfig({ workspace: root, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  t.after(() => store.close());
  store.initialize({ ...snapshot(), tasks: [], edges: [] });
  return { root, store };
}

test("a worker starts only on its own acknowledgment", async (t) => {
  const dir = temporaryDirectory("avoozl-grant-repo-"),
    origin = path.join(dir, "origin.git"),
    repo = path.join(dir, "app");
  fs.mkdirSync(repo);
  git(dir, "init", "--bare", "-b", "main", origin);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "Start");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "origin", "main");
  git(repo, "push", "origin", "main:avoozl/demo/work");
  const commit = git(repo, "rev-parse", "HEAD");

  const w = world(),
    { journal } = await started(w),
    ws = workerWorkspace(t, origin, repo),
    ops = (login) =>
      new Operations(ws.store, {
        workspaceRoot: ws.root,
        github: w.as(login),
      });
  await publishOffer(
    journal,
    {
      driver: DRIVER,
      owner: OWNER,
      login: "owner",
      spec: SPEC,
      task: "t1",
      definition: DEF,
      worker: "worker-a",
      ref: { repository: "fork-a/code", branch: "avoozl/demo/work", commit },
      base: commit,
    },
    OPTIONS,
  );
  const worker = ops("worker-a");
  assert.equal(
    (await worker.execute("worker.pull", {}, local)).offers.length,
    1,
  );
  // First grant: asks, and starts nothing without an acknowledgment.
  const first = await worker.execute("worker.accept", {}, local);
  assert.deepEqual(first.requested, [{ spec: SPEC, task: "t1" }]);
  assert.deepEqual(first.started, []);
  assert.equal(first.waiting.length, 1);
  assert.equal(
    ws.store.getMeta("runner.tasks") ?? null,
    null,
    "nothing is accepted before the acknowledgment",
  );
  // The comment named no login; the driver reads the author.
  assert.ok(!w.comments.at(-1).body.includes("worker-a"));
  const reserved = await reserveGrants({
    ...driving(w, journal),
    cap: 1,
  });
  assert.equal(reserved.acknowledged.length, 1);
  // The same worker asking again does not ask twice, and now it starts.
  const second = await worker.execute("worker.accept", {}, local);
  assert.deepEqual(second.requested, []);
  assert.deepEqual(second.started, [{ spec: SPEC, task: "t1" }]);
  assert.equal(Object.keys(ws.store.getMeta("runner.tasks")).length, 1);
  assert.equal(ws.store.getMeta("runner.tasks").t1.envelope.baseCommit, commit);
});

// Worker-paths WP5.2: the worker machine's tick pulls, asks and starts on its
// own, with the functions the hand-run commands call.
function codeRepo() {
  const dir = temporaryDirectory("avoozl-grant-repo-"),
    origin = path.join(dir, "origin.git"),
    repo = path.join(dir, "app");
  fs.mkdirSync(repo);
  git(dir, "init", "--bare", "-b", "main", origin);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "Start");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "origin", "main");
  git(repo, "push", "origin", "main:avoozl/demo/work");
  return { origin, repo, commit: git(repo, "rev-parse", "HEAD") };
}

async function offers(journal, commit, tasks) {
  for (const task of tasks)
    await publishOffer(
      journal,
      {
        driver: DRIVER,
        owner: OWNER,
        login: "owner",
        spec: SPEC,
        task,
        definition: DEF,
        worker: "worker-a",
        ref: { repository: "fork-a/code", branch: "avoozl/demo/work", commit },
        base: commit,
      },
      OPTIONS,
    );
}

const workerTickOf = (ops) =>
  ops.execute("workspace.tick", { cron: true }, local);
const accepted = (ws) => Object.keys(ws.store.getMeta("runner.tasks") ?? {});

test("a worker tick with two free lanes and three offers asks for two and starts two, with nothing run by hand", async (t) => {
  const code = codeRepo(),
    w = world(),
    { journal } = await started(w),
    ws = workerWorkspace(t, code.origin, code.repo, { lanes: 2 }),
    worker = new Operations(ws.store, {
      workspaceRoot: ws.root,
      github: w.as("worker-a"),
    });
  await offers(journal, code.commit, ["t1", "t2", "t3"]);
  // Tick 1 pulls and asks; no acknowledgment, so nothing starts.
  await workerTickOf(worker);
  assert.equal(Object.keys(ws.store.getMeta("worker.requested")).length, 2);
  assert.deepEqual(accepted(ws), []);
  // The driver acknowledges what was asked.
  const reserved = await reserveGrants({ ...driving(w, journal), cap: 3 });
  assert.equal(reserved.acknowledged.length, 2);
  // Tick 2 starts the two; tick 3 has no free lane for the third.
  await workerTickOf(worker);
  assert.deepEqual(accepted(ws).sort(), ["t1", "t2"]);
  await workerTickOf(worker);
  assert.deepEqual(accepted(ws).sort(), ["t1", "t2"]);
});

test("the hand-run commands give what one tick gives", async (t) => {
  const code = codeRepo(),
    w = world(),
    { journal } = await started(w),
    byTick = workerWorkspace(t, code.origin, code.repo, { lanes: 2 }),
    byHand = workerWorkspace(t, code.origin, code.repo, { lanes: 2 }),
    ops = (ws) =>
      new Operations(ws.store, {
        workspaceRoot: ws.root,
        github: w.as("worker-a"),
      });
  await offers(journal, code.commit, ["t1", "t2"]);
  // Both workers ask for the same two tasks; the driver acknowledges them.
  await workerTickOf(ops(byTick));
  await ops(byHand).execute("worker.pull", {}, local);
  await ops(byHand).execute("worker.accept", {}, local);
  assert.equal(
    (await reserveGrants({ ...driving(w, journal), cap: 2 })).acknowledged
      .length >= 1,
    true,
  );
  await workerTickOf(ops(byTick));
  await ops(byHand).execute("worker.accept", {}, local);
  assert.deepEqual(accepted(byTick).sort(), accepted(byHand).sort());
  assert.ok(accepted(byTick).length >= 1);
});

test("a worker tick with no GitHub records one line and starts nothing", async (t) => {
  const code = codeRepo(),
    ws = workerWorkspace(t, code.origin, code.repo),
    ops = new Operations(ws.store, {
      workspaceRoot: ws.root,
      github: { available: () => false },
    });
  await workerTickOf(ops);
  const lines = ws.store
    .events({ latest: true })
    .filter((e) => e.kind === "worker.tick");
  assert.equal(lines.length, 1);
  assert.match(lines[0].skipped, /no GitHub/);
  assert.deepEqual(accepted(ws), []);
});

// Worker-paths WP5.3: the driver's tick fetches and checks what a worker
// pushed, and lands it with no command run by hand.
const commitAs = (cwd, message) =>
  git(
    cwd,
    "-c",
    "user.name=W",
    "-c",
    "user.email=w@example.com",
    "commit",
    "-qm",
    message,
  );

// A target, a fork, the driver's own checkout, and a store holding task t1
// of spec `demo` with its repository. `push` adds the worker's checkpoint.
async function driverWorld(
  t,
  { files = { "b.txt": "b\n" }, grant = true } = {},
) {
  const dir = temporaryDirectory("avoozl-driver-results-"),
    target = path.join(dir, "target.git"),
    fork = path.join(dir, "fork.git"),
    seed = path.join(dir, "seed"),
    root = path.join(dir, "driver");
  git(dir, "init", "--bare", "-b", "main", target);
  fs.mkdirSync(seed);
  git(seed, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(seed, "a.txt"), "a\n");
  git(seed, "add", ".");
  commitAs(seed, "Start");
  git(seed, "remote", "add", "origin", target);
  git(seed, "push", "-q", "origin", "main");
  const base = git(seed, "rev-parse", "HEAD");
  git(dir, "clone", "-q", "--bare", target, fork);
  // The driver's own checkout of the target, on its base branch.
  git(dir, "clone", "-q", target, root);
  git(root, "config", "user.name", "Driver");
  git(root, "config", "user.email", "driver@example.com");
  const store = new Store(path.join(dir, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize({
    ...snapshot(),
    tasks: [
      {
        id: "t1",
        title: "Task t1",
        kind: "leaf",
        scope: "catalog",
        status: "planned",
        epic: "sample",
        track: "catalog",
        tags: [],
        acceptance: ["Works."],
        repository: "example/code",
        paths: ["b.txt"],
      },
    ],
    edges: [],
  });
  store.put("repositories", {
    id: "example/code",
    github: "example/code",
    root,
    baseBranch: "main",
    checks: [["node", "-e", "process.exit(0)"]],
  });
  const w = world(),
    { journal } = await started(w);
  await publishOffer(
    journal,
    {
      driver: DRIVER,
      owner: OWNER,
      login: "owner",
      spec: SPEC,
      task: "t1",
      definition: DEF,
      worker: "worker-a",
      ref: {
        repository: "fork/code",
        branch: "avoozl/demo/work",
        commit: base,
      },
      base,
    },
    OPTIONS,
  );
  if (grant) {
    await ask(w, "worker-a");
    const reserved = await reserveGrants({ ...driving(w, journal), cap: 1 });
    assert.equal(reserved.acknowledged.length, 1);
  }
  const sources = {
      "example/code": { url: target },
      "fork/code": { url: fork, parent: "example/code" },
    },
    push = (named = files) => {
      git(seed, "checkout", "-q", "-B", checkpointBranch(SPEC, "t1"), base);
      for (const [name, text] of Object.entries(named)) {
        fs.mkdirSync(path.dirname(path.join(seed, name)), { recursive: true });
        fs.writeFileSync(path.join(seed, name), text);
      }
      git(seed, "add", ".");
      commitAs(seed, "Do t1");
      git(seed, "push", "-q", "-f", fork, checkpointBranch(SPEC, "t1"));
      return git(seed, "rev-parse", "HEAD");
    },
    step = (extra = {}) =>
      workerResultsStep(store, {
        driving: [SPEC],
        journalFor: async () => ({ journal, options: OPTIONS }),
        sources,
        ...extra,
      });
  return { store, root, base, push, step, sources };
}

test("a pushed result lands on the driver's tick with no command run by hand", async (t) => {
  const d = await driverWorld(t);
  // Nothing pushed yet: the task waits.
  assert.deepEqual((await d.step()).waiting, ["t1"]);
  const head = d.push();
  const result = await d.step();
  assert.deepEqual(result.landed, ["t1"]);
  assert.equal(
    git(d.root, "rev-parse", "refs/heads/avoozl/demo/work^2"),
    head,
    "the working branch merged the verified head",
  );
  // The working branch landed on the driver's base branch (wp-p3).
  assert.equal(
    git(d.root, "rev-parse", "main"),
    git(d.root, "rev-parse", "refs/heads/avoozl/demo/work"),
  );
  assert.equal(
    d.store.read().tasks.find((task) => task.id === "t1").integration.into,
    "main",
  );
  // The same head is judged once.
  assert.deepEqual((await d.step()).landed, []);
});

test("a result that touches a protected path, and one whose checks fail, are failed attempts with the reason", async (t) => {
  const guarded = await driverWorld(t);
  guarded.push({ "b.txt": "b\n" });
  const held = await guarded.step({ protectedPaths: ["b.txt"] });
  assert.equal(held.failed[0].outcome, "protected");
  assert.match(held.failed[0].cause, /protected/);
  assert.equal(held.notify.length, 1);
  assert.equal(guarded.store.get("task_deliveries", "t1").state, "decision");
  assert.equal(guarded.store.get("task_deliveries", "t1").attempts.length, 1);

  const failing = await driverWorld(t);
  failing.push();
  failing.store.put("repositories", {
    ...failing.store.get("repositories", "example/code"),
    checks: [["node", "-e", "process.exit(3)"]],
  });
  const rejected = await failing.step();
  assert.equal(rejected.failed[0].outcome, "rejected");
  const delivery = failing.store.get("task_deliveries", "t1");
  assert.equal(delivery.state, "failed");
  assert.match(delivery.attempts[0].cause, /rejected: checks/);
  assert.equal(
    spawnHas(failing.root, "refs/heads/avoozl/demo/work"),
    false,
    "nothing landed",
  );
});

test("a result for a grant the driver did not acknowledge is ignored", async (t) => {
  const d = await driverWorld(t, { grant: false });
  d.push();
  const result = await d.step();
  assert.deepEqual(result, { landed: [], failed: [], waiting: [], notify: [] });
  assert.equal(d.store.get("task_deliveries", "t1"), null);
});

const spawnHas = (cwd, ref) => {
  try {
    git(cwd, "rev-parse", "--verify", "--quiet", ref);
    return true;
  } catch {
    return false;
  }
};

test("worker-results.mjs has an importer that is not a test", () => {
  const sources = fs
    .readdirSync(new URL("..", import.meta.url))
    .filter((name) => name.endsWith(".mjs"))
    .filter((name) =>
      /worker-results\.mjs/.test(
        fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8"),
      ),
    );
  assert.ok(sources.includes("worker-result-step.mjs"), sources.join(", "));
});

// wp-p3: with workers.offerTo, the driver's tick offers each ready task of a
// driven spec once, holds it from local dispatch, and answers the grant.
test("the driver's tick offers ready tasks once, holds them here and acknowledges the grant", async (t) => {
  const { taskDefinition } = await import("../task-outcomes.mjs");
  const { offeredTaskIds, workerOffersStep } = await import(
    "../worker-offer-step.mjs"
  );
  const dir = temporaryDirectory("avoozl-driver-offers-"),
    root = path.join(dir, "code");
  fs.mkdirSync(root);
  git(root, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(root, "a.txt"), "a\n");
  git(root, "add", ".");
  git(
    root,
    "-c",
    "user.name=D",
    "-c",
    "user.email=d@example.com",
    "commit",
    "-qm",
    "Start",
  );
  const store = new Store(path.join(dir, "workspace.sqlite"));
  t.after(() => store.close());
  const task = {
    id: "t1",
    title: "Task t1",
    kind: "leaf",
    scope: "catalog",
    status: "planned",
    epic: "sample",
    track: "catalog",
    tags: [],
    acceptance: ["Works."],
    repository: "example/code",
    planId: SPEC,
  };
  store.initialize({ ...snapshot(), tasks: [task], edges: [] });
  store.put("repositories", {
    id: "example/code",
    github: "example/code",
    root,
    baseBranch: "main",
  });
  const w = world(),
    { journal } = await started(w),
    step = () =>
      workerOffersStep(store, {
        driving: [SPEC],
        logins: ["worker-a"],
        authorityFor: async () => ({
          journal,
          options: OPTIONS,
          login: "owner",
          owner: OWNER,
          driver: DRIVER,
          github: w.as("owner"),
        }),
      });
  const first = await step();
  assert.deepEqual(first.offered, [{ task: "t1", worker: "worker-a" }]);
  assert.ok(offeredTaskIds(store).has("t1"), "held from local dispatch");
  // Nearby input: a second tick offers nothing new.
  assert.deepEqual((await step()).offered, []);
  const definition = taskDefinition({
    id: "t1",
    title: "Task t1",
    acceptance: ["Works."],
  });
  await w
    .as("worker-a")
    .createIssueComment(
      "example/plans",
      1,
      requestBody({ spec: SPEC, task: "t1", definition, generation: 1 }),
    );
  const answered = await step();
  assert.equal(answered.acknowledged.length, 1);
  assert.equal(answered.acknowledged[0].task, "t1");
  assert.ok(w.branches.has(`example/code:${grantBranch(SPEC, "t1")}`));
  // Without workers.offerTo the step does nothing.
  const none = await workerOffersStep(store, {
    driving: [SPEC],
    logins: [],
    authorityFor: async () => {
      throw Error("not called");
    },
  });
  assert.deepEqual(none.offered, []);
});
