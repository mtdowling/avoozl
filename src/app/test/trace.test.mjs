import assert from "node:assert/strict";
import test from "node:test";
import { TRACE_STEPS, buildTrace, readTrace } from "../trace.mjs";

// rc-8.2: the eight steps, with GitHub's times and never the marker's
// `updated=`. All data is made up.
const t = (hhmm) => `2026-11-09T${hhmm}:00Z`;
const PROV =
  "<!-- avoozl v=1 spec=search tasks=S4,S5 commit=a41c9e2a41c9e2a41c9e2a41c9e2a41c9e2a41c9 approved-by=owner -->";
const issue = {
  number: 52,
  title: "Index builder",
  html_url: "https://github.com/o/r/issues/52",
  created_at: t("08:10"),
  body: `Body\n${PROV}`,
};
// The crew wrote `updated=` 25 minutes ahead of GitHub's own time.
const claim = {
  id: 7,
  created_at: t("09:21"),
  updated_at: t("10:09"),
  html_url: "https://github.com/o/r/issues/52#issuecomment-7",
  body: "👻 **Draco**\n<!-- kirocrew-crew v=1 id=c_022aea7f phase=implementing pr=57 updated=2026-11-09T09:46:00Z -->",
};
const events = [
  { event: "labeled", label: { name: "Ready" }, created_at: t("09:15") },
  { event: "labeled", label: { name: "other" }, created_at: t("09:00") },
];
const pull = {
  number: 57,
  html_url: "https://github.com/o/r/pull/57",
  created_at: t("09:48"),
  merged_at: null,
};
const checks = [
  {
    name: "a",
    status: "completed",
    conclusion: "success",
    completed_at: t("09:58"),
  },
  { name: "b", status: "in_progress", conclusion: null, completed_at: null },
];
const base = {
  issue,
  comments: [claim],
  events,
  pull,
  checks,
  readyLabel: "ready",
  specApproved: { at: t("08:02") },
};

test("there are eight steps, in order", () => {
  assert.deepEqual(
    TRACE_STEPS.map((s) => s.key),
    ["spec", "issue", "ready", "claimed", "pr", "ci", "merged", "retro"],
  );
  assert.equal(buildTrace(base).steps.length, 8);
});

test("a claim marker's updated= ahead of GitHub still shows GitHub's time", () => {
  const steps = buildTrace(base).steps,
    claimed = steps.find((s) => s.key === "claimed");
  assert.equal(claimed.at, t("09:21"));
  assert.notEqual(claimed.at, "2026-11-09T09:46:00Z");
  assert.equal(JSON.stringify(steps).includes("09:46"), false);
});

test("times, states and the crew come from GitHub", () => {
  const trace = buildTrace(base),
    by = Object.fromEntries(trace.steps.map((s) => [s.key, s]));
  assert.equal(by.spec.at, t("08:02"));
  assert.equal(by.spec.by, "owner");
  assert.equal(by.issue.at, t("08:10"));
  assert.equal(by.ready.at, t("09:15"));
  assert.equal(by.pr.at, t("09:48"));
  assert.equal(by.ci.state, "now");
  assert.equal(by.ci.detail, "1 of 2 checks done");
  assert.equal(by.merged.state, "later");
  assert.equal(trace.crew.id, "c_022aea7f");
  assert.equal(trace.crew.name, "Draco");
  assert.equal(trace.links.pr, pull.html_url);
});

test("a step the crew skipped is drawn skipped; a loop shows its count", () => {
  const trace = buildTrace({
    ...base,
    comments: [],
    checks: [
      {
        name: "a",
        status: "completed",
        conclusion: "failure",
        completed_at: t("09:58"),
      },
      {
        name: "a",
        status: "completed",
        conclusion: "success",
        completed_at: t("10:20"),
      },
    ],
    pull: { ...pull, merged_at: t("10:30") },
  });
  const by = Object.fromEntries(trace.steps.map((s) => [s.key, s]));
  assert.equal(by.claimed.state, "skipped");
  assert.equal(by.ci.state, "done");
  assert.equal(by.ci.at, t("10:20"));
  assert.equal(by.ci.rounds, 2);
  assert.equal(by.merged.at, t("10:30"));
  assert.equal(by.retro.state, "now");
});

test("readTrace reads the issue, comments, events, pull request and checks", async () => {
  const calls = [],
    github = {
      issue: async () => (calls.push("issue"), issue),
      listIssueComments: async () => (calls.push("comments"), [claim]),
      issueEvents: async () => (calls.push("events"), events),
      pullRequest: async (_r, n) => (
        calls.push(`pull ${n}`),
        { ...pull, head: { sha: "abc" } }
      ),
      checkRuns: async (_r, ref) => (calls.push(`checks ${ref}`), checks),
      request: async (_m, path) => (
        calls.push(path),
        { commit: { committer: { date: t("08:02") } } }
      ),
    },
    trace = await readTrace(github, "o/r", 52, { managedLabels: {} });
  assert.deepEqual(
    calls.filter((c) => !c.startsWith("/")),
    ["issue", "comments", "events", "pull 57", "checks abc"],
  );
  assert.equal(trace.steps[0].at, t("08:02"));
  assert.equal(trace.steps[3].at, t("09:21"));
});

test("a GitHub read that fails leaves its step without a time and says so", async () => {
  const github = {
    issue: async () => issue,
    listIssueComments: async () => [claim],
    issueEvents: async () => {
      throw new Error("rate limited");
    },
    pullRequest: async () => pull,
    checkRuns: async () => [],
    request: async () => {
      throw new Error("404");
    },
  };
  const trace = await readTrace(github, "o/r", 52, {});
  assert.equal(trace.steps.find((s) => s.key === "ready").at, null);
  assert.ok(trace.problems.some((p) => p.includes("rate limited")));
});
