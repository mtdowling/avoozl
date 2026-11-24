// integration.foreign: a branch named for a spec
// may hold merges of the default branch and landings of the spec's tasks,
// and nothing else. Real git with a bare origin.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { foreignCommits } from "../integration-lint.ts";
import { specCheckout } from "../../test/spec-checkout.ts";
import { temporaryDirectory } from "../../test/temporary.ts";

const lint = (root: string, extra = {}) =>
  foreignCommits(root, {
    spec: "parser",
    taskIds: ["p-1", "p-2"],
    defaultBranch: "main",
    ...extra,
  });

test("lint flags a same-name branch holding work that is not the spec's, and passes the spec's own", async () => {
  const origin = temporaryDirectory("avoozl-foreign-origin-");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  const { root, run } = specCheckout("avoozl-foreign-");
  const commit = (file: string, message: string, text = message) => {
    fs.writeFileSync(path.join(root, file), text);
    run(["add", file]);
    run(["commit", "-q", "-m", message]);
  };
  commit("a.txt", "Start");
  run(["remote", "add", "origin", origin]);
  run(["push", "-q", "origin", "main"]);
  // Without the branch on origin there is nothing to check.
  run(["fetch", "-q", "origin"]);
  assert.deepEqual(await lint(root), []);
  run(["checkout", "-q", "-b", "parser"]);
  run(["push", "-q", "origin", "parser"]);
  run(["fetch", "-q", "origin"]);
  assert.deepEqual(await lint(root), [], "no commit beyond main");
  // A landing ticks the spec's task, then a merge of main: both the spec's.
  commit("tasks.md", "Land p-1", "- [x] `p-1` Parse\n");
  run(["checkout", "-q", "main"]);
  commit("c.txt", "Main moves");
  run(["push", "-q", "origin", "main"]);
  run(["checkout", "-q", "parser"]);
  run(["merge", "-q", "--no-ff", "-m", "Merge main into parser", "main"]);
  run(["push", "-q", "origin", "parser"]);
  run(["fetch", "-q", "origin"]);
  assert.deepEqual(await lint(root), []);
  // A commit that is neither.
  commit("d.txt", "Someone's experiment");
  run(["push", "-q", "origin", "parser"]);
  run(["fetch", "-q", "origin"]);
  const found = await lint(root);
  assert.deepEqual(
    found.map((entry) => entry.subject),
    ["Someone's experiment"],
  );
  // With other task IDs the landing is foreign too.
  assert.equal((await lint(root, { taskIds: ["x-9"] })).length, 2);
});

test("lint skips the check without an origin", async () => {
  const { root, run } = specCheckout("avoozl-foreign-none-");
  fs.writeFileSync(path.join(root, "a.txt"), "a");
  run(["add", "a.txt"]);
  run(["commit", "-q", "-m", "Start"]);
  run(["branch", "parser"]);
  assert.deepEqual(await lint(root), []);
});
