// The tick lands `pr` repositories through pull requests (task 42.6). Real git
// (a bare "origin" and a checkout), a fake GitHub; nothing live.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { digest } from "../../../model.ts";
import { Store } from "../../store/store.ts";
import {
  deliveryPolicy,
  integrateVerified,
  reconcileDeliveries,
  reportSession,
} from "../../delivery/delivery.ts";
import { landingQueue } from "../landing-queue.ts";
import { landPullRequests } from "../pr-landing.ts";
import type { LandOptions } from "../direct-landing.ts";
import { approveMerge } from "../landing-pulls.ts";
import { claimOf, closedPullNeedsYou } from "../../workers/claims.ts";
import { addItemContext } from "../../api/needs-you-context.ts";
import { taskLinks } from "../../tasks/scm-links.ts";
import { seedClaims, snapshot, verifiedTask } from "../../test/fixtures.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { git, leaf as fixtureLeaf } from "../../test/delivery-fixture.ts";
import { partialFake } from "../../test/partial-fake.ts";
import { found, storedRow } from "../../test/view-shapes.ts";
import type { QueueEntry } from "../landing-queue.ts";
import type { Task } from "../../../types.ts";

type Github = NonNullable<LandOptions["github"]>;
// A pull request on the fake.
interface FakePull {
  number: number;
  state: string;
  head: { ref: string; sha: string };
  base: { sha: string };
  mergeable: boolean;
  draft: boolean;
  merged_at?: string;
  merged_by?: { login: string };
  merge_commit_sha?: string;
}
// What the fake records, its pull requests, and how a test sets the check.
interface Extras {
  calls: {
    created: number;
    merged: { number: number; sha: string; method?: string }[];
    statuses: Record<string, unknown>[];
    deleted: string[];
  };
  pulls: FakePull[];
  setChecks: (value: string) => void;
}
// A task's delivery record, for the fields these tests read.
interface Delivery {
  id: string;
  state: string;
  commit?: string;
  cause?: string;
  integratedCommit?: string;
  returnedAttempts?: unknown[];
  failedChecks?: { commit?: string; checks?: unknown[] };
  [key: string]: unknown;
}

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const leaf = (id: string) =>
  fixtureLeaf(id, { acceptance: [id + " works."], planId: "s" });

const FILE = ".kiro/specs/s/tasks.md";
const TASKS = "# Tasks\n\n- [ ] `1.1` First\n  - It works\n";

// `spec`: the spec's tasks.md is in the code repository, so a landing
// ticks it there.
async function workspace(t: TestContext, { spec = false } = {}) {
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
  if (spec) {
    fs.mkdirSync(path.join(checkout, path.dirname(FILE)), { recursive: true });
    fs.writeFileSync(path.join(checkout, FILE), TASKS);
  }
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  git(checkout, "push", "-q", "origin", "main");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize({
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
  store.put("plans", {
    id: "s",
    spec: "s",
    hash: digest("plan s"),
    ...(spec ? { mapping: { "s.1.1": "t1" } } : {}),
  });
  return { root, origin, checkout: fs.realpathSync.native(checkout), store };
}

// A task worktree with one commit, a verified delivery and a worker chat
// claimed by the command line, as `avoozl claim` does.
type World = Awaited<ReturnType<typeof workspace>>;
const verified = (w: World, taskId: string, file?: string) =>
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
function fakeGithub(w: World) {
  const pulls: FakePull[] = [],
    calls: Extras["calls"] = {
      created: 0,
      merged: [],
      statuses: [],
      deleted: [],
    };
  let conclusion = "pending";
  const pullOf = (n: number) => found(pulls.find((p) => p.number === n));
  const github = partialFake<Github & Extras>({
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
      const pull: FakePull = {
        number: pulls.length + 1,
        state: "open",
        head: {
          ref: String(input.head),
          sha: git(w.origin, "rev-parse", String(input.head)),
        },
        base: { sha: git(w.origin, "rev-parse", "main") },
        mergeable: true,
        draft: Boolean(input.draft),
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
    createCommitStatus: async (
      _repo: string,
      sha: string,
      input: Record<string, unknown>,
    ) => calls.statuses.push({ sha, ...input }),
    pullRequestReviews: async () => [],
    deleteBranch: async (_repo: string, branch: string) =>
      calls.deleted.push(branch),
    mergePullRequest: async (
      _repo: string,
      n: number,
      { sha, method }: { sha: string; method?: string },
    ) => {
      const pull = pullOf(n);
      if (pull.head.sha !== sha) return { merged: false };
      git(w.origin, "update-ref", "refs/heads/main", sha);
      Object.assign(pull, {
        state: "closed",
        merged_at: "2026-11-17T00:00:00Z",
        merged_by: { login: "bot" },
        merge_commit_sha: sha,
      });
      calls.merged.push({ number: n, sha, method });
      return { merged: true };
    },
  });
  return github;
}

const step = (w: World, github: Github) =>
  landPullRequests(w.store, { github, workspaceRoot: w.root, rounds: 2 });

test("a verified task is pushed as a draft, waits for its release and check on the exact head, and merges on a person's Merge", async (t) => {
  const w = await workspace(t),
    github = fakeGithub(w),
    commit = verified(w, "t1");
  await integrateVerified(w.store);
  assert.equal(git(w.origin, "rev-parse", "avoozl/t1"), commit);
  assert.equal(
    storedRow<Delivery>(w.store, "task_deliveries", "t1").state,
    "verified",
  );
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
  const at = { repositoryId: "app", base: "main", key: "t1" },
    waiting = () => landingQueue(w.store, at)[0].waiting?.reason;
  // A draft until a person releases it: no check is read, nothing merges.
  assert.equal(github.pulls[0].draft, true);
  await step(w, github);
  assert.equal(waiting(), "draft");
  github.pulls[0].draft = false; // Ready for review on GitHub
  await step(w, github);
  // Released and passing: it waits for a person to merge.
  assert.equal(waiting(), "merge");
  assert.deepEqual(github.calls.merged, []);
  approveMerge(w.store, at, { commit, by: "dashboard" });
  await step(w, github);
  // Unset, landing.method squashes.
  assert.deepEqual(github.calls.merged, [
    { number: 1, sha: commit, method: "squash" },
  ]);
  assert.deepEqual(github.calls.statuses, [], "no commit status is posted");
  const delivery = storedRow<Delivery>(w.store, "task_deliveries", "t1");
  assert.equal(delivery.state, "integrated");
  assert.equal(delivery.integratedCommit, commit);
  assert.equal(
    found(w.store.read().tasks.find((x: Task) => x.id === "t1")).integration
      ?.commit,
    commit,
  );
  // The local base follows the merged remote base.
  assert.equal(git(w.checkout, "rev-parse", "main"), commit);
});

test("a private plan's task goes by an opaque name on a public repository", async (t) => {
  const w = await workspace(t),
    github = fakeGithub(w),
    created: Record<string, unknown>[] = [];
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
    task = entry.tasks[0],
    named = String(typeof task === "string" ? task : task.public);
  assert.match(named, /^t-[0-9a-f]{24}$/);
  assert.equal(entry.source?.branch, `avoozl/${named}`);
  assert.equal(git(w.origin, "rev-parse", `avoozl/${named}`), commit);
  // The readable task branch never reaches the public remote.
  assert.equal(git(w.origin, "branch", "--list", "avoozl/t1"), "");
  await step(w, github);
  assert.equal(created.length, 1);
  assert.equal(created[0].head, `avoozl/${named}`);
  for (const text of [String(created[0].title), String(created[0].body)])
    assert.ok(!/\bt1\b|\bs\b/.test(text.replace(named, "")), text);
  assert.equal(created[0].body, "", "no trailer in the body");
  // The task's branch link is the branch that was pushed.
  assert.equal(
    taskLinks(w.store, "t1").branch?.url,
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
  assert.equal(
    storedRow<Delivery>(w.store, "task_deliveries", "t1").state,
    "running",
  );
  assert.deepEqual(github.calls.merged, []);
  // The failed portion keeps its pull request, so its Links box shows it.
  const failed = found(
    w.store
      .list<QueueEntry>("landing_queue")
      .find((entry) => entry.key === "t1"),
  );
  assert.equal(failed.state, "failed");
  assert.equal(failed.pr, 1);
  assert.equal(
    taskLinks(w.store, "t1").pr?.url,
    "https://github.com/acme/app/pull/1",
  );
  // The same chat reports done again on its fix, and that is recorded.
  const wt = String(storedRow(w.store, "task_worktrees", "t1").path);
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
  const delivery = storedRow<Delivery>(w.store, "task_deliveries", "t1");
  assert.equal(delivery.state, "done");
  assert.equal(delivery.commit, fixed);
  assert.equal(delivery.returnedAttempts?.length, 1);
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
  const delivery = storedRow<Delivery>(w.store, "task_deliveries", "t1");
  assert.equal(delivery.state, "decision");
  assert.deepEqual(delivery.failedChecks?.checks, [
    {
      name: "build",
      conclusion: "failure",
      firstError: "Error: expected 3 rows, got 2",
    },
  ]);
  const [item] = addItemContext(w.store, w.store.read(), [
    { kind: "stale-session", taskId: "t1" },
  ]);
  assert.deepEqual(item.context?.failedChecks, {
    commit: delivery.failedChecks?.commit,
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
  assert.equal(later.context?.failedChecks, null);
});

// Someone lands other work on GitHub's base.
function landOtherWork(w: World) {
  const other = path.join(w.root, "other");
  git(w.root, "clone", "-q", w.origin, other);
  git(other, "config", "user.name", "Test");
  git(other, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(other, "other.txt"), "x\n");
  git(other, "add", ".");
  git(other, "commit", "-qm", "Other");
  git(other, "push", "-q", "origin", "main");
}

test("a queued task whose base moved is withdrawn, merged with the base and verified again", async (t) => {
  const w = await workspace(t);
  const first = verified(w, "t1");
  await integrateVerified(w.store);
  landOtherWork(w);
  await integrateVerified(w.store);
  const delivery = storedRow<Delivery>(w.store, "task_deliveries", "t1");
  assert.equal(delivery.state, "done", "back to verification");
  assert.notEqual(delivery.commit, first);
  assert.equal(
    landingQueue(w.store, { repositoryId: "app", base: "main" }).length,
    0,
  );
});

// A person merges the pull request on GitHub: origin's main moves to its head.
const mergeOnGitHub = (w: World, pull: FakePull) => {
  git(w.origin, "update-ref", "refs/heads/main", pull.head.sha);
  Object.assign(pull, {
    state: "closed",
    merged_at: "2026-11-18T00:00:00Z",
    merged_by: { login: "mona" },
    merge_commit_sha: pull.head.sha,
  });
};

test("the pull request carries the work commit and its tick on top, so its checks run on the tick", async (t) => {
  const w = await workspace(t, { spec: true }),
    github = fakeGithub(w),
    commit = verified(w, "t1");
  await integrateVerified(w.store);
  const head = git(w.origin, "rev-parse", "avoozl/t1");
  assert.notEqual(head, commit);
  assert.equal(git(w.origin, "rev-parse", `${head}^`), commit);
  assert.match(
    git(w.origin, "show", `${head}:${FILE}`),
    /- \[x\] `1\.1` First/,
  );
  assert.equal(
    landingQueue(w.store, { repositoryId: "app", base: "main" })[0].commit,
    head,
  );
  await step(w, github);
  assert.equal(github.pulls[0].head.sha, head);
  assert.equal(github.pulls[0].draft, true);
});

test("a pull request a person merges lands its task with its tick, and Avoozl deletes the claim branch it created", async (t) => {
  const w = await workspace(t, { spec: true }),
    github = fakeGithub(w);
  await seedClaims(w.store, { own: ["t1"], other: ["t2"] });
  const commit = verified(w, "t1");
  await integrateVerified(w.store);
  github.setChecks("success");
  await step(w, github);
  mergeOnGitHub(w, github.pulls[0]);
  await step(w, github);
  assert.equal(
    storedRow<Delivery>(w.store, "task_deliveries", "t1").state,
    "integrated",
  );
  const landed = String(
    found(w.store.read().tasks.find((x: Task) => x.id === "t1")).integration
      ?.commit,
  );
  assert.equal(git(w.origin, "rev-parse", `${landed}^`), commit);
  assert.match(git(w.origin, "show", `${landed}:${FILE}`), /- \[x\] `1\.1`/);
  assert.deepEqual(github.calls.merged, [], "Avoozl merged nothing");
  assert.deepEqual(github.calls.deleted, ["avoozl/s/t1"]);
  assert.equal(claimOf(w.store, "acme/app", "t1"), null);
  assert.ok(claimOf(w.store, "acme/app", "t2"), "another runner's claim stays");
});

test("a pull request closed unmerged leaves the queue and gives a Needs you row with Delete claim branch", async (t) => {
  const w = await workspace(t),
    github = fakeGithub(w);
  await seedClaims(w.store, { own: ["t1"] });
  verified(w, "t1");
  await integrateVerified(w.store);
  await step(w, github);
  github.pulls[0].state = "closed";
  await step(w, github);
  assert.equal(
    landingQueue(w.store, { repositoryId: "app", base: "main" }).length,
    0,
  );
  const [row] = closedPullNeedsYou(w.store);
  assert.equal(row.reason, "pr-closed");
  assert.equal(row.taskId, "t1");
  assert.equal(row.link, "https://github.com/acme/app/pull/1");
  assert.match(row.detail, /stays claimed by avoozl\/s\/t1/);
  const [action] = found(row.actions);
  assert.equal(action.label, "Delete claim branch");
  assert.equal(action.operation, "claim.delete");
  assert.equal(action.confirm[0].job, "claim-delete");
  assert.deepEqual(github.calls.deleted, [], "Avoozl deletes nothing itself");
  assert.deepEqual(github.calls.merged, []);
});

test("a labeled issue's pull request says Closes #<n>", async (t) => {
  const w = await workspace(t),
    github = fakeGithub(w),
    bodies: unknown[] = [],
    create = github.createPullRequest;
  github.createPullRequest = async (repo, input) => {
    bodies.push(input.body);
    return create(repo, input);
  };
  w.store.mutate("Issue task", (data) => {
    data.tasks.push({
      ...leaf("issue-12"),
      planId: undefined,
      labeledIssue: { repository: "acme/app", number: 12 },
    });
  });
  verified(w, "issue-12");
  await integrateVerified(w.store);
  await step(w, github);
  assert.match(String(bodies[0]), /^Closes #12$/m);
});

test("an auto merge checks the labeled issue again: one edited after its label is not merged, stays open and waits for a person", async (t) => {
  // Nearby input: the same issue unedited merges, so what holds the merge
  // is the edit.
  const run = async (edited: string | null) => {
    const w = await workspace(t),
      github = fakeGithub(w);
    w.store.put("repositories", {
      ...storedRow<{ id: string }>(w.store, "repositories", "app"),
      labels: { require: ["agent-ok"] },
    });
    Object.assign(github, {
      issue: async () => ({
        number: 12,
        state: "open",
        title: "Fix the crash",
        body: "x",
        labels: [{ name: "agent-ok" }],
        assignees: [{ login: "bot" }],
      }),
      issueEvents: async () => [
        {
          id: 501,
          event: "labeled",
          created_at: "2026-11-20T10:00:00Z",
          label: { name: "agent-ok" },
          actor: { login: "bot" },
        },
      ],
      graphql: async () => ({ repository: { i12: { lastEditedAt: edited } } }),
    });
    w.store.mutate("Issue task", (data) => {
      data.tasks.push({
        ...leaf("issue-12"),
        title: "Fix the crash",
        acceptance: ["x"],
        planId: undefined,
        labeledIssue: {
          repository: "acme/app",
          number: 12,
          event: { id: "501", createdAt: "2026-11-20T10:00:00Z" },
        },
        approvedSource: { text: "x", hash: digest("Fix the crash\n\nx") },
      });
    });
    verified(w, "issue-12");
    await integrateVerified(w.store);
    github.setChecks("success");
    const auto = (config: object) =>
      landPullRequests(w.store, {
        github,
        workspaceRoot: w.root,
        rounds: 2,
        config,
      });
    await auto({ landing: { pr: "auto" } });
    await auto({ landing: { pr: "auto" } });
    return {
      merged: github.calls.merged.length,
      decision: w.store.read().tasks.find((x: Task) => x.id === "issue-12")
        ?.decision,
      waiting: landingQueue(w.store, { repositoryId: "app", base: "main" })[0]
        ?.waiting?.reason,
    };
  };
  assert.deepEqual(await run(null), {
    merged: 1,
    decision: undefined,
    waiting: undefined,
  });
  const held = await run("2026-11-20T11:00:00Z");
  assert.equal(held.merged, 0);
  assert.equal(held.waiting, "merge");
  assert.match(
    String(held.decision),
    /did not merge pull request #1, so issue #12 stays open: its text changed after the label/,
  );
});

test("a ticked head merged with a moved base goes to a -2 branch, since it does not fast-forward the pushed tick", async (t) => {
  const w = await workspace(t, { spec: true });
  verified(w, "t1");
  await integrateVerified(w.store);
  const pushed = git(w.origin, "rev-parse", "avoozl/t1");
  landOtherWork(w);
  await integrateVerified(w.store);
  const delivery = storedRow<Delivery>(w.store, "task_deliveries", "t1");
  assert.equal(delivery.state, "done", "back to verification");
  // Verified again: the work commit carries the base, but not the tick.
  w.store.put("task_deliveries", { ...delivery, state: "verified" });
  await integrateVerified(w.store);
  assert.equal(git(w.origin, "rev-parse", "avoozl/t1"), pushed, "not forced");
  const [queued] = landingQueue(w.store, { repositoryId: "app", base: "main" });
  assert.equal(queued?.source?.branch, "avoozl/t1-2");
  assert.equal(git(w.origin, "rev-parse", "avoozl/t1-2"), queued?.commit);
});
