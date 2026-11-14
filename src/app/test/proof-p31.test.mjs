// Proof P31: the Untriaged list with a fake GitHub (tasks.md Phase 13,
// design §8.5, Requirement 49). An isolated temporary workspace in
// single-repo mode, the real `.avoozl.json` policy, the real tick through
// `workspace.tick`, and the `untriaged.view` operation the page calls. The
// fake GitHub answers every read and records any call that would write.
// Action (8), the live read-only count, runs only with AVOOZL_P31_LIVE set
// (scripts/proof-p31-live.mjs); it is not part of `npm test`.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { machineIdentity } from "../github-sync.mjs";
import {
  UNTRIAGED_INTERVAL_MS,
  UNTRIAGED_NOTICE_GAP_MS,
  untriagedPath,
} from "../untriaged.mjs";
import { selectionHandOff } from "../../../kirocrew-app/ui/src/untriaged-api.ts";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const REPO = "o/app",
  NOW = Date.parse("2026-11-12T12:00:00Z"),
  MINUTE = 60 * 1000,
  day = (n) => new Date(NOW - n * 86400000).toISOString();

const node = (number, extra = {}) => ({
  __typename: "Issue",
  number,
  title: `Item ${number}`,
  url: `https://github.com/${REPO}/issues/${number}`,
  createdAt: extra.createdAt ?? day(2),
  author: { login: "alice" },
  labels: { nodes: (extra.labels || []).map((name) => ({ name })) },
  assignees: { nodes: [] },
  comments: { totalCount: 1 },
});
const pull = (number, extra = {}) => ({
  ...node(number, extra),
  __typename: "PullRequest",
  url: `https://github.com/${REPO}/pull/${number}`,
  isDraft: extra.draft === true,
  closingIssuesReferences: {
    nodes: (extra.closes || []).map((n) => ({
      number: n,
      repository: { nameWithOwner: REPO },
    })),
  },
  commits: {
    nodes: [
      { commit: { statusCheckRollup: { state: extra.checks ?? "SUCCESS" } } },
    ],
  },
});

// P31's open items.
const ITEMS = [
  node(1),
  node(2, { labels: ["go"] }),
  node(3, { labels: ["triaged"] }),
  node(4, { labels: ["avoozl:managed"] }),
  node(5, { createdAt: day(100) }),
  pull(6, { draft: true, checks: "FAILURE" }),
  pull(7, { closes: [4] }),
  pull(8),
];

const WRITE =
  /^(create|update|add|remove|delete|ensure|set|close|reopen|merge|post|lock|link|unlink|move|transfer)/;

// Every method is a read that answers empty, except the search; a method
// whose name writes is recorded and refused.
function fakeGitHub() {
  const state = {
    items: [...ITEMS],
    fail: null,
    searches: [],
    writes: [],
    calls: [],
  };
  const known = {
    available: () => true,
    async graphql(query, variables, purpose) {
      if (!/search\(query/.test(query)) {
        state.calls.push(["graphql", purpose]);
        if (/mutation/.test(query)) state.writes.push(["graphql", purpose]);
        return {};
      }
      state.searches.push(variables.q);
      if (state.fail) throw new Error(state.fail);
      return {
        search: {
          issueCount: state.items.length,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: structuredClone(state.items),
        },
      };
    },
    async currentUser() {
      return { login: "owner" };
    },
    async permission() {
      return { permission: "admin" };
    },
    async repository() {
      return { id: 1, node_id: "R_1", full_name: REPO, default_branch: "main" };
    },
    async issue(_repository, number) {
      const found = state.items.find((entry) => entry.number === number);
      return found
        ? {
            number,
            state: "open",
            title: found.title,
            body: "",
            labels: found.labels.nodes,
            html_url: found.url,
            updated_at: day(1),
          }
        : null;
    },
  };
  const github = new Proxy(known, {
    get(target, name) {
      if (name === "state") return state;
      if (name in target) return target[name];
      if (typeof name !== "string" || name === "then") return undefined;
      return async (...args) => {
        state.calls.push([name]);
        if (WRITE.test(name)) {
          state.writes.push([name, args[0]]);
          throw new Error(`P31 fake GitHub refuses ${name}`);
        }
        return [];
      };
    },
  });
  return github;
}

function writePolicy(root, untriaged, mode = "single-repo") {
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_0123456789abcdef",
      ...(mode
        ? {
            github: {
              mode,
              repositories: {
                [REPO]: {
                  baseBranch: "main",
                  // Plain issues are listed only for a repository Avoozl triages.
                  coder: "worker",
                  allowedActors: ["owner"],
                  minimumPermission: "write",
                  managedLabels: {
                    managed: "avoozl:managed",
                    ready: "avoozl:ready",
                  },
                  rules: [{ id: "go", action: "deliver", match: "label:go" }],
                  untriaged,
                },
              },
            },
          }
        : {}),
    }),
  );
}

function workspace(t) {
  const { store } = fixture(t),
    root = temporaryDirectory(),
    github = fakeGitHub();
  // The workspace database must be on disk: the cache sits beside it.
  assert.ok(untriagedPath(store), "the store has a file");
  writePolicy(root, { triageLabels: ["triaged"] });
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    checks: [],
  });
  store.put("github_repositories", {
    id: REPO,
    owner: "o",
    repo: "app",
    projectId: "code",
    activeMachine: machineIdentity(store).id,
  });
  // Issue 4 is a task's issue, and pull request 8 is recorded on it.
  store.mutate("Seed the task that owns issue 4", (data) => {
    data.tasks.push({
      id: "t4",
      title: "Task t4",
      scope: "catalog",
      status: "planned",
      epic: "sample",
      track: "catalog",
      kind: "leaf",
      authority: "local",
      repository: "code",
      acceptance: ["t4 works"],
      checks: [],
      github: {
        repository: REPO,
        number: 4,
        url: `https://github.com/${REPO}/issues/4`,
        pullRequests: [{ number: 8, url: `https://github.com/${REPO}/pull/8` }],
      },
    });
  });
  const ops = new Operations(store, { github, workspaceRoot: root });
  return {
    store,
    root,
    github,
    ops,
    tick: () => ops.execute("workspace.tick", { sessions: [], cron: true }),
    view: (input = {}) => ops.execute("untriaged.view", input),
  };
}

const numbers = (view) =>
  view.items.map((item) => item.number).sort((a, b) => a - b);
const untriagedNotices = (result) =>
  result.notify.filter((notice) => notice.channel === "untriaged");

test("P31: the Untriaged list with a fake GitHub", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const w = workspace(t),
    state = w.github.state,
    later = (ms) => t.mock.timers.tick(ms);

  // (1) Two ticks within 10 minutes make one search.
  await w.tick();
  later(5 * MINUTE);
  await w.tick();
  assert.equal(state.searches.length, 1);
  assert.equal(state.searches[0], `repo:${REPO} is:open -label:triaged`);
  let checked = new Date(NOW).toISOString();

  // (2) The tab: items 1, 5, and 6 only, with links and fallback tooltips.
  let view = await w.view();
  assert.equal(view.enabled, true);
  assert.deepEqual(numbers(view), [1, 5, 6]);
  const six = view.items.find((item) => item.number === 6);
  assert.equal(six.kind, "pr");
  assert.equal(six.draft, true);
  assert.equal(six.checks, "failing");
  for (const item of view.items) {
    assert.equal(item.links.github, item.url);
    assert.equal(item.links.issueRadar.url, "/issue-radar");
    assert.equal(item.links.issueRadar.exact, false);
    assert.match(
      item.links.issueRadar.tooltip,
      new RegExp(`Pick o/app #${item.number} there`),
    );
    if (item.kind === "pr") {
      assert.match(item.links.review.tooltip, /posts nothing to GitHub\.$/);
    } else assert.equal(item.links.review, null);
  }
  assert.equal(view.repositories[0].checkedAt, checked);
  assert.equal(view.repositories[0].error, null);
  assert.equal(view.repositories[0].truncated, false);
  // The list holds no bodies, comments, CI logs, or findings (R49.15).
  for (const item of view.items)
    for (const field of ["body", "comments_text", "logs", "findings"])
      assert.equal(item[field], undefined);

  // (3) A 30-day limit: item 5 leaves at once, and the next read searches
  // with the cutoff.
  writePolicy(w.root, { triageLabels: ["triaged"], ignoreOlderThanDays: 30 });
  later(MINUTE);
  await w.tick();
  // A changed age reads on the next tick, inside the 10 minutes (R49.6).
  assert.equal(state.searches.length, 2);
  assert.equal(
    state.searches[1],
    `repo:${REPO} is:open -label:triaged created:>=2026-10-13`,
  );
  checked = new Date(Date.now()).toISOString();
  view = await w.view();
  assert.deepEqual(numbers(view), [1, 6]);

  // (4) A failed read after 10 minutes keeps the items and shows the error
  // with the last checked time.
  later(UNTRIAGED_INTERVAL_MS);
  state.fail = "API rate limit exceeded";
  const searches = state.searches.length;
  await w.tick();
  assert.equal(state.searches.length, searches + 1);
  view = await w.view();
  assert.deepEqual(numbers(view), [1, 6]);
  assert.match(
    view.repositories[0].error,
    /GitHub could not be read: API rate limit exceeded/,
  );
  assert.equal(view.repositories[0].checkedAt, checked);
  state.fail = null;

  // (5) Notify on, issue 9 added: one notice naming the count, none more
  // within the hour, and the next rise an hour later notifies again.
  writePolicy(w.root, {
    triageLabels: ["triaged"],
    ignoreOlderThanDays: 30,
    notify: true,
  });
  state.items.push(node(9));
  later(UNTRIAGED_INTERVAL_MS);
  const first = untriagedNotices(await w.tick());
  assert.equal(first.length, 1);
  assert.match(first[0].title, /3 in o\/app/);
  assert.equal(numbers(await w.view()).length, 3);
  state.items.push(node(10));
  later(UNTRIAGED_INTERVAL_MS);
  assert.equal(untriagedNotices(await w.tick()).length, 0);
  later(UNTRIAGED_NOTICE_GAP_MS - UNTRIAGED_INTERVAL_MS);
  const second = untriagedNotices(await w.tick());
  assert.equal(second.length, 1);
  assert.match(second[0].title, /4 in o\/app/);
  // Counts per repository, never one per item.
  assert.doesNotMatch(second[0].text, /#\d/);

  // (6) Select 1 and 6: the bulk link opens Issue Radar and names both.
  view = await w.view();
  const bulk = selectionHandOff(
    view.items.filter((item) => [1, 6].includes(item.number)),
  );
  assert.equal(bulk.url, "/issue-radar");
  assert.equal(bulk.exact, false);
  assert.match(bulk.tooltip, /o\/app #\d, #\d/);
  assert.match(bulk.tooltip, /#1/);
  assert.match(bulk.tooltip, /#6/);

  // Check now reads at once, still read only.
  const before = state.searches.length;
  await w.view({ refresh: true });
  assert.equal(state.searches.length, before + 1);

  // (7) Local only: the list is off (the page hides the tab and the
  // Dashboard count when `enabled` is false) and nothing is read.
  writePolicy(w.root, null, null);
  const reads = state.searches.length;
  later(UNTRIAGED_INTERVAL_MS);
  await w.tick();
  view = await w.view({ refresh: true });
  assert.equal(view.enabled, false);
  assert.equal(view.total, 0);
  assert.equal(state.searches.length, reads);

  // No GitHub write at any step.
  assert.deepEqual(state.writes, []);
});
