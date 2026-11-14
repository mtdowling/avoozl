// The plan-me hand-off and Issue Radar's live claims, tested on payloads
// recorded from a scratch repository (fixtures/radar-scratch.json: the REST
// issues, comments, label events and permissions as GitHub returned them).
// No network. Two substitutions, both named where they happen: the scratch
// repository has one account, so an "untrusted" author is the recorded
// issue with `octocat` as its author, and `octocat`'s permission is the real
// answer GitHub gave for that account (none). The `avoozl-task` marker body
// is rendered by the marker code, since the scratch repository has none.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { renderMarker } from "../github-marker.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import {
  claimsView,
  isStale,
  latestSkip,
  liveClaim,
  parseMarkers,
  refreshClaims,
  skipScope,
} from "../radar-claims.mjs";
import { INTAKE_SCOPES, routeOf } from "../radar-plan-me.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const RECORDED = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/radar-scratch.json", import.meta.url),
    "utf8",
  ),
);
const REPO = RECORDED.repository,
  NAMESPACE = "avz_0123456789abcdef";

// A recorded issue, optionally with another author or extra labels.
const recorded = (number, { author, labels = [], body } = {}) => {
  const issue = structuredClone(RECORDED.issues[number]);
  if (author) issue.user = { login: author };
  if (body !== undefined) issue.body = body;
  for (const name of labels) issue.labels.push({ name });
  return issue;
};

function fakeGitHub(issues, { events = RECORDED.events } = {}) {
  const byNumber = new Map(issues.map((issue) => [issue.number, issue])),
    graphNode = (issue) => ({
      __typename: "Issue",
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      createdAt: "2026-11-14T05:00:00Z",
      author: { login: issue.user.login },
      labels: { nodes: issue.labels },
      assignees: { nodes: [] },
      comments: { totalCount: issue.comments.length },
    });
  return {
    available: () => true,
    broken: new Set(),
    async graphql() {
      return {
        search: {
          issueCount: issues.length,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: issues.map(graphNode),
        },
      };
    },
    async issue(_repository, number) {
      if (this.broken.has(number)) throw Error("GitHub said no");
      return byNumber.get(number);
    },
    async listIssueComments(_repository, number) {
      return byNumber.get(number).comments;
    },
    async issueEvents(_repository, number) {
      return events[String(number)] ?? [];
    },
    async permission(_repository, actor) {
      const held = RECORDED.permissions[actor];
      if (!held) throw Object.assign(Error("forbidden"), { status: 403 });
      return held;
    },
    async listIssues(_repository, { label }) {
      return issues.filter((issue) =>
        issue.labels.some((entry) => entry.name === label),
      );
    },
  };
}

const POLICY = (extra = {}) => ({
  mode: "single-repo",
  repositories: {
    [REPO]: {
      baseBranch: "main",
      coder: "issue-radar",
      minimumPermission: "write",
      managedLabels: { managed: "avoozl:managed", ready: "ready" },
      crewLabels: { needsHuman: "plan me" },
      acceptedLabel: "accepted",
      rules: [],
      ...extra,
    },
  },
});

function workspace(t, github, { policy = POLICY() } = {}) {
  const { store } = fixture(t),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, namespace: NAMESPACE, github: policy }),
  );
  store.put("github_repositories", {
    id: REPO,
    owner: "mtdowling",
    repo: "avoozl-radar-test",
    projectId: "code",
    activeMachine: machineIdentity(store).id,
  });
  const ops = new Operations(store, { github, workspaceRoot: root });
  return {
    store,
    ops,
    // Where each issue ended up after one read.
    async where() {
      await ops.execute("untriaged.view", { refresh: true });
      const intake = await ops.execute("untriaged.view", {}),
        needs = await ops.execute("conflicts.view", {});
      return {
        intake: intake.items.map((item) => item.number).sort((a, b) => a - b),
        needsYou: needs.items
          .filter((item) => item.reason === "crew")
          .map((item) => item.issue.number)
          .sort((a, b) => a - b),
        withRadar: intake.withRadar.map((item) => item.number),
      };
    },
  };
}

test("routing: only a trusted skip is planned, and only for a planning scope", () => {
  assert.deepEqual([...INTAKE_SCOPES].sort(), [
    "architecture",
    "needs-design",
    "new-feature",
  ]);
  for (const scope of INTAKE_SCOPES)
    assert.equal(routeOf({ trusted: true, scope }), "intake");
  for (const scope of [
    "needs-decision",
    "needs-investigation",
    "duplicate",
    null,
  ])
    assert.equal(routeOf({ trusted: true, scope }), "needs-you");
  for (const scope of ["new-feature", "needs-decision", null])
    assert.equal(routeOf({ trusted: false, scope }), "left-alone");
});

test("a recorded skip: marker fields and the scope in the visible line", () => {
  const first = RECORDED.issues[12].comments[0],
    [marker] = parseMarkers(first.body);
  assert.deepEqual(marker, {
    version: "1",
    id: "c_022aea7f",
    phase: "skipped",
    pr: null,
    updated: "2026-11-14T05:40:00Z",
  });
  assert.equal(skipScope(first.body), "new-feature");
  // The crew's own comment on #2 carries the scope in the same place.
  assert.equal(skipScope(RECORDED.issues[2].comments[0].body), "duplicate");
  // The crew's skip on #5 names a PR where the scope would go: no scope.
  assert.equal(skipScope(RECORDED.issues[5].comments[0].body), null);
  assert.equal(latestSkip(RECORDED.issues[5].comments).crewName, "Draco");
});

test("trusted new-feature goes to Intake, not Needs you", async (t) => {
  const github = fakeGitHub([recorded(12)]),
    { where } = workspace(t, github);
  assert.deepEqual(await where(), {
    intake: [12],
    needsYou: [],
    withRadar: [],
  });
});

test("trusted needs-decision goes to Needs you, not Intake", async (t) => {
  const { where } = workspace(t, fakeGitHub([recorded(14)]));
  assert.deepEqual(await where(), {
    intake: [],
    needsYou: [14],
    withRadar: [14],
  });
});

test("a recorded crew skip with no scope in the line goes to Needs you", async (t) => {
  const { where } = workspace(t, fakeGitHub([recorded(5)]));
  assert.deepEqual(await where(), {
    intake: [],
    needsYou: [5],
    withRadar: [5],
  });
});

test("an untrusted new-feature is left alone: neither list asks anyone", async (t) => {
  // #13 as recorded, but opened by an account with no permission.
  const { where } = workspace(
    t,
    fakeGitHub([recorded(13, { author: "octocat" })]),
  );
  assert.deepEqual(await where(), {
    intake: [],
    needsYou: [],
    withRadar: [13],
  });
});

test("an allowed actor's accepted label makes an untrusted author trusted", async (t) => {
  const issue = recorded(15, { author: "octocat" });
  assert.deepEqual(await workspace(t, fakeGitHub([issue])).where(), {
    intake: [15],
    needsYou: [],
    withRadar: [],
  });
  // No acceptedLabel in the policy: the same issue is left alone.
  assert.deepEqual(
    await workspace(t, fakeGitHub([issue]), {
      policy: POLICY({ acceptedLabel: undefined }),
    }).where(),
    { intake: [], needsYou: [], withRadar: [15] },
  );
  // The label was added by someone who does not count.
  const events = structuredClone(RECORDED.events);
  for (const event of events["15"]) event.actor.login = "octocat";
  assert.deepEqual(
    await workspace(t, fakeGitHub([issue], { events })).where(),
    { intake: [], needsYou: [], withRadar: [15] },
  );
});

test("this workspace's own marker makes an issue trusted; another's does not", async (t) => {
  const marker = (namespace) =>
      renderMarker({
        version: 2,
        taskId: "T1",
        namespace,
        kind: "leaf",
        source: { commit: null, manifest: "0".repeat(64) },
        applied: {
          title: "1".repeat(64),
          body: "2".repeat(64),
          labels: [],
          blockers: [],
        },
      }),
    mine = recorded(13, { author: "octocat", body: marker(NAMESPACE) }),
    other = recorded(13, {
      author: "octocat",
      body: marker("avz_abcdefghijklmnop"),
    });
  assert.deepEqual(await workspace(t, fakeGitHub([mine])).where(), {
    intake: [13],
    needsYou: [],
    withRadar: [],
  });
  assert.deepEqual(await workspace(t, fakeGitHub([other])).where(), {
    intake: [],
    needsYou: [],
    withRadar: [13],
  });
});

test("a permission Avoozl cannot read is not trusted", async (t) => {
  const github = fakeGitHub([recorded(12, { author: "stranger" })]);
  assert.deepEqual(await workspace(t, github).where(), {
    intake: [],
    needsYou: [],
    withRadar: [12],
  });
});

test("when the hand-off read fails the issue keeps today's route, Needs you", async (t) => {
  const github = fakeGitHub([recorded(12)]);
  github.broken.add(12);
  assert.deepEqual(await workspace(t, github).where(), {
    intake: [],
    needsYou: [12],
    withRadar: [12],
  });
});

test("acceptedLabel is a policy key and stays optional", () => {
  const policy = normalizeGitHubPolicy(POLICY());
  assert.equal(policy.repositories[REPO].acceptedLabel, "accepted");
  assert.equal(
    normalizeGitHubPolicy(POLICY({ acceptedLabel: undefined })).repositories[
      REPO
    ].acceptedLabel,
    null,
  );
});

test("a live claim is the oldest marker not in a terminal phase", () => {
  const comment = (id, phase, extra = "") => ({
    id,
    body: `👻 **A** is on this\n${phase}\n<!-- kirocrew-crew v=${extra || 1} id=c_${id} phase=${phase} pr= updated=2026-11-14T05:00:00Z -->`,
  });
  assert.equal(liveClaim([comment(1, "resolved")]), null);
  assert.equal(
    liveClaim([
      comment(1, "preempted"),
      comment(3, "implementing"),
      comment(2, "claimed"),
    ]).marker.id,
    "c_2",
  );
  // A version this reader does not know is treated as a live claim.
  assert.equal(liveClaim([comment(1, "skipped", 9)]).marker.version, "9");
});

test("stale means a TTL phase older than the TTL, or with no time", () => {
  const now = Date.parse("2026-11-14T06:00:00Z"),
    marker = (phase, updated) => ({ phase, updated });
  assert.equal(
    isStale(marker("implementing", "2026-11-10T02:10:00Z"), now),
    true,
  );
  assert.equal(
    isStale(marker("implementing", "2026-11-14T05:52:00Z"), now),
    false,
  );
  assert.equal(isStale(marker("implementing", "nonsense"), now), true);
  // A waiting phase is exempt: an open PR stands in for a heartbeat.
  assert.equal(
    isStale(marker("awaiting-ci", "2026-11-01T00:00:00Z"), now),
    false,
  );
});

test("the In flight read lists each live claim with its crew, phase, PR and age", async (t) => {
  // #16 and #17 carry the claim label as recorded; #12 has none.
  const github = fakeGitHub([recorded(16), recorded(17), recorded(12)]),
    { store } = workspace(t, github),
    now = Date.parse("2026-11-14T06:00:00Z");
  await refreshClaims(store, github, normalizeGitHubPolicy(POLICY()), {
    now,
    force: true,
  });
  const view = claimsView(store, now);
  assert.deepEqual(
    view.rows.map((row) => [
      row.number,
      row.crewName,
      row.crewId,
      row.phase,
      row.pr,
      row.stale,
      row.prUrl,
    ]),
    [
      [16, "Draco", "c_022aea7f", "implementing", null, false, null],
      [
        17,
        "Bode",
        "c_0badc0de",
        "implementing",
        6,
        true,
        `https://github.com/${REPO}/pull/6`,
      ],
    ],
  );
  assert.equal(view.stale, 1);
  assert.deepEqual(view.unseen, ["paused", "machine", "chat"]);
  // A second read inside the interval does not call GitHub again.
  github.listIssues = async () => {
    throw Error("read again");
  };
  await refreshClaims(store, github, normalizeGitHubPolicy(POLICY()), {
    now: now + 1000,
  });
  assert.equal(claimsView(store, now).rows.length, 2);
});

test("a claim label with no live marker is listed as stale, with no crew", async (t) => {
  const issue = recorded(12);
  issue.labels.push({ name: "crew: in progress" });
  const github = fakeGitHub([issue]),
    { store } = workspace(t, github);
  await refreshClaims(store, github, normalizeGitHubPolicy(POLICY()), {
    force: true,
  });
  const [row] = claimsView(store).rows;
  assert.deepEqual([row.crewId, row.noMarker, row.stale], [null, true, true]);
});

test("radar.crews reads on demand and reports what GitHub cannot show", async (t) => {
  const { ops } = workspace(t, fakeGitHub([recorded(16), recorded(12)])),
    view = await ops.execute("radar.crews", {});
  assert.deepEqual(
    view.rows.map((row) => [row.number, row.crewName, row.phase]),
    [[16, "Draco", "implementing"]],
  );
  assert.deepEqual(view.unseen, ["paused", "machine", "chat"]);
});

test("radar.trace shows the claim comment's GitHub time, not the marker's updated=", async (t) => {
  const issue = recorded(16),
    marked = issue.comments[0];
  // The recorded marker says 05:52; GitHub's own time for the comment is
  // 05:30 (rc-8.2).
  marked.created_at = "2026-11-14T05:30:00Z";
  issue.created_at = "2026-11-14T05:00:00Z";
  const { ops } = workspace(t, fakeGitHub([issue])),
    trace = await ops.execute("radar.trace", { repository: REPO, number: 16 }),
    claimed = trace.steps.find((step) => step.key === "claimed");
  assert.equal(claimed.at, "2026-11-14T05:30:00Z");
  assert.equal(trace.crew.name, "Draco");
  assert.equal(trace.steps.length, 8);
  await assert.rejects(
    ops.execute("radar.trace", { repository: "x/y", number: 1 }),
    /not registered/,
  );
  await assert.rejects(
    ops.execute("radar.trace", { repository: REPO, number: "abc" }),
    /issue number/,
  );
});
