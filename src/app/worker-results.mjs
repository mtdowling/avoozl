// The driver verifies a worker's fetched result on its own before anything
// is integrated (Requirement 90.2, 102.6, 102.7, design §4.32.8, task 43.5).
// It never trusts the worker machine's account of its own checks.
//
// Steps, in order, each holding the result when it fails:
// 1. The reference is the one the claim named: same source repository and
//    the task's checkpoint branch.
// 2. The source is the target or a fork of it the registry knows.
// 3. The exact commit is fetched from the registered location. A branch that
//    moved, was rewritten, vanished or shares no history holds the result.
// 4. The diff against the target base stays inside the task's declared paths
//    (outside: rejected) and off protected paths (protected: a person's).
// 5. The privacy scan of the commits, ref name and added lines finds nothing.
// 6. The declared checks run again at that exact commit in a detached
//    worktree.
//
// Only `verified` carries evidence `integrateVerified` accepts. `held` means
// nothing here could complete the task; `rejected` goes back to the worker;
// `protected` goes to a person.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git } from "./git.mjs";
import { changedPaths, pathVerdict, runEach } from "./verify.mjs";
import { requireDiskSpace } from "./disk-space.mjs";
import {
  checkpointBranch,
  fetchExact,
  privacyScan,
  retainVerified,
  verifiedEvidence,
  verifyRelationship,
} from "./working-heads.mjs";

const lower = (value) => String(value).toLowerCase();

const held = (reason, extra = {}) => ({ state: "held", reason, ...extra });

export const expectedCheckpoint = ({ spec, task, repository }) => ({
  repository,
  branch: checkpointBranch(spec, task),
});

export async function verifyWorkerResult({
  root,
  registry,
  ref,
  expected,
  spec,
  github = null,
  declared = [],
  protectedPaths = [],
  checks = [],
  timeoutMs = 600_000,
  run,
  env,
  machine,
  configFile,
}) {
  const { commit } = ref.source;
  if (
    lower(ref.source.repository) !== lower(expected.repository) ||
    ref.source.branch !== expected.branch
  )
    return held("wrong-reference", { commit });
  try {
    await verifyRelationship(github, ref, registry);
  } catch (error) {
    return held("wrong-repository", {
      commit,
      detail: String(error.message).slice(0, 200),
    });
  }
  const fetched = await fetchExact(root, ref, registry, { env });
  if (fetched.state !== "exact")
    return held(`fetch-${fetched.state}`, {
      commit,
      retained: fetched.retained,
      ...(fetched.reason ? { detail: fetched.reason } : {}),
    });
  const { paths } = await changedPaths(root, fetched.base, commit),
    verdict = pathVerdict(paths, { declared, protectedPaths });
  if (verdict.outside.length)
    return {
      state: "rejected",
      reason: "outside-paths",
      commit,
      paths: verdict,
    };
  if (verdict.protected.length)
    return {
      state: "protected",
      reason: "protected-paths",
      commit,
      paths: verdict,
    };
  const hits = privacyScan(root, {
    base: fetched.base,
    head: commit,
    refs: [ref.source.branch],
    machine,
    configFile,
  });
  // Only the rule and place are kept, never the matched text.
  if (hits.length)
    return held("private-metadata", {
      commit,
      rules: [...new Set(hits.map((hit) => hit.rule))],
    });
  // Room for the worktree first: a full volume holds the result.
  try {
    requireDiskSpace(null, os.tmpdir(), `The check of ${commit.slice(0, 12)}`);
  } catch (error) {
    if (!error.lowDisk) throw error;
    return held("low-disk", { commit, ...error.lowDisk });
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-verify-")),
    tree = path.join(dir, "tree");
  let results;
  try {
    await git(root, ["worktree", "add", "--detach", tree, commit]);
    results = await runEach(tree, checks, {
      timeoutFor: () => timeoutMs,
      ...(run ? { run } : {}),
      env,
    });
  } finally {
    await git(root, ["worktree", "remove", "--force", tree]).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const evidence = {
      commit,
      checks: results,
      paths: { outside: [], protected: [] },
    },
    problem = verifiedEvidence(evidence, commit);
  if (problem)
    return { state: "rejected", reason: "checks", commit, problem, evidence };
  await retainVerified(root, spec, ref);
  return { state: "verified", commit, evidence };
}
