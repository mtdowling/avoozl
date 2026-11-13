// Local checks first (design §4.11, Requirement 45): a session Avoozl opens
// that pushes runs the repository's declared checks in its worktree before
// each push. The run leaves a record in the repository's git directory, so
// the pre-push hook and the done report read it instead of running the
// checks twice. Local delivery pushes nothing and is unchanged.
import fs from "node:fs";
import path from "node:path";
import { commandEvidence, git } from "./git.mjs";
import { fail } from "./store.mjs";
import { putSpan } from "./flow.mjs";
import { taskRepository } from "../work-model.mjs";

const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

async function recordDir(root) {
  const common = fs.realpathSync.native(
    path.resolve(root, await git(root, ["rev-parse", "--git-common-dir"])),
  );
  return path.join(common, "avoozl-checks");
}

// The commands a pushing session runs before each push: the repository's
// declared checks. A plans-repo leaf's own `checks` name required GitHub
// checks, which run in CI, not here.
export const localCheckList = (project) =>
  (project?.checks || []).map((argv) => argv.join(" "));

// Split a declared check into argv the way the verifier brief shows it.
const argvOf = (check) =>
  Array.isArray(check) ? check : String(check).trim().split(/\s+/);

// flow.checks.run: run every declared check at the worktree's HEAD and
// record the result. Returns the entries for the done report.
export async function runLocalChecks({ cwd, root, checks }) {
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
      result = await commandEvidence(cwd, argv);
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

// A pushing worker's done report (R45.2, R45.3): every declared check for
// one commit, each exiting 0. Throws why not; a not-run check keeps the
// gate shut like R38 and is refused here too.
export function checkDoneList(entries, checks) {
  if (!Array.isArray(entries) || !entries.length)
    fail(
      "Local checks first: list checks [{command, exitCode, durationMs, commit}] for the commit you pushed (run `avoozl checks run --task <id>` in your worktree before each push).",
      409,
    );
  const commits = new Set(entries.map((e) => e.commit));
  if (commits.size !== 1 || !SHA.test([...commits][0] || ""))
    fail(
      "Local checks first: every check entry names the same pushed commit.",
      409,
    );
  for (const check of checks) {
    const name = argvOf(check).join(" "),
      entry = entries.find((e) => e.command === name);
    if (!entry)
      fail(
        `Local checks first: \`${name}\` is missing from the check list.`,
        409,
      );
    if (entry.exitCode !== 0)
      fail(
        `Local checks first: \`${name}\` ${entry.exitCode === null ? "did not run" : `exited ${entry.exitCode}`}; fix it before reporting done.`,
        409,
      );
    if (!Number.isInteger(entry.durationMs))
      fail(`Local checks first: give \`${name}\`'s durationMs.`, 409);
  }
  return [...commits][0];
}

const FAILED = new Set([
  "failure",
  "timed_out",
  "cancelled",
  "action_required",
  "error",
]);

// GitHub timing (R43.3, F95), from the check runs completion already reads
// (§6.5): `ci-wait` from the first required check run started on the pushed
// head to the last one completed. A required check that failed on a commit
// with a recorded local pass is a "CI only" failure (R45.5). No new poller.
export async function recordGitHubTiming(store, task, verdict) {
  const head = verdict?.headSha,
    checks = verdict?.checks || [];
  if (!head || !checks.length) return;
  const timed = checks.filter((c) => c.startedAt && c.completedAt);
  if (timed.length) {
    const start = timed.map((c) => c.startedAt).sort()[0],
      end = timed
        .map((c) => c.completedAt)
        .sort()
        .at(-1);
    putSpan(store, {
      id: `events:${task.id}:github:ci-wait:${head}`,
      taskId: task.id,
      stage: "ci-wait",
      startedAt: start,
      endedAt: end,
      source: "events",
      detail: null,
    });
  }
  const failed = checks.filter((c) =>
    FAILED.has(String(c.state || "").toLowerCase()),
  );
  if (!failed.length) return;
  const project = store.get("projects", taskRepository(task) || "");
  if (!project?.root) return;
  const pass = await localPass(project.root, head, []);
  const id = `ci-only:${task.id}:${head}`;
  if (pass.ok && !store.get("flow_records", id))
    store.transaction(() =>
      store.put("flow_records", {
        id,
        kind: "ci-only",
        taskId: task.id,
        projectId: project.id,
        commit: head,
        checks: failed.map((c) => c.name),
        at: new Date().toISOString(),
      }),
    );
}
