// rc-23.3: merged mirror pull requests become one "to forward" record each
// (RC24.5, RC24.14, design D29.4), with rows and four Trace steps. Fake GitHub
// only.
import assert from "node:assert/strict";
import test from "node:test";
import {
  mirrorForwardRows,
  mirrorForwardStep,
  mirrorForwards,
} from "../mirror-forward.mjs";
import { releaseQueue } from "../release-queue.mjs";
import { fixture } from "../../test/fixtures.mjs";

const SOURCE = "example/code";
const MIRROR = "example/code-private";
const T0 = Date.parse("2026-11-14T10:00:00Z");
const iso = (minutes) => new Date(T0 + minutes * 60000).toISOString();
const policy = (forward = "nudge") => ({
  mode: "single-repo",
  repositories: {
    [SOURCE]: {
      mirror: {
        source: SOURCE,
        mirror: MIRROR,
        forward,
        branchPrefix: "avoozl/",
      },
    },
  },
});

// `tracking`: commits on the mirror's avoozl-upstream/main branch.
function fake(pulls, tracking = []) {
  const github = {
    pulls,
    detailReads: 0,
    commitReads: 0,
    commit: async (repo, sha) => {
      assert.equal(repo, MIRROR);
      github.commitReads++;
      const pull = github.pulls.find((p) => p.merge_commit_sha === sha);
      return { parents: pull.parents ?? [{ sha: "base" }] };
    },
    compareCommits: async (repo, base, head) => {
      assert.equal(repo, MIRROR);
      assert.equal(head, "avoozl-upstream/main");
      return { status: tracking.includes(base) ? "ahead" : "diverged" };
    },
    available: () => true,
    repository: async () => ({ default_branch: "main" }),
    listPullRequests: async (repo, input) => {
      assert.equal(repo, MIRROR);
      assert.equal(input.state, "closed");
      return github.pulls.map(({ approver: _a, parents: _p, ...pull }) => pull);
    },
    pullRequest: async (_repo, number) => {
      github.detailReads++;
      const pull = github.pulls.find((p) => p.number === number);
      return { ...pull, merged_by: { login: pull.approver } };
    },
  };
  return github;
}
const merged = (number, minutes, extra = {}) => ({
  number,
  state: "closed",
  merged_at: iso(minutes),
  merge_commit_sha: `sha${number}`,
  head: { ref: `avoozl/task-${number}` },
  base: { ref: "main" },
  approver: "dana",
  ...extra,
});

test("a PR merged after the first tick gives one record, whatever the tick count", async (t) => {
  const { store } = fixture(t),
    github = fake([merged(7, -30)]);
  // The first tick sets the starting point: older merges are not recorded.
  await mirrorForwardStep(store, github, { policy: policy(), now: T0 });
  assert.deepEqual(mirrorForwards(store), []);
  github.pulls.push(merged(8, 5));
  for (let i = 1; i <= 3; i++)
    await mirrorForwardStep(store, github, {
      policy: policy(),
      now: T0 + i * 60000,
    });
  const records = mirrorForwards(store);
  assert.equal(records.length, 1);
  assert.deepEqual(
    {
      id: records[0].id,
      mirrorPr: records[0].mirrorPr,
      taskId: records[0].taskId,
      approver: records[0].approver,
      state: records[0].state,
      mirrorMergedAt: records[0].mirrorMergedAt,
    },
    {
      id: "sha8",
      mirrorPr: 8,
      taskId: "task-8",
      approver: "dana",
      state: "to_forward",
      mirrorMergedAt: iso(5),
    },
  );
  assert.equal(github.detailReads, 1, "the approver is read once");
});

test("upstream imports are never recorded; a private change beside them is (R102.21)", async (t) => {
  const { store } = fixture(t),
    github = fake([], ["u1", "u2"]);
  await mirrorForwardStep(store, github, { policy: policy(), now: T0 });
  github.pulls.push(
    // The import pull request from the tracking branch.
    merged(20, 5, { head: { ref: "avoozl-upstream/main" } }),
    // A second import, merged by hand from another branch: its second
    // parent is on the tracking branch.
    merged(21, 6, {
      head: { ref: "sync-upstream" },
      parents: [{ sha: "m1" }, { sha: "u2" }],
    }),
    // A genuine private change merged with a merge commit.
    merged(22, 7, { parents: [{ sha: "m2" }, { sha: "c9" }] }),
  );
  for (let i = 1; i <= 3; i++)
    await mirrorForwardStep(store, github, {
      policy: policy(),
      now: T0 + i * 60000,
    });
  assert.deepEqual(
    mirrorForwards(store).map((record) => record.mirrorPr),
    [22],
  );
  assert.deepEqual(mirrorForwardRows(store, policy()).length, 1);
  assert.equal(github.commitReads, 2, "each merge commit is read once");
});

test("a PR closed without a merge, or merged into another branch, is not recorded", async (t) => {
  const { store } = fixture(t),
    github = fake([]);
  await mirrorForwardStep(store, github, { policy: policy(), now: T0 });
  github.pulls.push(
    merged(9, 5, { merged_at: null, merge_commit_sha: null }),
    merged(10, 6, { base: { ref: "other" } }),
  );
  await mirrorForwardStep(store, github, { policy: policy(), now: T0 + 1000 });
  assert.deepEqual(mirrorForwards(store), []);
});

test("nudge gives one Needs you row per record, auto gives none, both reach the queue", async (t) => {
  const { store } = fixture(t),
    github = fake([]);
  await mirrorForwardStep(store, github, { policy: policy(), now: T0 });
  github.pulls.push(merged(8, 5));
  await mirrorForwardStep(store, github, { policy: policy(), now: T0 + 1000 });
  const rows = mirrorForwardRows(store, policy("nudge"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "mirror-forward:sha8");
  assert.match(rows[0].title, /#8/);
  assert.deepEqual(mirrorForwardRows(store, policy("auto")), []);
  assert.deepEqual(mirrorForwardRows(store, policy("off")), []);
  const queue = releaseQueue(store, policy());
  assert.deepEqual(
    queue.forwards.map((f) => [f.id, f.state]),
    [["sha8", "to_forward"]],
  );
});
