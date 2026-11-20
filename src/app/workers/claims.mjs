// Claim branches (simplify §D3): `avoozl/<spec>/<task>` on origin is the lock
// on a task. Creating it is the claim; GitHub's refs create call refuses a
// second one with 422, so two runners never hold one task. The cache keeps
// the branches each read saw, so a rebuilt cache finds every claim again.
import { fail } from "../store/store.mjs";
import { confirmStep } from "../github/github-jobs.mjs";

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

// Read and cache the claim branches of every repository with a GitHub name,
// each with its head commit's time (`at`), read once per head. A repository
// whose read fails keeps its cached claims.
export async function refreshClaims(store, github) {
  if (!github?.branchesUnder) return [];
  const read = {},
    errors = [],
    cached = store.getMeta(META) || {};
  for (const repository of store.list("repositories"))
    if (repository.github)
      try {
        const claims = await readClaims(github, repository.github),
          known = new Map(
            (cached[repository.github] || []).map((c) => [c.sha, c.at]),
          );
        for (const claim of claims)
          claim.at =
            known.get(claim.sha) ??
            (await headTime(github, repository.github, claim.sha));
        read[repository.github] = claims;
      } catch (error) {
        errors.push({ repository: repository.github, error: error.message });
      }
  cacheClaims(store, read);
  return errors;
}

// A claim head's commit time, or null when it cannot be read (the claim
// still counts; it just cannot go stale until a read gives its time).
async function headTime(github, repository, sha) {
  if (!github.commit || !sha) return null;
  try {
    return (
      (await github.commit(repository, sha))?.commit?.committer?.date ?? null
    );
  } catch {
    return null;
  }
}

// Drop one claim branch from the cache, once it is gone from origin.
export function forgetClaim(store, repository, branch) {
  const all = store.getMeta(META) || {};
  if (!all[repository]) return;
  store.setMeta(META, {
    ...all,
    [repository]: all[repository].filter((c) => c.branch !== branch),
  });
}

export const DEFAULT_STALE_HOURS = 24;
const HOUR = 3600 * 1000;

// Whether the tick reads the claim branches now: once per 15 minutes, as
// staleness is counted in hours.
const READ_EVERY = 15 * 60 * 1000;
export function claimsDue(store, now = Date.now()) {
  if (!store.list("repositories").some((repository) => repository.github))
    return false;
  if (now - (store.getMeta("claims.readAt") ?? 0) < READ_EVERY) return false;
  store.setMeta("claims.readAt", now);
  return true;
}

// Cached claims whose head commit is older than their repository's
// `claims.staleHours` (simplify §D3, default 24), with their age in hours.
export function staleClaims(store, now = Date.now()) {
  const all = store.getMeta(META) || {},
    seen = new Set(),
    stale = [];
  for (const repository of store.list("repositories")) {
    if (!repository.github || seen.has(repository.github)) continue;
    seen.add(repository.github);
    const hours = repository.claims?.staleHours ?? DEFAULT_STALE_HOURS;
    for (const claim of all[repository.github] || []) {
      const at = Date.parse(claim.at ?? "");
      if (Number.isFinite(at) && now - at > hours * HOUR)
        stale.push({
          ...claim,
          repository: repository.github,
          hours,
          ageHours: Math.floor((now - at) / HOUR),
          staleAt: new Date(at + hours * HOUR).toISOString(),
        });
    }
  }
  return stale.sort((a, b) => a.staleAt.localeCompare(b.staleAt));
}

// One Needs you row per stale claim, for the spec issue's assignee. Only a
// person deletes the branch, through the high-risk confirm; Avoozl never
// deletes another runner's claim branch on its own.
export function claimsNeedsYou(store, now = Date.now()) {
  return staleClaims(store, now).map((claim) => {
    const assignees = store.get("drivers", claim.spec)?.assignees ?? [],
      who = assignees.length
        ? `For ${assignees.join(", ")}, the spec issue's assignee: `
        : "The spec issue names no assignee. ";
    return {
      kind: "needs-human",
      reason: "stale-claim",
      id: `stale-claim:${claim.repository}:${claim.branch}`,
      taskId: null,
      authority: "github",
      assignees,
      link: `https://github.com/${claim.repository}/tree/${claim.branch}`,
      title: `${claim.branch} has had no commit for ${claim.ageHours} hours`,
      detail: `${who}the claim on ${claim.task} in ${claim.repository} has had no new commit for over ${claim.hours} hours. Ask whoever holds it, or delete the branch so the task is ready again. Avoozl deletes no other runner's claim branch.`,
      openedAt: claim.staleAt,
      actions: [
        {
          label: "Delete branch",
          operation: "claim.delete",
          input: { repository: claim.repository, branch: claim.branch },
          confirm: [
            confirmStep({
              job: "claim-delete",
              target: claim.repository,
              action: `Delete ${claim.branch}`,
            }),
          ],
        },
      ],
    };
  });
}

// A person's Delete branch: the claim branch only, in a registered
// repository, as the high-risk claim-delete job.
export async function deleteClaim(store, github, { repository, branch }) {
  const claim = parseClaimRef({ ref: `refs/heads/${branch ?? ""}` });
  if (!claim) fail("Name a claim branch: avoozl/<spec>/<task>.", 400);
  if (
    !store
      .list("repositories")
      .some(
        (r) =>
          String(r.github).toLowerCase() === String(repository).toLowerCase(),
      )
  )
    fail(`${repository} is not a repository in this workspace.`, 404);
  await github.deleteBranch(repository, branch);
  forgetClaim(store, repository, branch);
  return { deleted: branch, repository };
}

// Claim the first of `candidates` ({task, repository}) whose branch GitHub
// creates at its base head. A 422 means another runner holds it: take the
// next. Ten refusals in one call, or none left, end the call. With no
// candidate at all it returns null. `baseOf` may be async, and a null base
// skips the candidate (its integration branch could not take the default
// branch).
export async function claimFirst(github, candidates, { baseOf }) {
  if (!candidates.length) return null;
  let refusals = 0,
    held = 0;
  for (const candidate of candidates) {
    if (refusals >= CLAIM_REFUSALS) break;
    const { task, repository } = candidate,
      branch = claimBranch(task),
      base = await baseOf(candidate);
    if (!base) {
      held += 1;
      continue;
    }
    const head = (await github.branch(repository.github, base))?.commit?.sha;
    if (!head) fail(`Cannot read the head of ${repository.github} ${base}.`);
    try {
      await github.createBranch(repository.github, branch, head);
    } catch (error) {
      if (error.status !== 422 || error.contentBlocked) throw error;
      refusals += 1;
      continue;
    }
    // A new claim has no lease yet, so this runner takes generation 1
    // (workflow rule 12.1).
    const lease = await takeLease(github, repository.github, task, 1, head);
    if (!lease) fail(`Another runner took the lease on ${branch} first.`, 409);
    return { ...candidate, branch, base, head, lease, refusals };
  }
  if (held && !refusals)
    fail(
      "No task claimed: its integration branch could not take the default branch. See Needs you.",
      409,
    );
  fail(`No task claimed: ${ALL_CLAIMED}.`, 409);
}

// Leases (workflow rule 12.5): `avoozl-lease/<spec>/<task>/<generation>`,
// created at most once, say which runner may push to a claim branch.
export const leaseRef = (task, generation) =>
  `avoozl-lease/${taskSpec(task)}/${task.id}/${generation}`;

// Take generation `generation` of a task's lease by creating its ref; null
// when another runner created it first.
// shortcut: the lease points at the claim's head and is not renewed (12.6);
// renew it when the loop runs tasks that outlive the stale hours.
export async function takeLease(github, repository, task, generation, sha) {
  const ref = leaseRef(task, generation);
  try {
    await github.createBranch(repository, ref, sha);
  } catch (error) {
    if (error.status !== 422 || error.contentBlocked) throw error;
    return null;
  }
  return ref;
}

// Whether a lease is stale (12.6): its lease commit and the claim branch's
// newest commit are both older than the stale hours.
export const leaseStale = (lease, claimAgeHours, staleHours) =>
  lease.ageHours > staleHours && claimAgeHours > staleHours;

// Resume a claim (12.7): with no lease, or a stale newest one, each runner
// in turn tries the next generation; the first create wins and the rest stop.
// With a live lease nobody resumes.
export async function resumeClaim(
  github,
  { repository, task, leases, claimAgeHours, staleHours, runners, sha },
) {
  const newest = [...leases].sort((a, b) => b.generation - a.generation)[0];
  if (newest && !leaseStale(newest, claimAgeHours, staleHours))
    return { holder: null, lease: null, stopped: [...runners] };
  const generation = (newest?.generation ?? 0) + 1,
    stopped = [];
  let holder = null,
    lease = null;
  for (const runner of runners) {
    const ref = await takeLease(github, repository, task, generation, sha);
    if (ref && !holder) [holder, lease] = [runner, ref];
    else stopped.push(runner);
  }
  return { holder, lease, stopped };
}
