// The tick lands `pr` repositories through pull requests (task 42.6). Real git
// (a bare "origin" and a checkout), a fake GitHub; nothing live.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { digest } from "../../model.mjs";
import { Store } from "../store.mjs";
import {
  deliveryPolicy,
  integrateVerified,
  reconcileDeliveries,
  reportSession,
} from "../delivery.mjs";
import { landingQueue } from "../landing-queue.mjs";
import { landPullRequests } from "../pr-landing.mjs";
import { addItemContext } from "../needs-you-context.mjs";
import { taskLinks } from "../scm-links.mjs";
import { takeOverSpec } from "../spec-takeover.mjs";
import { snapshot, verifiedTask } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const leaf = (id) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: [id + " works."],
  repository: "app",
  planId: "s",
});

async function workspace(t) {
  const root = temporaryDirectory("avoozl-prland-"),
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
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: [leaf("t1"), leaf("t2"), leaf("t3")],
    edges: [],
  });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    landing: "pr",
    github: "acme/app",
    worktreeRoot: path.join(root, "wt"),
  });
  store.put("plans", { id: "s", spec: "s", hash: digest("plan s") });
  store.put("receipts", {
    id: "spec-journal:s",
    kind: "spec-journal",
    planId: "s",
    home: "local",
  });
  await takeOverSpec(store, { workspaceRoot: root, actor: "Operator" }, "s");
  return { root, origin, checkout: fs.realpathSync.native(checkout), store };
}

// A task worktree with one commit, a verified delivery and a worker chat
// claimed by the command line, as `avoozl claim` does.
const verified = (w, taskId, file) =>
  verifiedTask(w, taskId, file, {
    delivery: (commit) => ({
      attempts: [{ attempt: 1, outcome: "done", commit }],
    }),
    binding: (commit) => ({
      report: { kind: "done", text: "", commit, at: "2026-11-17T00:00:00Z" },
      source: "conductor",
      conductor: "cli",
      boundAt: "2026-11-17T00:00:00Z",
    }),
  }).commit;

// GitHub as far as pull request landing reads and writes it. A merge moves
// the bare origin's main to the head (a fast-forward stands in for it).
function fakeGithub(w) {
  const pulls = [],
    calls = { created: 0, merged: [], statuses: [] };
  let conclusion = "pending";
  const pullOf = (n) => pulls.find((p) => p.number === n);
  const github = {
    calls,
    pulls,
    setChecks: (value) => (conclusion = value),
    currentUser: async () => ({ login: "bot" }),
    branchHead: async () => ({ oid: git(w.origin, "rev-parse", "main") }),
    listPullRequests: async (_repo, { head }) =>
      pulls.filter((p) => `acme:${p.head.ref}` === head),
    pullRequest: async (_repo, n) => {
      const pull = pullOf(n);
      // GitHub reads the head from the pushed branch.
      if (pull.state === "open")
        pull.head.sha = git(w.origin, "rev-parse", pull.head.ref);
      return structuredClone(pull);
    },
    createPullRequest: async (_repo, input) => {
      calls.created += 1;
      const pull = {
        number: pulls.length + 1,
        state: "open",
        head: {
          ref: input.head,
          sha: git(w.origin, "rev-parse", input.head),
        },
        base: { sha: git(w.origin, "rev-parse", "main") },
        mergeable: true,
      };
      pulls.push(pull);
      return structuredClone(pull);
    },
    // Only the signed-in login has rights; the local operator is not a
    // GitHub login.
    permission: async (_repo, login) => ({
      permission: login === "bot" ? "write" : "none",
    }),
    branchRules: async () => [
      {
        type: "required_status_checks",
        parameters: { required_status_checks: [{ context: "build" }] },
      },
    ],
    branch: async () => ({ protection: { enabled: false } }),
    branchProtection: async () => null,
    checkRuns: async () => [
      {
        name: "build",
        status: conclusion === "pending" ? "in_progress" : "completed",
        conclusion: conclusion === "pending" ? null : conclusion,
        output:
          conclusion === "failure"
            ? {
                title: "build failed",
                summary: "Running 12 tests\nError: expected 3 rows, got 2",
              }
            : { title: null, summary: null },
      },
    ],
    commitStatus: async () => ({ statuses: [] }),
    createCommitStatus: async (_repo, sha, input) =>
      calls.statuses.push({ sha, ...input }),
    pullRequestReviews: async () => [],
    mergePullRequest: async (_repo, n, { sha }) => {
      const pull = pullOf(n);
      if (pull.head.sha !== sha) return { merged: false };
      git(w.origin, "update-ref", "refs/heads/main", sha);
      Object.assign(pull, {
        state: "closed",
        merged_at: "2026-11-17T00:00:00Z",
        merged_by: { login: "bot" },
        merge_commit_sha: sha,
      });
      calls.merged.push({ number: n, sha });
      return { merged: true };
    },
  };
  return github;
}

const step = (w, github) =>
  landPullRequests(w.store, { github, workspaceRoot: w.root, rounds: 2 });

test("a verified task is pushed, waits for its check on the exact head, then merges", async (t) => {
  const w = await workspace(t),
    github = fakeGithub(w),
    commit = verified(w, "t1");
  await integrateVerified(w.store);
  assert.equal(git(w.origin, "rev-parse", "avoozl/t1"), commit);
  assert.equal(w.store.get("task_deliveries", "t1").state, "verified");
  assert.equal(
    landingQueue(w.store, { repositoryId: "app", base: "main" }).length,
    1,
  );
  // Nothing lands locally or on GitHub before the check passes.
  await step(w, github);
  assert.equal(github.calls.created, 1);
  assert.deepEqual(github.calls.merged, []);
  await integrateVerified(w.store);
  assert.equal(git(w.origin, "rev-parse", "avoozl/t1"), commit);
  github.setChecks("success");
  await step(w, github);
  assert.deepEqual(github.calls.merged, [{ number: 1, sha: commit }]);
  assert.equal(github.calls.statuses[0].context, "avoozl/verify");
  const delivery = w.store.get("task_deliveries", "t1");
  assert.equal(delivery.state, "integrated");
  assert.equal(delivery.integratedCommit, commit);
  assert.equal(
    w.store.read().tasks.find((x) => x.id === "t1").integration.commit,
    commit,
  );
  // The local base follows the merged remote base.
  assert.equal(git(w.checkout, "rev-parse", "main"), commit);
});

test("a private plan's task goes by an opaque name on a public repository", async (t) => {
  const w = await workspace(t),
    github = fakeGithub(w),
    created = [];
  const create = github.createPullRequest;
  github.createPullRequest = async (repo, input) => {
    created.push(input);
    return create(repo, input);
  };
  // The spec's issue lives in a private home; the target is public.
  w.store.put("receipts", {
    id: "github-parent:plan:s",
    kind: "github-parent",
    level: "plan",
    parentId: "s",
    repository: "acme/plans",
    number: 4,
  });
  w.store.put("github_repositories", { id: "acme/plans", private: true });
  w.store.put("github_repositories", { id: "acme/app", private: false });
  const commit = verified(w, "t1");
  await integrateVerified(w.store);
  const [entry] = landingQueue(w.store, { repositoryId: "app", base: "main" }),
    named = entry.tasks[0].public;
  assert.match(named, /^t-[0-9a-f]{24}$/);
  assert.equal(entry.source.branch, `avoozl/${named}`);
  assert.equal(git(w.origin, "rev-parse", `avoozl/${named}`), commit);
  // The readable task branch never reaches the public remote.
  assert.equal(git(w.origin, "branch", "--list", "avoozl/t1"), "");
  await step(w, github);
  assert.equal(created.length, 1);
  assert.equal(created[0].head, `avoozl/${named}`);
  for (const text of [created[0].title, created[0].body])
    assert.ok(!/\bt1\b|\bs\b/.test(text.replace(named, "")), text);
  assert.match(created[0].body, new RegExp(`^Avoozl-Task: ${named}@`));
  // The task's branch link is the branch that was pushed.
  assert.equal(
    taskLinks(w.store, "t1").branch.url,
    `https://github.com/acme/app/tree/avoozl/${named}`,
  );
});

test("a failed check sends the task back to its chat", async (t) => {
  const w = await workspace(t),
    github = fakeGithub(w);
  verified(w, "t1");
  await integrateVerified(w.store);
  github.setChecks("failure");
  const result = await step(w, github);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].slot, "slot-t1");
  assert.match(
    result.messages[0].text,
    /build: failure \(Error: expected 3 rows, got 2\)/,
    "the chat gets the check's first error line",
  );
  assert.equal(w.store.get("task_deliveries", "t1").state, "running");
  assert.deepEqual(github.calls.merged, []);
  // The failed portion keeps its pull request, so its Links box shows it.
  const failed = w.store
    .list("landing_queue")
    .find((entry) => entry.key === "t1");
  assert.equal(failed.state, "failed");
  assert.equal(failed.pr, 1);
  assert.equal(
    taskLinks(w.store, "t1").pr?.url,
    "https://github.com/acme/app/pull/1",
  );
  // The same chat reports done again on its fix, and that is recorded.
  const wt = w.store.get("task_worktrees", "t1").path;
  fs.writeFileSync(path.join(wt, "fix.txt"), "fix\n");
  git(wt, "add", ".");
  git(wt, "commit", "-qm", "Fix");
  const fixed = git(wt, "rev-parse", "HEAD");
  // The person's claim reports again from its worktree.
  await reportSession(
    w.store,
    { taskId: "t1", kind: "done", commit: fixed },
    { sessionKey: "dashboard:slot-t1" },
  );
  reconcileDeliveries(w.store, deliveryPolicy({ delivery: {} }), {});
  const delivery = w.store.get("task_deliveries", "t1");
  assert.equal(delivery.state, "done");
  assert.equal(delivery.commit, fixed);
  assert.equal(delivery.returnedAttempts.length, 1);
});

test("a check that fails past its rounds keeps its name and first error line for Needs you", async (t) => {
  const w = await workspace(t),
    github = fakeGithub(w);
  verified(w, "t1");
  await integrateVerified(w.store);
  github.setChecks("failure");
  await landPullRequests(w.store, {
    github,
    workspaceRoot: w.root,
    rounds: 0,
  });
  const delivery = w.store.get("task_deliveries", "t1");
  assert.equal(delivery.state, "decision");
  assert.deepEqual(delivery.failedChecks.checks, [
    {
      name: "build",
      conclusion: "failure",
      firstError: "Error: expected 3 rows, got 2",
    },
  ]);
  const [item] = addItemContext(w.store, w.store.read(), [
    { kind: "stale-session", taskId: "t1" },
  ]);
  assert.deepEqual(item.context.failedChecks, {
    commit: delivery.failedChecks.commit,
    checks: [
      {
        name: "build",
        conclusion: "failure",
        firstError: "Error: expected 3 rows, got 2",
      },
    ],
  });
  // A later stop for another cause shows no old checks.
  w.store.put("task_deliveries", { ...delivery, cause: "something else" });
  const [later] = addItemContext(w.store, w.store.read(), [
    { kind: "stale-session", taskId: "t1" },
  ]);
  assert.equal(later.context.failedChecks, null);
});

test("a queued task whose base moved is withdrawn, merged with the base and verified again", async (t) => {
  const w = await workspace(t);
  const first = verified(w, "t1");
  await integrateVerified(w.store);
  // Someone lands other work on GitHub's base.
  const other = path.join(w.root, "other");
  git(w.root, "clone", "-q", w.origin, other);
  git(other, "config", "user.name", "Test");
  git(other, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(other, "other.txt"), "x\n");
  git(other, "add", ".");
  git(other, "commit", "-qm", "Other");
  git(other, "push", "-q", "origin", "main");
  await integrateVerified(w.store);
  const delivery = w.store.get("task_deliveries", "t1");
  assert.equal(delivery.state, "done", "back to verification");
  assert.notEqual(delivery.commit, first);
  assert.equal(
    landingQueue(w.store, { repositoryId: "app", base: "main" }).length,
    0,
  );
});

test("without a take over nothing is pushed", async (t) => {
  const w = await workspace(t);
  w.store.setMeta("specDrivers", {});
  verified(w, "t2");
  const { notify } = await integrateVerified(w.store);
  assert.match(notify[0].text, /spec takeover/);
  assert.equal(w.store.get("task_deliveries", "t2").state, "decision");
  assert.throws(() => git(w.origin, "rev-parse", "--verify", "avoozl/t2"));
});
