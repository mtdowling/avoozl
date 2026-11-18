// Task 43.5 (R90.2, R102.6, R102.7): a worker's fetched result is verified by
// the driver on its own before integration.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { verifyWorkerResult } from "../worker-results.mjs";
import {
  checkpointBranch,
  ensureWorkingBranch,
  integrateVerified,
  qualifiedRef,
  sourceRegistry,
} from "../working-heads.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const SPEC = "demo",
  TASK = "T1",
  PASS = [["node", "-e", "process.exit(0)"]],
  FAIL = [["node", "-e", "process.exit(3)"]];
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const commit = (cwd, message) =>
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

// A target, a fork holding the task's checkpoint branch with one commit, and
// the driver's own checkout.
function fixture(files = { "b.txt": "b\n" }, message = "Add b") {
  const dir = temporaryDirectory("avoozl-results-"),
    target = path.join(dir, "target.git"),
    fork = path.join(dir, "fork.git"),
    seed = path.join(dir, "seed"),
    root = path.join(dir, "driver");
  git(dir, "init", "--bare", "-b", "main", target);
  fs.mkdirSync(seed);
  git(seed, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(seed, "a.txt"), "a\n");
  git(seed, "add", ".");
  commit(seed, "Start");
  git(seed, "remote", "add", "origin", target);
  git(seed, "push", "-q", "origin", "main");
  const base = git(seed, "rev-parse", "HEAD");
  git(dir, "clone", "-q", "--bare", target, fork);
  const branch = checkpointBranch(SPEC, TASK);
  git(seed, "checkout", "-q", "-b", branch);
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(seed, name)), { recursive: true });
    fs.writeFileSync(path.join(seed, name), text);
  }
  git(seed, "add", ".");
  commit(seed, message);
  git(seed, "remote", "add", "fork", fork);
  git(seed, "push", "-q", "fork", branch);
  const head = git(seed, "rev-parse", "HEAD");
  fs.mkdirSync(root);
  git(root, "init", "-q", "-b", "main");
  const registry = sourceRegistry({
    "example/code": { url: target },
    "fork/code": { url: fork, parent: "example/code" },
  });
  const ref = (over = {}) =>
    qualifiedRef({
      source: {
        repository: "fork/code",
        branch,
        commit: head,
        ...over,
      },
      target: { repository: "example/code", base: "main" },
    });
  return { root, registry, ref, base, head, branch, seed };
}
const verify = (f, over = {}) =>
  verifyWorkerResult({
    root: f.root,
    registry: f.registry,
    ref: f.ref(),
    expected: { repository: "fork/code", branch: f.branch },
    spec: SPEC,
    declared: ["b.txt"],
    checks: PASS,
    ...over,
  });

test("a result that passes every independent check is verified and integrates", async () => {
  const f = fixture(),
    result = await verify(f);
  assert.equal(result.state, "verified");
  assert.equal(result.commit, f.head);
  await ensureWorkingBranch(f.root, {
    spec: SPEC,
    repository: "example/code",
    target: { repository: "example/code", base: "main" },
    baseCommit: f.base,
  });
  const done = await integrateVerified(f.root, {
    spec: SPEC,
    task: TASK,
    commit: f.head,
    evidence: result.evidence,
  });
  assert.equal(done.integrated, true);
});

test("a wrong repository or branch holds the result", async () => {
  const f = fixture();
  const elsewhere = await verify(f, {
    expected: { repository: "other/code", branch: f.branch },
  });
  assert.deepEqual(
    [elsewhere.state, elsewhere.reason],
    ["held", "wrong-reference"],
  );
  const branch = await verify(f, {
    expected: { repository: "fork/code", branch: "avoozl/demo/task/T2" },
  });
  assert.equal(branch.reason, "wrong-reference");
  const stranger = await verify(f, {
    ref: f.ref({ repository: "stranger/code" }),
    expected: { repository: "stranger/code", branch: f.branch },
  });
  assert.deepEqual(
    [stranger.state, stranger.reason],
    ["held", "wrong-repository"],
  );
});

test("a moved head or an unreachable fork holds the result", async () => {
  const f = fixture();
  // The fork's branch moves on after the commit the worker reported.
  fs.writeFileSync(path.join(f.seed, "c.txt"), "c\n");
  git(f.seed, "add", ".");
  commit(f.seed, "More");
  git(f.seed, "push", "-q", "fork", f.branch);
  const moved = await verify(f);
  assert.deepEqual([moved.state, moved.reason], ["held", "fetch-advanced"]);
  const gone = await verify(f, {
    registry: sourceRegistry({
      "example/code": { url: path.join(f.root, "no-target.git") },
      "fork/code": {
        url: path.join(f.root, "no-fork.git"),
        parent: "example/code",
      },
    }),
  });
  assert.deepEqual([gone.state, gone.reason], ["held", "fetch-unavailable"]);
});

test("paths outside the task are rejected and protected paths go to a person", async () => {
  const f = fixture();
  const outside = await verify(f, { declared: ["c.txt"] });
  assert.deepEqual(
    [outside.state, outside.reason],
    ["rejected", "outside-paths"],
  );
  const guarded = await verify(f, { protectedPaths: ["b.txt"] });
  assert.deepEqual(
    [guarded.state, guarded.reason],
    ["protected", "protected-paths"],
  );
});

test("the checks run again, whatever the worker said", async () => {
  const f = fixture(),
    result = await verify(f, { checks: FAIL });
  assert.deepEqual([result.state, result.reason], ["rejected", "checks"]);
  await ensureWorkingBranch(f.root, {
    spec: SPEC,
    repository: "example/code",
    target: { repository: "example/code", base: "main" },
    baseCommit: f.base,
  });
  await assert.rejects(
    integrateVerified(f.root, {
      spec: SPEC,
      task: TASK,
      commit: f.head,
      evidence: result.evidence,
    }),
    /not verified/,
  );
});

test("private metadata in a commit message holds the result", async () => {
  const f = fixture({ "b.txt": "b\n" }, "Work from /home/someone/private plan"),
    result = await verify(f);
  assert.deepEqual([result.state, result.reason], ["held", "private-metadata"]);
  assert.ok(!JSON.stringify(result).includes("someone"));
});
