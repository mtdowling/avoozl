// Guarded pushes and merges (§4.32.5): a fast-forward that refuses when
// the remote moved, and a pull request merge that GitHub refuses when its
// head moved. Never forced.
import { git, landingJob, remoteGit } from "../git/git.ts";
import { fail } from "../store/store.ts";

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
export async function guardedFastForward(
  root: string,
  {
    url,
    branch,
    base,
    candidate,
    env,
  }: {
    url: string;
    branch: string;
    base: string;
    candidate: string;
    env?: NodeJS.ProcessEnv;
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
// is no longer `sha`.
export async function headGuardedMerge(
  github: {
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
) {
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
