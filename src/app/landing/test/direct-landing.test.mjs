// The tick lands `direct` repositories on their remote (task 41.9). Real git (a
// bare "origin" and a checkout) and real checks; nothing live.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { digest } from "../../../model.mjs";
import { Store } from "../../store/store.mjs";
import { integrateVerified } from "../../delivery/delivery.mjs";
import { landingQueue } from "../landing-queue.mjs";
import { landDirect } from "../direct-landing.mjs";
import { graphView } from "../../api/page-views.mjs";
import { cacheClaim, claimOf } from "../../workers/claims.mjs";
import { retryLanded } from "../landed-work.mjs";
import { Operations } from "../../api/operations.mjs";
import { seedClaims, snapshot, verifiedTask } from "../../test/fixtures.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

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
// The check fails while the tree has a file named FAIL.
const CHECK = [
  process.execPath,
  "-e",
  "process.exit(require('fs').existsSync('FAIL') ? 1 : 0)",
];

async function workspace(t) {
  const root = temporaryDirectory("avoozl-directland-"),
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
  store.initialize({
    ...snapshot(),
    tasks: [leaf("t1"), leaf("t2")],
    edges: [],
  });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    landing: "direct",
    checks: [CHECK],
    worktreeRoot: path.join(root, "wt"),
  });
  store.put("plans", { id: "s", spec: "s", hash: digest("plan s") });
  return { root, origin, checkout: fs.realpathSync.native(checkout), store };
}

const verified = verifiedTask;

const step = (w) =>
  landDirect(w.store, { workspaceRoot: w.root, rounds: 2, machine: {} });

test("a verified task is queued, checked at the candidate and pushed by the tick", async (t) => {
  const w = await workspace(t),
    start = git(w.origin, "rev-parse", "main"),
    { commit, wt, branch } = verified(w, "t1");
  await integrateVerified(w.store);
  // Queued, not pushed.
  assert.equal(git(w.origin, "rev-parse", "main"), start);
  assert.equal(
    landingQueue(w.store, { repositoryId: "app", base: "main" }).length,
    1,
  );
  const result = await step(w);
  assert.deepEqual(result.notify, []);
  const landed = git(w.origin, "rev-parse", "main");
  assert.notEqual(landed, start);
  git(w.origin, "merge-base", "--is-ancestor", commit, landed);
  const delivery = w.store.get("task_deliveries", "t1");
  assert.equal(delivery.state, "integrated");
  assert.equal(delivery.integratedCommit, landed);
  assert.equal(
    w.store.read().tasks.find((x) => x.id === "t1").integration.commit,
    landed,
  );
  // The local base follows, and the task's worktree and branch are gone.
  assert.equal(git(w.checkout, "rev-parse", "main"), landed);
  assert.equal(fs.existsSync(wt), false);
  assert.equal(w.store.get("task_worktrees", "t1"), null);
  assert.throws(() => git(w.checkout, "rev-parse", "--verify", branch));
  // A second step has nothing to do.
  await step(w);
  assert.equal(git(w.origin, "rev-parse", "main"), landed);
  // A Kiro Crew chat that reported done keeps its last read status, working:
  // the landed task is not drawn as running (P39 live).
  const state = () =>
    graphView(w.store, w.store.read()).tasks.find((x) => x.id === "t1").state;
  assert.equal(state(), "running");
  w.store.put("session_bindings", {
    ...w.store.get("session_bindings", "slot-t1"),
    report: { kind: "done", commit },
  });
  assert.notEqual(state(), "running");
});

test("a failed check at the candidate goes back to the chat and pushes nothing", async (t) => {
  const w = await workspace(t),
    start = git(w.origin, "rev-parse", "main");
  verified(w, "t1", "FAIL");
  await integrateVerified(w.store);
  const result = await step(w);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].slot, "slot-t1");
  assert.match(result.messages[0].text, /landing candidate on main/);
  assert.match(result.messages[0].text, /exit 1/);
  assert.equal(w.store.get("task_deliveries", "t1").state, "running");
  assert.equal(git(w.origin, "rev-parse", "main"), start);
});

// The round sent back is finished by the same attempt's next done report,
// which replaces the first and goes through Verify again on the new commit.
// A `process` child sent back after landing is resumed by the message: its
// session reads as working again, so the backend reads the resumed run's
// result file, and it is told to finish with that file, not a commit.
test("a process worker sent back after landing is watched again and told to exit", async (t) => {
  const w = await workspace(t),
    { commit } = verified(w, "t1", "FAIL");
  w.store.put("session_bindings", {
    ...w.store.get("session_bindings", "slot-t1"),
    status: "closed",
    source: "tick",
    executor: "process",
    report: { kind: "done", commit, at: "2026-01-01T00:00:00.000Z" },
  });
  await integrateVerified(w.store);
  const result = await step(w);
  assert.match(result.messages[0].text, /\.avoozl\/result\.json/);
  assert.doesNotMatch(result.messages[0].text, /report done again/);
  const reopened = w.store.get("session_bindings", "slot-t1");
  assert.equal(reopened.report, undefined, "the done is set aside");
  assert.equal(reopened.status, "working", "the backend watches the resume");
});

test("a chat sent back after landing is told to report done again", async (t) => {
  const w = await workspace(t);
  verified(w, "t1", "FAIL");
  await integrateVerified(w.store);
  const result = await step(w);
  assert.match(result.messages[0].text, /report done again/);
  assert.equal(
    w.store.get("session_bindings", "slot-t1").status,
    "working",
    "a chat's own status is left alone",
  );
});

test("the tick lands a merge batch, then each landed member's ref is gone and the remote holds only main", async (t) => {
  const w = await workspace(t);
  w.store.put("repositories", {
    ...w.store.get("repositories", "app"),
    github: "acme/app",
  });
  const config = {
    github: {
      repositories: {
        "acme/app": { baseBranch: "main", landing: { mergeBatch: 2 } },
      },
    },
  };
  const first = verified(w, "t1"),
    second = verified(w, "t2");
  await integrateVerified(w.store);
  const at = git(w.checkout, "for-each-ref", "refs/avoozl/land");
  assert.equal(at, "", "refs are made when the batch is built");
  const result = await landDirect(w.store, {
    workspaceRoot: w.root,
    rounds: 2,
    machine: {},
    config,
  });
  assert.deepEqual(result.notify, []);
  const landed = git(w.origin, "rev-parse", "main");
  for (const { commit } of [first, second])
    git(w.origin, "merge-base", "--is-ancestor", commit, landed);
  assert.equal(
    git(w.origin, "rev-list", "--count", "--merges", "main"),
    "2",
    "one merge commit per member in one push",
  );
  assert.equal(
    git(w.origin, "for-each-ref", "--format=%(refname)"),
    "refs/heads/main",
  );
  assert.equal(git(w.checkout, "for-each-ref", "refs/avoozl/land"), "");
});

// The spec's tasks.md in the code repository, so a landing ticks it there.
function specInCode(w) {
  const file = path.join(w.checkout, ".kiro/specs/s/tasks.md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "# Tasks\n\n- [ ] 1.1 First\n- [ ] 1.2 Second\n");
  git(w.checkout, "add", ".");
  git(w.checkout, "commit", "-qm", "Spec");
  git(w.checkout, "push", "-q", "origin", "main");
  w.store.put("plans", {
    ...w.store.get("plans", "s"),
    mapping: { "s.1.1": "t1", "s.1.2": "t2" },
  });
}

test("after a direct landing Avoozl deletes the claim branch it created, and no other runner's", async (t) => {
  const w = await workspace(t);
  specInCode(w);
  w.store.put("repositories", {
    ...w.store.get("repositories", "app"),
    github: "acme/app",
  });
  const deleted = [],
    github = { deleteBranch: async (_repo, branch) => deleted.push(branch) };
  await seedClaims(w.store, { own: ["t1"], other: ["t2"] });
  verified(w, "t1");
  verified(w, "t2");
  await integrateVerified(w.store);
  const step = () =>
    landDirect(w.store, {
      github,
      workspaceRoot: w.root,
      rounds: 2,
      machine: {},
    });
  await step();
  await step();
  assert.equal(w.store.get("task_deliveries", "t2").state, "integrated");
  assert.match(
    git(w.origin, "show", "main:.kiro/specs/s/tasks.md"),
    /- \[x\] 1\.1 First/,
    "the tick landed with the work",
  );
  assert.deepEqual(deleted, ["avoozl/s/t1"]);
  assert.equal(claimOf(w.store, "acme/app", "t1"), null);
  assert.equal(claimOf(w.store, "acme/app", "t2").branch, "avoozl/s/t2");
});

test("landed work keeps its own claim until its tick is known on the done branch, then a later pass deletes it (13.6)", async (t) => {
  const w = await workspace(t),
    file = path.join(w.checkout, ".kiro/specs/s/tasks.md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "# Tasks\n\n- [x] 1.1 First\n  - It works\n");
  git(w.checkout, "add", ".");
  git(w.checkout, "commit", "-qm", "Land t1 with its tick");
  const landed = git(w.checkout, "rev-parse", "HEAD"),
    repository = { ...w.store.get("repositories", "app"), github: "acme/app" };
  w.store.mutate("Landed", (data) => {
    data.tasks.find((x) => x.id === "t1").integration = { commit: landed };
  });
  cacheClaim(w.store, "acme/app", {
    spec: "s",
    task: "t1",
    branch: "avoozl/s/t1",
    sha: landed,
    own: true,
  });
  const deleted = [],
    github = { deleteBranch: async (_repo, branch) => deleted.push(branch) };
  // The done branch cannot be read: the claim stays, so nobody takes t1.
  w.store.put("repositories", {
    ...repository,
    root: path.join(w.root, "gone"),
  });
  assert.equal(
    await retryLanded(w.store, github, { workspaceRoot: w.root }),
    0,
  );
  assert.deepEqual(deleted, []);
  assert.ok(claimOf(w.store, "acme/app", "t1"));
  // Readable again, with the tick in the landed commit: the claim goes.
  w.store.put("repositories", repository);
  assert.equal(
    await retryLanded(w.store, github, { workspaceRoot: w.root }),
    1,
  );
  assert.deepEqual(deleted, ["avoozl/s/t1"]);
  assert.equal(claimOf(w.store, "acme/app", "t1"), null);
});

test("avoozl land lands a claimed task now by its repository's mode, and refuses a task the caller did not claim", async (t) => {
  const w = await workspace(t),
    ops = new Operations(w.store, { workspaceRoot: w.root }),
    land = (taskId, context) =>
      ops.execute("runner.land", { taskId }, undefined, context);
  const { commit } = verified(w, "t1");
  verified(w, "t2");
  // Nobody here claimed it: the command line is refused, and so is another
  // task's session.
  await assert.rejects(land("t1", { local: true }), /not yours to land/);
  await assert.rejects(
    land("t1", { caller: { sessionKey: "dashboard:slot-t2" } }),
    /not yours to land/,
  );
  // The session bound to t1 lands it, in direct mode on main.
  const result = await land("t1", {
    caller: { sessionKey: "dashboard:slot-t1" },
  });
  assert.deepEqual(result, { task: "t1", mode: "direct", state: "integrated" });
  git(w.origin, "merge-base", "--is-ancestor", commit, "main");
  assert.equal(w.store.get("task_deliveries", "t2").state, "verified");
  // At the command line, a task this machine claimed is taken on too: main
  // moved under it, so it is merged with main and checked again first.
  await seedClaims(w.store, { own: ["t2"] });
  assert.equal((await land("t2", { local: true })).state, "done");
});

test("a labeled issue landed directly is closed with a comment naming the landed commit", async (t) => {
  const w = await workspace(t);
  w.store.put("repositories", {
    ...w.store.get("repositories", "app"),
    github: "acme/app",
  });
  w.store.mutate("Issue task", (data) => {
    data.tasks.push({
      ...leaf("issue-12"),
      planId: undefined,
      labeledIssue: { repository: "acme/app", number: 12 },
    });
  });
  const calls = [],
    github = {
      deleteBranch: async () => null,
      issue: async () => ({ state: "open" }),
      createIssueComment: async (repo, number, body) =>
        calls.push(["comment", repo, number, body]),
      updateIssue: async (repo, number, input) =>
        calls.push(["update", repo, number, input.state]),
    };
  verified(w, "issue-12");
  await integrateVerified(w.store);
  await landDirect(w.store, {
    github,
    workspaceRoot: w.root,
    rounds: 2,
    machine: {},
  });
  const landed = git(w.origin, "rev-parse", "main");
  assert.deepEqual(calls, [
    ["comment", "acme/app", 12, `Landed in ${landed}.`],
    ["update", "acme/app", 12, "closed"],
  ]);
});
