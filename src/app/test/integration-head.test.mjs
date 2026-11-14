// rc-16.3, rc-16.5 and rc-16.6: whole-head checks and acceptance on an epic's
// integration branch, the stop that holds the epic's line, and the one
// person-approved landing. Fake GitHub only: the fake has no call that merges
// the branch into main, so a test would fail if the code tried.
import assert from "node:assert/strict";
import test from "node:test";
import { linePausedTaskIds, openStops } from "../flow.mjs";
import {
  landBranch,
  landingNeedsYou,
  headStep,
  integrationView,
} from "../integration-head.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

const REPO = "example/code";
const BRANCH = "rewrite/x";
const sha = (n) => String(n).repeat(40).slice(0, 40);
const policy = {
  mode: "single-repo",
  repositories: {
    [REPO]: {
      baseBranch: "main",
      coder: "issue-radar",
      requiredChecks: ["build"],
    },
  },
};
const target = {
  spec: "rewrite",
  repository: REPO,
  branch: BRANCH,
  sync: "weekly",
};

function fake(state = {}) {
  const s = { head: sha(1), checks: [], behind: 0, ...state };
  return {
    s,
    available: () => true,
    repository: async () => ({ default_branch: "main" }),
    branch: async () => ({ commit: { sha: s.head } }),
    checkRuns: async () => s.checks,
    commitStatus: async () => ({ statuses: [] }),
    compareCommits: async () => ({ ahead_by: s.behind }),
  };
}
const pass = { name: "build", status: "completed", conclusion: "success" };
const fail = { name: "build", status: "completed", conclusion: "failure" };

function workspace(t) {
  const { store } = fixture(t);
  store.put("plans", { id: "rewrite", spec: "rewrite", state: "approved" });
  return store;
}
const step = (store, github, now = Date.now()) =>
  headStep(store, github, [target], { policy, now });
const view = (store) => integrationView(store).branches[0];

test("a green head records acceptance naming it; a task merge moves the head and leaves it open", async (t) => {
  const store = workspace(t),
    github = fake({ checks: [pass], behind: 2 });
  await step(store, github);
  assert.equal(view(store).checks, "green");
  assert.equal(view(store).accepted, true);
  const first = view(store).head;
  // A task merges into the branch: a new head whose checks have not run.
  github.s.head = sha(2);
  github.s.checks = [{ name: "build", status: "in_progress" }];
  await step(store, github);
  assert.equal(view(store).accepted, false);
  assert.equal(view(store).checks, "pending");
  // Green again: the record names the new head.
  github.s.checks = [pass];
  await step(store, github);
  assert.equal(view(store).accepted, true);
  assert.notEqual(view(store).head, first);
});

test("the view shows tasks merged, commits behind main and the head's check state", async (t) => {
  const store = workspace(t);
  await step(store, fake({ checks: [pass], behind: 3 }));
  const row = view(store);
  assert.equal(row.behind, 3);
  assert.equal(row.checks, "green");
  assert.equal(row.tasksMerged, 0);
  assert.equal(row.branch, BRANCH);
});

test("a red head opens one stop for the epic, and clearing it resumes the line", async (t) => {
  const store = workspace(t),
    github = fake({ checks: [fail] });
  await step(store, github);
  await step(store, github);
  const stops = openStops(store);
  assert.equal(stops.length, 1);
  assert.match(stops[0].reason, /red check/);
  // While it is open the epic's tasks are paused: no release, no arming.
  store.mutate("epic task", (data) => {
    data.tasks[0].planId = "rewrite";
  });
  assert.ok(linePausedTaskIds(store).has(store.read().tasks[0].id));
  assert.equal(stops[0].scope, "spec");
  github.s.checks = [pass];
  await step(store, github);
  assert.deepEqual(openStops(store), []);
  assert.equal(linePausedTaskIds(store).size, 0);
});

test("a sync conflict stops the line too", async (t) => {
  const store = workspace(t),
    github = fake({ checks: [pass] });
  store.setMeta("integrationSync", {
    entries: { [`${REPO}@${BRANCH}`]: { state: "conflict", base: "main" } },
  });
  await step(store, github);
  assert.equal(openStops(store).length, 1);
  assert.match(openStops(store)[0].reason, /sync has a conflict/);
  store.setMeta("integrationSync", {
    entries: { [`${REPO}@${BRANCH}`]: { state: "ok" } },
  });
  await step(store, github);
  assert.deepEqual(openStops(store), []);
});

test("a read failure keeps the last entry, says so, and changes no stop", async (t) => {
  const store = workspace(t),
    github = fake({ checks: [fail] });
  await step(store, github);
  github.branch = async () => {
    throw new Error("down");
  };
  const result = await step(store, github);
  assert.equal(result.errors.length, 1);
  assert.equal(view(store).checks, "red");
  assert.match(view(store).error, /down/);
  assert.equal(openStops(store).length, 1);
});

test("landing: a row when the head is green and caught up, an approval for that head, and no merge", async (t) => {
  const store = workspace(t),
    github = fake({ checks: [pass], behind: 1 });
  await step(store, github);
  // Behind main: no row.
  assert.deepEqual(landingNeedsYou(store), []);
  github.s.behind = 0;
  await step(store, github);
  const rows = landingNeedsYou(store);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "branch-landing");
  const head = view(store).head;
  const record = landBranch(
    store,
    { repository: REPO, branch: BRANCH, head },
    { by: "dashboard" },
  );
  assert.equal(record.head, head);
  assert.equal(record.approvedBy, "dashboard");
  assert.equal(view(store).landing.head, head);
  // The row now says to merge it on GitHub; a second approval is refused.
  assert.match(landingNeedsYou(store)[0].title, /merge it on GitHub/);
  assert.throws(
    () =>
      landBranch(
        store,
        { repository: REPO, branch: BRANCH, head },
        { by: "dashboard" },
      ),
    /already approved/,
  );
});

test("an approval for an older head is refused, and a moved head needs a new one", async (t) => {
  const store = workspace(t),
    github = fake({ checks: [pass] });
  await step(store, github);
  const old = view(store).head;
  github.s.head = sha(2);
  await step(store, github);
  assert.throws(
    () =>
      landBranch(
        store,
        { repository: REPO, branch: BRANCH, head: old },
        { by: "dashboard" },
      ),
    (error) => error.status === 409 && /Review it again/.test(error.message),
  );
  landBranch(
    store,
    { repository: REPO, branch: BRANCH, head: view(store).head },
    { by: "dashboard" },
  );
  // The head moves after approval: the old approval does not count.
  github.s.head = sha(3);
  await step(store, github);
  assert.equal(landingNeedsYou(store).length, 1);
  assert.equal(landingNeedsYou(store)[0].kind, "branch-landing");
});

test("a red or unaccepted head cannot be approved", async (t) => {
  const store = workspace(t),
    github = fake({ checks: [fail] });
  await step(store, github);
  assert.throws(
    () =>
      landBranch(
        store,
        { repository: REPO, branch: BRANCH, head: view(store).head },
        { by: "dashboard" },
      ),
    /not green/,
  );
});

test("landing is a person's: refused over MCP and for an agent, allowed for the page", async (t) => {
  const store = workspace(t),
    github = fake({ checks: [pass] });
  await step(store, github);
  const ops = new Operations(store, { github, workspaceRoot: "/nope" });
  const input = { repository: REPO, branch: BRANCH, head: view(store).head };
  await assert.rejects(
    ops.execute("integration.land", input, undefined, { mcp: true }),
    /person/,
  );
  await assert.rejects(
    ops.execute("integration.land", input, undefined, { caller: "s" }),
    /person/,
  );
  assert.equal(view(store).landing, null);
  assert.equal((await ops.execute("integration.view", {})).branches.length, 1);
  await ops.execute("integration.land", input);
  assert.equal(view(store).landing.head, input.head);
});
