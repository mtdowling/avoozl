// The owner's proof runner: its options, the scratch repository guard and
// the front-end check.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  frontEnds,
  PROOF_IDS,
  parseOptions,
  scratchRepoName,
  scratchRepoProblem,
} from "../../../scripts/proofs/run-ms-owner-proofs.mjs";

const GITHUB = [
  "--github-claude",
  "o/avoozl-ms-p2-scratch",
  "--github-codex",
  "o/avoozl-ms-p3-scratch",
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

test("the scratch flags are optional, and two named ones must differ", () => {
  assert.deepEqual(parseOptions([]).github, { claude: null, codex: null });
  assert.deepEqual(parseOptions(["--only", "ms-p2"]).github, {
    claude: null,
    codex: null,
  });
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
    () => parseOptions(["--dry-run", "--github-claude", "o/avoozl"]),
    /--github-claude: .*scratch/,
  );
  assert.throws(
    () => parseOptions(["--github-codex", "OWNER/SCRATCH"]),
    /--github-codex: .*placeholder/,
  );
});

test("the scratch guard takes only a real scratch-named repository outside nupp-lang", () => {
  for (const repo of [
    "o/avoozl-ms-p2-scratch",
    "mtdowling/throwaway",
    "o/proof-repo",
    "o/Test.Repo",
  ])
    assert.equal(scratchRepoProblem(repo), null, repo);
  for (const [repo, problem] of [
    ["o/avoozl", /does not look like a scratch/],
    ["nupp-lang/nupp-scratch", /nupp-lang/],
    ["OWNER/SCRATCH", /placeholder/],
    ["owner/avoozl-ms-p2-scratch", /placeholder/],
    ["mtdowling/SCRATCH1", /placeholder/],
    ["owner", /OWNER\/NAME/],
    ["o/a b", /OWNER\/NAME/],
    [undefined, /OWNER\/NAME/],
  ])
    assert.match(scratchRepoProblem(repo), problem, String(repo));
});

test("a made scratch repository is named like the other avoozl-scratch ones and passes the guard", () => {
  const repo = scratchRepoName(
    "mtdowling",
    "ms-p2",
    new Date("2026-11-20T19:27:50Z"),
  );
  assert.equal(repo, "mtdowling/avoozl-scratch-ms-p2-20261120-1927");
  assert.equal(scratchRepoProblem(repo), null);
});

test("only an interactive Claude Code or Codex session outside the run is a front end", () => {
  const ps = [
    "  500     1 ??       /usr/local/bin/kirocrew gateway --port 5698 --no-open",
    "  600     1 ttys001  claude",
    "  601     1 ttys002  /opt/homebrew/bin/codex --model gpt-5",
    "  602     1 ??       codex app-server",
    "  603     1 ttys003  claude -p hello",
    "  700   650 ttys004  node scripts/proofs/run-ms-owner-proofs.mjs",
    "  701   700 ttys004  codex",
    "  702   701 ttys004  /usr/bin/codex exec --json",
    "  800     1 ttys005  vim codex.json",
  ];
  const found = frontEnds(ps, 700);
  assert.deepEqual(found.sessions, [
    "claude",
    "/opt/homebrew/bin/codex --model gpt-5",
  ]);
  assert.equal(found.kirocrew.length, 1);
  assert.deepEqual(frontEnds(ps.slice(0, 1), 700).sessions, []);
});
