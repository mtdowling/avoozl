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

// `heads`: default-branch head per repository. `ancestors`: commits the source
// has. The only writes are `copies` (one fast-forward each).
function fake(state = {}) {
  const s = {
    heads: { [SOURCE]: "s2", [MIRROR]: "s1" },
    ancestors: ["s0", "s1", "s2"],
    unreadable: false,
    ...state,
  };
  const github = {
    s,
    copies: [],
    writes: [],
    available: () => true,
    repository: async () => ({ default_branch: "main" }),
    branch: async (repo) => {
      if (s.unreadable)
        throw Object.assign(new Error("Not Found"), { status: 404 });
      return { commit: { sha: s.heads[repo] } };
    },
    compareCommits: async (repo, base, head) => {
      assert.equal(repo, SOURCE, "ancestry is read on the source only");
      if (!s.ancestors.includes(base))
        throw Object.assign(new Error("Not Found"), { status: 404 });
      const [b, h] = [s.ancestors.indexOf(base), s.ancestors.indexOf(head)];
      return { status: h > b ? "ahead" : h === b ? "identical" : "behind" };
    },
  };
  github.copy = async (input) => {
    github.copies.push(input);
    s.heads[MIRROR] = input.sha;
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

test("a divergence gives one row across three ticks and no write", async (t) => {
  const { store } = fixture(t),
    github = fake({
      heads: { [SOURCE]: "s2", [MIRROR]: "m9" },
    });
  const notices = [];
  for (let i = 0; i < 3; i++)
    notices.push(...(await run(store, github)).notify);
  assert.deepEqual(github.copies, []);
  assert.equal(notices.length, 1);
  const rows = mirrorNeedsYou(store);
  assert.equal(rows.length, 1);
  assert.match(rows[0].detail, /s2/);
  assert.match(rows[0].detail, /m9/);
});

test("a mirror ahead of the source is a divergence too", async (t) => {
  const { store } = fixture(t),
    github = fake({ heads: { [SOURCE]: "s1", [MIRROR]: "s2" } });
  await run(store, github);
  assert.deepEqual(github.copies, []);
  assert.equal(mirrorNeedsYou(store).length, 1);
});

test("the row clears when a person fixes the mirror, and syncing resumes", async (t) => {
  const { store } = fixture(t),
    github = fake({ heads: { [SOURCE]: "s2", [MIRROR]: "m9" } });
  await run(store, github);
  assert.equal(mirrorNeedsYou(store).length, 1);
  github.s.heads[MIRROR] = "s1";
  await run(store, github);
  assert.deepEqual(mirrorNeedsYou(store), []);
  assert.equal(github.copies.length, 1);
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
