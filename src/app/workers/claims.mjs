// Claim branches (simplify §D3): `avoozl/<spec>/<task>` on origin is the lock
// on a task. Creating it is the claim; GitHub's refs create call refuses a
// second one with 422, so two runners never hold one task. The cache keeps
// the branches each read saw, so a rebuilt cache finds every claim again.
import { fail } from "../store/store.mjs";

const PREFIX = "avoozl/";
const META = "claims.branches";
export const CLAIM_REFUSALS = 10;
export const ALL_CLAIMED = "every ready task is claimed";

// The spec a task belongs to: its plan, which is named for its spec folder.
// A task with no spec claims under its own ID, as a labeled issue does.
export const taskSpec = (task) => task.planId || task.id;

export const claimBranch = (task) => `${PREFIX}${taskSpec(task)}/${task.id}`;

// `refs/heads/avoozl/<spec>/<task>` as {spec, task, branch, sha}; any other
// name under avoozl/ is not a claim.
export function parseClaimRef(ref) {
  const match = /^refs\/heads\/avoozl\/([^/]+)\/([^/]+)$/.exec(ref?.ref ?? "");
  return match
    ? {
        spec: match[1],
        task: match[2],
        branch: `${PREFIX}${match[1]}/${match[2]}`,
        sha: ref.object?.sha ?? null,
      }
    : null;
}

// Every claim branch of one GitHub repository, from one matching-refs read.
export async function readClaims(github, repository) {
  const refs = await github.branchesUnder(repository, PREFIX);
  return (Array.isArray(refs) ? refs : []).map(parseClaimRef).filter(Boolean);
}

// Replace the cached claims of the repositories read; others keep theirs.
export function cacheClaims(store, byRepository) {
  store.setMeta(META, { ...(store.getMeta(META) || {}), ...byRepository });
}

// The cached claim branch names, across repositories.
export function cachedClaims(store) {
  return new Set(
    Object.values(store.getMeta(META) || {}).flatMap((claims) =>
      claims.map((claim) => claim.branch),
    ),
  );
}

// Task IDs whose claim branch the cache holds.
export function claimedTaskIds(store, tasks) {
  const branches = cachedClaims(store);
  if (!branches.size) return new Set();
  return new Set(
    (tasks ?? store.read().tasks)
      .filter((task) => branches.has(claimBranch(task)))
      .map((task) => task.id),
  );
}

// Add one claim this runner made to the cache.
export function cacheClaim(store, repository, claim) {
  const all = store.getMeta(META) || {},
    own = (all[repository] || []).filter((c) => c.branch !== claim.branch);
  store.setMeta(META, { ...all, [repository]: [...own, claim] });
}

// Read and cache the claim branches of every repository with a GitHub name.
// A repository whose read fails keeps its cached claims.
export async function refreshClaims(store, github) {
  if (!github?.branchesUnder) return [];
  const read = {},
    errors = [];
  for (const repository of store.list("repositories"))
    if (repository.github)
      try {
        read[repository.github] = await readClaims(github, repository.github);
      } catch (error) {
        errors.push({ repository: repository.github, error: error.message });
      }
  cacheClaims(store, read);
  return errors;
}

// Claim the first of `candidates` ({task, repository}) whose branch GitHub
// creates at its base head. A 422 means another runner holds it: take the
// next. Ten refusals in one call, or none left, end the call. With no
// candidate at all it returns null.
export async function claimFirst(github, candidates, { baseOf }) {
  if (!candidates.length) return null;
  let refusals = 0;
  for (const candidate of candidates) {
    if (refusals >= CLAIM_REFUSALS) break;
    const { task, repository } = candidate,
      branch = claimBranch(task),
      base = baseOf(candidate),
      head = (await github.branch(repository.github, base))?.commit?.sha;
    if (!head) fail(`Cannot read the head of ${repository.github} ${base}.`);
    try {
      await github.createBranch(repository.github, branch, head);
    } catch (error) {
      if (error.status !== 422 || error.contentBlocked) throw error;
      refusals += 1;
      continue;
    }
    return { ...candidate, branch, base, head, refusals };
  }
  fail(`No task claimed: ${ALL_CLAIMED}.`, 409);
}
