// Guarded pushes and merges (§4.32.5): a fast-forward that refuses when
// the remote moved, and a pull request merge that GitHub refuses when its
// head moved. Never forced. Each reads the leases of the claims it lands
// first, and refuses unless this runner holds them (workflow rule 15.9).
import { git, landingJob, remoteGit } from "../git/git.ts";
import { fail } from "../store/store.ts";
import {
  type ClaimGitHub,
  holdLease,
  holdLeaseOnGitHub,
} from "../workers/claims.ts";

async function isAncestor(root: string, older: string, newer: string) {
  try {
    await git(root, ["merge-base", "--is-ancestor", older, newer]);
    return true;
  } catch {
    return false;
  }
}

// Guarded fast-forward of `branch` in a registered remote from exactly
// `base` to `candidate`. Refuses unless the remote is at `base` and the
// candidate descends from it; the push itself is fast-forward only, so a
// base that moved between the read and the push refuses. Never forced.
// `claims` are the claim branches whose work lands: a lease this runner no
// longer holds refuses with 409 before the push.
export async function guardedFastForward(
  root: string,
  {
    url,
    branch,
    base,
    candidate,
    env,
    claims = [],
  }: {
    url: string;
    branch: string;
    base: string;
    candidate: string;
    env?: NodeJS.ProcessEnv;
    claims?: string[];
  },
) {
  if (!(await isAncestor(root, base, candidate)))
    fail("The candidate does not build on the expected base.", 409);
  const environment = { ...(env ?? process.env), GIT_TERMINAL_PROMPT: "0" },
    remote = (
      await remoteGit(
        root,
        ["ls-remote", "--heads", url, `refs/heads/${branch}`],
        { env: environment },
      )
    ).split(/\s+/)[0];
  if (remote !== base) return false;
  for (const claim of claims)
    await holdLease(root, url, claim, { env: environment });
  try {
    await remoteGit(
      root,
      ["push", "--quiet", url, `${candidate}:refs/heads/${branch}`],
      // A range that changes a workflow file lands as land-workflows (PC4.7).
      { env: environment, job: await landingJob(root, base, candidate) },
    );
    return true;
  } catch {
    return false;
  }
}

// A merge guarded by the pull request's head: GitHub refuses when the head
// is no longer `sha`. With `lease`, the claim branch's leases are read
// through the same client just before the merge, and a lease this runner
// (by its checkout `root`) no longer holds refuses (409).
export async function headGuardedMerge(
  github: ClaimGitHub & {
    mergePullRequest(
      repository: string,
      number: number,
      options: Record<string, unknown>,
    ): Promise<{ merged?: boolean } | null>;
  },
  repository: string,
  number: number,
  sha: string,
  method: string,
  commit: Record<string, unknown> = {},
  lease?: { root: string; branch: string },
) {
  if (lease)
    await holdLeaseOnGitHub(github, repository, lease.root, lease.branch);
  try {
    const result = await github.mergePullRequest(repository, number, {
      sha,
      method,
      ...commit,
    });
    return Boolean(result?.merged);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 409 || status === 405) return false;
    throw error;
  }
}
