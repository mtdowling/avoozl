// The owner's proof runner: its options and the scratch repository guard.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  PROOF_IDS,
  parseOptions,
  scratchRepoProblem,
} from "../../../scripts/proofs/run-ms-owner-proofs.mjs";

const GITHUB = [
  "--github-claude",
  "owner/avoozl-ms-p2-scratch",
  "--github-codex",
  "owner/avoozl-ms-p3-scratch",
];

test("ms-p2 and ms-p3 run in order, and --only picks one", () => {
  assert.deepEqual(parseOptions(GITHUB).proofs, PROOF_IDS);
  assert.deepEqual(PROOF_IDS, ["ms-p2", "ms-p3"]);
  assert.deepEqual(parseOptions(["--only", "ms-p3", "--dry-run"]).proofs, [
    "ms-p3",
  ]);
  const options = parseOptions(["--dry-run", "--root", "x"]);
  assert.equal(options.dryRun, true);
  assert.equal(options.root, path.resolve("x"));
});

test("--only refuses an unknown proof", () => {
  assert.throws(() => parseOptions(["--only", "ms-p1"]), /--only takes/);
  assert.throws(() => parseOptions(["--only", "ms-p9"]), /--only takes/);
  assert.throws(() => parseOptions(["--bogus"]), /Unknown option/);
});

test("ms-p2 and ms-p3 need two different scratch repositories, except in a dry run", () => {
  assert.throws(() => parseOptions(["--only", "ms-p2"]), /--github-claude/);
  assert.throws(
    () => parseOptions(["--only", "ms-p3", "--github-claude", "o/x-scratch"]),
    /--github-codex/,
  );
  assert.doesNotThrow(() => parseOptions(["--only", "ms-p2", "--dry-run"]));
  assert.throws(
    () =>
      parseOptions([
        "--github-claude",
        "o/x-scratch",
        "--github-codex",
        "o/x-scratch",
      ]),
    /two repositories/,
  );
  assert.throws(
    () => parseOptions(["--dry-run", "--github-claude", "owner/avoozl"]),
    /--github-claude: .*scratch/,
  );
});

test("the scratch guard takes only a scratch-named repository outside nupp-lang", () => {
  for (const repo of [
    "owner/avoozl-ms-p2-scratch",
    "owner/throwaway",
    "owner/proof-repo",
    "owner/Test.Repo",
  ])
    assert.equal(scratchRepoProblem(repo), null, repo);
  for (const [repo, problem] of [
    ["owner/avoozl", /does not look like a scratch/],
    ["nupp-lang/nupp-scratch", /nupp-lang/],
    ["owner", /OWNER\/NAME/],
    ["owner/a b", /OWNER\/NAME/],
    [undefined, /OWNER\/NAME/],
  ])
    assert.match(scratchRepoProblem(repo), problem, String(repo));
});
