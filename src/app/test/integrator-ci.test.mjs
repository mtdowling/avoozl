// CI fallback for platforms without a local environment (lt-4.4), with a fake
// GitHub and a real bare remote.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { validateByCi, validateBranch, watchRun } from "../integrator-ci.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function repo() {
  const root = temporaryDirectory("avoozl-ci-"),
    origin = path.join(root, "origin.git"),
    work = path.join(root, "work");
  git(root, "init", "--bare", "-q", "-b", "main", origin);
  git(root, "clone", "-q", origin, work);
  git(work, "config", "user.name", "T");
  git(work, "config", "user.email", "t@example.com");
  fs.writeFileSync(path.join(work, "a.txt"), "a\n");
  git(work, "add", ".");
  git(work, "commit", "-qm", "Base");
  git(work, "push", "-q", "origin", "main");
  const base = git(work, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(work, "b.txt"), "b\n");
  git(work, "add", ".");
  git(work, "commit", "-qm", "Stack");
  return { origin, work, base, head: git(work, "rev-parse", "HEAD") };
}

// A fake GitHub whose run for `headSha` completes after `polls` reads.
function fakeGitHub({ conclusion = "success", polls = 2 } = {}) {
  const calls = { dispatch: [], reads: 0 };
  let sha = null,
    event = null;
  return {
    calls,
    setRun(headSha, ev) {
      sha = headSha;
      event = ev;
    },
    async dispatchWorkflow(repository, workflow, ref, inputs) {
      calls.dispatch.push({ repository, workflow, ref, inputs });
      // The candidate ref exists on the remote while the run is live.
      calls.refSeen = true;
    },
    async workflowRuns() {
      calls.reads += 1;
      if (!sha) return [];
      return [
        {
          id: 7,
          workflow: ".github/workflows/test.yml",
          headSha: sha,
          event,
          status: calls.reads >= polls ? "completed" : "in_progress",
          conclusion: calls.reads >= polls ? conclusion : null,
        },
      ];
    },
  };
}
const quick = { intervalMs: 1, sleep: async () => {} };

test("a gated train with a CI-only platform dispatches exactly one run, waits, and deletes the ref", async () => {
  const r = repo(),
    github = fakeGitHub();
  github.setRun(r.head, "workflow_dispatch");
  const out = await validateByCi({
    github,
    repository: "acme/app",
    workflow: "test.yml",
    train: "train-abc",
    platforms: ["linux-x64", "windows-x64"],
    policy: "gated",
    candidate: r.head,
    baseHead: r.base,
    root: r.work,
    url: r.origin,
    machine: {},
    ...quick,
  });
  assert.equal(out.state, "passed");
  assert.equal(out.mode, "dispatch");
  assert.equal(github.calls.dispatch.length, 1);
  assert.deepEqual(github.calls.dispatch[0], {
    repository: "acme/app",
    workflow: "test.yml",
    ref: "avoozl-validate/train-abc",
    inputs: { platforms: "linux-x64,windows-x64" },
  });
  assert.equal(
    git(r.origin, "branch", "--list", validateBranch("train-abc")),
    "",
  );
});

test("a failed dispatched run is not validated, and the ref is still deleted", async () => {
  const r = repo(),
    github = fakeGitHub({ conclusion: "failure" });
  github.setRun(r.head, "workflow_dispatch");
  const out = await validateByCi({
    github,
    repository: "acme/app",
    workflow: "test.yml",
    train: "train-f",
    platforms: ["windows-x64"],
    policy: "gated",
    candidate: r.head,
    baseHead: r.base,
    root: r.work,
    url: r.origin,
    machine: {},
    ...quick,
  });
  assert.equal(out.state, "failed");
  assert.equal(git(r.origin, "branch", "--list", "avoozl-validate/*"), "");
});

test("an optimistic train makes no dispatch and reads the push's run", async () => {
  const r = repo(),
    github = fakeGitHub();
  github.setRun(r.head, "push");
  const out = await validateByCi({
    github,
    repository: "acme/app",
    workflow: "test.yml",
    train: "train-o",
    platforms: ["windows-x64"],
    policy: "optimistic",
    pushed: r.head,
    ...quick,
  });
  assert.equal(out.state, "passed");
  assert.equal(out.mode, "push-run");
  assert.deepEqual(github.calls.dispatch, []);
  assert.ok(github.calls.reads >= 2);
});

test("with no CI-only platform nothing is dispatched or read", async () => {
  const github = fakeGitHub();
  const out = await validateByCi({
    github,
    repository: "acme/app",
    workflow: "test.yml",
    train: "t",
    platforms: [],
    policy: "gated",
  });
  assert.equal(out.mode, "none");
  assert.equal(github.calls.reads, 0);
});

test("a run that never completes times out", async () => {
  const github = fakeGitHub({ polls: 10 ** 9 });
  github.setRun("a".repeat(40), "push");
  let clock = 0;
  const out = await watchRun(github, {
    repository: "acme/app",
    workflow: "test.yml",
    headSha: "a".repeat(40),
    event: "push",
    since: "2026-01-01T00:00:00Z",
    timeoutMs: 100,
    intervalMs: 40,
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  });
  assert.equal(out.state, "timeout");
  assert.equal(out.run.id, 7);
});
