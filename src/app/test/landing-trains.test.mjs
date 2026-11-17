// Direct portions and bounded trains (task 41.3). Journals are in memory;
// repositories are local scratch repositories with a bare remote.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { digest } from "../../model.mjs";
import { fixture } from "./fixtures.mjs";
import { git } from "../git.mjs";
import { replayJournal } from "../spec-journal.mjs";
import { driverState, takeOver } from "../driver-generations.mjs";
import { landNext, landingQueue } from "../landing-queue.mjs";
import { TRAIN_TASKS, directSteps, queuePortion } from "../landing-trains.mjs";
import { workingBranch } from "../working-heads.mjs";

const Q = { projectId: "fixture", base: "main" };
const owner = { login: "owner", from: "spec" };
const person = { kind: "person", login: "owner" };
const REVISION = digest("revision");
const def = (task) => digest("definition " + task);

function memory() {
  const entries = [];
  return {
    entries,
    list: async () => structuredClone(entries),
    create: async (body) => {
      const id = 1000 + entries.length * 7;
      entries.push({ id, body, author: "owner" });
      return { id };
    },
    permission: async (login) => (login === "owner" ? "admin" : "none"),
  };
}

const state = async (journal) =>
  driverState(
    await replayJournal(journal.entries, {
      permission: journal.permission,
      visibility: "private",
    }),
  );

// A bare upstream whose check fails when `bad.txt` exists, and a landing
// clone where each portion is a commit on its own branch from the base.
async function setup(t) {
  const { root, store } = fixture(t),
    seed = path.join(root, "seed"),
    upstream = path.join(root, "upstream.git"),
    landing = path.join(root, "landing");
  fs.mkdirSync(seed);
  const identity = async (dir) => {
    await git(dir, ["config", "user.name", "Fixture"]);
    await git(dir, ["config", "user.email", "fixture@example.invalid"]);
  };
  await git(seed, ["init", "-q", "-b", "main"]);
  await identity(seed);
  fs.writeFileSync(
    path.join(seed, "check.mjs"),
    'import fs from "node:fs"; process.exit(fs.existsSync("bad.txt") ? 1 : 0);\n',
  );
  fs.writeFileSync(path.join(seed, "CHANGELOG.md"), "start\n");
  await git(seed, ["add", "."]);
  await git(seed, ["commit", "-q", "-m", "Start"]);
  await git(root, ["clone", "-q", "--bare", seed, upstream]);
  await git(root, ["clone", "-q", upstream, landing]);
  await identity(landing);
  const head = async () =>
    (
      await git(root, ["ls-remote", "--heads", upstream, "refs/heads/main"])
    ).split(/\s+/)[0];
  const base = await head();
  const options = {
    visibility: "private",
    machine: { hostname: "made-up-host", username: "madeupuser" },
    configFile: path.join(root, "machine.json"),
  };
  const journals = new Map(),
    drivers = new Map();
  const journalOf = async (spec) => {
    if (!journals.has(spec)) {
      const journal = memory();
      journals.set(spec, journal);
      const { driver } = await takeOver(
        journal,
        { by: person, owner, spec },
        options,
      );
      drivers.set(spec, driver);
    }
    return journals.get(spec);
  };
  // One verified portion: a commit with `files` on its own branch.
  const portion = async (spec, task, files, { driver = "d1" } = {}) => {
    await git(landing, ["checkout", "-q", "-B", `${spec}-${task}`, base]);
    for (const [file, text] of Object.entries(files)) {
      const full = path.join(landing, file);
      fs.writeFileSync(
        full,
        (fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "") + text,
      );
    }
    await git(landing, ["add", "."]);
    await git(landing, ["commit", "-q", "-m", `Work on ${task}`]);
    const commit = await git(landing, ["rev-parse", "HEAD"]);
    await journalOf(spec);
    return queuePortion(store, {
      ...Q,
      spec,
      driver,
      commit,
      tasks: [{ task, definition: def(task) }],
      evidence: { commit, checks: [{ command: "npm test", exitCode: 0 }] },
      key: `${spec}.${task}`,
    });
  };
  const steps = (extra = {}) =>
    directSteps({
      root: landing,
      url: upstream,
      branch: "main",
      repository: "acme/app",
      checks: [[process.execPath, "check.mjs"]],
      scan: async () => [],
      intent: (spec) => ({
        journal: journals.get(spec),
        options,
        input: {
          driver: drivers.get(spec),
          owner,
          login: "owner",
          revision: REVISION,
          checks: [{ name: "check.mjs", conclusion: "success" }],
        },
      }),
      ...extra,
    });
  const tree = async (file) => {
    await git(landing, ["fetch", "-q", "origin", "main"]);
    return git(landing, ["show", `FETCH_HEAD:${file}`]).catch(() => null);
  };
  return {
    store,
    root,
    landing,
    upstream,
    head,
    base,
    portion,
    steps,
    journals,
    tree,
    options,
  };
}

test("only verified portions with task definitions are queued", async (t) => {
  const x = await setup(t);
  const commit = x.base;
  const input = {
    ...Q,
    spec: "s",
    driver: "d1",
    commit,
    tasks: [{ task: "t1", definition: def("t1") }],
  };
  assert.throws(
    () => queuePortion(x.store, { ...input, evidence: null }),
    /Only verified work/,
  );
  assert.throws(
    () =>
      queuePortion(x.store, {
        ...input,
        evidence: { commit, checks: [{ exitCode: 1 }] },
      }),
    /did not pass/,
  );
  assert.throws(
    () =>
      queuePortion(x.store, {
        ...input,
        tasks: [{ task: "t1" }],
        evidence: { commit, checks: [{ exitCode: 0 }] },
      }),
    /definition/,
  );
  assert.throws(
    () =>
      directSteps({
        root: x.landing,
        url: x.upstream,
        branch: "main",
        checks: [["true"]],
      }),
    /intent/,
  );
});

test("a train of one driver's portions across specs lands in one guarded push, at most four tasks", async (t) => {
  const x = await setup(t);
  await x.portion("spec-a", "t1", { "one.txt": "1\n" });
  await x.portion("spec-b", "t2", { "two.txt": "2\n" });
  await x.portion("spec-a", "t3", { "three.txt": "3\n" });
  await x.portion("spec-b", "t4", { "four.txt": "4\n" });
  await x.portion("spec-a", "t5", { "five.txt": "5\n" });
  const s = x.steps(),
    result = await landNext(x.store, Q, s, { maxTasks: TRAIN_TASKS });
  assert.equal(result.state, "landed");
  assert.deepEqual(
    result.entries.map((e) => e.key),
    ["spec-a.t1", "spec-b.t2", "spec-a.t3", "spec-b.t4"],
  );
  assert.equal(await x.head(), result.candidate);
  // The fifth task waits for the next train.
  assert.deepEqual(
    landingQueue(x.store, Q).map((e) => e.key),
    ["spec-a.t5"],
  );
  // Each spec's journal has an intent and a landed outcome for its tasks.
  for (const [spec, tasks] of [
    ["spec-a", ["t1", "t3"]],
    ["spec-b", ["t2", "t4"]],
  ]) {
    const st = await state(x.journals.get(spec));
    assert.deepEqual(st.outcomes.map((o) => o.task).sort(), tasks, spec);
    assert.ok(
      st.outcomes.every(
        (o) => o.kind === "landed" && o.commit === result.candidate,
      ),
    );
  }
  // Every merge commit carries its tasks' trailers.
  const log = await git(x.landing, [
    "log",
    "--format=%B",
    `${x.base}..${result.candidate}`,
  ]);
  for (const task of ["t1", "t2", "t3", "t4"])
    assert.match(log, new RegExp(`Avoozl-Task: ${task}@${def(task)}`));
});

test("another driver's portion does not join the train", async (t) => {
  const x = await setup(t);
  await x.portion("spec-a", "t1", { "one.txt": "1\n" });
  await x.portion("spec-b", "t2", { "two.txt": "2\n" }, { driver: "d2" });
  const result = await landNext(x.store, Q, x.steps(), {
    maxTasks: TRAIN_TASKS,
  });
  assert.deepEqual(
    result.entries.map((e) => e.key),
    ["spec-a.t1"],
  );
});

test("a failed train is halved until one task is left; no landed head failed its checks", async (t) => {
  const x = await setup(t);
  await x.portion("spec-a", "t1", { "one.txt": "1\n" });
  await x.portion("spec-a", "t2", { "two.txt": "2\n" });
  await x.portion("spec-a", "t3", { "bad.txt": "x\n" });
  await x.portion("spec-a", "t4", { "four.txt": "4\n" });
  const ran = [];
  const s = x.steps({
    run: async (project, commit, argv) => {
      const { runCheckAt } = await import("../flow-line.mjs");
      const result = await runCheckAt(project, commit, argv);
      ran.push({ commit, exitCode: result.exitCode });
      return result;
    },
  });
  const go = () => landNext(x.store, Q, s, { maxTasks: TRAIN_TASKS });
  const first = await go();
  assert.equal(first.state, "landed");
  assert.deepEqual(
    first.entries.map((e) => e.key),
    ["spec-a.t1", "spec-a.t2"],
  );
  const second = await go();
  assert.equal(second.state, "failed");
  assert.equal(second.entry.key, "spec-a.t3");
  const third = await go();
  assert.equal(third.state, "landed");
  assert.deepEqual(
    third.entries.map((e) => e.key),
    ["spec-a.t4"],
  );
  assert.equal(await x.tree("bad.txt"), null);
  // Every head pushed was a candidate whose checks passed.
  const passed = new Set(
    ran.filter((r) => r.exitCode === 0).map((r) => r.commit),
  );
  assert.ok(passed.has(first.candidate) && passed.has(third.candidate));
  assert.equal(await x.head(), third.candidate);
});

test("declared union paths merge in the landing worktree; other conflicts refuse the portion", async (t) => {
  const x = await setup(t);
  await x.portion("spec-a", "t1", { "CHANGELOG.md": "from t1\n" });
  await x.portion("spec-a", "t2", { "CHANGELOG.md": "from t2\n" });
  // Without union paths the second conflicts: the train narrows to the first.
  const plain = await landNext(x.store, Q, x.steps(), {
    maxTasks: TRAIN_TASKS,
  });
  assert.equal(plain.state, "landed");
  assert.deepEqual(
    plain.entries.map((e) => e.key),
    ["spec-a.t1"],
  );
  const conflict = await landNext(x.store, Q, x.steps(), {
    maxTasks: TRAIN_TASKS,
  });
  assert.equal(conflict.state, "conflict");
  assert.deepEqual(conflict.entry.files, ["CHANGELOG.md"]);

  // With CHANGELOG.md declared append-only, both lines land together.
  await x.portion("spec-b", "t3", { "CHANGELOG.md": "from t3\n" });
  await x.portion("spec-b", "t4", { "CHANGELOG.md": "from t4\n" });
  const union = await landNext(
    x.store,
    Q,
    x.steps({ unionPaths: ["CHANGELOG.md"] }),
    { maxTasks: TRAIN_TASKS },
  );
  assert.equal(union.state, "landed");
  const text = await x.tree("CHANGELOG.md");
  for (const line of ["start", "from t1", "from t3", "from t4"])
    assert.ok(text.includes(line), line);
  // The landing clone's own checkout was never touched by the merge.
  assert.equal(await git(x.landing, ["status", "--porcelain"]), "");
});

test("a content scan hit pushes nothing", async (t) => {
  const x = await setup(t);
  await x.portion("spec-a", "t1", { "one.txt": "1\n" });
  const seen = [];
  const s = x.steps({
    scan: async (root, range) => {
      seen.push(range);
      return [{ target: "file:one.txt", line: 1, rule: "hostname" }];
    },
  });
  const result = await landNext(x.store, Q, s, { maxTasks: TRAIN_TASKS });
  assert.equal(result.state, "failed");
  assert.equal(result.entry.checks[0].command, "content scan");
  assert.equal(seen[0].base, x.base);
  assert.equal(await x.head(), x.base);
});

test("a displaced driver's intent stops before the push", async (t) => {
  const x = await setup(t);
  await x.portion("spec-a", "t1", { "one.txt": "1\n" });
  // The owner takes over on another machine: d1 is no longer the driver.
  await takeOver(
    x.journals.get("spec-a"),
    { by: person, owner, spec: "spec-a" },
    x.options,
  );
  const s = x.steps(),
    result = await landNext(x.store, Q, s, { maxTasks: TRAIN_TASKS });
  assert.equal(result.state, "not-landed");
  assert.equal(s.log.results[0][0].state, "refused");
  assert.equal(await x.head(), x.base);
  assert.equal(landingQueue(x.store, Q)[0].key, "spec-a.t1");
});

test("after a landing the new base merges back into the spec's working branch, keeping unlanded work", async (t) => {
  const x = await setup(t);
  const landed = await x.portion("spec-a", "t1", { "one.txt": "1\n" }),
    branch = workingBranch("spec-a");
  // The working branch holds t1 and a verified t2 that is not queued.
  await git(x.landing, ["checkout", "-q", "-B", "spec-a-t2", x.base]);
  fs.writeFileSync(path.join(x.landing, "two.txt"), "2\n");
  await git(x.landing, ["add", "."]);
  await git(x.landing, ["commit", "-q", "-m", "Work on t2"]);
  const unlanded = await git(x.landing, ["rev-parse", "HEAD"]);
  await git(x.landing, ["checkout", "-q", "-B", branch, x.base]);
  for (const commit of [landed.commit, unlanded])
    await git(x.landing, ["merge", "-q", "--no-ff", "-m", "Integrate", commit]);
  await git(x.landing, ["checkout", "-q", "--detach"]);
  const before = await git(x.landing, ["rev-parse", branch]);
  const result = await landNext(x.store, Q, x.steps());
  assert.equal(result.state, "landed");
  assert.deepEqual(
    result.mergedBack.map((m) => [m.spec, m.merged]),
    [["spec-a", true]],
  );
  const head = await git(x.landing, ["rev-parse", branch]);
  assert.equal(
    await git(x.landing, ["rev-list", "--parents", "-n", "1", head]),
    `${head} ${before} ${result.candidate}`,
  );
  await git(x.landing, ["merge-base", "--is-ancestor", unlanded, head]);
});
