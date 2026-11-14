// rc-16.4: the scheduled merge of the default branch into an epic's
// integration branch (RC16.6, design D21), with a fake GitHub that models the
// branch. Nothing here reaches the network.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { GitHubClient } from "../github.mjs";
import { syncNeedsYou, syncStep, syncTargets } from "../integration-sync.mjs";
import { fixture } from "./fixtures.mjs";

const REPO = "example/code";
const BRANCH = "rewrite/x";
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-11-14T00:00:00Z");
const policy = {
  mode: "single-repo",
  repositories: { [REPO]: { baseBranch: "main", coder: "issue-radar" } },
};

// `fresh`: commits on main the branch lacks. `own`: commits on the branch main
// lacks. `conflict`: the merge cannot be made. `mainFiles` / `branchFiles`:
// files each side changed. The only write the fake has is mergeBranch.
function fake(state = {}) {
  const s = {
    fresh: 0,
    own: 0,
    conflict: false,
    missing: false,
    mainFiles: [],
    branchFiles: [],
    ...state,
  };
  const github = {
    s,
    reads: 0,
    merges: [],
    available: () => true,
    repository: async () => ({ default_branch: "main" }),
    compareCommits: async (_repo, base, head) => {
      github.reads++;
      if (s.missing) throw Object.assign(Error("Not Found"), { status: 404 });
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
      if (!s.fresh) return null;
      s.fresh = 0;
      s.own++;
      return { sha: "merge-commit" };
    },
  };
  return github;
}

const target = (extra = {}) => ({
  spec: "rewrite",
  repository: REPO,
  branch: BRANCH,
  sync: "weekly",
  ...extra,
});
const run = (store, github, targets = [target()], now = T0) =>
  syncStep(store, github, targets, { policy, now });

test("a branch behind main gets one merge commit through GitHub's merge call", async (t) => {
  const { store } = fixture(t),
    github = fake({ fresh: 3 }),
    step = await run(store, github);
  assert.deepEqual(github.merges, [
    { base: BRANCH, head: "main", message: `Merge main into ${BRANCH}` },
  ]);
  assert.equal(github.s.fresh, 0);
  assert.deepEqual(step.errors, []);
  assert.deepEqual(syncNeedsYou(store), []);
});

test("a diverged branch is merged the same way", async (t) => {
  const { store } = fixture(t),
    github = fake({ fresh: 2, own: 5 });
  await run(store, github);
  assert.equal(github.merges.length, 1);
  assert.equal(github.s.own, 6);
});

test("an up to date branch and a branch only ahead of main are not merged", async (t) => {
  for (const state of [{}, { own: 4 }]) {
    const { store } = fixture(t),
      github = fake(state);
    await run(store, github);
    assert.deepEqual(github.merges, [], JSON.stringify(state));
    assert.ok(github.reads > 0);
  }
});

test("a conflict leaves the branch unchanged and raises one row naming the files", async (t) => {
  const { store } = fixture(t),
    github = fake({
      fresh: 2,
      own: 1,
      conflict: true,
      mainFiles: ["a.js", "b.js"],
      branchFiles: ["b.js", "c.js"],
    }),
    before = structuredClone(github.s);
  const first = await run(store, github);
  assert.deepEqual(github.s, before);
  const rows = syncNeedsYou(store);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, `integration-conflict:${REPO}@${BRANCH}`);
  assert.match(rows[0].detail, /b\.js/);
  assert.doesNotMatch(rows[0].detail, /a\.js|c\.js/);
  assert.equal(first.notify.length, 1);
  // The next tick reads the branch but neither merges again nor notifies again.
  const second = await run(store, github, [target()], T0 + 5 * 60 * 1000);
  assert.equal(github.merges.length, 1);
  assert.deepEqual(second.notify, []);
  assert.equal(syncNeedsYou(store).length, 1);
});

test("the row clears when a person has merged main into the branch", async (t) => {
  const { store } = fixture(t),
    github = fake({ fresh: 2, conflict: true });
  await run(store, github);
  assert.equal(syncNeedsYou(store).length, 1);
  github.s.fresh = 0;
  await run(store, github, [target()], T0 + 5 * 60 * 1000);
  assert.deepEqual(syncNeedsYou(store), []);
  assert.equal(github.merges.length, 1);
});

test("the schedule: weekly by default, daily on request, off never", async (t) => {
  const { store } = fixture(t),
    github = fake({ fresh: 1 });
  await run(store, github);
  assert.equal(github.merges.length, 1);
  github.s.fresh = 1;
  await run(store, github, [target()], T0 + 6 * DAY);
  assert.equal(github.merges.length, 1);
  await run(store, github, [target()], T0 + 7 * DAY);
  assert.equal(github.merges.length, 2);
  github.s.fresh = 1;
  await run(store, github, [target({ sync: "daily" })], T0 + 7 * DAY + DAY / 2);
  assert.equal(github.merges.length, 2);
  await run(store, github, [target({ sync: "daily" })], T0 + 8 * DAY);
  assert.equal(github.merges.length, 3);
  const off = fake({ fresh: 1 }),
    other = fixture(t).store;
  await run(other, off, [target({ sync: "off" })]);
  assert.equal(off.reads, 0);
  assert.deepEqual(off.merges, []);
});

test("a missing branch is reported once, not merged, and read again on the next tick", async (t) => {
  const { store } = fixture(t),
    github = fake({ fresh: 1, missing: true }),
    first = await run(store, github);
  assert.deepEqual(github.merges, []);
  assert.equal(first.errors.length, 1);
  assert.match(first.errors[0], new RegExp(BRANCH));
  const again = await run(store, github, [target()], T0 + 5 * 60 * 1000);
  assert.equal(github.reads, 2);
  assert.deepEqual(again.errors, []);
  github.s.missing = false;
  await run(store, github, [target()], T0 + 10 * 60 * 1000);
  assert.equal(github.merges.length, 1);
});

test("a branch named as the default branch is never merged into itself", async (t) => {
  const { store } = fixture(t),
    github = fake({ fresh: 1 }),
    step = await run(store, github, [target({ branch: "main" })]);
  assert.deepEqual(github.merges, []);
  assert.equal(github.reads, 0);
  assert.equal(step.errors.length, 1);
});

test("an unreadable GitHub leaves the standing row and merges nothing", async (t) => {
  const { store } = fixture(t),
    github = fake({ fresh: 1, conflict: true });
  await run(store, github);
  github.compareCommits = async () => {
    throw Error("offline");
  };
  const step = await run(store, github, [target()], T0 + 5 * 60 * 1000);
  assert.equal(github.merges.length, 1);
  assert.equal(syncNeedsYou(store).length, 1);
  assert.match(step.errors[0], /offline/);
});

function plan(store, spec, manifest, extra = {}) {
  store.put("approvals", {
    id: `approval-${spec}`,
    planId: spec,
    hash: "h",
    files: { "avoozl/manifest.json": JSON.stringify(manifest) },
  });
  store.put("plans", {
    id: spec,
    spec,
    approvalId: `approval-${spec}`,
    ...extra,
  });
}
const leaf = (repository) => ({
  kind: "leaf",
  ...(repository ? { repository } : {}),
});

test("targets come from approved plans whose manifest names a branch", (t) => {
  const { store } = fixture(t);
  plan(store, "old", { tasks: { 1: leaf(REPO) } });
  plan(store, "rewrite", {
    integrationBranch: BRANCH,
    tasks: { 1: leaf(REPO), 2: leaf(REPO) },
  });
  plan(store, "daily", {
    integrationBranch: "rewrite/d",
    integrationSync: "daily",
    tasks: { 1: leaf() },
  });
  plan(
    store,
    "gone",
    { integrationBranch: "rewrite/g", tasks: { 1: leaf(REPO) } },
    { deletedAt: "2026-01-01" },
  );
  store.put("plans", { id: "draft", spec: "draft" });
  const { targets, problems } = syncTargets(store, policy);
  assert.deepEqual(
    targets.map((entry) => [
      entry.spec,
      entry.repository,
      entry.branch,
      entry.sync,
    ]),
    [
      ["daily", REPO, "rewrite/d", "daily"],
      ["rewrite", REPO, BRANCH, "weekly"],
    ],
  );
  assert.deepEqual(problems, []);
});

test("targets: two repositories, or none to pick, are named as problems, not guessed", (t) => {
  const { store } = fixture(t);
  plan(store, "two", {
    integrationBranch: BRANCH,
    tasks: { 1: leaf(REPO), 2: leaf("example/other") },
  });
  const { targets, problems } = syncTargets(store, policy);
  assert.deepEqual(targets, []);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /two/);
  const none = fixture(t).store;
  plan(none, "nothing", { integrationBranch: BRANCH, tasks: { 1: leaf() } });
  assert.equal(
    syncTargets(none, {
      ...policy,
      repositories: {
        a: { coder: "issue-radar" },
        b: { coder: "issue-radar" },
      },
    }).problems.length,
    1,
  );
});

test("the real client merges with POST /merges and compares with a slash in the branch", async () => {
  const seen = [];
  const client = new GitHubClient({
    token: "t",
    apiUrl: "https://api.example.test",
    fetch: async (url, init) => {
      const u = new URL(url);
      seen.push([init.method, u.pathname, init.body]);
      return u.pathname.endsWith("/merges")
        ? new Response("", { status: 200 })
        : new Response(JSON.stringify({ ahead_by: 0 }), { status: 200 });
    },
  });
  await client.compareCommits(REPO, BRANCH, "main");
  assert.equal(
    await client.mergeBranch(REPO, {
      base: BRANCH,
      head: "main",
      message: "m",
    }),
    null,
  );
  assert.deepEqual(seen[0].slice(0, 2), [
    "GET",
    `/repos/${REPO}/compare/rewrite/x...main`,
  ]);
  assert.deepEqual(seen[1].slice(0, 2), ["POST", `/repos/${REPO}/merges`]);
  assert.deepEqual(JSON.parse(seen[1][2]), {
    base: BRANCH,
    head: "main",
    commit_message: "m",
  });
});

test("the sync code has no way to rewrite history", () => {
  const text = fs.readFileSync(
    new URL("../integration-sync.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(text, /force|rebase|--amend|reset|\+refs/i);
  for (const method of ["updateRef", "deleteBranch", "createBranch", "putFile"])
    assert.ok(!text.includes(method), method);
});
