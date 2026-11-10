import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fixture } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";
import { RunManager } from "../manager.mjs";
import { git } from "../git.mjs";

test("a conversation's changes are readable, bounded, and never alter the worktree", async (t) => {
  const { store, root } = fixture(t),
    repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "Fixture"]);
  await git(repo, ["config", "user.email", "fixture@example.invalid"]);
  fs.writeFileSync(path.join(repo, "app.mjs"), "export const value = 1;\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Start"]);
  const manager = new RunManager(store, {
    recover: false,
    factories: {
      codex: ({ emit }) => ({
        async start(options) {
          if (options.catalogOnly) return [];
          emit("session", { providerSessionId: "thread" });
        },
        async close() {},
      }),
    },
  });
  t.after(() => manager.close());
  const ops = new Operations(store, { manager });
  await ops.execute("project.configure", {
    id: "fixture",
    root: repo,
    checks: [[process.execPath, "--version"]],
  });
  const run = await ops.execute("run.start", {
    id: "run-changes",
    taskId: "sample-task",
    provider: "codex",
    projectId: "fixture",
    mode: "implement",
    prompt: "Change the value",
  });
  // One committed change and one uncommitted change, as a real run leaves.
  fs.writeFileSync(
    path.join(run.worktree, "app.mjs"),
    "export const value = 2;\n",
  );
  await git(run.worktree, ["add", "."]);
  await git(run.worktree, ["commit", "-m", "Change the value"]);
  fs.writeFileSync(path.join(run.worktree, "notes.md"), "Work in progress\n");
  const before = await git(run.worktree, ["rev-parse", "HEAD"]);

  const changes = await ops.execute("run.changes", { id: run.id });
  assert.equal(changes.branch, run.branch);
  assert.deepEqual(
    changes.files.map((file) => file.path),
    ["app.mjs"],
  );
  assert.equal(changes.files[0].additions, 1);
  assert.equal(changes.files[0].deletions, 1);
  assert.deepEqual(
    changes.uncommitted.map((file) => file.path),
    ["notes.md"],
  );
  assert.equal(changes.truncated, false);

  // The base revision is readable so a client can show a real diff.
  const file = await ops.execute("run.changes", {
    id: run.id,
    path: "app.mjs",
  });
  assert.equal(file.before, "export const value = 1;");

  // Reading changes must not touch the worktree.
  assert.equal(await git(run.worktree, ["rev-parse", "HEAD"]), before);
  assert.match(await git(run.worktree, ["status", "--porcelain"]), /notes\.md/);

  await assert.rejects(
    ops.execute("run.changes", { id: run.id, path: "../escape" }),
    /repository-relative/,
  );
  store.put("runs", { ...store.get("runs", run.id), readOnly: true });
  await assert.rejects(
    ops.execute("run.changes", { id: run.id }),
    /no worktree of its own/,
  );
});
