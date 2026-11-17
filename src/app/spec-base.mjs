// The spec base a task starts from, and the base merged back after landing
// (Requirement 87.7, 102.6 and 102.15, design §4.32.3 and §4.32.5, task
// 41.5).
//
// - One resolver picks the branch for both Prepare and the spec's qualified
//   reference, so the two always agree: the spec's working branch when it
//   exists in the checkout, else a legacy integration branch (an epic's
//   RC16 branch, then the project's), else the target base.
// - After a portion lands, the new target base comes back into the working
//   branch as a merge commit with a guarded ref update. The working branch
//   keeps its first-parent history, so verified but unlanded integrations
//   stay; task checkpoint refs are never touched. Nothing is pushed or
//   forced here.
import { git } from "./git.mjs";
import { branchNameProblem } from "./integration-branch.mjs";
import { qualifiedRef, workingBranch } from "./working-heads.mjs";
import { fail } from "./store.mjs";

const SHA = /^[0-9a-f]{40}$/;
const SPEC = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

async function tip(root, branch) {
  try {
    return await git(root, [
      "rev-parse",
      "--verify",
      "--quiet",
      `refs/heads/${branch}^{commit}`,
    ]);
  } catch {
    return null;
  }
}

// {branch, commit, kind} with kind working | integration | base. `legacy`
// lists integration branch names in priority order; unusable names are
// skipped. A spec id that cannot name a branch has no working branch.
export async function specBase(root, { spec, base, legacy = [] }) {
  const candidates = [
    ...(typeof spec === "string" && SPEC.test(spec)
      ? [{ branch: workingBranch(spec), kind: "working" }]
      : []),
    ...legacy
      .filter((name) => typeof name === "string" && !branchNameProblem(name))
      .map((branch) => ({ branch, kind: "integration" })),
    { branch: base, kind: "base" },
  ];
  for (const candidate of candidates) {
    const commit = await tip(root, candidate.branch);
    if (commit) return { ...candidate, commit };
  }
  fail(`The base branch ${base} does not exist in ${root}.`, 409);
}

// The same base as a qualified reference: source is the checkout's
// repository at the resolved branch and commit, target is the landing base.
export async function specBaseRef(root, { spec, repository, base, legacy }) {
  const found = await specBase(root, { spec, base, legacy });
  return {
    ...found,
    ref: qualifiedRef({
      source: { repository, branch: found.branch, commit: found.commit },
      target: { repository, base },
    }),
  };
}

// Merges the landed target base into the spec's working branch with a merge
// commit (parents: working head, landed base). A base already in the
// branch is a no-op, so a retry is safe. A conflict refuses and leaves the
// branch unchanged. `lock` wraps only the guarded ref move.
export async function mergeBaseBack(
  root,
  { spec, landed, base, lock = (fn) => fn() },
) {
  if (!SHA.test(landed ?? "")) fail("Name the exact landed base commit.", 400);
  if (typeof spec !== "string" || !SPEC.test(spec))
    return { merged: false, reason: "no working branch" };
  const branch = workingBranch(spec),
    name = `refs/heads/${branch}`,
    head = await tip(root, branch);
  if (!head) return { branch, merged: false, reason: "no working branch" };
  try {
    await git(root, ["merge-base", "--is-ancestor", landed, head]);
    return { branch, head, merged: false, reason: "already merged" };
  } catch {}
  let tree;
  try {
    tree = (
      await git(root, [
        "merge-tree",
        "--write-tree",
        "--no-messages",
        head,
        landed,
      ])
    ).split("\n")[0];
  } catch (error) {
    const files = [
      ...new Set(
        String(error.stdout ?? "")
          .split("\n")
          .slice(1)
          .map((line) => line.split("\t")[1])
          .filter(Boolean),
      ),
    ];
    return { branch, head, merged: false, conflict: files };
  }
  const merged = await git(root, [
    "commit-tree",
    tree,
    "-p",
    head,
    "-p",
    landed,
    "-m",
    `Merge landed ${base ?? "base"} at ${landed.slice(0, 12)} into ${branch}`,
  ]);
  await lock(async () => {
    try {
      await git(root, ["update-ref", name, merged, head]);
    } catch {
      fail(
        `${branch} moved while Avoozl was merging the base back. Retry.`,
        409,
      );
    }
  });
  return { branch, head: merged, previous: head, merged: true };
}
