// task.files and task.diff (design §8.10): what a task's branch changed, one
// file's diff, and the rules that keep a read inside the task's worktree and
// keep its arguments from reaching Git as options or pathspec magic.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { handleMcp } from "../mcp.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { DIFF_BYTES } from "../task-files.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "app",
  ...extra,
});

// A checkout with four files on main, and task a's worktree with one file
// added, one changed, one deleted, one renamed, and one untracked.
async function setup(t, project = {}) {
  const root = temporaryDirectory("avoozl-task-files-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  git(checkout, "config", "core.autocrlf", "false");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  fs.writeFileSync(path.join(checkout, "keep.txt"), "one\ntwo\n");
  fs.writeFileSync(path.join(checkout, "gone.txt"), "bye\n");
  fs.writeFileSync(
    path.join(checkout, "old.txt"),
    "moved text\nline two\nline three\n",
  );
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: [leaf("a"), leaf("b")],
    edges: [],
  });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    repository: "octo/app",
    ...project,
  });
  const ops = new Operations(store, { workspaceRoot: root });
  const { path: worktree } = await ops.execute("worktree.prepare", {
    taskId: "a",
  });
  fs.writeFileSync(path.join(worktree, "new.txt"), "fresh\n");
  fs.writeFileSync(path.join(worktree, "keep.txt"), "one\nTWO\nthree\n");
  fs.rmSync(path.join(worktree, "gone.txt"));
  git(worktree, "mv", "old.txt", "moved.txt");
  fs.writeFileSync(path.join(worktree, "bin.dat"), Buffer.from([0, 1, 2, 3]));
  git(worktree, "add", "-A");
  git(worktree, "commit", "-m", "Work");
  fs.writeFileSync(path.join(worktree, "draft.md"), "# Draft\nnot added\n");
  return {
    root,
    checkout: fs.realpathSync.native(checkout),
    store,
    ops,
    worktree,
  };
}

test("task.files lists what the branch changed, with badges, counts and the whole tree on request", async (t) => {
  // Nearby inputs: a rename, a deletion, a binary, an untracked file, all,
  // and a task with no worktree or branch.
  const { ops, worktree } = await setup(t);
  const view = await ops.execute("task.files", { taskId: "a" });
  assert.equal(view.mode, "worktree");
  assert.equal(view.worktree, fs.realpathSync.native(worktree));
  assert.equal(view.branch, "avoozl/a");
  assert.equal(view.remote, false);
  assert.equal(view.github, "https://github.com/octo/app/tree/avoozl/a");
  const byPath = Object.fromEntries(view.files.map((f) => [f.path, f]));
  assert.deepEqual(Object.keys(byPath).sort(), [
    "bin.dat",
    "draft.md",
    "gone.txt",
    "keep.txt",
    "moved.txt",
    "new.txt",
  ]);
  assert.equal(byPath["new.txt"].status, "added");
  assert.equal(byPath["gone.txt"].status, "deleted");
  assert.equal(byPath["moved.txt"].status, "renamed");
  assert.equal(byPath["moved.txt"].from, "old.txt");
  assert.deepEqual(
    [
      byPath["keep.txt"].status,
      byPath["keep.txt"].additions,
      byPath["keep.txt"].deletions,
    ],
    ["modified", 2, 1],
  );
  assert.equal(byPath["bin.dat"].binary, true);
  assert.equal(byPath["draft.md"].untracked, true);
  assert.equal(view.totals.files, 6);
  assert.equal(view.all, null);

  const all = await ops.execute("task.files", { taskId: "a", all: true });
  assert.deepEqual(all.all.paths.sort(), [
    "README.md",
    "bin.dat",
    "keep.txt",
    "moved.txt",
    "new.txt",
  ]);

  const none = await ops.execute("task.files", { taskId: "b" });
  assert.equal(none.mode, "none");
  assert.deepEqual(none.files, []);
  assert.equal(none.github, "https://github.com/octo/app/tree/avoozl/b");
});

test("task.diff gives one file's unified diff and summarizes binaries, untracked and large files", async (t) => {
  const { ops, worktree } = await setup(t);
  const kept = await ops.execute("task.diff", {
    taskId: "a",
    path: "keep.txt",
  });
  assert.equal(kept.status, "modified");
  assert.match(kept.diff, /^-two$/m);
  assert.match(kept.diff, /^\+TWO$/m);
  const moved = await ops.execute("task.diff", {
    taskId: "a",
    path: "moved.txt",
  });
  assert.equal(moved.from, "old.txt");
  assert.match(moved.diff, /rename from old\.txt/);
  const binary = await ops.execute("task.diff", {
    taskId: "a",
    path: "bin.dat",
  });
  assert.deepEqual([binary.binary, binary.diff], [true, ""]);
  const draft = await ops.execute("task.diff", {
    taskId: "a",
    path: "draft.md",
  });
  assert.match(draft.diff, /^\+# Draft$/m);
  const same = await ops.execute("task.diff", {
    taskId: "a",
    path: "README.md",
  });
  assert.deepEqual([same.status, same.diff], ["unchanged", ""]);

  fs.writeFileSync(path.join(worktree, "keep.txt"), "x\n".repeat(DIFF_BYTES));
  const large = await ops.execute("task.diff", {
    taskId: "a",
    path: "keep.txt",
  });
  assert.deepEqual([large.tooLarge, large.diff], [true, ""]);
});

test("task.diff refuses a path outside the task's worktree", async (t) => {
  // Nearby inputs: parent steps, absolute POSIX and Windows paths, a
  // backslash, `.` parts, an empty part, NUL, the Git directory, a file
  // outside, and an untracked link that points out of the worktree.
  const { ops, root, worktree } = await setup(t);
  const secret = path.join(root, "secret.txt");
  fs.writeFileSync(secret, "do not read\n");
  for (const bad of [
    "../secret.txt",
    "a/../../secret.txt",
    secret,
    "/etc/passwd",
    "C:/Windows/win.ini",
    "C:secret",
    "..\\secret.txt",
    "./keep.txt",
    "a//b",
    "x\0y",
    "",
    7,
  ])
    await assert.rejects(
      ops.execute("task.diff", { taskId: "a", path: bad }),
      (error) => error.status === 400,
      JSON.stringify(bad),
    );
  for (const unlisted of [".git", ".git/config", "nothing.txt"])
    await assert.rejects(
      ops.execute("task.diff", { taskId: "a", path: unlisted }),
      (error) => error.status === 404,
      unlisted,
    );

  let linked = true;
  try {
    fs.symlinkSync(secret, path.join(worktree, "out.txt"));
  } catch {
    linked = false; // Windows without the symlink privilege.
  }
  if (linked) {
    const out = await ops.execute("task.diff", {
      taskId: "a",
      path: "out.txt",
    });
    assert.equal(out.link, true);
    assert.doesNotMatch(JSON.stringify(out), /do not read/);
  }
});

test("task.files and task.diff pass no argument to Git as an option or pathspec", async (t) => {
  // Nearby inputs: an option-shaped path, pathspec magic, a glob, and an
  // option-shaped base branch from configuration.
  const { ops, root, store } = await setup(t);
  // Set after the worktree exists: worktree.prepare is not under test here.
  store.put("projects", {
    ...store.get("projects", "app"),
    baseBranch: "--output=PWNED",
  });
  const marker = path.join(root, "pwned.txt");
  for (const bad of [
    "--output=" + marker,
    "-p",
    ":(glob)**",
    ":/",
    "*.txt",
    "keep.tx?",
  ])
    await assert.rejects(
      ops.execute("task.diff", { taskId: "a", path: bad }),
      (error) => [400, 404].includes(error.status),
      bad,
    );
  assert.equal(fs.existsSync(marker), false);
  // The bad base is never passed; the branch's own head is the base.
  const view = await ops.execute("task.files", { taskId: "a" });
  assert.equal(view.base, view.head);
  assert.equal(fs.existsSync(path.join(root, "PWNED")), false);
  for (const dir of [root, path.join(root, "app")])
    assert.ok(!fs.readdirSync(dir).includes("PWNED"));
});

test("files whose names read as options or pathspec magic are diffed as names", async (t) => {
  // Nearby inputs: an untracked and a committed `--output=` name, `-p`, and
  // a `:(glob)` name (skipped where the file system refuses ':').
  const { ops, root, worktree } = await setup(t);
  const names = ["--output=out.txt", "-p", ":(glob)*"].filter((name) => {
    try {
      fs.writeFileSync(path.join(worktree, name), "tricky\n");
      return true;
    } catch {
      return false;
    }
  });
  const check = async (when) => {
    for (const name of names) {
      const diff = await ops.execute("task.diff", { taskId: "a", path: name });
      assert.match(diff.diff, /^\+tricky$/m, `${when} ${name}`);
      assert.doesNotMatch(
        diff.diff,
        /keep\.txt|new\.txt|moved\.txt/,
        `${when} ${name}`,
      );
    }
  };
  await check("untracked");
  git(worktree, "add", "-A");
  git(worktree, "commit", "-m", "Tricky names");
  await check("committed");
  for (const dir of [root, worktree, process.cwd()])
    assert.ok(
      !fs.readdirSync(dir).includes("out.txt"),
      "a path ran as --output",
    );
});

test("a removed worktree reads the task's branch, and MCP may call both reads", async (t) => {
  const { ops, checkout, worktree } = await setup(t);
  git(checkout, "worktree", "remove", "--force", worktree);
  const view = await ops.execute("task.files", { taskId: "a" });
  assert.equal(view.mode, "branch");
  assert.equal(view.worktree, null);
  assert.ok(view.files.some((f) => f.path === "new.txt"));
  assert.ok(
    !view.files.some((f) => f.path === "draft.md"),
    "untracked work went with the worktree",
  );
  const call = (action, input) =>
    handleMcp(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "plans_task", arguments: { action, input } },
      },
      ops,
    ).then((r) => r.body.result);
  const files = await call("files", { taskId: "a" });
  assert.equal(files.isError, undefined, files.content?.[0]?.text);
  const diff = await call("diff", { taskId: "a", path: "new.txt" });
  assert.equal(diff.isError, undefined, diff.content?.[0]?.text);
  assert.match(diff.structuredContent.diff, /^\+fresh$/m);
});
