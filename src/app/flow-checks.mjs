// A worker's own check run (design §4.11, Requirement 45): the repository's
// checks in its worktree, each with its command, exit code and duration. The
// run leaves a record in the repository's git directory.
import fs from "node:fs";
import path from "node:path";
import { commandEvidence, git } from "./git.mjs";
import { checkCommand, selectedChecks } from "./repository-checks.mjs";
import { changedPaths } from "./verify.mjs";
import { fail } from "./store.mjs";

async function recordDir(root) {
  const common = fs.realpathSync.native(
    path.resolve(root, await git(root, ["rev-parse", "--git-common-dir"])),
  );
  return path.join(common, "avoozl-checks");
}

// The checks one commit runs, the same selection Avoozl's own check run
// makes: a check with paths only when the commit's diff against the base
// touches one. `dir` is a checkout that holds the commit. A diff that
// cannot be read picks every check.
export async function commitChecks(repository, commit, dir = repository.root) {
  try {
    const { paths } = await changedPaths(
      dir,
      repository.baseBranch || "main",
      commit,
    );
    return selectedChecks(repository, paths);
  } catch {
    return selectedChecks(repository);
  }
}

// flow.checks.run: run the checks the worktree's HEAD picks and record the
// result. Returns the entries for the done report.
export async function runLocalChecks({ cwd, root, repository, env }) {
  if (!selectedChecks(repository).length)
    fail("This repository has no checks.", 409);
  const top = await git(cwd, ["rev-parse", "--show-toplevel"]).catch(
    () => null,
  );
  if (!top) fail("Run the checks inside the task's worktree.", 409);
  const [mine, theirs] = await Promise.all([recordDir(cwd), recordDir(root)]);
  if (mine !== theirs)
    fail("This folder is not a worktree of the task's repository.", 409);
  if (await git(cwd, ["status", "--porcelain", "--untracked-files=no"]))
    fail("Commit your change first: checks are recorded for a commit.", 409);
  const commit = await git(cwd, ["rev-parse", "HEAD"]),
    checks = await commitChecks(repository, commit, cwd),
    entries = [];
  for (const check of checks) {
    const started = Date.now(),
      result = await commandEvidence(cwd, check.argv, { env });
    entries.push({
      name: check.name,
      command: checkCommand(check),
      exitCode: result.exitCode,
      durationMs: Date.now() - started,
      commit,
    });
  }
  fs.mkdirSync(mine, { recursive: true });
  fs.writeFileSync(
    path.join(mine, commit + ".json"),
    JSON.stringify(
      {
        commit,
        at: new Date().toISOString(),
        selected: checks.map((check) => check.name),
        checks: entries,
      },
      null,
      2,
    ) + "\n",
  );
  return {
    commit,
    checks: entries,
    passed: entries.every((e) => e.exitCode === 0),
  };
}
