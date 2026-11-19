// Direct landing in merge batches (tasks 41.3, mb-1.2 to mb-1.4). Journals
// are in memory; repositories are local scratch repositories with a bare
// remote.
import { parseLanding } from "../landing-trailers.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { digest } from "../../model.mjs";
import { fixture } from "./fixtures.mjs";
import { gitTemplate } from "./git-template.mjs";
import { git } from "../git.mjs";
import { journalOutcomes, replayJournal } from "../spec-journal.mjs";
import { taskOutcome } from "../task-outcomes.mjs";
import { driverState, takeOver } from "../driver-generations.mjs";
import { batchOf, landNext, landingQueue } from "../landing-queue.mjs";
import { directSteps, memberRef, queuePortion } from "../merge-batch.mjs";
import { workingBranch } from "../working-heads.mjs";

const Q = { repositoryId: "fixture", base: "main" };
const BATCH = { limit: 4, bisect: true };
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

// The base commit's files, which a portion appends to.
const BASE_FILES = {
  "check.mjs":
    'import fs from "node:fs"; process.exit(fs.existsSync("bad.txt") ? 1 : 0);\n',
  "CHANGELOG.md": "start\n",
};

// A bare upstream whose check fails when `bad.txt` exists, and a landing
// clone where each portion is a commit on its own branch from the base.
// Built once for the file; each test gets a copy.
const repositories = gitTemplate(async (dir) => {
  const seed = path.join(dir, "seed"),
    upstream = path.join(dir, "upstream.git"),
    landing = path.join(dir, "landing");
  fs.mkdirSync(seed);
  const identity = async (repo) => {
    await git(repo, ["config", "user.name", "Fixture"]);
    await git(repo, ["config", "user.email", "fixture@example.invalid"]);
  };
  await git(seed, ["init", "-q", "-b", "main"]);
  await identity(seed);
  for (const [file, text] of Object.entries(BASE_FILES))
    fs.writeFileSync(path.join(seed, file), text);
  await git(seed, ["add", "."]);
  await git(seed, ["commit", "-q", "-m", "Start"]);
  await git(dir, ["clone", "-q", "--bare", seed, upstream]);
  await git(dir, ["clone", "-q", upstream, landing]);
  await identity(landing);
  return { upstream, landing, base: await git(seed, ["rev-parse", "HEAD"]) };
});

async function setup(t) {
  const { root, store } = fixture(t),
    { upstream, landing, base } = await repositories(root);
  const head = async () =>
    (
      await git(root, ["ls-remote", "--heads", upstream, "refs/heads/main"])
    ).split(/\s+/)[0];
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
  // One verified portion: a commit with `files` on its own branch, made by
  // one `git fast-import` from the base's files (no checkout, add or commit).
  const marks = path.join(root, "portion-marks");
  const portion = async (spec, task, files, { driver = "d1" } = {}) => {
    const data = (text) => `data ${Buffer.byteLength(text)}\n${text}`;
    execFileSync("git", ["fast-import", "--quiet", `--export-marks=${marks}`], {
      cwd: landing,
      input: [
        `commit refs/heads/${spec}-${task}`,
        "mark :1",
        "committer Fixture <fixture@example.invalid> 1700000000 +0000",
        data(`Work on ${task}\n`),
        `from ${base}`,
        ...Object.entries(files).flatMap(([file, text]) => [
          `M 100644 inline ${file}`,
          data((BASE_FILES[file] ?? "") + text),
        ]),
        "",
      ].join("\n"),
    });
    const commit = fs.readFileSync(marks, "utf8").trim().split(" ")[1];
    await journalOf(spec);
    return queuePortion(store, {
      ...Q,
      spec,
      driver,
      commit,
      tasks: [
        {
          task,
          definition: def(task),
          metrics: { tries: "2", harness: "process" },
        },
      ],
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
    journalOf,
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

test("a merge batch across specs lands in one guarded push, up to the limit", async (t) => {
  const x = await setup(t);
  await x.portion("spec-a", "t1", { "one.txt": "1\n" });
  await x.portion("spec-b", "t2", { "two.txt": "2\n" });
  await x.portion("spec-a", "t3", { "three.txt": "3\n" });
  await x.portion("spec-b", "t4", { "four.txt": "4\n" });
  await x.portion("spec-a", "t5", { "five.txt": "5\n" });
  const s = x.steps(),
    result = await landNext(x.store, Q, s, BATCH);
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
    // The intent carries the checks that passed at the candidate, so each
    // landed outcome has evidence and completes its task (R102.5).
    const replay = await replayJournal(x.journals.get(spec).entries, {
      permission: x.journals.get(spec).permission,
      visibility: "private",
    });
    for (const task of tasks)
      assert.equal(
        taskOutcome(journalOutcomes(replay), {
          spec,
          task,
          revision: REVISION,
          definition: def(task),
        }).state,
        "complete",
        `${spec} ${task}`,
      );
    const [evidence] = [...st.intents.values()][0].checks;
    assert.match(evidence.name, /^node(\.exe)? check\.mjs$/);
    assert.equal(evidence.conclusion, "success");
  }
  // Every merge commit carries its tasks' trailers.
  const log = await git(x.landing, [
    "log",
    "--format=%B",
    `${x.base}..${result.candidate}`,
  ]);
  for (const task of ["t1", "t2", "t3", "t4"])
    assert.match(log, new RegExp(`Avoozl-Task: ${task}@${def(task)}`));
  // And what each landing cost, under its task (landing-trailers.mjs).
  assert.deepEqual(
    parseLanding(log).map((t) => [t.task, t.tries, t.harness]),
    [
      ["t4", 2, "process"],
      ["t3", 2, "process"],
      ["t2", 2, "process"],
      ["t1", 2, "process"],
    ],
  );
});

test("members of two drivers land in one fast-forward, each intent read back first", async (t) => {
  const x = await setup(t);
  await x.portion("spec-a", "t1", { "one.txt": "1\n" });
  await x.portion("spec-b", "t2", { "two.txt": "2\n" }, { driver: "d2" });
  await x.portion("spec-b", "t3", { "three.txt": "3\n" }, { driver: "d2" });
  const s = x.steps(),
    result = await landNext(x.store, Q, s, { ...BATCH, limit: 3 });
  assert.equal(result.state, "landed");
  assert.deepEqual(
    result.entries.map((e) => e.key),
    ["spec-a.t1", "spec-b.t2", "spec-b.t3"],
  );
  assert.equal(await x.head(), result.candidate);
  assert.equal(s.log.results[0].length, 2);
  for (const r of s.log.results[0]) assert.equal(r.state, "landed");
});

test("a batch of one lands as direct landing did, and a base that moved gets new checks", async (t) => {
  const x = await setup(t);
  await x.portion("spec-a", "t1", { "one.txt": "1\n" });
  const ran = [];
  let moved = false;
  const s = x.steps({
    run: async (repository, commit, argv) => {
      const { runCheckAt } = await import("../flow-line.mjs");
      ran.push(commit);
      if (!moved) {
        // Someone else pushes to the base while the checks run.
        moved = true;
        const other = path.join(x.root, "other");
        await git(x.root, ["clone", "-q", x.upstream, other]);
        await git(other, ["config", "user.name", "Other"]);
        await git(other, ["config", "user.email", "other@example.invalid"]);
        fs.writeFileSync(path.join(other, "other.txt"), "o\n");
        await git(other, ["add", "."]);
        await git(other, ["commit", "-q", "-m", "Other work"]);
        await git(other, ["push", "-q", "origin", "main"]);
      }
      return runCheckAt(repository, commit, argv);
    },
  });
  const first = await landNext(x.store, Q, s);
  assert.equal(first.state, "base-moved");
  assert.equal(landingQueue(x.store, Q).length, 1);
  const second = await landNext(x.store, Q, s);
  assert.equal(second.state, "landed");
  assert.equal(second.entries.length, 1);
  // A new candidate on the new base, checked again.
  assert.equal(ran.length, 2);
  assert.notEqual(ran[0], ran[1]);
  assert.equal(await x.head(), second.candidate);
});

test("a push never forces", async (t) => {
  const x = await setup(t);
  await x.portion("spec-a", "t1", { "one.txt": "1\n" });
  await x.portion("spec-b", "t2", { "two.txt": "2\n" });
  const trace = path.join(x.root, "trace.log");
  const s = x.steps({ env: { ...process.env, GIT_TRACE: trace } });
  const result = await landNext(x.store, Q, s, BATCH);
  assert.equal(result.state, "landed");
  const pushes = fs
    .readFileSync(trace, "utf8")
    .split("\n")
    .filter((line) => /\bgit\b.*\bpush\b/.test(line));
  assert.ok(pushes.length > 0);
  for (const line of pushes) assert.doesNotMatch(line, /--force|\s-f\b|\s\+/);
});

// The check runner for the next tests: bad.txt fails alone, pair-a.txt and
// pair-b.txt fail only together, and flaky.txt fails the first time a head
// is checked and passes the second.
function fakeRunner() {
  const seen = new Map(),
    trees = new Map();
  return async (repository, commit, argv) => {
    // A commit's tree never changes, so each is listed once.
    if (!trees.has(commit))
      trees.set(
        commit,
        (
          await git(repository.root, ["ls-tree", "-r", "--name-only", commit])
        ).split("\n"),
      );
    const files = trees.get(commit);
    const key = `${commit}:${argv.join(" ")}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    const bad =
      files.includes("bad.txt") ||
      (files.includes("pair-a.txt") && files.includes("pair-b.txt")) ||
      (files.includes("flaky.txt") && seen.get(key) === 1);
    return {
      exitCode: bad ? 1 : 0,
      durationMs: 1,
      tail: bad ? "FAILED\n".repeat(5000) : "",
    };
  };
}

test("a flaky failure lands the batch and is recorded as flaky", async (t) => {
  const x = await setup(t);
  await x.portion("spec-a", "t1", { "one.txt": "1\n" });
  await x.portion("spec-a", "t2", { "flaky.txt": "f\n" });
  const result = await landNext(
    x.store,
    Q,
    x.steps({ run: fakeRunner() }),
    BATCH,
  );
  assert.equal(result.state, "landed");
  assert.equal(result.entries.length, 2);
  assert.ok(result.entries.every((e) => e.flaky === true));
  assert.deepEqual(result.sentBack, []);
});

test("with member 5 of 8 bad, 1 to 4 land, 5 goes back with its failing check and 6 to 8 are next", async (t) => {
  const x = await setup(t);
  for (let n = 1; n <= 8; n += 1)
    await x.portion(
      "spec-a",
      `t${n}`,
      n === 5 ? { "bad.txt": "x\n" } : { [`f${n}.txt`]: `${n}\n` },
    );
  const result = await landNext(x.store, Q, x.steps({ run: fakeRunner() }), {
    limit: 8,
    bisect: true,
  });
  assert.equal(result.state, "landed");
  assert.deepEqual(
    result.entries.map((e) => e.key),
    ["spec-a.t1", "spec-a.t2", "spec-a.t3", "spec-a.t4"],
  );
  const [sent] = result.sentBack;
  assert.equal(sent.state, "failed");
  assert.equal(sent.entry.key, "spec-a.t5");
  assert.match(sent.entry.checks[0].command, /check\.mjs/);
  assert.ok(sent.entry.excerpt.length > 0);
  assert.ok(Buffer.byteLength(sent.entry.excerpt) <= 8192);
  assert.equal(sent.entry.checks[0].tail, undefined);
  assert.deepEqual(
    landingQueue(x.store, Q).map((e) => e.key),
    ["spec-a.t6", "spec-a.t7", "spec-a.t8"],
  );
  assert.deepEqual(result.batch.culprits, ["spec-a.t5"]);
  assert.equal(await x.tree("bad.txt"), null);
  assert.equal(await x.head(), result.candidate);
});

test("a prefix of a stack already made is that stack's head, stacked once", async (t) => {
  const x = await setup(t);
  for (let n = 1; n <= 3; n += 1)
    await x.portion("spec-a", `t${n}`, { [`f${n}.txt`]: `${n}\n` });
  const entries = landingQueue(x.store, Q),
    s = x.steps(),
    full = await s.prepare(entries, x.base);
  assert.equal(full.heads.length, 3);
  assert.equal(full.heads[2], full.candidate);
  const two = await s.prepare(entries.slice(0, 2), x.base);
  assert.deepEqual(two, { candidate: full.heads[1] });
  assert.equal(
    await git(x.landing, ["rev-parse", `${full.candidate}^1`]),
    two.candidate,
  );
  const files = await git(x.landing, ["ls-tree", "--name-only", two.candidate]);
  assert.match(files, /f2\.txt/);
  assert.doesNotMatch(files, /f3\.txt/);
  // Another order is a new stack.
  const other = await s.prepare([entries[1]], x.base);
  assert.equal(other.heads.length, 1);
  assert.notEqual(other.candidate, full.heads[0]);
  // A member already in the stack adds no commit and keeps the head.
  const again = { ...entries[0], key: "spec-a.again" },
    noop = await s.prepare([entries[0], again, entries[1]], x.base);
  assert.equal(noop.heads[1], noop.heads[0]);
  assert.equal(
    await git(x.landing, ["rev-parse", `${noop.heads[2]}^1`]),
    noop.heads[1],
  );
});

test("a pair that fails only together sends back the later one naming the earlier, which lands", async (t) => {
  const x = await setup(t);
  await x.portion("spec-a", "t1", { "pair-a.txt": "a\n" });
  await x.portion("spec-a", "t2", { "pair-b.txt": "b\n" });
  const result = await landNext(
    x.store,
    Q,
    x.steps({ run: fakeRunner() }),
    BATCH,
  );
  assert.equal(result.state, "landed");
  assert.deepEqual(
    result.entries.map((e) => e.key),
    ["spec-a.t1"],
  );
  const [sent] = result.sentBack;
  assert.equal(sent.entry.key, "spec-a.t2");
  assert.deepEqual(sent.entry.with, ["spec-a.t1"]);
});

test("a member that conflicts with an earlier one goes back with its files and the rest land", async (t) => {
  const x = await setup(t);
  await x.portion("spec-a", "t1", { "CHANGELOG.md": "from t1\n" });
  await x.portion("spec-a", "t2", { "CHANGELOG.md": "from t2\n" });
  await x.portion("spec-b", "t3", { "three.txt": "3\n" });
  const result = await landNext(x.store, Q, x.steps(), BATCH);
  assert.equal(result.state, "landed");
  assert.deepEqual(
    result.entries.map((e) => e.key),
    ["spec-a.t1", "spec-b.t3"],
  );
  assert.equal(result.sentBack[0].state, "conflict");
  assert.equal(result.sentBack[0].entry.key, "spec-a.t2");
  assert.deepEqual(result.sentBack[0].entry.files, ["CHANGELOG.md"]);
});

test("a member marked alone lands alone", async (t) => {
  const x = await setup(t);
  await x.portion("spec-a", "t1", { "one.txt": "1\n" });
  await x.portion("spec-a", "t2", { "two.txt": "2\n" });
  await x.portion("spec-a", "t3", { "three.txt": "3\n" });
  const queue = landingQueue(x.store, Q),
    isAlone = (entry) => entry.key === "spec-a.t2",
    keys = (list) => list.map((e) => e.key);
  // It ends the batch before it, and when it is first it takes the batch.
  assert.deepEqual(keys(batchOf(x.store, queue, { limit: 3, isAlone })), [
    "spec-a.t1",
  ]);
  assert.deepEqual(
    keys(batchOf(x.store, queue.slice(1), { limit: 3, isAlone })),
    ["spec-a.t2"],
  );
});

test("a worker machine's result lands from its fetched ref, and the remote holds only the base", async (t) => {
  const x = await setup(t);
  // The result's commit exists only in another clone and arrives by fetch
  // into the member's ref.
  const worker = path.join(x.root, "worker");
  await git(x.root, ["clone", "-q", x.upstream, worker]);
  await git(worker, ["config", "user.name", "Worker"]);
  await git(worker, ["config", "user.email", "worker@example.invalid"]);
  fs.writeFileSync(path.join(worker, "remote.txt"), "r\n");
  await git(worker, ["add", "."]);
  await git(worker, ["commit", "-q", "-m", "Work on t1"]);
  const commit = await git(worker, ["rev-parse", "HEAD"]);
  await git(x.landing, [
    "fetch",
    "-q",
    worker,
    `${commit}:${memberRef("spec-a.t1")}`,
  ]);
  await x.journalOf("spec-a");
  queuePortion(x.store, {
    ...Q,
    spec: "spec-a",
    driver: "d1",
    commit,
    tasks: [{ task: "t1", definition: def("t1") }],
    evidence: { commit, checks: [{ command: "npm test", exitCode: 0 }] },
    key: "spec-a.t1",
  });
  const result = await landNext(x.store, Q, x.steps(), BATCH);
  assert.equal(result.state, "landed");
  assert.equal(await x.tree("remote.txt"), "r");
  const refs = (await git(x.upstream, ["for-each-ref", "--format=%(refname)"]))
    .split("\n")
    .filter(Boolean);
  assert.deepEqual(refs, ["refs/heads/main"]);
});

test("declared union paths merge in the landing worktree; other conflicts send the later member back", async (t) => {
  const x = await setup(t);
  await x.portion("spec-a", "t1", { "CHANGELOG.md": "from t1\n" });
  await x.portion("spec-a", "t2", { "CHANGELOG.md": "from t2\n" });
  // Without union paths the second conflicts: it goes back and the first lands.
  const plain = await landNext(x.store, Q, x.steps(), BATCH);
  assert.equal(plain.state, "landed");
  assert.deepEqual(
    plain.entries.map((e) => e.key),
    ["spec-a.t1"],
  );
  assert.equal(plain.sentBack[0].state, "conflict");
  assert.deepEqual(plain.sentBack[0].entry.files, ["CHANGELOG.md"]);

  // With CHANGELOG.md declared append-only, both lines land together.
  await x.portion("spec-b", "t3", { "CHANGELOG.md": "from t3\n" });
  await x.portion("spec-b", "t4", { "CHANGELOG.md": "from t4\n" });
  const union = await landNext(
    x.store,
    Q,
    x.steps({ unionPaths: ["CHANGELOG.md"] }),
    BATCH,
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
  const result = await landNext(x.store, Q, s, BATCH);
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
    result = await landNext(x.store, Q, s, BATCH);
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
