import assert from "node:assert/strict";
import test from "node:test";
import { flowTimes } from "../radar-events.mjs";
import { flowView, refreshFlow } from "../radar-flow.mjs";
import { fixture } from "./fixtures.mjs";

// rc-8.4: stage times computed from GitHub events match hand-computed values.
// All data is made up. Times are minutes after 2026-11-09 08:00 UTC.
const MIN = 60_000;
const at = (m) => new Date(Date.UTC(2026, 10, 9, 8, 0) + m * MIN).toISOString();
const REPO = "o/r";
const POLICY = {
  mode: "single-repo",
  repositories: {
    [REPO]: {
      coder: "issue-radar",
      managedLabels: { ready: "ready" },
      crewLabels: { claim: "crew: in progress" },
    },
    "o/plain": { coder: "worker" },
  },
};
// Issue 1: ready 0, claimed 10, PR 40, green 90, merged 100.
//   stages 10, 30, 50, 10; lead 100.
// Issue 2: ready 0, claimed 20, PR 80, green 100, merged 110.
//   stages 20, 60, 20, 10; lead 110.
const TIMES = {
  1: { ready: 0, claimed: 10, pr: 40, green: 90, merged: 100 },
  2: { ready: 0, claimed: 20, pr: 80, green: 100, merged: 110 },
};
function github({ closed = [1, 2], extra = {} } = {}) {
  const calls = [];
  return {
    calls,
    available: () => true,
    async listIssues(_repo, { state, label }) {
      calls.push(`list ${state} ${label}`);
      return label === "ready" ? closed.map((number) => ({ number })) : [];
    },
    async issue(_repo, number) {
      return { number, created_at: at(-5), body: "" };
    },
    async listIssueComments(_repo, number) {
      const t = TIMES[number];
      return [
        {
          id: number,
          created_at: at(t.claimed),
          // The marker's own clock runs 30 minutes ahead; it must not count.
          body: `<!-- kirocrew-crew v=1 id=c_${number} phase=resolved pr=${number + 50} updated=${at(t.claimed + 30)} -->`,
        },
      ];
    },
    async issueEvents(_repo, number) {
      return [
        {
          event: "labeled",
          label: { name: "ready" },
          created_at: at(TIMES[number].ready),
        },
      ];
    },
    async pullRequest(_repo, number) {
      const t = TIMES[number - 50];
      return {
        number,
        created_at: at(t.pr),
        merged_at: at(t.merged),
        head: { sha: `sha${number}` },
      };
    },
    async checkRuns(_repo, sha) {
      const t = TIMES[Number(sha.slice(3)) - 50];
      return [
        {
          name: "lint",
          status: "completed",
          conclusion: "success",
          completed_at: at(t.green - 5),
        },
        {
          name: "test",
          status: "completed",
          conclusion: "success",
          completed_at: at(t.green),
        },
      ];
    },
    ...extra,
  };
}

test("flowTimes reads GitHub's times, never the marker's updated=", async () => {
  const gh = github();
  const facts = {
    issue: { number: 1 },
    events: await gh.issueEvents(REPO, 1),
    claim: { at: at(10) },
    pull: await gh.pullRequest(REPO, 51),
    checks: await gh.checkRuns(REPO, "sha51"),
    readyLabel: "ready",
  };
  assert.deepEqual(flowTimes(facts), {
    number: 1,
    ready: at(0),
    claimed: at(10),
    pr: at(40),
    green: at(90),
    merged: at(100),
  });
});

test("the view's stage times match the hand-computed minutes", async (t) => {
  const { store } = fixture(t),
    gh = github(),
    now = Date.parse(at(200));
  await refreshFlow(store, gh, POLICY, { now, force: true });
  const view = flowView(store);
  assert.equal(view.count, 2);
  assert.deepEqual(
    view.median.map((ms) => ms / MIN),
    [15, 45, 35, 10],
  );
  assert.equal(view.medianLead / MIN, 105);
  assert.equal(view.efficiency, 90 / 210);
  assert.equal(view.bottleneck, "Claim to PR");
  assert.deepEqual(
    view.issues.map((issue) => issue.number),
    [1, 2],
  );
  // Only the Radar-coded repository is read.
  assert.deepEqual(gh.calls, ["list closed ready"]);
});

test("a read inside the interval does not call GitHub again; a failure keeps the last rows", async (t) => {
  const { store } = fixture(t),
    now = Date.parse(at(200));
  await refreshFlow(store, github(), POLICY, { now, force: true });
  const idle = github({
    extra: {
      listIssues: async () => {
        throw Error("read again");
      },
    },
  });
  await refreshFlow(store, idle, POLICY, { now: now + 1000 });
  assert.equal(flowView(store).count, 2);
  await refreshFlow(store, idle, POLICY, { now: now + 3600_000 });
  const view = flowView(store);
  assert.equal(view.count, 2);
  assert.match(view.errors[0].error, /read again/);
});

test("a closed issue with no pull request is left out, and one with a missing time is named", async (t) => {
  const { store } = fixture(t),
    base = github(),
    gh = github({
      closed: [1, 2, 3, 5],
      extra: {
        // #3 has a claim and a pull request but no ready event; #5 has no claim.
        listIssueComments: async (repo, number) =>
          number === 5
            ? []
            : base.listIssueComments(repo, number === 3 ? 1 : number),
        issueEvents: async (repo, number) =>
          number === 3 || number === 5 ? [] : base.issueEvents(repo, number),
      },
    });
  await refreshFlow(store, gh, POLICY, {
    now: Date.parse(at(200)),
    force: true,
  });
  const view = flowView(store);
  assert.equal(view.count, 2);
  assert.deepEqual(
    view.skipped.map((row) => row.number),
    [3],
  );
});
