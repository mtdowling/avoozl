// Host-side git and file reads after any session (vm-harness vm-2.6, D6):
// a task folder's `.git` file, hooks, fsmonitor and links written by a
// worker change nothing on the host.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { commitWorkerChanges, worktreeChanges } from "../git.mjs";
import { taskGit } from "../task-git.mjs";
import {
  readChildOutput,
  readChildResult,
} from "../../executors/supervisor.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
import { gitCheckout } from "../../test/delivery-fixture.mjs";

const gitIn = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function checkoutWithTask() {
  const root = fs.realpathSync.native(temporaryDirectory("avoozl-task-git-")),
    checkout = path.join(root, "checkout"),
    folder = path.join(root, "task");
  gitCheckout(checkout);
  gitIn(checkout, "worktree", "add", "-q", "-b", "task", folder);
  return { root, checkout, folder };
}

test("a .git file moved to a planted git directory is refused, and its fsmonitor never runs", async () => {
  const { root, checkout, folder } = checkoutWithTask(),
    marker = path.join(root, "fsmonitor-ran"),
    planted = path.join(folder, "planted");
  // The worker plants a git directory whose config runs a program, then
  // points the folder's .git file at it.
  gitIn(root, "init", "-q", "--bare", planted);
  fs.writeFileSync(
    path.join(planted, "config"),
    `[core]\n\tbare = false\n\tfsmonitor = "touch ${marker}; false"\n`,
  );
  fs.writeFileSync(path.join(folder, ".git"), `gitdir: ${planted}\n`);
  fs.writeFileSync(path.join(folder, "work.txt"), "x\n");
  await assert.rejects(
    commitWorkerChanges(folder, "Work", { checkout }),
    /no longer names the git directory Avoozl made it with/,
  );
  await assert.rejects(
    worktreeChanges(folder, checkout),
    /no longer names the git directory/,
  );
  assert.equal(fs.existsSync(marker), false, "the fsmonitor never ran");
  // A gitdir that names another worktree of the same checkout is refused
  // too: it must point back at this folder.
  const other = path.join(root, "other");
  gitIn(checkout, "worktree", "add", "-q", "-b", "other", other);
  fs.writeFileSync(
    path.join(folder, ".git"),
    fs.readFileSync(path.join(other, ".git"), "utf8"),
  );
  await assert.rejects(
    taskGit(folder, ["status"], { checkout }),
    /no longer names/,
  );
  // A .git that is a link or a folder of the worker's own is refused.
  fs.rmSync(path.join(folder, ".git"));
  fs.symlinkSync(path.join(other, ".git"), path.join(folder, ".git"));
  await assert.rejects(
    taskGit(folder, ["status"], { checkout }),
    /not a regular file/,
  );
});

test("a hook in the git directory and core.fsmonitor in its config do not run on Avoozl's commit", async () => {
  const { root, checkout, folder } = checkoutWithTask(),
    hookRan = path.join(root, "hook-ran"),
    monitorRan = path.join(root, "monitor-ran"),
    hooks = path.join(checkout, ".git", "hooks");
  for (const name of ["pre-commit", "post-commit", "commit-msg"]) {
    fs.writeFileSync(
      path.join(hooks, name),
      `#!/bin/sh\ntouch ${hookRan}\nexit 1\n`,
    );
    fs.chmodSync(path.join(hooks, name), 0o755);
  }
  gitIn(checkout, "config", "core.fsmonitor", `touch ${monitorRan}; false`);
  fs.writeFileSync(path.join(folder, "work.txt"), "x\n");
  const commit = await commitWorkerChanges(folder, "Work", { checkout });
  assert.match(commit, /^[0-9a-f]{40}$/);
  assert.equal(fs.existsSync(hookRan), false, "no hook ran");
  assert.equal(fs.existsSync(monitorRan), false, "no fsmonitor ran");
  assert.equal(gitIn(folder, "log", "-1", "--format=%s"), "Work");
});

test("a commit that adds a link pointing outside the folder is refused", async () => {
  const { root, checkout, folder } = checkoutWithTask();
  fs.writeFileSync(path.join(root, "secret.txt"), "s\n");
  fs.symlinkSync(path.join(root, "secret.txt"), path.join(folder, "leak"));
  await assert.rejects(
    commitWorkerChanges(folder, "Work", { checkout }),
    /adds leak, a link to .* outside the task folder/,
  );
  fs.rmSync(path.join(folder, "leak"));
  // A link inside the folder is an ordinary change.
  fs.symlinkSync("README.md", path.join(folder, "readme-link"));
  assert.ok(await commitWorkerChanges(folder, "Link", { checkout }));
});

test("a result or output file that is a link, or under a linked folder, is refused and its target is not read", () => {
  const folder = temporaryDirectory("avoozl-task-result-"),
    outside = temporaryDirectory("avoozl-task-outside-");
  fs.writeFileSync(
    path.join(outside, "result.json"),
    JSON.stringify({ state: "done", text: "from outside" }),
  );
  fs.mkdirSync(path.join(folder, ".avoozl"));
  fs.symlinkSync(
    path.join(outside, "result.json"),
    path.join(folder, ".avoozl", "result.json"),
  );
  assert.match(readChildResult(folder).problem, /symbolic link/);
  // The folder itself linked elsewhere.
  fs.rmSync(path.join(folder, ".avoozl"), { recursive: true });
  fs.symlinkSync(outside, path.join(folder, ".avoozl"));
  assert.match(readChildResult(folder).problem, /\.avoozl is a symbolic link/);
  fs.rmSync(path.join(folder, ".avoozl"));
  fs.mkdirSync(path.join(folder, ".avoozl"));
  fs.symlinkSync(outside, path.join(folder, ".avoozl", "output"));
  fs.writeFileSync(path.join(outside, "answer.md"), "known_hosts");
  assert.match(
    readChildOutput(folder, "answer.md", { limit: 1000 }).problem,
    /output is a symbolic link/,
  );
  // A plain file still reads.
  fs.writeFileSync(
    path.join(folder, ".avoozl", "result.json"),
    JSON.stringify({ state: "done", text: "ok" }),
  );
  assert.deepEqual(readChildResult(folder), { state: "done", text: "ok" });
});

test("every git call on a task folder in src/app goes through taskGit", () => {
  const app = fileURLToPath(new URL("../../", import.meta.url));
  // A bare git call whose folder is a task folder by its name.
  const bare =
    /\bgit\(\s*(?:run\.|entry\.|current\.|record\.|binding\.)?worktree(?:\.path)?\s*,/;
  // shortcut: matched by the variable's name; a task folder held under
  // another name is not found. The content rules' push hook reads the
  // folder's git directory with rev-parse and writes its worktree config,
  // which runs no program the folder names.
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "test") walk(file);
      } else if (entry.name.endsWith(".mjs"))
        fs.readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, index) => {
            if (bare.test(line))
              found.push(`${path.relative(app, file)}:${index + 1}`);
          });
    }
  };
  walk(app);
  assert.deepEqual(found, []);
});
