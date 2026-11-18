// The integrator resolver chat (lt-11.1) with a fake executor and real git.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { mechanicalResolver } from "../integrator-conflicts.mjs";
import { integratorChat } from "../integrator-resolver.mjs";
import {
  addLandingWorktree,
  removeLandingWorktree,
  stackMembers,
} from "../integrator-stack.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const node = (code, ...rest) => [process.execPath, "-e", code, ...rest];

function repo(files) {
  const root = temporaryDirectory("avoozl-resolver-");
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Landing");
  git(root, "config", "user.email", "landing@example.com");
  for (const [f, text] of Object.entries(files))
    fs.writeFileSync(path.join(root, f), text);
  git(root, "add", ".");
  git(root, "commit", "-qm", "Base");
  const base = git(root, "rev-parse", "HEAD"),
    branch = (name, file, text) => {
      git(root, "checkout", "-q", "-b", name, base);
      fs.writeFileSync(path.join(root, file), text);
      git(root, "add", ".");
      git(root, "commit", "-qm", `Edit ${file}`);
      const head = git(root, "rev-parse", "HEAD");
      git(root, "checkout", "-q", "main");
      return head;
    },
    entry = (key, head) => ({
      key,
      id: `app\0main\0${key}`,
      base: "main",
      commit: head,
      forkPoint: base,
      state: "queued",
      tasks: [{ task: key, definition: "d".repeat(64) }],
    });
  return { root, base, branch, entry };
}

// The rule fails by itself (its command exits 1), so only a chat can settle
// the file; `verify` wants both sides' lines.
const RULE = {
  paths: ["s.txt"],
  strategy: "regenerate",
  command: node("process.exit(1)"),
  verify: node(
    "const t=require('fs').readFileSync(process.argv[1],'utf8');process.exit(/A/.test(t)&&/B/.test(t)&&!/<<<<<<</.test(t)?0:1)",
    "{file}",
  ),
};

function fakeExecutor(edit) {
  const calls = [];
  return {
    calls,
    async start(role, task, worktree, brief, model, permission) {
      calls.push({ role, task, worktree, brief, permission });
      edit?.(worktree);
      return "session-1";
    },
    async status() {
      return "exited 0";
    },
  };
}

async function stack(t, files, edit, { rules = [RULE] } = {}) {
  const { store } = fixture(t),
    r = repo(files),
    a = r.branch("a", "s.txt", "one\nA\nthree\n"),
    b = r.branch("b", "s.txt", "one\nB\nthree\n"),
    executor = fakeExecutor(edit),
    dir = await addLandingWorktree(r.root, r.base);
  try {
    const out = await stackMembers({
      root: r.root,
      dir,
      baseHead: r.base,
      members: [r.entry("a", a), r.entry("b", b)],
      others: [],
      resolve: mechanicalResolver({
        rules,
        chat: integratorChat({ executor, store }),
      }),
    });
    return {
      out,
      executor,
      dir,
      text: fs.readFileSync(path.join(dir, "s.txt"), "utf8"),
    };
  } finally {
    await removeLandingWorktree(r.root, dir);
  }
}

test("the chat is opened for a covered file whose rule failed, and a verified edit is staged", async (t) => {
  const got = await stack(t, { "s.txt": "one\ntwo\nthree\n" }, (dir) =>
    fs.writeFileSync(path.join(dir, "s.txt"), "one\nA\nB\nthree\n"),
  );
  assert.deepEqual(
    got.out.members.map((m) => m.state),
    ["stacked", "stacked"],
  );
  assert.equal(got.executor.calls.length, 1);
  const [call] = got.executor.calls;
  assert.equal(call.role, "integrator");
  assert.equal(call.permission, "write");
  assert.equal(call.worktree, got.dir);
  assert.match(call.brief, /s\.txt/);
  assert.doesNotMatch(call.brief, /push|pull request|comment/i);
  assert.match(got.text, /A\nB/);
});

test("an edit that fails verify is not staged and the conflict returns to the later task", async (t) => {
  const got = await stack(t, { "s.txt": "one\ntwo\nthree\n" }, (dir) =>
    fs.writeFileSync(path.join(dir, "s.txt"), "one\nA\nthree\n"),
  );
  assert.deepEqual(
    got.out.members.map((m) => m.state),
    ["stacked", "conflict"],
  );
  assert.deepEqual(got.out.members[1].files, ["s.txt"]);
});

test("an edit that leaves conflict markers is refused", async (t) => {
  const got = await stack(t, { "s.txt": "one\ntwo\nthree\n" }, (dir) =>
    fs.writeFileSync(path.join(dir, "s.txt"), "A B\n<<<<<<< x\n"),
  );
  assert.equal(got.out.members[1].state, "conflict");
});

test("a file no rule covers is never offered to the chat", async (t) => {
  const got = await stack(
    t,
    { "s.txt": "one\ntwo\nthree\n" },
    (dir) => fs.writeFileSync(path.join(dir, "s.txt"), "A B\n"),
    { rules: [{ paths: ["other.txt"], strategy: "union" }] },
  );
  assert.equal(got.executor.calls.length, 0);
  assert.equal(got.out.members[1].state, "conflict");
});
