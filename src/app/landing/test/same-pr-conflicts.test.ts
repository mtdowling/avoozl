// Same-pull-request conflict fixing and auto-merge arming (R87.6, R80.5,
// workflow rules 16.6 and 17.7). Real git (a bare "origin" and a checkout)
// and a small fake GitHub that keeps one pull request per branch.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { Store } from "../../store/store.ts";
import { integrateVerified } from "../../delivery/delivery.ts";
import { landingQueue } from "../landing-queue.ts";
import { landPullRequests } from "../pr-landing.ts";
import type { LandOptions } from "../direct-landing.ts";
import { snapshot, verifiedTask } from "../../test/fixtures.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import {
  cloneOf,
  git,
  leaf,
  originCheckout,
} from "../../test/delivery-fixture.ts";
import { partialFake } from "../../test/partial-fake.ts";
import { storedRow } from "../../test/view-shapes.ts";
import type { LandingConfig } from "../landing-config.ts";

type Github = NonNullable<LandOptions["github"]>;
interface Pull {
  number: number;
  state: string;
  node_id: string;
  user: { login: string };
  head: { ref: string; sha: string };
  mergeable: boolean;
  draft: boolean;
  auto_merge: unknown;
}
interface Delivery {
  id: string;
  state: string;
  commit: string;
  cause?: string;
  landingConflicts?: { resolved?: unknown; commented?: { pr: number } }[];
}

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");
const FILE = "same.txt";

async function world(t: TestContext) {
  const root = temporaryDirectory("avoozl-samepr-"),
    { origin, checkout } = originCheckout(root);
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize({
    ...snapshot(),
    tasks: [leaf("t1", { acceptance: ["t1 works."], planId: "s" })],
    edges: [],
  });
  store.put("repositories", {
    id: "app",
    root: checkout,
    baseBranch: "main",
    landing: "pr",
    github: "acme/app",
  });
  store.put("plans", { id: "s", spec: "s" });
  const w = { root, origin, checkout, store };
  const task = verifiedTask(w, "t1", FILE);
  return { ...w, ...task };
}
type World = Awaited<ReturnType<typeof world>>;

// Lands a commit on origin's main from a second clone.
function pushToMain(w: World, file: string, text: string) {
  const other = cloneOf(
    w.origin,
    path.join(w.root, `other-${Date.now()}-${Math.random()}`),
  );
  fs.writeFileSync(path.join(other, file), text);
  git(other, "add", ".");
  git(other, "commit", "-qm", `Change ${file}`);
  git(other, "push", "-q", "origin", "main");
}

// GitHub, as far as these steps read and write it: one pull request per
// head branch, a `build` check whose result the test sets, and an optional
// one-approval review rule.
function fakeGitHub(w: World, { review = false, author = "bot" } = {}) {
  const pulls: Pull[] = [],
    comments: { number: number; body: string }[] = [],
    armed: { node: string; head: string; method: string }[] = [],
    state = { checks: "success", mergeable: true };
  const tip = (ref: string) => git(w.origin, "rev-parse", ref);
  const rules = [
    {
      type: "required_status_checks",
      parameters: { required_status_checks: [{ context: "build" }] },
    },
    ...(review
      ? [
          {
            type: "pull_request",
            parameters: { required_approving_review_count: 1 },
          },
        ]
      : []),
  ];
  const github = partialFake<Github>({
    currentUser: async () => ({ login: "bot" }),
    permission: async () => ({ permission: "write" }),
    branchHead: async () => ({ oid: tip("main") }),
    branchRules: async () => rules,
    branch: async () => null,
    branchProtection: async () => null,
    commitStatus: async () => ({ statuses: [] }),
    pullRequestReviews: async () => [],
    checkRuns: async () => [
      state.checks === "pending"
        ? { name: "build", status: "in_progress", conclusion: null }
        : { name: "build", status: "completed", conclusion: state.checks },
    ],
    listPullRequests: async (_repo, query) =>
      pulls.filter((p) => `acme:${p.head.ref}` === query.head),
    pullRequest: async (_repo, number) => {
      const pull = pulls.find((p) => p.number === number) ?? null;
      if (pull) {
        // A push moves the head and disarms auto-merge, as on GitHub.
        const sha = tip(pull.head.ref);
        if (sha !== pull.head.sha) pull.auto_merge = null;
        pull.head.sha = sha;
        pull.mergeable = state.mergeable;
      }
      return structuredClone(pull);
    },
    createPullRequest: async (_repo, input) => {
      const ref = String(input.head),
        pull: Pull = {
          number: pulls.length + 1,
          state: "open",
          node_id: `PR_${pulls.length + 1}`,
          user: { login: author },
          head: { ref, sha: tip(ref) },
          mergeable: state.mergeable,
          draft: Boolean(input.draft),
          auto_merge: null,
        };
      pulls.push(pull);
      return structuredClone(pull);
    },
    createIssueComment: async (_repo, number, body) =>
      comments.push({ number: Number(number), body: String(body) }),
    compareCommits: async (_repo, base, head) => {
      const behind = git(w.origin, "rev-list", "--count", `${head}..${base}`);
      return { behind_by: Number(behind) };
    },
    enablePullRequestAutoMerge: async (node, { head, method }) => {
      armed.push({ node, head, method });
      const pull = pulls.find((p) => p.node_id === node);
      if (pull) pull.auto_merge = { head };
    },
  });
  return { github, pulls, comments, armed, state };
}

const configFor = (pr: string): LandingConfig => ({
  github: { repositories: { "acme/app": { landing: { mode: "pr", pr } } } },
});
const step = (w: World, github: Github, pr = "ready") =>
  landPullRequests(w.store, {
    github,
    workspaceRoot: w.root,
    rounds: 2,
    config: configFor(pr),
  });
const delivery = (w: World) =>
  storedRow<Delivery>(w.store, "task_deliveries", "t1");

// The worker's round: merge main into the task branch, resolve `same.txt`
// as `text`, commit, and report done with `notes`. Verification is not what
// these tests check, so the delivery goes straight back to verified.
function workerFixes(w: World, text: string, notes: string) {
  git(w.wt, "fetch", "-q", "origin");
  try {
    git(w.wt, "merge", "-q", "origin/main");
  } catch {}
  fs.writeFileSync(path.join(w.wt, FILE), text);
  git(w.wt, "add", ".");
  git(w.wt, "commit", "-qm", "Merge main into avoozl/t1");
  const fixed = git(w.wt, "rev-parse", "HEAD");
  const binding = storedRow(w.store, "session_bindings", "slot-t1");
  w.store.put("session_bindings", {
    ...binding,
    report: { kind: "done", text: notes, commit: fixed },
  });
  w.store.put("task_deliveries", {
    ...delivery(w),
    state: "verified",
    commit: fixed,
  });
  return fixed;
}

// t1's pull request is open; then main changes the same file, so the merge
// forward conflicts and the round goes to t1's worker.
async function conflicted(w: World, github: Github) {
  await integrateVerified(w.store);
  await step(w, github);
  pushToMain(w, FILE, "main one\nmain two\n");
  const sent = await integrateVerified(w.store);
  assert.equal(sent.messages.length, 1);
  assert.match(sent.messages[0].text, /same\.txt/);
  assert.equal(delivery(w).state, "running");
}

test("a conflict is fixed in the same pull request, with one comment naming each file", async (t) => {
  const w = await world(t),
    fake = fakeGitHub(w);
  await conflicted(w, fake.github);
  const fixed = workerFixes(
    w,
    "t1\nmain one\nmain two\n",
    "same.txt: kept the task's line above both of main's",
  );
  await integrateVerified(w.store);
  assert.equal(git(w.origin, "rev-parse", "avoozl/t1"), fixed, "pushed");
  assert.equal(
    git(w.origin, "rev-list", "--parents", "-n", "1", fixed).split(" ").length,
    3,
    "a merge commit",
  );
  await step(w, fake.github);
  await step(w, fake.github);
  assert.equal(fake.pulls.length, 1, "the same pull request");
  assert.equal(fake.comments.length, 1, "one comment, posted once");
  const [comment] = fake.comments;
  assert.equal(comment.number, 1);
  assert.match(
    comment.body,
    /\| `same\.txt` \| 2 of 2 kept \| kept the task's line/,
  );
  assert.match(comment.body, /Nothing was rebased or force pushed/);
});

test("a fix that loses a line main added pushes nothing and goes to Needs you", async (t) => {
  const w = await world(t),
    fake = fakeGitHub(w);
  await conflicted(w, fake.github);
  const before = git(w.origin, "rev-parse", "avoozl/t1");
  workerFixes(w, "t1\nmain one\n", "same.txt: took ours");
  const { notify } = await integrateVerified(w.store);
  assert.equal(
    git(w.origin, "rev-parse", "avoozl/t1"),
    before,
    "nothing pushed",
  );
  assert.equal(delivery(w).state, "decision");
  assert.match(
    String(delivery(w).cause),
    /lost a line the base added: main two/,
  );
  assert.equal(notify.length, 1);
  assert.equal(notify[0].channel, "decision");
  assert.equal(
    landingQueue(w.store, { repositoryId: "app", base: "main" }).length,
    0,
  );
});

test("a dropped line the worker quotes with its reason is allowed and named on the pull request", async (t) => {
  const w = await world(t),
    fake = fakeGitHub(w);
  await conflicted(w, fake.github);
  const fixed = workerFixes(
    w,
    "t1\nmain one\n",
    "same.txt: kept main one\nDropped `main two`: t1 replaces it.",
  );
  await integrateVerified(w.store);
  assert.equal(git(w.origin, "rev-parse", "avoozl/t1"), fixed);
  await step(w, fake.github);
  assert.match(fake.comments[0].body, /1 of 2 kept/);
  assert.match(fake.comments[0].body, /Dropped `main two`: t1 replaces it\./);
});

test("a pull request a person opened is left alone when it conflicts", async (t) => {
  const w = await world(t),
    fake = fakeGitHub(w, { author: "mona" });
  await integrateVerified(w.store);
  pushToMain(w, FILE, "main\n");
  fake.state.mergeable = false;
  const out = await step(w, fake.github);
  assert.deepEqual(out.messages, [], "no worker is sent");
  assert.equal(delivery(w).state, "decision");
  assert.match(String(delivery(w).cause), /mona's, so Avoozl leaves/);
  assert.equal(fake.comments.length, 0);
});

test("auto mode arms auto-merge once checks pass, and again after each base merge", async (t) => {
  const w = await world(t),
    fake = fakeGitHub(w, { review: true });
  await integrateVerified(w.store);
  await step(w, fake.github, "auto");
  await step(w, fake.github, "auto");
  const first = git(w.origin, "rev-parse", "avoozl/t1");
  assert.deepEqual(
    fake.armed,
    [{ node: "PR_1", head: first, method: "squash" }],
    "armed once for the head",
  );
  // Main moves without a conflict: Avoozl merges it in and verifies again.
  pushToMain(w, "other.txt", "other\n");
  await integrateVerified(w.store);
  assert.equal(delivery(w).state, "done");
  w.store.put("task_deliveries", { ...delivery(w), state: "verified" });
  await integrateVerified(w.store);
  const second = git(w.origin, "rev-parse", "avoozl/t1");
  assert.notEqual(second, first);
  fake.state.checks = "pending";
  await step(w, fake.github, "auto");
  assert.equal(fake.armed.length, 1, "not armed before its checks pass");
  fake.state.checks = "success";
  await step(w, fake.github, "auto");
  assert.deepEqual(
    fake.armed.map((a) => a.head),
    [first, second],
  );
});

test("auto-merge is not armed while the head is behind the base, or outside auto", async (t) => {
  const w = await world(t),
    fake = fakeGitHub(w, { review: true });
  await integrateVerified(w.store);
  await step(w, fake.github, "ready");
  await step(w, fake.github, "ready");
  assert.deepEqual(fake.armed, [], "ready never arms");
  pushToMain(w, "other.txt", "other\n");
  await step(w, fake.github, "auto");
  assert.deepEqual(fake.armed, [], "behind the base");
});
