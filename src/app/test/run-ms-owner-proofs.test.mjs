// The owner's proof runner: its options, the scratch repository guard and
// the isolated Avoozl home each proof runs in.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  PROOF_IDS,
  isolation,
  parseOptions,
  scratchRepoProblem,
} from "../../../scripts/proofs/run-ms-owner-proofs.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const GITHUB = [
  "--github-claude",
  "owner/avoozl-ms-p2-scratch",
  "--github-codex",
  "owner/avoozl-ms-p3-scratch",
];

test("every proof runs in order, ms-p1 last, and --only picks some", () => {
  assert.deepEqual(parseOptions(GITHUB).proofs, PROOF_IDS);
  assert.equal(PROOF_IDS.at(-1), "ms-p1");
  assert.deepEqual(
    parseOptions(["--only", "ms-p1,ms-p5", "--only", "ms-p4"]).proofs,
    ["ms-p4", "ms-p5", "ms-p1"],
  );
  const options = parseOptions(["--dry-run", "--root", "x"]);
  assert.equal(options.dryRun, true);
  assert.equal(options.root, path.resolve("x"));
});

test("--only refuses ms-p1w and an unknown proof", () => {
  assert.throws(() => parseOptions(["--only", "ms-p1w"]), /Windows/);
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
  assert.doesNotThrow(() => parseOptions(["--only", "ms-p5"]));
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

test("a proof's Avoozl home is under its folder, with no variable of the owner's shell", {
  skip: process.platform === "win32" && "the runner is for macOS and Linux",
}, (t) => {
  const dir = fs.realpathSync.native(temporaryDirectory());
  const saved = { ...process.env };
  t.after(() => {
    for (const name of Object.keys(process.env))
      if (!(name in saved)) delete process.env[name];
    Object.assign(process.env, saved);
  });
  process.env.KIROCREW_HOME = "/somewhere/real";
  process.env.AVOOZL_WORKSPACE = "/somewhere/workspace";
  for (const crew of [false, true]) {
    const folder = path.join(dir, String(crew));
    fs.mkdirSync(folder);
    const { env, machine, fish } = isolation(folder, { crew });
    for (const value of [machine.configDirectory, machine.stateDirectory])
      assert.ok(value.startsWith(folder + path.sep), value);
    assert.equal(env.AVOOZL_WORKSPACE, undefined);
    assert.equal(
      env.KIROCREW_HOME,
      crew ? path.join(folder, "crew", "home") : undefined,
    );
    assert.ok(env.PATH.startsWith(path.join(folder, "bin")));
    assert.ok(fs.existsSync(path.join(folder, "bin", "avoozl")));
    const text = fs.readFileSync(fish, "utf8");
    assert.match(text, /set -e \$name/);
    assert.ok(text.includes(crew ? "KIROCREW_HOME" : "XDG_STATE_HOME"));
  }
});
