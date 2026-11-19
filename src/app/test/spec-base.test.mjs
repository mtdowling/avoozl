// Task 41.5: Prepare and qualified-ref resolution agree on the spec base,
// and a landed base merges back into the working branch.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { mergeBaseBack } from "../spec-base.mjs";
import { checkpointBranch, workingBranch } from "../working-heads.mjs";

import { temporaryDirectory } from "./temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function repo() {
  const root = temporaryDirectory("avoozl-spec-base-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-q", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-q", "-m", "Start");
  return { root, checkout: fs.realpathSync.native(checkout) };
}

// A commit on a new branch from `from`, writing `files`.
function commitOn(checkout, branch, from, files) {
  git(checkout, "checkout", "-q", "-B", branch, from);
  for (const [file, text] of Object.entries(files))
    fs.writeFileSync(path.join(checkout, file), text);
  git(checkout, "add", ".");
  git(checkout, "commit", "-q", "-m", `Work on ${branch}`);
  const commit = git(checkout, "rev-parse", "HEAD");
  git(checkout, "checkout", "-q", "main");
  return commit;
}

test("a landed base merges back with a merge commit, keeping unlanded work and checkpoints", async () => {
  const { checkout } = repo(),
    branch = workingBranch("reader"),
    start = git(checkout, "rev-parse", "main");
  // Two verified integrations on the working branch: one landed, one not.
  const landedTask = commitOn(checkout, "t1", start, { "a.txt": "a\n" }),
    unlanded = commitOn(checkout, "t2", start, { "b.txt": "b\n" });
  git(checkout, "branch", branch, start);
  git(checkout, "checkout", "-q", branch);
  git(checkout, "merge", "-q", "--no-ff", "-m", "Integrate t1", landedTask);
  git(checkout, "merge", "-q", "--no-ff", "-m", "Integrate t2", unlanded);
  git(checkout, "checkout", "-q", "main");
  const checkpoint = checkpointBranch("reader", "t3"),
    unfinished = commitOn(checkout, checkpoint, start, { "c.txt": "wip\n" });
  // The target lands t1 alone, plus an unrelated change.
  git(checkout, "merge", "-q", "--no-ff", "-m", "Land t1", landedTask);
  fs.writeFileSync(path.join(checkout, "other.txt"), "other\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-q", "-m", "Other work");
  const landed = git(checkout, "rev-parse", "main"),
    before = git(checkout, "rev-parse", branch);

  const result = await mergeBaseBack(checkout, {
    spec: "reader",
    landed,
    base: "main",
  });
  assert.equal(result.merged, true);
  const head = git(checkout, "rev-parse", branch);
  assert.equal(
    git(checkout, "rev-list", "--parents", "-n", "1", head),
    `${head} ${before} ${landed}`,
    "a merge commit: working head first, then the landed base",
  );
  for (const commit of [unlanded, landedTask, landed])
    git(checkout, "merge-base", "--is-ancestor", commit, head);
  assert.equal(git(checkout, "rev-parse", checkpoint), unfinished);
  assert.equal(git(checkout, "rev-parse", "main"), landed, "main is untouched");

  const again = await mergeBaseBack(checkout, {
    spec: "reader",
    landed,
    base: "main",
  });
  assert.deepEqual([again.merged, again.reason], [false, "already merged"]);
  assert.equal(
    (await mergeBaseBack(checkout, { spec: "other", landed })).reason,
    "no working branch",
  );

  // A conflicting base leaves the working branch unchanged.
  fs.writeFileSync(path.join(checkout, "b.txt"), "different\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-q", "-m", "Clash");
  const clash = await mergeBaseBack(checkout, {
    spec: "reader",
    landed: git(checkout, "rev-parse", "main"),
  });
  assert.deepEqual([clash.merged, clash.conflict], [false, ["b.txt"]]);
  assert.equal(git(checkout, "rev-parse", branch), head);
});
