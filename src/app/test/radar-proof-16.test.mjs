// Proof 16 (rc-p16): a rewrite on an integration branch. Run on one fake
// GitHub that models the branch; no real repository is written. The fake has
// no call that merges the branch into main, and the only write it has is the
// merge of main into the branch.
import assert from "node:assert/strict";
import test from "node:test";
import { openStops } from "../flow.mjs";
import { checkIntegrationBranch } from "../integration-branch.mjs";
import {
  headStep,
  integrationView,
  landBranch,
  landingNeedsYou,
} from "../integration-head.mjs";
import { syncNeedsYou, syncStep } from "../integration-sync.mjs";
import { renderProvenance } from "../github-provenance.mjs";
import { verifyIssue } from "../verify-issue.mjs";
import { fixture } from "./fixtures.mjs";

const REPO = "example/code";
const BRANCH = "rewrite/x";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const T0 = Date.parse("2026-11-14T00:00:00Z");
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
const pass = { name: "build", status: "completed", conclusion: "success" };
const fail = { name: "build", status: "completed", conclusion: "failure" };

function fakeGitHub(state = {}) {
  const s = {
    head: sha(1),
    checks: [pass],
    fresh: 0,
    own: 0,
    conflict: false,
    protected: true,
    mainFiles: [],
    branchFiles: [],
    ...state,
  };
  const github = {
    s,
    merges: [],
    available: () => true,
    repository: async () => ({ default_branch: "main" }),
    branch: async (_repo, name) => {
      if (name !== BRANCH)
        throw Object.assign(Error("Not Found"), { status: 404 });
      return { protected: s.protected, commit: { sha: s.head } };
    },
    checkRuns: async () => s.checks,
    commitStatus: async () => ({ statuses: [] }),
    compareCommits: async (_repo, base, head) => {
      const fromMain = base === BRANCH && head === "main";
      return {
        ahead_by: fromMain ? s.fresh : s.own,
        behind_by: fromMain ? s.own : s.fresh,
        files: (fromMain ? s.mainFiles : s.branchFiles).map((filename) => ({
          filename,
        })),
      };
    },
    mergeBranch: async (_repo, input) => {
      github.merges.push(input);
      if (s.conflict)
        throw Object.assign(Error("Merge conflict"), { status: 409 });
      s.fresh = 0;
      s.own++;
      s.head = sha(9);
      return { sha: s.head };
    },
  };
  return github;
}

// verify-issue reads: a task issue whose marker names the branch as base.
function reader(pullBase) {
  const spec = `repos/${REPO}/contents/.kiro/specs/s`,
    prose = "# T\n\nStatus: Approved\n",
    tasks = "# Tasks\n\nStatus: Approved\n\n- [ ] rc-1 First\n",
    body = renderProvenance({
      spec: "s",
      tasks: ["rc-1"],
      commit: COMMIT,
      approvedBy: "octocat",
      base: BRANCH,
    }),
    table = new Map([
      [`repos/${REPO}/issues/7`, { body: { body, user: { login: "owner1" } } }],
      [
        `repos/${REPO}/collaborators/octocat/permission`,
        { body: { permission: "write" } },
      ],
      [
        `repos/${REPO}/collaborators/owner1/permission`,
        { body: { permission: "admin" } },
      ],
      [`repos/${REPO}`, { body: { default_branch: "main" } }],
      [
        `repos/${REPO}/compare/main...${COMMIT}`,
        { body: { status: "behind" } },
      ],
      [`${spec}/requirements.md?ref=${COMMIT}`, { text: prose }],
      [`${spec}/design.md?ref=${COMMIT}`, { text: prose }],
      [`${spec}/tasks.md?ref=${COMMIT}`, { text: tasks }],
      [
        `${spec}/avoozl/manifest.json?ref=${COMMIT}`,
        { text: JSON.stringify({ integrationBranch: BRANCH }) },
      ],
      [`repos/${REPO}/pulls/11`, { body: { base: { ref: pullBase } } }],
    ]);
  return async (apiPath) => {
    const hit = table.get(apiPath);
    return hit
      ? { status: 200, headers: {}, text: hit.text ?? JSON.stringify(hit.body) }
      : { status: 404, headers: {}, text: "{}" };
  };
}

test("Proof 16: a four-task rewrite on a protected branch lands only with one person's approval on the current head", async (t) => {
  const { store } = fixture(t),
    github = fakeGitHub({ fresh: 2, own: 3 });
  store.put("plans", { id: "rewrite", spec: "rewrite", state: "approved" });
  const view = () => integrationView(store).branches[0];
  const tick = async (now) => {
    await syncStep(store, github, [target], { policy, now });
    await headStep(store, github, [target], { policy, now });
  };
  const land = (head) =>
    landBranch(
      store,
      { repository: REPO, branch: BRANCH, head },
      { by: "dashboard" },
    );

  // The branch is checked first: unprotected is refused, protected is ready.
  github.s.protected = false;
  const bad = await checkIntegrationBranch(github, REPO, BRANCH, {
    baseBranch: "main",
  });
  assert.equal(bad.ready, false);
  github.s.protected = true;
  const good = await checkIntegrationBranch(github, REPO, BRANCH, {
    baseBranch: "main",
  });
  assert.equal(good.ready, true);

  // Small merges go into the branch, not main.
  assert.equal(
    (await verifyIssue(`${REPO}#7`, { read: reader(BRANCH), pull: 11 })).ok,
    true,
  );
  const wrong = await verifyIssue(`${REPO}#7`, {
    read: reader("main"),
    pull: 11,
  });
  assert.equal(
    wrong.ok,
    false,
    "a pull request into main fails for a branch epic",
  );

  // Three of four tasks merge into the branch. The head is green, so it is accepted, behind main.
  store.mutate("epic tasks", (data) => {
    data.tasks.push(
      ...["t1", "t2", "t3", "t4"].map((id, i) => ({
        id: `rewrite.${id}`,
        title: id,
        planId: "rewrite",
        scope: "catalog",
        track: "catalog",
        tags: [],
        acceptance: ["x"],
        status: i < 3 ? "accepted" : "planned",
      })),
    );
  });
  github.s.fresh = 0; // main is caught up for now, so the first sync merges nothing
  await tick(T0);
  assert.equal(view().tasksMerged, 3);
  assert.equal(view().tasksTotal, 4);
  assert.equal(view().accepted, true);
  assert.deepEqual(openStops(store), []);

  // Main moves and the sync conflicts: the line stops, one row, branch unchanged.
  Object.assign(github.s, {
    fresh: 2,
    conflict: true,
    mainFiles: ["a.js", "b.js"],
    branchFiles: ["b.js"],
  });
  const before = structuredClone(github.s);
  await tick(T0 + 8 * 24 * 3600 * 1000);
  assert.deepEqual(github.s, before, "the conflict left the branch unchanged");
  assert.equal(syncNeedsYou(store).length, 1);
  assert.equal(openStops(store).length, 1);
  assert.match(openStops(store)[0].reason, /sync has a conflict/);
  assert.deepEqual(landingNeedsYou(store), [], "no landing row while stopped");

  // The head check fails too: still one stop, now naming the red check.
  github.s.checks = [fail];
  await tick(T0 + 8 * 24 * 3600 * 1000 + 300_000);
  assert.equal(view().checks, "red");
  assert.equal(openStops(store).length, 1);
  assert.throws(() => land(view().head), /not green/);

  // A person fixes both: merges main into the branch and the check passes.
  Object.assign(github.s, {
    fresh: 0,
    conflict: false,
    checks: [pass],
    head: sha(2),
  });
  await tick(T0 + 9 * 24 * 3600 * 1000);
  assert.deepEqual(syncNeedsYou(store), []);
  assert.deepEqual(openStops(store), []);
  assert.equal(view().accepted, true);

  // Landing needs a person's approval on the current head. An old head is refused.
  assert.equal(landingNeedsYou(store).length, 1);
  assert.throws(() => land(sha(1)), /Review it again/);
  const record = land(view().head);
  assert.equal(record.head, sha(2));
  assert.equal(view().landing.head, sha(2));
  // A new head voids the approval.
  github.s.head = sha(3);
  await tick(T0 + 9 * 24 * 3600 * 1000 + 300_000);
  assert.equal(landingNeedsYou(store).length, 1);
  assert.match(landingNeedsYou(store)[0].title, /^(?!.*merge it on GitHub)/);

  // Nothing merged the branch into main: the only write was main into the branch.
  assert.ok(github.merges.length >= 1);
  assert.ok(github.merges.every((m) => m.base === BRANCH && m.head === "main"));
});
