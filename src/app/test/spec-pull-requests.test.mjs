// Spec pull requests (Requirement 107, design §4.36): detection, the author
// check, adoption, Triage exclusion, approve then merge, reject and request
// changes. Fake GitHub only; no network.
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { Store } from "../store.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { readCache, refreshUntriaged, untriagedView } from "../untriaged.mjs";
import {
  adoptPull,
  linkOf,
  mergeApprovedPulls,
  pullFor,
  pullSpecs,
  recordPullApproval,
  rejectPull,
  requestChanges,
  specPullNeedsYou,
  specPullOf,
  specPullView,
  syncSpecPulls,
} from "../spec-pull-requests.mjs";
import { specFiles } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const HEAD = "a".repeat(40),
  HEAD2 = "b".repeat(40);
const SPEC = ".kiro/specs/config/";
const paths = (names = ["requirements.md", "design.md", "tasks.md"]) =>
  names.map((name) => `${SPEC}${name}`);

function policy(roles = {}) {
  return normalizeGitHubPolicy({
    mode: "single-repo",
    repositories: {
      "o/app": {
        baseBranch: "main",
        coder: "worker",
        allowedActors: ["carol"],
        ...roles,
      },
    },
  });
}

const prNode = (number, extra = {}) => ({
  __typename: "PullRequest",
  number,
  title: `Spec ${number}`,
  url: `https://github.com/o/app/pull/${number}`,
  createdAt: new Date().toISOString(),
  author: { login: extra.author ?? "owner" },
  labels: { nodes: [] },
  assignees: { nodes: [] },
  comments: { totalCount: 0 },
  isDraft: extra.draft === true,
  headRefOid: extra.head ?? HEAD,
  headRefName: extra.branch ?? "feature/spec",
  baseRefName: "main",
  files: {
    totalCount: extra.total ?? (extra.paths ?? paths()).length,
    nodes: (extra.paths ?? paths()).map((path) => ({ path })),
  },
  closingIssuesReferences: { nodes: [] },
  commits: {
    nodes: [
      { commit: { statusCheckRollup: { state: extra.checks ?? "SUCCESS" } } },
    ],
  },
});

function fakeGitHub(nodes) {
  const github = {
    calls: [],
    nodes,
    heads: {
      [HEAD]: specFiles(),
      [HEAD2]: { ...specFiles(), "design.md": "# Design\n\nChanged.\n" },
    },
    pulls: {},
    permissions: { carol: "write", dave: "read" },
    available: () => true,
    async graphql() {
      github.calls.push("graphql");
      return {
        search: {
          issueCount: github.nodes.length,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: github.nodes,
        },
      };
    },
    async blobTexts(_repository, ref, list) {
      github.calls.push(`blobTexts:${ref.slice(0, 1)}`);
      const files = github.heads[ref] ?? {},
        out = new Map();
      for (const file of list)
        out.set(file, files[file.slice(SPEC.length)] ?? null);
      return out;
    },
    async permission(_repository, actor) {
      github.calls.push(`permission:${actor}`);
      return { permission: github.permissions[actor] ?? "none" };
    },
    async pullRequest(_repository, number) {
      github.calls.push(`pullRequest:${number}`);
      return github.pulls[number] ?? { state: "open", merged: false };
    },
    async mergePullRequest(_repository, number, options) {
      github.calls.push(`merge:${number}`);
      github.merged = { number, ...options };
      if (github.refuse) {
        const error = new Error("head moved");
        error.status = 409;
        throw error;
      }
      return { merged: true };
    },
    async createIssueComment(_repository, number, body) {
      github.calls.push(`comment:${number}`);
      (github.comments ??= []).push({ number, body });
    },
    async updateIssue(_repository, number, input) {
      github.calls.push(`update:${number}`);
      github.updated = { number, ...input };
    },
  };
  return github;
}

const open = (t, nodes = [prNode(5)], roles) => {
  const store = new Store(
      path.join(temporaryDirectory("avoozl-specpr-"), "avoozl.sqlite"),
    ),
    github = fakeGitHub(nodes),
    rules = policy(roles);
  t.after(() => store.close());
  return { store, github, rules };
};

const read = async ({ store, github, rules }) => {
  await refreshUntriaged(store, github, rules, [], { force: true });
  return readCache(store);
};

test("a pull request is a spec pull request only when every file is under one spec folder of a planning repository", () => {
  const entry = (extra) => ({
    kind: "pr",
    files: { total: 3, paths: paths() },
    ...extra,
  });
  assert.deepEqual(specPullOf(entry(), "planning"), { spec: "config" });
  assert.deepEqual(specPullOf(entry(), "both"), { spec: "config" });
  assert.equal(specPullOf(entry(), "code"), null);
  assert.equal(specPullOf(entry(), undefined), null);
  // Code mixed in.
  assert.equal(
    specPullOf(
      entry({ files: { total: 4, paths: [...paths(), "src/a.mjs"] } }),
      "both",
    ),
    null,
  );
  // Two spec folders.
  assert.equal(
    specPullOf(
      entry({
        files: {
          total: 2,
          paths: [`${SPEC}tasks.md`, ".kiro/specs/other/tasks.md"],
        },
      }),
      "both",
    ),
    null,
  );
  // More files than were read.
  assert.equal(
    specPullOf(entry({ files: { total: 40, paths: paths() } }), "both"),
    null,
  );
  assert.equal(
    specPullOf(entry({ files: { total: 0, paths: [] } }), "both"),
    null,
  );
  assert.equal(specPullOf({ kind: "issue", files: null }, "both"), null);
  // A path that climbs out of the folder, and a file at the spec root.
  assert.equal(
    specPullOf(
      entry({ files: { total: 1, paths: [`${SPEC}../../x`] } }),
      "both",
    ),
    null,
  );
  assert.equal(
    specPullOf(
      entry({ files: { total: 1, paths: [".kiro/specs/config"] } }),
      "both",
    ),
    null,
  );
  // A new folder is just another name.
  assert.deepEqual(
    specPullOf(
      entry({ files: { total: 1, paths: [".kiro/specs/fresh/tasks.md"] } }),
      "both",
    ),
    { spec: "fresh" },
  );
});

test("the Triage read carries the changed files and branch names, with no extra call", async (t) => {
  const fixture = open(t),
    cache = await read(fixture),
    item = cache.repositories["o/app"].items[0];
  assert.deepEqual(item.files, { total: 3, paths: paths() });
  assert.equal(item.branch, "feature/spec");
  assert.equal(item.base, "main");
  assert.deepEqual(fixture.github.calls, ["graphql"]);
});

test("an own pull request is adopted: a draft revision, a review choice, and no Triage row", async (t) => {
  const fixture = open(t, [
      prNode(5),
      prNode(6, { paths: ["src/a.mjs"], total: 1 }),
    ]),
    { store, github, rules } = fixture,
    cache = await read(fixture);
  // Before adoption the spec-only pull request shows with Review as spec.
  const before = untriagedView(rules, [], cache, Date.now());
  assert.deepEqual(before.items.find((item) => item.number === 5).specPull, {
    spec: "config",
  });
  assert.equal(
    before.items.find((item) => item.number === 6).specPull,
    undefined,
  );
  const out = await syncSpecPulls(store, github, rules, cache, {
    owners: ["owner"],
  });
  assert.deepEqual(out.adopted, [
    { repository: "o/app", number: 5, spec: "config" },
  ]);
  const receipt = store.get("receipts", "spec-pr:o/app#5");
  assert.equal(receipt.state, "open");
  assert.equal(receipt.link, "own");
  assert.equal(receipt.head, HEAD);
  const plan = store.get("plans", "config");
  assert.equal(plan.state, "draft");
  assert.equal(plan.hash, receipt.hash);
  assert.equal(
    store.list("receipts").find((entry) => entry.kind === "plan-review-choice")
      .state,
    "review",
  );
  // The spec pull request never shows in Triage again; the code one stays.
  const after = untriagedView(rules, [], readCache(store), Date.now());
  assert.deepEqual(
    after.items.map((item) => item.number),
    [6],
  );
  // The same head again reads nothing and writes nothing.
  const blobs = github.calls.filter((call) =>
    call.startsWith("blobTexts"),
  ).length;
  await syncSpecPulls(store, github, rules, readCache(store), {
    owners: ["owner"],
  });
  assert.equal(
    github.calls.filter((call) => call.startsWith("blobTexts")).length,
    blobs,
  );
  assert.equal(store.list("plans").length, 1);
});

test("a new head commit imports as the next draft revision", async (t) => {
  const fixture = open(t),
    { store, github, rules } = fixture;
  await syncSpecPulls(store, github, rules, await read(fixture), {
    owners: ["owner"],
  });
  const first = store.get("plans", "config");
  github.nodes = [prNode(5, { head: HEAD2 })];
  await syncSpecPulls(store, github, rules, await read(fixture), {
    owners: ["owner"],
  });
  const next = store.get("plans", "config");
  assert.equal(next.revision, first.revision + 1);
  assert.notEqual(next.hash, first.hash);
  assert.equal(pullFor(store, "config").head, HEAD2);
  assert.equal(pullSpecs(store)[0].hash, next.hash);
});

test("who may be adopted: working branch, owner login, an allowed author, else Review as spec", async (t) => {
  const { store, github, rules } = open(t),
    entry = (extra) => ({ number: 5, author: "owner", branch: "x", ...extra }),
    link = (extra, owners = ["owner"]) =>
      linkOf(store, github, rules, {
        repository: "o/app",
        entry: entry(extra),
        spec: "config",
        owners,
      });
  assert.equal(
    await link({ author: "someone", branch: "avoozl/config/work" }, []),
    "own",
  );
  assert.equal(await link({ author: "Owner" }), "own");
  assert.equal(await link({ author: "carol" }, []), "allowed");
  assert.equal(await link({ author: "mallory" }, []), "person");
  assert.equal(await link({ author: null }, []), "person");
  // An author's answer is kept: one permission read per author.
  const reads = github.calls.filter(
    (call) => call === "permission:carol",
  ).length;
  await link({ author: "carol" }, []);
  assert.equal(
    github.calls.filter((call) => call === "permission:carol").length,
    reads,
  );
  // An unreadable permission is not allowed.
  github.permission = async () => {
    throw new Error("no access");
  };
  assert.equal(await link({ author: "erin" }, []), "person");
});

test("a pull request by someone not allowed stays in Triage until a person presses Review as spec", async (t) => {
  const fixture = open(t, [prNode(5, { author: "mallory" })]),
    { store, github, rules } = fixture,
    cache = await read(fixture);
  const out = await syncSpecPulls(store, github, rules, cache, {
    owners: ["owner"],
  });
  assert.deepEqual(out.adopted, []);
  assert.equal(store.get("receipts", "spec-pr:o/app#5"), null);
  assert.equal(
    untriagedView(rules, [], cache, Date.now()).items[0].specPull.spec,
    "config",
  );
  // The person's button adopts it, as `person`.
  const entry = cache.repositories["o/app"].items[0];
  const receipt = await adoptPull(store, github, {
    repository: "o/app",
    entry,
    spec: "config",
    link: "person",
    actor: "me",
  });
  assert.equal(receipt.link, "person");
  assert.equal(
    untriagedView(rules, [], readCache(store), Date.now()).items.length,
    0,
  );
});

test("Approve records exactly the adopted head, refuses a draft, and the merge waits for passing checks", async (t) => {
  const fixture = open(t, [prNode(5, { draft: true })]),
    { store, github, rules } = fixture;
  await syncSpecPulls(store, github, rules, await read(fixture), {
    owners: ["owner"],
  });
  const plan = store.get("plans", "config");
  assert.throws(() => recordPullApproval(store, plan, "owner"), /draft/);
  // Ready now, but the checks have not finished.
  github.nodes = [prNode(5, { checks: "PENDING" })];
  await syncSpecPulls(store, github, rules, await read(fixture), {
    owners: ["owner"],
  });
  const state = recordPullApproval(
    store,
    store.get("plans", "config"),
    "owner",
  );
  assert.equal(state.state, "open");
  assert.equal(state.head, HEAD);
  assert.equal(state.number, 5);
  assert.deepEqual(await mergeApprovedPulls(store, github, rules), []);
  assert.equal(github.merged, undefined);
  // Passing: merged guarded by the head, with the repository's method.
  github.nodes = [prNode(5)];
  await syncSpecPulls(store, github, rules, await read(fixture), {
    owners: ["owner"],
  });
  assert.deepEqual(await mergeApprovedPulls(store, github, rules), [
    { repository: "o/app", number: 5 },
  ]);
  assert.deepEqual(github.merged, { number: 5, sha: HEAD, method: "squash" });
});

test("a head that moved after Approve approves nothing, and a refused merge waits before trying again", async (t) => {
  const fixture = open(t),
    { store, github, rules } = fixture;
  await syncSpecPulls(store, github, rules, await read(fixture), {
    owners: ["owner"],
  });
  recordPullApproval(store, store.get("plans", "config"), "owner");
  // GitHub refuses the guarded merge: tried again only after the delay.
  github.refuse = true;
  const now = Date.now();
  assert.deepEqual(await mergeApprovedPulls(store, github, rules, now), []);
  const tries = github.calls.filter((call) => call.startsWith("merge")).length;
  await mergeApprovedPulls(store, github, rules, now + 1000);
  assert.equal(
    github.calls.filter((call) => call.startsWith("merge")).length,
    tries,
  );
  // The author pushes: the revision changes and the old approval is void.
  github.refuse = false;
  github.nodes = [prNode(5, { head: HEAD2 })];
  await syncSpecPulls(store, github, rules, await read(fixture), {
    owners: ["owner"],
  });
  assert.deepEqual(
    await mergeApprovedPulls(store, github, rules, now + 2000),
    [],
  );
  const [name, voided] = store.metaEntries("spec-approval:")[0];
  assert.equal(voided.state, "closed");
  assert.match(name, /^spec-approval:config:/);
});

test("Reject comments with the reason and closes; Request changes posts the open findings once", async (t) => {
  const fixture = open(t),
    { store, github, rules } = fixture;
  await syncSpecPulls(store, github, rules, await read(fixture), {
    owners: ["owner"],
  });
  await assert.rejects(
    rejectPull(store, github, { id: "spec-pr:o/app#5", reason: " " }),
    /why/,
  );
  await assert.rejects(
    requestChanges(store, github, { id: "spec-pr:o/app#5" }),
    /no open findings/,
  );
  await rejectPull(store, github, {
    id: "spec-pr:o/app#5",
    reason: "Wrong direction.",
  });
  assert.equal(github.comments[0].body, "Rejected in Avoozl: Wrong direction.");
  assert.deepEqual(github.updated, { number: 5, state: "closed" });
  assert.equal(store.get("receipts", "spec-pr:o/app#5").state, "closed");
  assert.equal(pullFor(store, "config"), null);
  // The draft revision stays.
  assert.equal(store.get("plans", "config").state, "draft");
  assert.equal(
    untriagedView(rules, [], readCache(store), Date.now()).items.length,
    1,
  );
});

test("the view shows the diff against the approved revision, and Decisions gets one item", async (t) => {
  const fixture = open(t),
    { store, github, rules } = fixture;
  await syncSpecPulls(store, github, rules, await read(fixture), {
    owners: ["owner"],
  });
  const [view] = specPullView(store);
  assert.equal(view.newSpec, true);
  assert.equal(view.canApprove, true);
  assert.equal(view.review.state, "not-reviewed");
  assert.deepEqual(view.files.map((file) => [file.file, file.status]).sort(), [
    ["avoozl/manifest.json", "added"],
    ["design.md", "added"],
    ["requirements.md", "added"],
    ["tasks.md", "added"],
  ]);
  const [item] = specPullNeedsYou(store);
  assert.equal(item.kind, "spec-pull");
  assert.equal(item.specPull.number, 5);
  // Approve moves it out of the list: nobody waits on a person for it.
  recordPullApproval(store, store.get("plans", "config"), "owner");
  assert.deepEqual(specPullNeedsYou(store), []);
});

test("a pull request that left the read is looked at once and its receipt closes when it merged", async (t) => {
  const fixture = open(t),
    { store, github, rules } = fixture;
  await syncSpecPulls(store, github, rules, await read(fixture), {
    owners: ["owner"],
  });
  github.nodes = [];
  github.pulls[5] = { state: "closed", merged: true };
  await new Promise((resolve) => setTimeout(resolve, 5));
  const cache = await read(fixture);
  const out = await syncSpecPulls(store, github, rules, cache, {
    owners: ["owner"],
  });
  assert.deepEqual(out.closed, [{ repository: "o/app", number: 5 }]);
  assert.equal(store.get("receipts", "spec-pr:o/app#5").state, "merged");
  // A second pass makes no call about it.
  const calls = github.calls.length;
  await syncSpecPulls(store, github, rules, cache, { owners: ["owner"] });
  assert.equal(github.calls.length, calls);
});
