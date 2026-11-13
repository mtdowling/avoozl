import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { Store } from "../store.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { parseMatch } from "../issue-match.mjs";
import { CHANNELS, notificationPayload } from "../notifications.mjs";
import {
  CODE_REVIEW_SAGE_PATH,
  UNTRIAGED_INTERVAL_MS,
  UNTRIAGED_NOTICE_GAP_MS,
  defaultFilter,
  itemLinks,
  readCache,
  readUntriaged,
  refreshUntriaged,
  searchQuery,
  untriagedView,
} from "../untriaged.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const NOW = Date.parse("2026-11-12T12:00:00Z");
const day = (n) => new Date(NOW - n * 86400000).toISOString();

function policy(
  untriaged = { triageLabels: ["triaged"] },
  mode = "single-repo",
) {
  return normalizeGitHubPolicy({
    mode,
    repositories: {
      "o/app": {
        baseBranch: "main",
        managedLabels: { managed: "avoozl:managed", ready: "avoozl:ready" },
        rules: [{ id: "go", action: "deliver", match: "label:go" }],
        untriaged,
      },
    },
  });
}

const node = (number, extra = {}) => ({
  __typename: "Issue",
  number,
  title: `Item ${number}`,
  url: `https://github.com/o/app/issues/${number}`,
  createdAt: day(2),
  author: { login: "alice" },
  labels: { nodes: (extra.labels || []).map((name) => ({ name })) },
  assignees: { nodes: [] },
  comments: { totalCount: 1 },
  ...extra.fields,
});
const pull = (number, extra = {}) =>
  node(number, {
    ...extra,
    fields: {
      __typename: "PullRequest",
      url: `https://github.com/o/app/pull/${number}`,
      isDraft: extra.draft === true,
      closingIssuesReferences: {
        nodes: (extra.closes || []).map((n) => ({
          number: n,
          repository: { nameWithOwner: "o/app" },
        })),
      },
      commits: {
        nodes: [
          {
            commit: { statusCheckRollup: { state: extra.checks ?? "SUCCESS" } },
          },
        ],
      },
    },
  });

// P31's fake GitHub items.
const ITEMS = [
  node(1),
  node(2, { labels: ["go"] }),
  node(3, { labels: ["Triaged"] }),
  node(4, { labels: ["avoozl:managed"] }),
  node(5, { fields: { createdAt: day(100) } }),
  pull(6, { draft: true, checks: "FAILURE" }),
  pull(7, { closes: [4] }),
  pull(8),
];
const TASKS = [
  {
    id: "t4",
    github: {
      repository: "o/app",
      number: 4,
      pullRequests: [{ number: 8, url: "https://github.com/o/app/pull/8" }],
    },
  },
];

function fakeGitHub(items = ITEMS) {
  const github = {
    queries: [],
    fail: null,
    available: () => true,
    async graphql(_query, variables) {
      github.queries.push(variables.q);
      if (github.fail) throw new Error(github.fail);
      return {
        search: {
          issueCount: github.items.length,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: github.items,
        },
      };
    },
    items,
  };
  return github;
}

function store() {
  return new Store(path.join(temporaryDirectory(), "avoozl.sqlite"));
}

test("the untriaged filter parses without a label: term and defaults from triage labels", () => {
  assert.deepEqual(
    parseMatch("-label:triaged", "untriaged.filter", { needLabel: false })
      .labelsNone,
    ["triaged"],
  );
  assert.throws(
    () => parseMatch("-label:triaged"),
    /needs at least one label: term/,
  );
  assert.throws(
    () => parseMatch("is:open", "f", { needLabel: false }),
    /is:open/,
  );
  assert.equal(
    defaultFilter(["triaged", "needs info"]),
    '-label:triaged -label:"needs info"',
  );
  assert.equal(defaultFilter([]), "");
  assert.equal(
    searchQuery(
      "o/app",
      {
        filter: "no:assignee",
        triageLabels: ["triaged"],
        ignoreOlderThanDays: 30,
      },
      NOW,
    ),
    "repo:o/app is:open -label:triaged no:assignee created:>=2026-10-13",
  );
  assert.equal(searchQuery("o/app", {}, NOW), "repo:o/app is:open");
});

test("untriaged settings validate and refuse managed labels and bad values", () => {
  const repo = policy({
    filter: "  ",
    triageLabels: ["triaged"],
    ignoreOlderThanDays: 30,
    notify: true,
  }).repositories["o/app"];
  assert.deepEqual(repo.untriaged, {
    filter: null,
    triageLabels: ["triaged"],
    ignoreOlderThanDays: 30,
    notify: true,
  });
  assert.deepEqual(policy(null).repositories["o/app"].untriaged, {
    filter: null,
    triageLabels: [],
    ignoreOlderThanDays: null,
    notify: false,
  });
  assert.throws(
    () => policy({ triageLabels: ["avoozl:ready"] }),
    /cannot use managed label/,
  );
  assert.throws(
    () => policy({ ignoreOlderThanDays: 0 }),
    /whole number from 1 to 3650/,
  );
  assert.throws(
    () => policy({ filter: "repo:x/y" }),
    /untriaged.filter cannot use repo:x\/y/,
  );
  assert.throws(() => policy({ notify: "yes" }), /true or false/);
  assert.throws(() => policy({ other: 1 }), /Unknown setting/);
});

test("untriaged leaves out rule matches, triage and managed labels, and task-linked items", async () => {
  const s = store(),
    github = fakeGitHub();
  try {
    await refreshUntriaged(s, github, policy(), TASKS, { now: NOW });
    const view = untriagedView(policy(), TASKS, readCache(s), NOW);
    assert.equal(view.enabled, true);
    assert.deepEqual(
      view.items.map((item) => item.number).sort((a, b) => a - b),
      [1, 5, 6],
    );
    const six = view.items.find((item) => item.number === 6);
    assert.equal(six.kind, "pr");
    assert.equal(six.draft, true);
    assert.equal(six.checks, "failing");
    assert.equal(view.repositories[0].count, 3);
    assert.equal(view.repositories[0].checkedAt, new Date(NOW).toISOString());
    // An age limit applies at read time, before the next search.
    const older = policy({
      triageLabels: ["triaged"],
      ignoreOlderThanDays: 30,
    });
    assert.deepEqual(
      untriagedView(older, TASKS, readCache(s), NOW)
        .items.map((item) => item.number)
        .sort(),
      [1, 6],
    );
  } finally {
    s.close();
  }
});

test("the tick reads once per interval, keeps items on failure, and rereads a changed query", async () => {
  const s = store(),
    github = fakeGitHub();
  try {
    await refreshUntriaged(s, github, policy(), TASKS, { now: NOW });
    await refreshUntriaged(s, github, policy(), TASKS, { now: NOW + 60000 });
    assert.equal(github.queries.length, 1);
    assert.equal(github.queries[0], "repo:o/app is:open -label:triaged");
    github.fail = "API rate limit exceeded";
    await refreshUntriaged(s, github, policy(), TASKS, {
      now: NOW + UNTRIAGED_INTERVAL_MS,
    });
    const view = untriagedView(policy(), TASKS, readCache(s), NOW);
    assert.equal(view.items.length, 3);
    assert.match(view.repositories[0].error, /rate limit/);
    assert.equal(view.repositories[0].checkedAt, new Date(NOW).toISOString());
    github.fail = null;
    await refreshUntriaged(
      s,
      github,
      policy({ triageLabels: ["triaged"], filter: "no:assignee" }),
      TASKS,
      {
        now: NOW + UNTRIAGED_INTERVAL_MS + 1000,
      },
    );
    assert.equal(github.queries.length, 3);
    // A changed age alone reads again, though the query compares without
    // its daily cutoff.
    await refreshUntriaged(
      s,
      github,
      policy({
        triageLabels: ["triaged"],
        filter: "no:assignee",
        ignoreOlderThanDays: 30,
      }),
      TASKS,
      { now: NOW + UNTRIAGED_INTERVAL_MS + 2000 },
    );
    assert.equal(github.queries.length, 4);
    // Local only reads nothing and hides the list.
    const local = normalizeGitHubPolicy({});
    assert.deepEqual(
      await refreshUntriaged(s, github, local, TASKS, {
        now: NOW + 2 * UNTRIAGED_INTERVAL_MS,
      }),
      {
        read: 0,
        notify: [],
      },
    );
    assert.equal(github.queries.length, 4);
    assert.equal(untriagedView(local, TASKS, readCache(s), NOW).enabled, false);
  } finally {
    s.close();
  }
});

test("links go to GitHub exactly and fall back to the app pages with a tooltip", () => {
  const issue = itemLinks("o/app", {
    kind: "issue",
    number: 1,
    url: "https://github.com/o/app/issues/1",
  });
  assert.equal(issue.github, "https://github.com/o/app/issues/1");
  assert.deepEqual(
    { url: issue.issueRadar.url, exact: issue.issueRadar.exact },
    { url: "/issue-radar", exact: false },
  );
  assert.match(issue.issueRadar.tooltip, /Pick o\/app #1 there/);
  assert.equal(issue.review, null);
  const pr = itemLinks("o/app", {
    kind: "pr",
    number: 6,
    url: "https://github.com/o/app/pull/6",
  });
  assert.equal(pr.review.url, CODE_REVIEW_SAGE_PATH);
  assert.equal(pr.review.exact, false);
  assert.match(
    pr.review.tooltip,
    /Code Review Sage can't open one pull request/,
  );
});

test("a rising count sends one batched notice at most once an hour", async () => {
  const s = store(),
    github = fakeGitHub(),
    on = policy({ triageLabels: ["triaged"], notify: true });
  try {
    const first = await refreshUntriaged(s, github, on, TASKS, { now: NOW });
    assert.equal(first.notify.length, 1);
    assert.equal(first.notify[0].channel, "untriaged");
    assert.match(first.notify[0].title, /3 in o\/app/);
    assert.ok(CHANNELS.has("untriaged"));
    assert.equal(notificationPayload(first.notify[0]).url, "/apps/avoozl");
    github.items = [...ITEMS, node(9)];
    const soon = await refreshUntriaged(s, github, on, TASKS, {
      now: NOW + UNTRIAGED_INTERVAL_MS,
      force: true,
    });
    assert.equal(soon.notify.length, 0);
    const later = await refreshUntriaged(s, github, on, TASKS, {
      now: NOW + UNTRIAGED_NOTICE_GAP_MS,
      force: true,
    });
    assert.equal(later.notify.length, 1);
    assert.match(later.notify[0].title, /4 in o\/app/);
    // Off by default: no notice.
    const quiet = store();
    try {
      assert.equal(
        (
          await refreshUntriaged(quiet, fakeGitHub(), policy(), TASKS, {
            now: NOW,
          })
        ).notify.length,
        0,
      );
    } finally {
      quiet.close();
    }
  } finally {
    s.close();
  }
});

test("the untriaged operations are read only", async () => {
  const { classifyOperation } = await import("../operation-kinds.mjs");
  assert.equal(classifyOperation("untriaged.view"), "observe");
  assert.equal(classifyOperation("github.repository.labels"), "observe");
});

test("the Settings preview counts issues and pull requests for an untriaged filter", async () => {
  const { triggerPreview } = await import("../issue-match.mjs");
  const calls = [];
  const github = {
    available: () => true,
    searchOpenIssues: async (...args) => {
      calls.push(args);
      return {
        total_count: 2,
        items: [
          { number: 1, title: "a", html_url: "u1" },
          { number: 2, title: "b", html_url: "u2", pull_request: {} },
        ],
      };
    },
  };
  const preview = await triggerPreview(github, {
    match: "-label:triaged",
    repository: "o/app",
    untriaged: true,
  });
  assert.equal(preview.error, null);
  assert.deepEqual(calls[0][2], { perPage: 10, pullRequests: true });
  assert.equal(preview.issues.length, 2);
  assert.match(
    (await triggerPreview(github, { match: "-label:triaged" })).error,
    /needs at least one label: term/,
  );
});

// A search that answers `total` items in pages of `first`, up to GitHub's
// 1,000-result search cap.
function pagedGitHub(total) {
  const reachable = Math.min(total, 1000);
  return {
    pages: 0,
    async graphql(_query, { first, after }) {
      this.pages += 1;
      const from = after ? Number(after) : 0,
        to = Math.min(from + first, reachable);
      return {
        search: {
          issueCount: total,
          pageInfo: { hasNextPage: to < reachable, endCursor: String(to) },
          nodes: Array.from({ length: to - from }, (_, i) => node(from + i + 1)),
        },
      };
    },
  };
}

test("untriaged pages through every result, not the first 300", async () => {
  const github = pagedGitHub(440),
    result = await readUntriaged(github, "repo:o/app is:open");
  assert.equal(result.items.length, 440);
  assert.equal(result.total, 440);
  assert.equal(result.truncated, false);
  assert.equal(github.pages, 5);
});

test("past GitHub's search cap the view shows the true total and how many it read", async () => {
  const github = pagedGitHub(1500),
    result = await readUntriaged(github, "repo:o/app is:open");
  assert.equal(result.items.length, 1000);
  assert.equal(result.total, 1500);
  assert.equal(result.truncated, true);
  const view = untriagedView(
    policy(),
    [],
    { version: 1, repositories: { "o/app": { checkedAt: day(0), ...result } } },
    NOW,
  );
  assert.equal(view.repositories[0].searched, 1500);
  assert.equal(view.repositories[0].read, 1000);
});
