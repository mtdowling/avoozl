// Stacking with the cut rule (lt-3.2), real git.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  addLandingWorktree,
  removeLandingWorktree,
  stackMembers,
} from "../integrator-stack.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function repo(t) {
  const root = temporaryDirectory("avoozl-stack-");
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Landing");
  git(root, "config", "user.email", "landing@example.com");
  fs.writeFileSync(path.join(root, "base.txt"), "base\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "Base");
  const commit = (
    file,
    text,
    message,
    author = "Writer <writer@example.com>",
  ) => {
    fs.writeFileSync(path.join(root, file), text);
    git(root, "add", ".");
    git(root, "commit", "-q", "--author", author, "-m", message);
    return git(root, "rev-parse", "HEAD");
  };
  // A branch from `from`: returns its commits' heads and leaves main checked out.
  const branch = (name, from, steps) => {
    git(root, "checkout", "-q", "-b", name, from);
    for (const [file, text, message, author] of steps)
      commit(file, text, message, author);
    const head = git(root, "rev-parse", "HEAD");
    git(root, "checkout", "-q", "main");
    return head;
  };
  const entry = (key, head, fork, state = "queued") => ({
    key,
    commit: head,
    forkPoint: fork,
    state,
    tasks: [{ task: key, definition: "d".repeat(64) }],
  });
  return {
    root,
    commit,
    branch,
    entry,
    base: git(root, "rev-parse", "main"),
    t,
  };
}

async function stack(r, trunk, members, others = members) {
  const dir = await addLandingWorktree(r.root, trunk);
  try {
    const result = await stackMembers({
      root: r.root,
      dir,
      baseHead: trunk,
      members,
      others,
    });
    return {
      ...result,
      log: git(dir, "log", "--format=%an|%s", `${trunk}..HEAD`)
        .split("\n")
        .filter(Boolean),
      trailers: git(
        dir,
        "log",
        "--format=%(trailers:key=Avoozl-Task,valueonly)",
        `${trunk}..HEAD`,
      )
        .split("\n")
        .filter(Boolean),
    };
  } finally {
    await removeLandingWorktree(r.root, dir);
  }
}

test("B built on A, both queued: A's commits appear once, in order, with trailers and authors", async (t) => {
  const r = repo(t),
    a = r.branch("a", r.base, [
      ["a1.txt", "1\n", "A one"],
      ["a2.txt", "2\n", "A two", "Ann <ann@example.com>"],
    ]),
    b = r.branch("b", a, [["b1.txt", "1\n", "B one"]]),
    A = r.entry("a", a, r.base),
    B = r.entry("b", b, r.base);
  const result = await stack(r, r.base, [A, B]);
  assert.deepEqual(
    result.members.map((m) => [m.key, m.state]),
    [
      ["a", "stacked"],
      ["b", "stacked"],
    ],
  );
  assert.deepEqual(result.log.reverse(), [
    "Writer|A one",
    "Ann|A two",
    "Writer|B one",
  ]);
  assert.equal(result.members[1].from, a, "B's range starts at A's head");
  assert.equal(result.trailers.length, 3);
  assert.ok(
    result.trailers.every(
      (v) => /^(a|b)@d{64}$/.test(v) || /^(a|b)@d+$/.test(v),
    ),
  );
  assert.notEqual(result.members[0].boundary, result.members[1].boundary);
  assert.equal(result.stack, result.members[1].boundary);
});

test("B built on A where A landed yesterday: only B's commits are stacked", async (t) => {
  const r = repo(t),
    a = r.branch("a", r.base, [["a1.txt", "1\n", "A one"]]),
    b = r.branch("b", a, [["b1.txt", "1\n", "B one"]]);
  // A landed as a rebased copy: a new commit with the same change.
  git(r.root, "cherry-pick", a);
  const trunk = git(r.root, "rev-parse", "HEAD");
  const result = await stack(
    r,
    trunk,
    [r.entry("b", b, r.base)],
    [r.entry("a", a, r.base, "landed"), r.entry("b", b, r.base)],
  );
  assert.deepEqual(result.log, ["Writer|B one"]);
  assert.equal(result.members[0].from, a);
});

test("B built on A where A is queued outside the train: B is held naming A", async (t) => {
  const r = repo(t),
    a = r.branch("a", r.base, [["a1.txt", "1\n", "A one"]]),
    b = r.branch("b", a, [["b1.txt", "1\n", "B one"]]),
    B = r.entry("b", b, r.base);
  const result = await stack(r, r.base, [B], [r.entry("a", a, r.base), B]);
  assert.equal(result.members[0].state, "held");
  assert.match(
    result.members[0].holdReason,
    /built on a, which is queued outside this train/,
  );
  assert.deepEqual(result.log, []);
  assert.equal(result.stack, r.base);
});

test("a branch whose commits are all in the trunk is closed as contained", async (t) => {
  const r = repo(t),
    a = r.branch("a", r.base, [["a1.txt", "1\n", "A one"]]);
  git(r.root, "cherry-pick", a);
  const trunk = git(r.root, "rev-parse", "HEAD"),
    c = r.branch("c", r.base, [["c1.txt", "1\n", "C one"]]),
    result = await stack(r, trunk, [
      r.entry("a", a, r.base),
      r.entry("c", c, r.base),
    ]);
  assert.deepEqual(
    result.members.map((m) => [m.key, m.state]),
    [
      ["a", "contained"],
      ["c", "stacked"],
    ],
  );
  assert.deepEqual(result.log, ["Writer|C one"]);
});

test("merge commits in a member are dropped and the landing worktree is removed", async (t) => {
  const r = repo(t),
    a = r.branch("a", r.base, [["a1.txt", "1\n", "A one"]]);
  // Main moves, then the branch merges it in, then adds a commit.
  r.commit("main.txt", "m\n", "Main moves");
  const trunk = git(r.root, "rev-parse", "HEAD");
  git(r.root, "checkout", "-q", "a");
  git(r.root, "merge", "-q", "--no-ff", "-m", "Merge main", "main");
  fs.writeFileSync(path.join(r.root, "a2.txt"), "2\n");
  git(r.root, "add", ".");
  git(r.root, "commit", "-qm", "A two");
  const head = git(r.root, "rev-parse", "HEAD");
  git(r.root, "checkout", "-q", "main");
  const fork = git(r.root, "merge-base", head, trunk);
  assert.equal(fork, trunk);
  const result = await stack(r, trunk, [r.entry("a", head, fork)]);
  assert.deepEqual(result.log.reverse(), ["Writer|A one", "Landing|A two"]);
  assert.equal(result.members[0].state, "stacked");
  assert.deepEqual(git(r.root, "worktree", "list").split("\n").length, 1);
});

test("a semantic conflict drops that member and stacking goes on", async (t) => {
  const r = repo(t);
  fs.writeFileSync(path.join(r.root, "shared.txt"), "one\ntwo\nthree\n");
  git(r.root, "add", ".");
  git(r.root, "commit", "-qm", "Shared");
  const base = git(r.root, "rev-parse", "HEAD"),
    a = r.branch("a", base, [["shared.txt", "one\nTWO-A\nthree\n", "A edits"]]),
    b = r.branch("b", base, [["shared.txt", "one\nTWO-B\nthree\n", "B edits"]]),
    c = r.branch("c", base, [["c.txt", "c\n", "C adds"]]),
    result = await stack(r, base, [
      r.entry("a", a, base),
      r.entry("b", b, base),
      r.entry("c", c, base),
    ]);
  assert.deepEqual(
    result.members.map((m) => [m.key, m.state]),
    [
      ["a", "stacked"],
      ["b", "conflict"],
      ["c", "stacked"],
    ],
  );
  assert.deepEqual(result.members[1].files, ["shared.txt"]);
  assert.deepEqual(result.members[1].against, {
    commit: result.members[0].boundary,
    key: "a",
  });
  assert.deepEqual(result.log.reverse(), ["Writer|A edits", "Writer|C adds"]);
});

test("a branch whose writer merged the trunk and settled a conflict stacks as one net commit", async (t) => {
  const r = repo(t);
  fs.writeFileSync(path.join(r.root, "s.txt"), "one\ntwo\nthree\n");
  git(r.root, "add", ".");
  git(r.root, "commit", "-qm", "Shared");
  const fork = git(r.root, "rev-parse", "HEAD");
  // The trunk edits line two; the branch edits it too, then merges the trunk
  // and settles the conflict by hand.
  git(r.root, "checkout", "-q", "-b", "b", fork);
  fs.writeFileSync(path.join(r.root, "s.txt"), "one\nB\nthree\n");
  git(r.root, "commit", "-qam", "B edits");
  git(r.root, "checkout", "-q", "main");
  fs.writeFileSync(path.join(r.root, "s.txt"), "one\nTRUNK\nthree\n");
  git(r.root, "commit", "-qam", "Trunk edits");
  const trunk = git(r.root, "rev-parse", "HEAD");
  git(r.root, "checkout", "-q", "b");
  try {
    git(r.root, "merge", "main");
  } catch {}
  fs.writeFileSync(path.join(r.root, "s.txt"), "one\nB+TRUNK\nthree\n");
  git(r.root, "add", ".");
  git(r.root, "commit", "-qm", "Merge main");
  const head = git(r.root, "rev-parse", "HEAD");
  git(r.root, "checkout", "-q", "main");
  const entry = r.entry("b", head, git(r.root, "merge-base", head, trunk));
  const out = await stack(r, trunk, [entry]);
  assert.equal(out.members[0].state, "stacked");
  assert.equal(out.log.length, 1);
  assert.match(out.trailers[0], /^b@/);
});
