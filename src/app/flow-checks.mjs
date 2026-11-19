// Local checks first (design §4.11, Requirement 45): a session Avoozl opens
// that pushes runs the repository's declared checks in its worktree before
// each push. The run leaves a record in the repository's git directory, so
// the pre-push hook and the done report read it instead of running the
// checks twice. Local delivery pushes nothing and is unchanged.
import fs from "node:fs";
import path from "node:path";
import { commandEvidence, git } from "./git.mjs";
import { fail } from "./store.mjs";

const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

async function recordDir(root) {
  const common = fs.realpathSync.native(
    path.resolve(root, await git(root, ["rev-parse", "--git-common-dir"])),
  );
  return path.join(common, "avoozl-checks");
}

// Split a declared check into argv the way the verifier brief shows it.
const argvOf = (check) =>
  Array.isArray(check) ? check : String(check).trim().split(/\s+/);

// flow.checks.run: run every declared check at the worktree's HEAD and
// record the result. Returns the entries for the done report.
export async function runLocalChecks({ cwd, root, checks, env }) {
  if (!checks.length) fail("This task declares no checks.", 409);
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
    entries = [];
  for (const check of checks) {
    const argv = argvOf(check),
      started = Date.now(),
      result = await commandEvidence(cwd, argv, { env });
    entries.push({
      command: argv.join(" "),
      exitCode: result.exitCode,
      durationMs: Date.now() - started,
      commit,
    });
  }
  fs.mkdirSync(mine, { recursive: true });
  fs.writeFileSync(
    path.join(mine, commit + ".json"),
    JSON.stringify(
      { commit, at: new Date().toISOString(), checks: entries },
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

// The recorded local pass for one commit, or why there is none.
export async function localPass(root, commit, checks) {
  if (!SHA.test(commit))
    return { ok: false, cause: `${commit} is not a full commit SHA` };
  let record;
  try {
    record = JSON.parse(
      fs.readFileSync(
        path.join(await recordDir(root), commit + ".json"),
        "utf8",
      ),
    );
  } catch {
    return {
      ok: false,
      cause: `no recorded local pass for ${commit.slice(0, 12)}`,
    };
  }
  if (!checks.length && !(record.checks || []).every((e) => e.exitCode === 0))
    return {
      ok: false,
      cause: `a recorded check failed for ${commit.slice(0, 12)}`,
    };
  for (const check of checks) {
    const name = argvOf(check).join(" "),
      entry = record.checks?.find((e) => e.command === name);
    if (!entry)
      return {
        ok: false,
        cause: `\`${name}\` was not run for ${commit.slice(0, 12)}`,
      };
    if (entry.exitCode !== 0)
      return {
        ok: false,
        cause: `\`${name}\` exited ${entry.exitCode} for ${commit.slice(0, 12)}`,
      };
  }
  return { ok: true, record };
}
