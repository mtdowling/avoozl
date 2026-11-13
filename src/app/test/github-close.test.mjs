import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { queryTasks } from "../../model.mjs";
import { completionReached } from "../../work-model.mjs";
import { Operations } from "../operations.mjs";
import { blockerNotes } from "../github-close.mjs";
import { parseMarker, renderMarker } from "../github-marker.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// No machine-wide Avoozl configuration leaks into these workspaces.
process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const NAMESPACE = "avz_0123456789abcdef",
  REPO = "example/code",
  SHA = "a".repeat(40),
  hash = "b".repeat(64);

const marker = (taskId) =>
  renderMarker({
    version: 2,
    taskId,
    namespace: NAMESPACE,
    kind: "leaf",
    source: { commit: null, manifest: hash },
    applied: { title: hash, body: hash, labels: [], blockers: [] },
  });

class FakeGitHub {
  constructor() {
    this.issues = new Map();
    this.closing = new Map();
    this.reviews = new Map();
    this.events = new Map();
    this.timeline = new Map();
    this.permissions = new Map([
      ["maintainer", "write"],
      ["intruder", "write"],
    ]);
    this.checks = [{ id: 1, name: "build", conclusion: "success" }];
    this.updates = [];
    this.reads = 0;
  }
  available() {
    return true;
  }
  open(number, taskId) {
    this.issues.set(number, {
      number,
      state: "open",
      state_reason: null,
      closed_at: null,
      updated_at: "2026-11-12T10:00:00Z",
      body: marker(taskId) + "\nBody",
      html_url: `https://example.test/${REPO}/issues/${number}`,
    });
  }
  close(number, { reason = "completed", actor = "maintainer", at = 5 } = {}) {
    const closedAt = `2026-11-12T10:${String(at).padStart(2, "0")}:00Z`;
    Object.assign(this.issues.get(number), {
      state: "closed",
      state_reason: reason,
      closed_at: closedAt,
      updated_at: closedAt,
    });
    this.events.set(number, [
      ...(this.events.get(number) || []),
      {
        event: "closed",
        actor: { login: actor },
        state_reason: reason,
        created_at: closedAt,
      },
    ]);
  }
  reopen(number) {
    Object.assign(this.issues.get(number), {
      state: "open",
      state_reason: "reopened",
      closed_at: null,
      updated_at: "2026-11-12T11:00:00Z",
    });
  }
  merged(number, extra = {}) {
    this.closing.set(number, [
      {
        number: 100 + number,
        url: `https://example.test/${REPO}/pull/${100 + number}`,
        merged: true,
        mergedAt: "2026-11-12T10:04:00Z",
        headRefOid: SHA,
        baseRefName: "main",
        repository: { nameWithOwner: REPO },
        ...extra,
      },
    ]);
  }
  issue(_repository, number) {
    this.reads += 1;
    return Promise.resolve(structuredClone(this.issues.get(number)));
  }
  closingPullRequests(_repository, number) {
    return Promise.resolve(structuredClone(this.closing.get(number) || []));
  }
  pullRequestReviews(_repository, number) {
    return Promise.resolve(structuredClone(this.reviews.get(number) || []));
  }
  checkRuns() {
    return Promise.resolve(structuredClone(this.checks));
  }
  commitStatus() {
    return Promise.resolve({ statuses: [] });
  }
  issueEvents(_repository, number) {
    return Promise.resolve(structuredClone(this.events.get(number) || []));
  }
  issueTimeline(_repository, number) {
    return Promise.resolve(structuredClone(this.timeline.get(number) || []));
  }
  permission(_repository, actor) {
    return Promise.resolve({
      permission: this.permissions.get(actor) || "none",
    });
  }
  updateIssue(_repository, number, input) {
    this.updates.push([number, input]);
    const issue = this.issues.get(number);
    Object.assign(issue, input, { updated_at: "2026-11-12T12:00:00Z" });
    return Promise.resolve(structuredClone(issue));
  }
}

// Leaves a..h with issues 1..8; each `x` has a dependent `x-next`. The epic
// `parent` holds leaf a.
function workspace(t, mode = "single-repo", extra = {}) {
  const { store } = fixture(t),
    root = temporaryDirectory(),
    github = new FakeGitHub();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      github: {
        mode,
        ...(mode === "plans-repo"
          ? { planningRepository: "example/plans" }
          : {}),
        repositories: {
          [REPO]: {
            baseBranch: "main",
            allowedActors: ["maintainer"],
            minimumPermission: "write",
            requiredChecks: ["build"],
            ...extra,
          },
        },
      },
    }),
  );
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    checks: [],
  });
  store.put("github_repositories", {
    id: REPO,
    owner: "example",
    repo: "code",
    projectId: "code",
    activeMachine: machineIdentity(store).id,
  });
  store.mutate("Seed GitHub leaves", (data) => {
    const leaf = (id, number, extra = {}) => ({
      id,
      title: "Task " + id,
      scope: "catalog",
      status: "planned",
      epic: "sample",
      track: "catalog",
      kind: "leaf",
      authority: "github",
      repository: "code",
      acceptance: [id + " works"],
      checks: ["build"],
      ...(number
        ? {
            github: {
              repository: REPO,
              number,
              nodeId: "I_" + number,
              url: `https://example.test/${REPO}/issues/${number}`,
            },
          }
        : {}),
      ...extra,
    });
    data.tasks.push(
      {
        ...leaf("parent", 20),
        kind: "epic",
        acceptance: undefined,
      },
      leaf("a", 1, { parent: "parent" }),
    );
    for (const [id, number] of [
      ["b", 2],
      ["c", 3],
      ["d", 4],
      ["e", 5],
    ])
      data.tasks.push(leaf(id, number));
    for (const id of ["a", "b", "c", "d", "e"]) {
      data.tasks.push(leaf(id + "-next", null));
      data.edges.push({
        id: `${id}:requires:${id}-next`,
        from: id,
        to: id + "-next",
        kind: "requires",
      });
    }
  });
  for (const [taskId, number] of [
    ["parent", 20],
    ["a", 1],
    ["b", 2],
    ["c", 3],
    ["d", 4],
    ["e", 5],
  ])
    github.open(number, taskId);
  const ops = new Operations(store, { github, workspaceRoot: root }),
    run = () => ops.execute("workspace.tick", { sessions: [] }),
    task = (id) => store.read().tasks.find((item) => item.id === id),
    ready = () =>
      new Set(
        queryTasks(store.read(), { scope: "all", q: "ready:true" }).map(
          (item) => item.id,
        ),
      );
  return { store, github, run, task, ready };
}

test("a merged closer with passing checks completes the leaf, releases its dependent, and closes the parent", async (t) => {
  const { github, run, task, ready } = workspace(t);
  assert.equal((await run()).github.status, "ok");
  assert.equal(ready().has("a-next"), false);
  github.merged(1);
  github.close(1);
  await run();
  assert.equal(task("a").githubVerdict.state, "verified");
  assert.equal(task("a").githubVerdict.headSha, SHA);
  assert.equal(
    completionReached(task("a"), "integrated", () => false),
    true,
  );
  assert.equal(ready().has("a-next"), true);
  // Avoozl closes the parent, never a leaf.
  assert.deepEqual(github.updates, [
    [20, { state: "closed", state_reason: "completed" }],
  ]);
});

test("a tick with no GitHub change writes nothing", async (t) => {
  const { store, github, run } = workspace(t);
  github.merged(1);
  github.close(1);
  await run();
  await run();
  const revision = store.read().revision,
    updates = github.updates.length;
  await run();
  assert.equal(store.read().revision, revision);
  assert.equal(github.updates.length, updates);
});

test("failing checks hold the leaf until they pass", async (t) => {
  const { github, run, task, ready } = workspace(t);
  github.checks = [{ id: 1, name: "build", conclusion: "failure" }];
  github.merged(2);
  github.close(2);
  await run();
  assert.equal(task("b").githubVerdict.state, "held");
  assert.equal(ready().has("b-next"), false);
  github.checks = [{ id: 2, name: "build", conclusion: "success" }];
  await run();
  assert.equal(task("b").githubVerdict.state, "verified");
  assert.equal(task("b").decision, null);
  assert.equal(ready().has("b-next"), true);
});

test("an allowed close without code is an order; a reopen withdraws it", async (t) => {
  const { store, github, run, task, ready } = workspace(t);
  github.close(3, { reason: "not_planned" });
  await run();
  const verdict = task("c").githubVerdict;
  assert.equal(verdict.state, "order");
  assert.deepEqual(verdict.order, {
    actor: "maintainer",
    reason: "NOT_PLANNED",
    closedAt: "2026-11-12T10:05:00Z",
  });
  // The order satisfies every level and releases the dependent.
  assert.equal(
    completionReached(task("c"), "released", () => false),
    true,
  );
  assert.equal(ready().has("c-next"), true);
  assert.equal(
    parseMarker(github.issues.get(3).body).order.actor,
    "maintainer",
  );
  assert.equal(store.get("receipts", "github-order:c").reason, "NOT_PLANNED");
  // Only the marker was written; the issue stays closed.
  assert.equal(github.issues.get(3).state, "closed");
  const [note] = blockerNotes(store.read(), task("c-next"));
  assert.match(note, /closed without merged code: maintainer/);
  assert.match(note, /issues\/3/);

  github.reopen(3);
  await run();
  assert.equal(task("c").githubVerdict.state, "open");
  assert.equal(task("c").status, "planned");
  assert.equal(parseMarker(github.issues.get(3).body).order, undefined);
  assert.equal(store.get("receipts", "github-order:c"), null);
  assert.equal(ready().has("c-next"), false);
  assert.deepEqual(blockerNotes(store.read(), task("c-next")), []);
});

test("a close on an issue a crew claims is held, not an order, unless code merged", async (t) => {
  const { github, run, task, ready } = workspace(t);
  github.issues.get(3).labels = [{ name: "crew: in progress" }];
  github.close(3);
  github.issues.get(2).labels = [{ name: "Crew: In Progress" }];
  github.merged(2);
  github.close(2);
  await run();
  // The maintainer is allowed, but a crew closes with that same login.
  assert.equal(task("c").githubVerdict.state, "held");
  assert.match(
    task("c").githubVerdict.reason,
    /carries Issue Radar's claim "crew: in progress"/,
  );
  assert.equal(task("c").decision, "github-completion:c");
  assert.equal(ready().has("c-next"), false);
  assert.deepEqual(github.updates, []);
  // A merged closing pull request is judged as before.
  assert.equal(task("b").githubVerdict.state, "verified");
  assert.equal(ready().has("b-next"), true);
});

test("a drag to Done names the person through the Status change", async (t) => {
  const { github, run, task } = workspace(t);
  github.timeline.set(4, [
    {
      event: "project_v2_item_status_changed",
      actor: { login: "maintainer" },
      created_at: "2026-11-12T10:04:00Z",
    },
  ]);
  github.close(4, { actor: "github-project-automation[bot]" });
  await run();
  assert.equal(task("d").githubVerdict.state, "order");
  assert.equal(task("d").githubVerdict.source, "status-change");
  assert.equal(task("d").githubVerdict.order.actor, "maintainer");
});

test("a close by a disallowed or unreadable actor holds dependents and never reopens", async (t) => {
  const { github, run, task, ready } = workspace(t);
  github.close(5, { actor: "intruder" });
  github.close(4, { actor: "github-project-automation[bot]" });
  const result = await run();
  assert.equal(task("e").githubVerdict.state, "held");
  assert.equal(task("e").decision, "github-completion:e");
  assert.equal(task("d").githubVerdict.state, "held");
  assert.match(task("d").githubVerdict.reason, /no person can be read/);
  assert.equal(ready().has("e-next"), false);
  assert.equal(ready().has("d-next"), false);
  assert.equal(
    result.notify.filter((notice) => notice.channel === "decision").length,
    2,
  );
  assert.deepEqual(github.updates, []);
});

test("a closer whose permission GitHub hides holds instead of failing the tick", async (t) => {
  const { github, run, task, ready } = workspace(t);
  github.permission = () =>
    Promise.reject(
      Object.assign(
        Error("Must have push access to view collaborator permission."),
        {
          status: 403,
        },
      ),
    );
  github.close(3, { reason: "not_planned" });
  await run();
  assert.equal(task("c").githubVerdict.state, "held");
  assert.match(
    task("c").githubVerdict.reason,
    /write access .* to check who counts/,
  );
  assert.equal(ready().has("c-next"), false);
  assert.deepEqual(github.updates, []);
});

test("a merged, passing pull request whose issue stays open opens a decision", async (t) => {
  const { github, run, task, ready } = workspace(t);
  github.merged(2);
  await run();
  assert.equal(task("b").githubVerdict.state, "held");
  assert.match(task("b").githubVerdict.reason, /still open/);
  assert.equal(ready().has("b-next"), false);
  assert.deepEqual(github.updates, []);
});

test("a closer in another repository or on another base is a conflict", async (t) => {
  const { github, run, task } = workspace(t);
  github.merged(1, { repository: { nameWithOwner: "example/other" } });
  github.close(1);
  github.merged(2, { baseRefName: "release" });
  github.close(2);
  await run();
  assert.match(task("a").githubVerdict.reason, /another repository/);
  assert.match(task("b").githubVerdict.reason, /release, not main/);
  assert.equal(task("a").githubVerdict.state, "held");
});

test("plans-repo notes name the blocker by task ID and title only", async (t) => {
  const { store, github, run, task } = workspace(t, "plans-repo");
  github.close(3);
  await run();
  assert.equal(task("c").githubVerdict.state, "order");
  const [note] = blockerNotes(store.read(), task("c-next"));
  assert.match(note, /Blocker c "Task c" closed without merged code/);
  assert.doesNotMatch(note, /example\/code|issues\//);
});

// Task 9.10: pull-request reviews on the head SHA as the GitHub leaf's
// review verdict.
const review = (id, login, state, commit = SHA, at = id) => ({
  id,
  user: { login },
  state,
  commit_id: commit,
  submitted_at: `2026-11-12T10:${String(at).padStart(2, "0")}:00Z`,
  html_url: `https://example.test/${REPO}/pull/101#review-${id}`,
});

test("with pull-request reviews on, a merged leaf waits for an allowed approval on its head", async (t) => {
  const { github, run, task, ready } = workspace(t, "single-repo", {
    pullRequestReviews: {},
  });
  github.merged(1);
  github.close(1);
  github.reviews.set(101, [
    review(1, "maintainer", "APPROVED", "c".repeat(40)),
    review(2, "intruder", "APPROVED"),
    review(3, "maintainer", "COMMENTED"),
  ]);
  await run();
  let verdict = task("a").githubVerdict;
  assert.equal(verdict.state, "held");
  assert.match(verdict.reason, /0 of 1 allowed approvals/);
  assert.equal(task("a").decision, "github-completion:a");
  assert.equal(ready().has("a-next"), false);
  const [intruder, stale] = verdict.reviews.reviews;
  assert.equal(intruder.allowed, false);
  assert.match(intruder.reason, /not an allowed actor/);
  assert.equal(stale.stale, true);
  assert.equal(stale.reviewer, "maintainer");

  // An allowed approval on the head releases the dependent.
  github.reviews.get(101).push(review(4, "maintainer", "APPROVED"));
  await run();
  verdict = task("a").githubVerdict;
  assert.equal(verdict.state, "verified");
  assert.equal(verdict.reviews.state, "approved");
  assert.equal(task("a").decision, null);
  assert.equal(ready().has("a-next"), true);
  assert.deepEqual(
    github.updates.filter(([number]) => number !== 20),
    [],
  );
});

test("an allowed change request on the head holds; disallowed and dismissed ones count for nothing", async (t) => {
  const { github, run, task } = workspace(t, "single-repo", {
    pullRequestReviews: { approvals: 1 },
  });
  github.merged(2);
  github.close(2);
  github.reviews.set(102, [
    review(1, "maintainer", "APPROVED"),
    review(2, "lead", "CHANGES_REQUESTED"),
  ]);
  github.permissions.set("lead", "admin");
  // lead is not in allowedActors, so the change request is ignored.
  await run();
  assert.equal(task("b").githubVerdict.state, "verified");

  const {
    github: other,
    run: tick,
    task: read,
  } = workspace(t, "single-repo", { pullRequestReviews: {} });
  other.merged(2);
  other.close(2);
  other.reviews.set(102, [
    review(1, "maintainer", "APPROVED"),
    review(2, "maintainer", "CHANGES_REQUESTED"),
  ]);
  await tick();
  assert.equal(read("b").githubVerdict.state, "held");
  assert.match(
    read("b").githubVerdict.reason,
    /changes requested .* maintainer/,
  );
  // GitHub marks a dismissed review DISMISSED: it no longer counts, and
  // the earlier approval on the head is the reviewer's verdict again.
  other.reviews.get(102)[1].state = "DISMISSED";
  await tick();
  assert.equal(read("b").githubVerdict.state, "verified");
});

test("an open leaf shows its pull request's reviews, and a moved head makes them stale", async (t) => {
  const { store, github, run, task } = workspace(t, "single-repo", {
    pullRequestReviews: {},
  });
  github.closing.set(3, [
    {
      number: 103,
      url: `https://example.test/${REPO}/pull/103`,
      state: "OPEN",
      merged: false,
      headRefOid: SHA,
      baseRefName: "main",
      repository: { nameWithOwner: REPO },
    },
  ]);
  github.reviews.set(103, [review(1, "maintainer", "APPROVED")]);
  await run();
  assert.equal(task("c").githubVerdict.state, "open");
  assert.equal(task("c").githubVerdict.reviews.state, "approved");
  // The head moves; the issue does not change, but the leaf is watched.
  github.closing.get(3)[0].headRefOid = "d".repeat(40);
  await run();
  const reviews = task("c").githubVerdict.reviews;
  assert.equal(reviews.state, "pending");
  assert.equal(reviews.reviews[0].stale, true);
  const { deliveryView } = await import("../page-views.mjs"),
    item = deliveryView(store, store.read()).items.find((i) => i.id === "c");
  assert.equal(item.githubReviews.state, "pending");
  assert.equal(
    item.githubReviews.pullRequest,
    `https://example.test/${REPO}/pull/103`,
  );
  assert.equal(item.githubReviews.reviews[0].stale, true);
});

test("without pull-request reviews, reviews are not read", async (t) => {
  const { github, run, task } = workspace(t);
  github.pullRequestReviews = () => {
    throw Error("read reviews");
  };
  github.merged(1);
  github.close(1);
  await run();
  assert.equal(task("a").githubVerdict.state, "verified");
  assert.equal(task("a").githubVerdict.reviews, undefined);
});

test("the base branch's GitHub review rule sets the approvals a merged leaf needs", async (t) => {
  const { github, run, task, ready } = workspace(t, "single-repo", {
    allowedActors: ["maintainer", "lead"],
  });
  const asked = [];
  github.branchRules = (repository, branch) => {
    asked.push([repository, branch]);
    return Promise.resolve([
      {
        type: "pull_request",
        parameters: {
          required_approving_review_count: 2,
          dismiss_stale_reviews_on_push: true,
        },
      },
    ]);
  };
  github.branchProtection = () => Promise.resolve(null);
  github.branch = () => Promise.resolve({ protected: false });
  github.merged(1);
  github.close(1);
  github.reviews.set(101, [review(1, "maintainer", "APPROVED")]);
  await run();
  let verdict = task("a").githubVerdict;
  assert.equal(verdict.state, "held");
  assert.match(verdict.reason, /1 of 2 allowed approvals/);
  assert.equal(ready().has("a-next"), false);
  assert.deepEqual(asked[0], [REPO, "main"]);

  // A second allowed reviewer's approval on the head meets the rule.
  github.permissions.set("lead", "write");
  github.reviews.get(101).push(review(3, "lead", "APPROVED"));
  await run();
  verdict = task("a").githubVerdict;
  assert.equal(verdict.state, "verified");
  assert.equal(verdict.reviews.needed, 2);
});

test("with no branch review rule and no old setting, reviews are not read", async (t) => {
  const { github, run, task } = workspace(t);
  github.branchRules = () => Promise.resolve([]);
  github.branchProtection = () => Promise.resolve(null);
  github.branch = () => Promise.resolve({ protected: false });
  github.pullRequestReviews = () => {
    throw Error("read reviews");
  };
  github.merged(1);
  github.close(1);
  await run();
  assert.equal(task("a").githubVerdict.state, "verified");
});
