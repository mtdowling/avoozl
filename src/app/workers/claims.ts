// @ts-nocheck: typing debt
// Claim branches (simplify §D3): `avoozl/<spec>/<task>` on origin is the lock
// on a task. Creating it is the claim; GitHub's refs create call refuses a
// second one with 422, so two runners never hold one task. The cache keeps
// the branches each read saw, so a rebuilt cache finds every claim again.
import { fail } from "../store/store.ts";
import { asJob, confirmStep } from "../github/github-jobs.ts";
import { git, remoteGit } from "../git/git.ts";

const PREFIX = "avoozl/";
const META = "claims.branches";
const CLAIM_REFUSALS = 10;
const ALL_CLAIMED = "every ready task is claimed";

// The spec a task belongs to: its plan, which is named for its spec folder.
// A task with no spec claims under its own ID, as a labeled issue does.
export const taskSpec = (task) => task.planId || task.id;

export const claimBranch = (task) => `${PREFIX}${taskSpec(task)}/${task.id}`;

// `refs/heads/avoozl/<spec>/<task>` as {spec, task, branch, sha}; any other
// name under avoozl/ is not a claim.
function parseClaimRef(ref) {
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
async function readClaims(github, repository) {
  const refs = await github.branchesUnder(repository, PREFIX);
  return (Array.isArray(refs) ? refs : []).map(parseClaimRef).filter(Boolean);
}

// Replace the cached claims of the repositories read; others keep theirs.
function cacheClaims(store, byRepository) {
  const current = store.getMeta(META) || {},
    next = { ...current, ...byRepository };
  // Written only when a read changed it, so a read that finds the same
  // branches writes nothing.
  if (JSON.stringify(next) !== JSON.stringify(current))
    store.setMeta(META, next);
}

// The cached claim branch names, across repositories.
function cachedClaims(store) {
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
          before = cached[repository.github] || [],
          known = new Map(before.map((c) => [c.sha, c.at])),
          own = new Set(before.filter((c) => c.own).map((c) => c.branch));
        for (const claim of claims) {
          claim.at =
            known.get(claim.sha) ??
            (await headTime(github, repository.github, claim.sha));
          if (own.has(claim.branch)) claim.own = true;
        }
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
function forgetClaim(store, repository, branch) {
  const all = store.getMeta(META) || {};
  if (!all[repository]) return;
  store.setMeta(META, {
    ...all,
    [repository]: all[repository].filter((c) => c.branch !== branch),
  });
}

// The cached claim of one task, in one GitHub repository.
export function claimOf(store, repository, taskId) {
  return (
    ((store.getMeta(META) || {})[repository] || []).find(
      (claim) => claim.task === taskId,
    ) ?? null
  );
}

// The claims this runner created, each with its GitHub repository.
export const cachedOwnClaims = (store) =>
  Object.entries(store.getMeta(META) || {}).flatMap(([repository, claims]) =>
    claims
      .filter((claim) => claim.own)
      .map((claim) => ({ ...claim, repository })),
  );

// Delete a claim branch with every lease of its task, older generations
// included (workflow rules 15.6 and 20.5). Lease refs go only with their
// claim branch, so a generation number is never used twice.
async function deleteWithLeases(github, repository, { spec, task, branch }) {
  const leases = github.branchesUnder
    ? await github.branchesUnder(repository, `avoozl-lease/${spec}/${task}/`)
    : [];
  for (const lease of Array.isArray(leases) ? leases : [])
    await github.deleteBranch(
      repository,
      String(lease.ref).replace(/^refs\/heads\//, ""),
    );
  await github.deleteBranch(repository, branch);
}

// After a task lands, the claim branch this runner created goes from origin
// with its leases (rule 16.1, simplify SM4.1). A claim another runner
// created stays: a person deletes that one. Returns whether it was deleted.
export async function deleteOwnClaim(store, github, repository, taskId) {
  const claim = claimOf(store, repository, taskId);
  if (!claim?.own || !github?.deleteBranch) return false;
  await deleteWithLeases(asJob("land", github), repository, claim);
  forgetClaim(store, repository, claim.branch);
  return true;
}

// One Needs you row per pull request that closed unmerged: its task stays
// claimed, so Delete claim branch (the high-risk claim-delete job) makes it
// ready again. A newer landing of the same task clears the row.
export function closedPullNeedsYou(store) {
  const repositories = new Map(
      store
        .list("repositories")
        .map((repository) => [repository.id, repository]),
    ),
    entries = store.list("landing_queue"),
    newest = new Map();
  for (const entry of entries) {
    const key = `${entry.repositoryId}\0${entry.key}`;
    if ((newest.get(key)?.seq ?? -1) < (entry.seq ?? 0)) newest.set(key, entry);
  }
  return [...newest.values()]
    .filter((entry) => entry.state === "closed")
    .map((entry) => {
      const github = repositories.get(entry.repositoryId)?.github ?? null,
        claim = github ? claimOf(store, github, entry.key) : null;
      return {
        kind: "needs-human",
        reason: "pr-closed",
        id: `pr-closed:${entry.repositoryId}:${entry.key}`,
        taskId: entry.key,
        authority: "github",
        ...(github && entry.pr
          ? { link: `https://github.com/${github}/pull/${entry.pr}` }
          : {}),
        title: `Pull request${entry.pr ? ` #${entry.pr}` : ""} for ${entry.key} closed unmerged`,
        detail: claim
          ? `${entry.key} stays claimed by ${claim.branch}. Delete the claim branch to make the task ready again, or reopen the pull request on GitHub.`
          : `${entry.key} did not land. Reopen the pull request on GitHub, or send the task back to its worker.`,
        openedAt: entry.finishedAt,
        ...(claim
          ? {
              actions: [
                {
                  label: "Delete claim branch",
                  operation: "claim.delete",
                  input: { repository: github, branch: claim.branch },
                  confirm: [
                    confirmStep({
                      job: "claim-delete",
                      target: github,
                      action: `Delete ${claim.branch}`,
                    }),
                  ],
                },
              ],
            }
          : {}),
      };
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

// In flight's claim rows (simplify §D13): every cached claim branch, with
// its task, who holds it, its head and age, and whether it is stale. Reads
// the cache only.
// shortcut: the holder is this runner or another one; name the login once
// the claims read records each branch's pusher.
export function claimsView(store, now = Date.now()) {
  const all = store.getMeta(META) || {},
    stale = new Set(staleClaims(store, now).map((claim) => claim.branch)),
    titles = new Map(store.read().tasks.map((task) => [task.id, task.title]));
  return Object.entries(all)
    .flatMap(([repository, claims]) =>
      claims.map((claim) => {
        const at = Date.parse(claim.at ?? "");
        return {
          repository,
          branch: claim.branch,
          spec: claim.spec,
          task: claim.task,
          title: titles.get(claim.task) ?? null,
          holder: claim.own ? "this runner" : "another runner",
          head: claim.sha ?? null,
          at: claim.at ?? null,
          ageHours: Number.isFinite(at) ? Math.floor((now - at) / HOUR) : null,
          stale: stale.has(claim.branch),
        };
      }),
    )
    .sort((a, b) => a.branch.localeCompare(b.branch));
}

// One Needs you row per stale claim, for the spec issue's assignee to act
// on. Only a person deletes the branch, through the high-risk confirm; Avoozl never
// deletes another runner's claim branch on its own.
export function claimsNeedsYou(store, now = Date.now()) {
  return staleClaims(store, now).map((claim) => {
    return {
      kind: "needs-human",
      reason: "stale-claim",
      id: `stale-claim:${claim.repository}:${claim.branch}`,
      taskId: null,
      authority: "github",
      link: `https://github.com/${claim.repository}/tree/${claim.branch}`,
      title: `${claim.branch} has had no commit for ${claim.ageHours} hours`,
      detail: `For the spec issue's assignee: the claim on ${claim.task} in ${claim.repository} has had no new commit for over ${claim.hours} hours. Ask whoever holds it, or delete the branch so the task is ready again. Avoozl deletes no other runner's claim branch.`,
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
  await deleteWithLeases(github, repository, claim);
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
    // The next generation above any lease refs left by a claim branch
    // deleted outside Avoozl, else 1 (workflow rules 15.1 and 15.5).
    const generation =
        (await highestLease(github, repository.github, task)) + 1,
      lease = await takeLease(
        github,
        repository.github,
        task,
        generation,
        head,
      );
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

// Leases (workflow rule 15.5): `avoozl-lease/<spec>/<task>/<generation>`,
// created at most once, say which runner may push to a claim branch.
const leaseRef = (task, generation) =>
  `avoozl-lease/${taskSpec(task)}/${task.id}/${generation}`;

// The highest generation whose lease ref exists for a task, or 0 (15.5).
async function highestLease(github, repository, task) {
  const refs = await github.branchesUnder(repository, leaseRef(task, ""));
  return Math.max(
    0,
    ...refs.map((lease) => Number(String(lease.ref).split("/").pop()) || 0),
  );
}

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

// Whether a lease is stale (workflow rule 15.6): its lease commit and the
// claim branch's newest commit are both older than the stale hours.
const leaseStale = (lease, claimAgeHours, staleHours) =>
  lease.ageHours > staleHours && claimAgeHours > staleHours;

// Resume a claim (15.7): with no lease, or a newest one (the highest
// generation) that is stale or released, each runner in turn tries the next
// generation; the first create wins and the rest stop. With a live lease
// nobody resumes.
export async function resumeClaim(
  github,
  { repository, task, leases, claimAgeHours, staleHours, runners, sha },
) {
  const newest = [...leases].sort((a, b) => b.generation - a.generation)[0];
  if (
    newest &&
    !newest.released &&
    !leaseStale(newest, claimAgeHours, staleHours)
  )
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

// The takeover commit (workflow rule 15.8): a runner that took a lease on an
// existing claim pushes a child of the claim branch's head that changes no
// file, before it works or lands. The old holder's later push builds on the
// head before it, so it is not a fast-forward and is rejected. A rejected
// takeover reads the head again and pushes on top of it. Returns the
// takeover commit.
export async function pushTakeover(root, branch, { env, tries = 3 } = {}) {
  const options = env ? { env } : {};
  for (let attempt = 1; ; attempt++) {
    await remoteGit(root, ["fetch", "-q", "origin", branch], options);
    await git(
      root,
      ["checkout", "-q", "-B", branch, `origin/${branch}`],
      options,
    );
    await git(
      root,
      ["commit", "-q", "--allow-empty", "-m", `Take over ${branch}`],
      options,
    );
    try {
      await remoteGit(
        root,
        ["push", "-q", "origin", `HEAD:refs/heads/${branch}`],
        options,
      );
      return git(root, ["rev-parse", "HEAD"], options);
    } catch (error) {
      if (attempt >= tries) throw error;
    }
  }
}
