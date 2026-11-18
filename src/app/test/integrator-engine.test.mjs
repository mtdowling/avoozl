// The train engine (lt-5.1): gated and optimistic policies, the guarded push,
// a moved trunk, and no force push anywhere. Real git with a bare remote; the
// validation commands are small node scripts.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { digest } from "../../model.mjs";
import { bindContentRules } from "../content-rules.mjs";
import { driverState } from "../driver-generations.mjs";
import { runTrain } from "../integrator-run.mjs";
import { readTrainCi } from "../integrator-ci.mjs";
import { integratorPass, queueBatch } from "../integrator-trains.mjs";
import { requireTrainSettings } from "../integrator-trains.mjs";
import { landingQueue } from "../landing-queue.mjs";
import { replayJournal } from "../spec-journal.mjs";
import { specAuthority, takeOverSpec } from "../spec-takeover.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const node = (code) => [process.execPath, "-e", code];
const leaf = (id, planId = "s1") => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: [id + " works."],
  repository: "app",
  planId,
});

// `full` is the full-validation command; it runs in the landing worktree and
// can read ORIGIN (the bare remote's path) from its own script text.
async function workspace(
  t,
  { policy = "gated", full, cheap, trigger = {}, maxRebases } = {},
) {
  const root = temporaryDirectory("avoozl-engine-"),
    origin = path.join(root, "origin.git"),
    checkout = path.join(root, "app");
  git(root, "init", "--bare", "-b", "main", origin);
  git(root, "clone", "-q", origin, checkout);
  for (const [k, v] of [
    ["user.name", "Test"],
    ["user.email", "test@example.com"],
  ])
    git(checkout, "config", k, v);
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  git(checkout, "push", "-q", "origin", "main");
  const config = {
    landing: {
      trains: {
        ci: { workflow: "ci.yml" },
        trigger: { minBranches: 1, cooldownSeconds: 0, ...trigger },
        validation: {
          cheap: [cheap ?? node("0")],
          full: { "macos-arm64": { command: full ?? node("0") } },
        },
        ...(maxRebases === undefined ? {} : { failure: { maxRebases } }),
        targets: { main: { policy } },
      },
    },
    machine: { platforms: { "macos-arm64": { kind: "native" } } },
  };
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  bindContentRules(store, {
    workspaceRoot: root,
    configFile: path.join(root, "m.json"),
  });
  store.importSnapshot({
    ...snapshot(),
    tasks: [leaf("t1"), leaf("t2", "s2"), leaf("t3"), leaf("t4")],
    edges: [],
  });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    landing: "train",
    checks: [node("0")],
    worktreeRoot: path.join(root, "wt"),
  });
  for (const spec of ["s1", "s2"]) {
    store.put("plans", {
      id: spec,
      spec,
      hash: digest("plan " + spec),
      state: "approved",
    });
    store.put("receipts", {
      id: `spec-journal:${spec}`,
      kind: "spec-journal",
      planId: spec,
      home: "local",
    });
    await takeOverSpec(store, { workspaceRoot: root, actor: "Operator" }, spec);
  }
  const w = {
    root,
    origin,
    checkout: fs.realpathSync.native(checkout),
    store,
    config,
  };
  w.settings = () => requireTrainSettings(config, "main");
  return w;
}

// A task branch with one commit from `from`, queued as a batch branch.
async function queued(w, id, { file = `${id}.txt`, from = "main" } = {}) {
  const wt = path.join(w.root, "wt", id);
  git(w.checkout, "worktree", "add", "-q", "-b", `avoozl/${id}`, wt, from);
  fs.writeFileSync(path.join(wt, file), id + "\n");
  git(wt, "add", ".");
  git(wt, "commit", "-qm", `Do ${id}`);
  const commit = git(wt, "rev-parse", "HEAD"),
    task = w.store.read().tasks.find((x) => x.id === id);
  w.store.put("task_worktrees", {
    id,
    taskId: id,
    path: wt,
    branch: `avoozl/${id}`,
    repository: "app",
  });
  w.store.put("task_deliveries", {
    id,
    taskId: id,
    state: "done",
    commit,
    attempts: [],
    verifications: [],
  });
  await queueBatch(w.store, {
    project: w.store.get("projects", "app"),
    task,
    commit,
    config: w.config,
    machine: {},
  });
  return { commit, wt };
}

const train = (w, extra = {}) =>
  runTrain(w.store, {
    project: w.store.get("projects", "app"),
    target: "main",
    settings: w.settings(),
    config: w.config,
    lease: { leaseId: "lease-1" },
    workspaceRoot: w.root,
    machine: {},
    ...extra,
  });
const trunk = (w) => git(w.origin, "rev-parse", "main");
const queue = (w) => landingQueue(w.store, { projectId: "app", base: "main" });

// A command that records, when it runs, what the remote trunk is.
const probe = (w, log) =>
  node(
    `const {execFileSync}=require('child_process');require('fs').appendFileSync(${JSON.stringify(log)}, execFileSync('git',['rev-parse','main'],{cwd:${JSON.stringify(w.origin)},encoding:'utf8'}))`,
  );

test("gated: the trunk is pushed only after full validation passed on the stack", async (t) => {
  const log = path.join(temporaryDirectory("avoozl-engine-log-"), "log"),
    w = await workspace(t),
    start = trunk(w);
  w.config.landing.trains.validation.full["macos-arm64"].command = probe(
    w,
    log,
  );
  await queued(w, "t1");
  await queued(w, "t2");
  await queued(w, "t3");
  const result = await train(w);
  assert.equal(result.state, "landed");
  assert.equal(result.train.outcome, "landed");
  // At validation time the trunk was still the start; afterward it moved.
  assert.equal(fs.readFileSync(log, "utf8").trim(), start);
  assert.notEqual(trunk(w), start);
  assert.equal(trunk(w), result.candidate);
  git(w.origin, "merge-base", "--is-ancestor", start, trunk(w));
  assert.equal(git(w.origin, "rev-list", "--count", `${start}..main`), "3");
  // Every landed entry, task, branch and worktree is settled.
  assert.deepEqual(queue(w), []);
  for (const id of ["t1", "t2", "t3"]) {
    assert.equal(
      w.store.get("landing_queue", `app\0main\0${id}`).state,
      "landed",
    );
    assert.equal(w.store.get("task_deliveries", id).state, "integrated");
    assert.equal(git(w.origin, "branch", "--list", `avoozl-batch/${id}`), "");
    assert.equal(w.store.get("task_worktrees", id), null);
  }
  assert.deepEqual(
    result.train.steps.map((s) => s.name),
    ["stack", "cheap", "platforms", "full on the stack", "push"],
  );
  assert.deepEqual(result.train.worktrees, []);
  assert.equal(git(w.checkout, "worktree", "list").split("\n").length, 1);
});

test("gated: a failing full validation pushes nothing and requeues the members in order", async (t) => {
  const w = await workspace(t, { full: node("process.exit(1)") }),
    start = trunk(w);
  await queued(w, "t1");
  await queued(w, "t2");
  const result = await train(w);
  assert.equal(result.state, "ended");
  assert.equal(result.train.outcome, "failed");
  assert.equal(trunk(w), start);
  assert.deepEqual(
    queue(w).map((e) => e.key),
    ["t1", "t2"],
  );
  assert.ok(
    git(w.origin, "branch", "--list", "avoozl-batch/*").includes(
      "avoozl-batch/t1",
    ),
  );
  assert.equal(result.train.checks["macos-arm64"].ok, false);
});

test("optimistic: the trunk is pushed after the cheap checks, then full validation runs on the pushed head", async (t) => {
  const log = path.join(temporaryDirectory("avoozl-engine-log-"), "log"),
    w = await workspace(t, { policy: "optimistic" });
  w.config.landing.trains.validation.full["macos-arm64"].command = probe(
    w,
    log,
  );
  await queued(w, "t1");
  await queued(w, "t3");
  const start = trunk(w),
    result = await train(w);
  assert.equal(result.state, "landed");
  assert.notEqual(trunk(w), start);
  assert.equal(
    fs.readFileSync(log, "utf8").trim(),
    trunk(w),
    "full validation saw the pushed trunk",
  );
  assert.deepEqual(
    result.train.steps.map((s) => s.name),
    ["stack", "cheap", "platforms", "push", "full on the pushed head"],
  );
});

test("optimistic: a failing cheap check pushes nothing", async (t) => {
  const w = await workspace(t, {
      policy: "optimistic",
      cheap: node("process.exit(4)"),
    }),
    start = trunk(w);
  await queued(w, "t1");
  const result = await train(w);
  assert.equal(result.train.outcome, "failed");
  assert.equal(trunk(w), start);
  assert.deepEqual(
    queue(w).map((e) => e.key),
    ["t1"],
  );
});

test("a train with tasks of two specs writes an intent and a landed outcome in each journal", async (t) => {
  const w = await workspace(t);
  await queued(w, "t1");
  await queued(w, "t2");
  const result = await train(w);
  assert.equal(result.state, "landed");
  for (const [spec, tasks] of [
    ["s1", ["t1"]],
    ["s2", ["t2"]],
  ]) {
    const { journal, options } = await specAuthority(
        w.store,
        { workspaceRoot: w.root, actor: "Operator" },
        spec,
      ),
      st = driverState(
        await replayJournal(await journal.list(), {
          permission: journal.permission,
          visibility: "private",
          ...options,
        }),
      );
    assert.deepEqual(
      st.outcomes.map((o) => o.task),
      tasks,
      spec,
    );
    assert.ok(
      st.outcomes.every(
        (o) => o.kind === "landed" && o.commit === result.candidate,
      ),
    );
    assert.equal(st.intents.size, 1, spec);
  }
});

test("a trunk moved during the train is rebased onto and pushed after the rechecks", async (t) => {
  const dir = temporaryDirectory("avoozl-engine-move-"),
    once = path.join(dir, "once"),
    w = await workspace(t);
  // The first full validation pushes another commit to the trunk, as another
  // writer would; later runs find the marker and do nothing.
  const other = path.join(dir, "other");
  git(dir, "clone", "-q", w.origin, other);
  git(other, "config", "user.name", "Other");
  git(other, "config", "user.email", "other@example.com");
  w.config.landing.trains.validation.full["macos-arm64"].command = node(
    `const fs=require('fs'),cp=require('child_process');if(!fs.existsSync(${JSON.stringify(once)})){fs.writeFileSync(${JSON.stringify(once)},'1');fs.writeFileSync(${JSON.stringify(path.join(other, "other.txt"))},'o');cp.execFileSync('git',['add','.'],{cwd:${JSON.stringify(other)}});cp.execFileSync('git',['commit','-qm','Other writer'],{cwd:${JSON.stringify(other)}});cp.execFileSync('git',['push','-q','origin','main'],{cwd:${JSON.stringify(other)}})}`,
  );
  await queued(w, "t1");
  const result = await train(w);
  assert.equal(result.state, "landed");
  const log = git(w.origin, "log", "--format=%s", "main").split("\n");
  assert.ok(
    log.includes("Other writer"),
    "the other writer's commit is still there",
  );
  assert.ok(log.includes("Do t1"));
  assert.equal(result.train.steps.filter((s) => s.name === "push").length, 2);
  assert.equal(result.train.steps.filter((s) => s.name === "stack").length, 2);
});

test("after maxRebases moves the train fails with 'trunk kept moving' and its members requeue", async (t) => {
  const dir = temporaryDirectory("avoozl-engine-move-"),
    w = await workspace(t, { maxRebases: 1 }),
    other = path.join(dir, "other");
  git(dir, "clone", "-q", w.origin, other);
  git(other, "config", "user.name", "Other");
  git(other, "config", "user.email", "other@example.com");
  let n = 0;
  // Every full validation moves the trunk again.
  w.config.landing.trains.validation.full["macos-arm64"].command = node(
    `const fs=require('fs'),cp=require('child_process');const o=${JSON.stringify(other)};fs.writeFileSync(o+'/m'+Date.now()+'.txt','o');cp.execFileSync('git',['add','.'],{cwd:o});cp.execFileSync('git',['commit','-qm','Move'],{cwd:o});cp.execFileSync('git',['push','-q','origin','main'],{cwd:o})`,
  );
  await queued(w, "t1");
  const result = await train(w);
  n += 1;
  assert.equal(result.reason, "trunk kept moving");
  assert.equal(result.train.outcome, "failed");
  assert.deepEqual(
    queue(w).map((e) => e.key),
    ["t1"],
  );
  assert.ok(!git(w.origin, "log", "--format=%s", "main").includes("Do t1"));
  assert.equal(n, 1);
});

test("no push the source builds is forced", () => {
  const dir = path.join(import.meta.dirname, "..", ".."),
    files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "test" || e.name === "node_modules") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.mjs$/.test(e.name)) files.push(p);
    }
  };
  walk(dir);
  const pushes = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/\[[^\[\]]*["']push["'][^\[\]]*\]/g))
      pushes.push([file, m[0]]);
  }
  assert.ok(pushes.length > 5, "the scan found the push calls");
  for (const [file, call] of pushes) {
    assert.doesNotMatch(
      call,
      /--force|["'`]-f["'`]|--force-with-lease|["'`]\+|\+refs\//,
      `${path.basename(file)}: ${call}`,
    );
  }
});

test("the integrator pass takes the lease, runs the train and lands the work", async (t) => {
  const w = await workspace(t),
    start = trunk(w);
  await queued(w, "t1");
  const pass = await integratorPass(w.store, {
    config: w.config,
    sessionId: "integrator-test",
    run: {
      train: (store, context, { now }) =>
        runTrain(store, {
          ...context,
          workspaceRoot: w.root,
          machine: {},
          now,
        }),
    },
  });
  assert.equal(pass.targets[0].state, "holding");
  assert.equal(pass.targets[0].trained, "landed");
  assert.notEqual(trunk(w), start);
  assert.equal(w.store.get("landing_leases", "app\0main").state, "active");
  assert.equal(
    w.store.get("landing_leases", "app\0main").sessionId,
    "integrator-test",
  );
});

test("a batch branch pushed to during the train is kept and its new head queued", async (t) => {
  const w = await workspace(t),
    dir = temporaryDirectory("avoozl-engine-batch-"),
    other = path.join(dir, "other");
  await queued(w, "t1");
  git(dir, "clone", "-q", w.origin, other);
  git(other, "config", "user.name", "Other");
  git(other, "config", "user.email", "other@example.com");
  git(other, "checkout", "-q", "-b", "mine", "origin/avoozl-batch/t1");
  // The full validation pushes one more commit to the batch branch.
  w.config.landing.trains.validation.full["macos-arm64"].command = node(
    `const fs=require('fs'),cp=require('child_process');const o=${JSON.stringify(other)};fs.writeFileSync(o+'/more.txt','m');cp.execFileSync('git',['add','.'],{cwd:o});cp.execFileSync('git',['commit','-qm','More'],{cwd:o});cp.execFileSync('git',['push','-q','origin','mine:avoozl-batch/t1'],{cwd:o})`,
  );
  const moved = () => git(w.origin, "rev-parse", "avoozl-batch/t1");
  const result = await train(w);
  assert.equal(result.state, "landed");
  assert.equal(
    moved(),
    git(other, "rev-parse", "HEAD"),
    "the branch is still there with the new head",
  );
  const [entry] = queue(w);
  assert.equal(entry.key, "t1");
  assert.equal(entry.commit, moved());
  assert.match(entry.reason, /moved during the train/);
});

// A fake GitHub whose run for the trunk's current head has `conclusion`.
const fakeCi = (w, conclusion) => ({
  runs: 0,
  async workflowRuns() {
    this.runs += 1;
    return [
      {
        id: 41,
        workflow: ".github/workflows/ci.yml",
        headSha: git(w.origin, "rev-parse", "main"),
        event: "push",
        status: "completed",
        conclusion,
      },
    ];
  },
});
const ciPlatform = (w) => {
  w.config.landing.trains.validation.full["windows-x64"] = {
    command: node("0"),
  };
};

test("a train with a CI-only platform is validated only after the run passes", async (t) => {
  for (const [conclusion, validated] of [
    ["success", true],
    ["failure", false],
  ]) {
    const w = await workspace(t, { policy: "optimistic" }),
      github = fakeCi(w, conclusion);
    ciPlatform(w);
    await queued(w, "t1");
    const result = await train(w, {
      github,
      ciOptions: { intervalMs: 1, sleep: async () => {} },
    });
    assert.equal(result.train.validated, validated, conclusion);
    assert.equal(result.train.ci.conclusion, conclusion);
    assert.equal(result.train.ci.run, 41);
    assert.equal(result.train.ciValidation.mode, "push-run");
    assert.equal(result.train.outcome, validated ? "landed" : "failed");
  }
});

test("the run ID and conclusion land on the train record; one read serves every open train", async (t) => {
  const w = await workspace(t, { policy: "optimistic" }),
    github = fakeCi(w, "success");
  await queued(w, "t1");
  const result = await train(w);
  assert.equal(
    result.train.ci,
    null,
    "no CI-only platform: nothing read yet",
  );
  const read = await readTrainCi(w.store, {
    github,
    repository: "acme/app",
    projectId: "app",
    target: "main",
    workflow: "ci.yml",
  });
  assert.equal(read.length, 1);
  const stored = w.store.get("landing_trains", result.train.id);
  assert.deepEqual([stored.ci.run, stored.ci.conclusion], [41, "success"]);
  // A finished run is not read again.
  await readTrainCi(w.store, {
    github,
    repository: "acme/app",
    projectId: "app",
    target: "main",
    workflow: "ci.yml",
    now: Date.now() + 10 * 60000,
  });
  assert.equal(github.runs, 1);
});
