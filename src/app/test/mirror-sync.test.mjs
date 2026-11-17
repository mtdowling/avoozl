// rc-23.2: the mirror sync step and the write targets (RC24.3, RC24.4, design
// D29.2, D29.3). A fake GitHub holds two repositories; nothing reaches the
// network and no git runs.
import assert from "node:assert/strict";
import test from "node:test";
import {
  mirrorConfig,
  mirrorNeedsYou,
  mirrorSyncStep,
  writeRepo,
} from "../mirror-sync.mjs";
import { fixture } from "./fixtures.mjs";

const SOURCE = "example/code";
const MIRROR = "example/code-private";
const policy = {
  mode: "single-repo",
  repositories: {
    [SOURCE]: {
      coder: "issue-radar",
      mirror: { source: SOURCE, mirror: MIRROR, forward: "nudge" },
    },
    "example/other": { coder: "issue-radar" },
  },
};

const TRACKING = "avoozl-upstream/main";
const notFound = () => Object.assign(new Error("Not Found"), { status: 404 });

// `heads`: default-branch head per repository. `parents`: the commit graph.
// The source has only what its head reaches; the mirror has every commit.
// `tracking` is the mirror's TRACKING head. The only writes are `copies` (one
// fast-forward each) and `created` (import pull requests).
function fake(state = {}) {
  const s = {
    heads: { [SOURCE]: "s2", [MIRROR]: "s1" },
    parents: { s0: [], s1: ["s0"], s2: ["s1"], m9: ["s1"], x1: ["s1"] },
    tracking: null,
    unreadable: false,
    ...state,
  };
  const reach = (sha, seen = new Set()) => {
    if (sha && !seen.has(sha)) {
      seen.add(sha);
      for (const p of s.parents[sha] ?? []) reach(p, seen);
    }
    return seen;
  };
  const github = {
    s,
    copies: [],
    created: [],
    compares: 0,
    available: () => true,
    repository: async () => ({ default_branch: "main" }),
    branch: async (repo, name) => {
      if (s.unreadable) throw notFound();
      if (name === TRACKING) {
        assert.equal(repo, MIRROR);
        if (!s.tracking) throw notFound();
        return { commit: { sha: s.tracking } };
      }
      return { commit: { sha: s.heads[repo] } };
    },
    compareCommits: async (repo, base, head) => {
      github.compares++;
      if (repo === SOURCE && !reach(s.heads[SOURCE]).has(base))
        throw notFound();
      if (reach(head).has(base))
        return { status: base === head ? "identical" : "ahead" };
      return { status: reach(base).has(head) ? "behind" : "diverged" };
    },
    listPullRequests: async (repo, input) => {
      assert.deepEqual(
        [repo, input],
        [MIRROR, { state: "open", head: `example:${TRACKING}`, base: "main" }],
      );
      return github.created.filter((p) => p.state === "open");
    },
    createPullRequest: async (repo, input) => {
      assert.equal(repo, MIRROR);
      const pull = {
        number: 100 + github.created.length,
        state: "open",
        head: { ref: input.head },
        base: { ref: input.base },
        title: input.title,
      };
      github.created.push(pull);
      return pull;
    },
  };
  github.copy = async (input) => {
    github.copies.push(input);
    if (input.target === TRACKING) s.tracking = input.sha;
    else s.heads[MIRROR] = input.sha;
  };
  // A person merges the open import pull request with a merge commit.
  github.mergeImport = (sha) => {
    s.parents[sha] = [s.heads[MIRROR], s.tracking];
    s.heads[MIRROR] = sha;
    for (const p of github.created) p.state = "closed";
  };
  return github;
}
const run = (store, github) =>
  mirrorSyncStep(store, github, { policy, copy: github.copy });

test("a mirror behind the source is fast-forwarded once and nothing else is written", async (t) => {
  const { store } = fixture(t),
    github = fake();
  const step = await run(store, github);
  assert.deepEqual(github.copies, [
    { source: SOURCE, mirror: MIRROR, branch: "main", sha: "s2" },
  ]);
  assert.deepEqual(step.errors, []);
  await run(store, github);
  assert.equal(github.copies.length, 1);
  assert.deepEqual(mirrorNeedsYou(store), []);
});

test("equal heads write nothing", async (t) => {
  const { store } = fixture(t),
    github = fake({ heads: { [SOURCE]: "s1", [MIRROR]: "s1" } });
  await run(store, github);
  assert.deepEqual(github.copies, []);
});

test("after private commits, upstream comes in by one import pull request (R102.21)", async (t) => {
  const { store } = fixture(t),
    github = fake({ heads: { [SOURCE]: "s2", [MIRROR]: "m9" } });
  const notices = [];
  notices.push(...(await run(store, github)).notify);
  const compares = github.compares;
  for (let i = 0; i < 2; i++)
    notices.push(...(await run(store, github)).notify);
  assert.equal(github.compares, compares, "an unchanged tick reads no history");
  assert.deepEqual(github.copies, [
    {
      source: SOURCE,
      mirror: MIRROR,
      branch: "main",
      target: TRACKING,
      sha: "s2",
    },
  ]);
  assert.equal(github.s.heads[MIRROR], "m9", "the mirror branch is not moved");
  assert.deepEqual(
    github.created.map((p) => [p.head.ref, p.base.ref]),
    [[TRACKING, "main"]],
  );
  assert.equal(notices.length, 1);
  const rows = mirrorNeedsYou(store);
  assert.equal(rows.length, 1);
  assert.match(rows[0].title, /Review the import/);
  assert.equal(rows[0].link, `https://github.com/${MIRROR}/pull/100`);
});

test("a merged import clears the row, and a second import opens a new pull request", async (t) => {
  const { store } = fixture(t),
    github = fake({ heads: { [SOURCE]: "s2", [MIRROR]: "m9" } });
  await run(store, github);
  github.mergeImport("m10");
  await run(store, github);
  assert.deepEqual(mirrorNeedsYou(store), []);
  assert.equal(github.created.length, 1);
  // Upstream moves on: the tracking branch fast-forwards, one more import.
  github.s.parents.s3 = ["s2"];
  github.s.heads[SOURCE] = "s3";
  await run(store, github);
  await run(store, github);
  assert.deepEqual(
    github.copies.map((c) => [c.target, c.sha]),
    [
      [TRACKING, "s2"],
      [TRACKING, "s3"],
    ],
  );
  assert.deepEqual(
    github.created.map((p) => [p.number, p.state]),
    [
      [100, "closed"],
      [101, "open"],
    ],
  );
  assert.equal(
    mirrorNeedsYou(store)[0].link,
    `https://github.com/${MIRROR}/pull/101`,
  );
  github.mergeImport("m11");
  await run(store, github);
  assert.deepEqual(mirrorNeedsYou(store), []);
});

test("a mirror that holds the source head and more needs no import", async (t) => {
  const { store } = fixture(t),
    github = fake({ heads: { [SOURCE]: "s1", [MIRROR]: "m9" } });
  await run(store, github);
  assert.deepEqual(github.created, []);
  assert.deepEqual(mirrorNeedsYou(store), []);
  assert.equal(github.s.heads[MIRROR], "m9");
});

test("a tracking branch with commits the source lacks gives one row and no write, until fixed", async (t) => {
  const { store } = fixture(t),
    github = fake({
      heads: { [SOURCE]: "s2", [MIRROR]: "m9" },
      tracking: "x1",
    });
  const notices = [];
  for (let i = 0; i < 2; i++)
    notices.push(...(await run(store, github)).notify);
  assert.deepEqual(github.copies, []);
  assert.deepEqual(github.created, []);
  assert.equal(notices.length, 1);
  const rows = mirrorNeedsYou(store);
  assert.equal(rows.length, 1);
  assert.match(rows[0].title, /has diverged/);
  assert.match(rows[0].detail, /x1/);
  // A person resets the tracking branch: importing resumes.
  github.s.tracking = "s1";
  await run(store, github);
  assert.equal(github.copies.length, 1);
  assert.match(mirrorNeedsYou(store)[0].title, /Review the import/);
});

test("a repository that cannot be read gives one row for the cause", async (t) => {
  const { store } = fixture(t),
    github = fake({ unreadable: true });
  const first = await run(store, github);
  const second = await run(store, github);
  assert.equal(first.errors.length, 1);
  assert.deepEqual(second.errors, []);
  assert.equal(mirrorNeedsYou(store).length, 1);
  assert.deepEqual(github.copies, []);
});

test("a failed copy gives one row and is tried again", async (t) => {
  const { store } = fixture(t),
    github = fake();
  let fail = true;
  const copy = async (input) => {
    if (fail) throw new Error("push refused");
    return github.copy(input);
  };
  const first = await mirrorSyncStep(store, github, { policy, copy });
  assert.equal(first.errors.length, 1);
  assert.equal(mirrorNeedsYou(store).length, 1);
  fail = false;
  await mirrorSyncStep(store, github, { policy, copy });
  assert.deepEqual(mirrorNeedsYou(store), []);
  assert.equal(github.copies.length, 1);
});

test("writeRepo and mirrorConfig send writes to the mirror and leave other repositories alone", () => {
  assert.equal(writeRepo(policy.repositories[SOURCE], SOURCE), MIRROR);
  assert.equal(
    writeRepo(policy.repositories["example/other"], "example/other"),
    "example/other",
  );
  assert.equal(writeRepo(undefined, "example/x"), "example/x");
  const config = { id: SOURCE, owner: "example", repo: "code", label: "l" };
  const moved = mirrorConfig(config, policy.repositories);
  assert.equal(moved.id, MIRROR);
  assert.equal(moved.owner, "example");
  assert.equal(moved.repo, "code-private");
  assert.equal(moved.label, "l");
  const same = { id: "example/other", owner: "example", repo: "other" };
  assert.equal(mirrorConfig(same, policy.repositories), same);
});

test("no step of the sync writes to the source", async (t) => {
  const { store } = fixture(t),
    github = fake();
  await run(store, github);
  assert.ok(github.copies.every((c) => c.mirror === MIRROR));
});
