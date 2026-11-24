// Claim branches: `avoozl/<spec>/<task>` on origin is the lock
// on a task. Creating it is the claim; GitHub's refs create call refuses a
// second one with 422, so two runners never hold one task. Each claim has
// leases (workflow rule 15): `avoozl-lease/<spec>/<task>/<generation>`, a
// commit that names the start commit, the task text and the runner that
// holds it. The cache keeps the branches and newest leases each read saw,
// and which claims are this runner's comes from the lease, so a rebuilt
// cache finds every claim and its holder again.
import { randomUUID } from "node:crypto";
import { fail, type Store } from "../store/store.ts";
import { asJob, confirmStep } from "../github/github-jobs.ts";
import {
  effectiveGitIdentity,
  git,
  listWorktrees,
  remoteGit,
  type Repository,
} from "../git/git.ts";
import type { QueueEntry } from "../landing/landing-queue.ts";
import { LETTERED, NUMBERED } from "../specs/spec-refs.ts";
import type { Task } from "../../types.ts";

const PREFIX = "avoozl/";
const LEASE_PREFIX = "avoozl-lease/";
const META = "claims.branches";
const CLAIM_REFUSALS = 10;
const ALL_CLAIMED = "every ready task is claimed";

// A branch ref as GitHub's matching-refs read returns it.
interface Ref {
  ref?: string;
  object?: { sha?: string };
}
// A commit as GitHub's commit read returns it, in the fields leases read.
type CommitRead = {
  commit?: {
    committer?: { date?: string };
    message?: string;
    tree?: { sha?: string };
  };
} | null;
// The person a commit names, from their git config.
type Author = { name: string; email: string };
// The GitHub calls claims make; a reader may lack the optional ones.
export interface ClaimGitHub {
  branchesUnder?(repository: string, prefix: string): Promise<Ref[]>;
  deleteBranch?(repository: string, name: string): Promise<unknown>;
  commit?(repository: string, sha: string): Promise<CommitRead>;
  createCommit?(
    repository: string,
    body: { message: string; tree: string; parents: string[]; author?: Author },
  ): Promise<{ sha?: string } | null>;
  moveBranch?(repository: string, name: string, sha: string): Promise<unknown>;
}
// What claiming a task needs of GitHub. Lease commits need the commit
// calls too; a client without them (a test fake) leases at the claim head.
export type CreateGitHub = Required<Pick<ClaimGitHub, "branchesUnder">> &
  Pick<ClaimGitHub, "commit" | "createCommit" | "moveBranch"> & {
    branch(repository: string, name: string): Promise<unknown>;
    createBranch(
      repository: string,
      name: string,
      sha: string,
    ): Promise<unknown>;
  };
// What writing a lease, renewal or takeover commit needs of GitHub.
type CommitGitHub = Required<
  Pick<ClaimGitHub, "commit" | "createCommit" | "moveBranch">
>;
const canCommit = (github: ClaimGitHub): github is CommitGitHub =>
  typeof github.commit === "function" &&
  typeof github.createCommit === "function" &&
  typeof github.moveBranch === "function";
// What deleting a claim needs of GitHub.
type DeleteGitHub = Pick<ClaimGitHub, "branchesUnder"> &
  Required<Pick<ClaimGitHub, "deleteBranch">>;
const canDelete = (github: ClaimGitHub): github is DeleteGitHub =>
  typeof github.deleteBranch === "function";
// A claim's newest lease (workflow rule 15.5), as the claims read keeps it:
// its ref and commit, the commit's time, and what its message names.
export interface Lease {
  ref: string;
  generation: number;
  sha: string | null;
  at?: string | null;
  released?: boolean;
  runner?: string | null;
  start?: string | null;
}
// A claim branch, as the cache holds it. `own`: this runner holds its
// newest lease.
export interface Claim {
  spec: string;
  task: string;
  branch: string;
  sha: string | null;
  at?: string | null;
  own?: boolean;
  lease?: Lease | null;
}
// The cached claims, by GitHub repository.
type ClaimCache = Record<string, Claim[]>;
// A task, as far as its claim branch names it, and the text its lease
// records.
type ClaimTask = { id: string; planId?: string };
type LeaseTask = ClaimTask &
  Partial<Pick<Task, "title" | "labeledIssue">> & { acceptance?: unknown };
// A repository, as far as claims read it.
type ClaimRepository = Pick<Repository, "id"> & {
  github?: string | null;
  root?: string | null;
  claims?: { staleHours?: number };
};
// The claim cache's store: a Store, or a test's fake.
type ClaimStore = Pick<Store, "getMeta" | "setMeta">;
// The claims read's store: the cache and the repositories it reads.
type ReadStore = ClaimStore & {
  list<T = ClaimRepository>(table: "repositories"): T[];
};
const cacheOf = (store: Pick<Store, "getMeta">) =>
  store.getMeta<ClaimCache>(META) || {};
// A refused create: GitHub's 422, unless content rules blocked it.
const refused = (error: unknown) =>
  error !== null &&
  typeof error === "object" &&
  "status" in error &&
  error.status === 422 &&
  !("contentBlocked" in error && error.contentBlocked);

// The spec a task belongs to: its plan, which is named for its spec folder.
// A task with no spec claims under its own ID, as a labeled issue does.
export const taskSpec = (task: ClaimTask) => task.planId || task.id;

// The task part of a claim or lease ref is the ID as the spec writes it
// (rules 2.1 and 15.1). Avoozl keeps a numbered or lettered ID, such as
// `1.2`, as `<spec>.1.2`; the ref drops that prefix and a read adds it back.
const namespaced = (id: string) => NUMBERED.test(id) || LETTERED.test(id);
const refTask = (task: ClaimTask) => {
  const prefix = `${taskSpec(task)}.`,
    written = task.id.slice(prefix.length);
  return task.id.startsWith(prefix) && namespaced(written) ? written : task.id;
};
const taskOfRef = (spec: string, written: string) =>
  namespaced(written) ? `${spec}.${written}` : written;

export const claimBranch = (task: ClaimTask) =>
  `${PREFIX}${taskSpec(task)}/${refTask(task)}`;

// `refs/heads/avoozl/<spec>/<task>` as {spec, task, branch, sha}; any other
// name under avoozl/ is not a claim.
function parseClaimRef(ref: Ref | null | undefined): Claim | null {
  const match = /^refs\/heads\/avoozl\/([^/]+)\/([^/]+)$/.exec(ref?.ref ?? "");
  return match
    ? {
        spec: match[1],
        task: taskOfRef(match[1], match[2]),
        branch: `${PREFIX}${match[1]}/${match[2]}`,
        sha: ref?.object?.sha ?? null,
      }
    : null;
}

// Every claim branch of one GitHub repository, from one matching-refs read.
async function readClaims(github: ClaimGitHub, repository: string) {
  const refs = await github.branchesUnder?.(repository, PREFIX);
  return (Array.isArray(refs) ? refs : [])
    .map(parseClaimRef)
    .filter((claim) => claim !== null);
}

// Replace the cached claims of the repositories read; others keep theirs.
function cacheClaims(store: ClaimStore, byRepository: ClaimCache) {
  const current = cacheOf(store),
    next = { ...current, ...byRepository };
  // Written only when a read changed it, so a read that finds the same
  // branches writes nothing.
  if (JSON.stringify(next) !== JSON.stringify(current))
    store.setMeta(META, next);
}

// The cached claim branch names, across repositories.
function cachedClaims(store: Store) {
  return new Set(
    Object.values(cacheOf(store)).flatMap((claims) =>
      claims.map((claim) => claim.branch),
    ),
  );
}

// Task IDs whose claim branch the cache holds.
export function claimedTaskIds(store: Store, tasks?: ClaimTask[]) {
  const branches = cachedClaims(store);
  if (!branches.size) return new Set<string>();
  return new Set(
    (tasks ?? store.read().tasks)
      .filter((task) => branches.has(claimBranch(task)))
      .map((task) => task.id),
  );
}

// Add one claim this runner made to the cache.
export function cacheClaim(
  store: ClaimStore,
  repository: string,
  claim: Claim,
) {
  const all = cacheOf(store),
    own = (all[repository] || []).filter((c) => c.branch !== claim.branch);
  store.setMeta(META, { ...all, [repository]: [...own, claim] });
}

// The newest lease ref of each task, by `<spec>/<task>`, from one
// matching-refs read (15.5: the highest generation is the newest).
async function newestLeases(github: ClaimGitHub, repository: string) {
  // A 404 is no lease ref at all.
  const refs = await github
      .branchesUnder?.(repository, LEASE_PREFIX)
      .catch((error) => {
        if ((error as { status?: number })?.status === 404) return [];
        throw error;
      }),
    newest = new Map<string, Lease>();
  for (const ref of Array.isArray(refs) ? refs : []) {
    const match = /^refs\/heads\/(avoozl-lease\/([^/]+)\/([^/]+)\/(\d+))$/.exec(
      ref?.ref ?? "",
    );
    if (!match) continue;
    const key = `${match[2]}/${taskOfRef(match[2], match[3])}`,
      generation = Number(match[4]);
    if ((newest.get(key)?.generation ?? 0) < generation)
      newest.set(key, {
        ref: match[1],
        generation,
        sha: ref.object?.sha ?? null,
      });
  }
  return newest;
}

// Read and cache the claim branches of every repository with a GitHub name,
// each with its head commit's time (`at`) and its newest lease, each commit
// read once. A claim is this runner's (`own`) when its newest lease names
// this runner and is not released; a lease that names no runner keeps what
// the cache said. A repository whose read fails keeps its cached claims.
export async function refreshClaims(
  store: ReadStore,
  github: ClaimGitHub | null | undefined,
) {
  if (!github?.branchesUnder) return [];
  const read: ClaimCache = {},
    errors: { repository: string; error: string }[] = [],
    cached = cacheOf(store);
  for (const repository of store.list<ClaimRepository>("repositories"))
    if (repository.github && !read[repository.github])
      try {
        const claims = await readClaims(github, repository.github),
          leases = await newestLeases(github, repository.github),
          before = cached[repository.github] || [],
          known = new Map(before.map((c) => [c.sha, c.at])),
          knownLeases = new Map(
            before.flatMap((c) => (c.lease ? [[c.lease.sha, c.lease]] : [])),
          ),
          own = new Set(before.filter((c) => c.own).map((c) => c.branch)),
          runner = await runnerId(repository.root);
        for (const claim of claims) {
          claim.at =
            known.get(claim.sha) ??
            (await readCommit(github, repository.github, claim.sha)).at;
          const lease = leases.get(`${claim.spec}/${claim.task}`) ?? null;
          claim.lease = lease && {
            ...lease,
            ...(knownLeases.get(lease.sha) ??
              (await readCommit(github, repository.github, lease.sha))),
            ref: lease.ref,
            generation: lease.generation,
            sha: lease.sha,
          };
          const holder = claim.lease?.runner;
          if (
            holder
              ? holder === runner && !claim.lease?.released
              : own.has(claim.branch)
          )
            claim.own = true;
        }
        read[repository.github] = claims;
      } catch (error) {
        errors.push({
          repository: repository.github,
          error: error instanceof Error ? error.message : String(error),
        });
      }
  cacheClaims(store, read);
  return errors;
}

// A commit's time and what its lease message names, or a null time when it
// cannot be read (the claim still counts; it just cannot go stale until a
// read gives its time).
async function readCommit(
  github: ClaimGitHub,
  repository: string,
  sha: string | null,
): Promise<Partial<Lease> & { at: string | null }> {
  if (!github.commit || !sha) return { at: null };
  try {
    const commit = (await github.commit(repository, sha))?.commit;
    return {
      at: commit?.committer?.date ?? null,
      ...parseLease(commit?.message),
    };
  } catch {
    return { at: null };
  }
}

// Drop one claim branch from the cache, once it is gone from origin.
function forgetClaim(store: ClaimStore, repository: string, branch: string) {
  const all = cacheOf(store);
  if (!all[repository]) return;
  store.setMeta(META, {
    ...all,
    [repository]: all[repository].filter((c) => c.branch !== branch),
  });
}

// The cached claim of one task, in one GitHub repository.
export function claimOf(
  store: Pick<Store, "getMeta">,
  repository: string,
  taskId: string,
) {
  return (
    (cacheOf(store)[repository] || []).find((claim) => claim.task === taskId) ??
    null
  );
}

// The claims this runner created, each with its GitHub repository.
export const cachedOwnClaims = (store: Pick<Store, "getMeta">) =>
  Object.entries(cacheOf(store)).flatMap(([repository, claims]) =>
    claims
      .filter((claim) => claim.own)
      .map((claim) => ({ ...claim, repository })),
  );

// Delete a claim branch with every lease of its task, older generations
// included (workflow rules 15.6 and 20.5). Lease refs go only with their
// claim branch, so a generation number is never used twice.
async function deleteWithLeases(
  github: DeleteGitHub,
  repository: string,
  { spec, task, branch }: Claim,
) {
  const leases = github.branchesUnder
    ? await github.branchesUnder(
        repository,
        leaseRef({ id: task, planId: spec }, ""),
      )
    : [];
  for (const lease of Array.isArray(leases) ? leases : [])
    await github.deleteBranch(
      repository,
      String(lease.ref).replace(/^refs\/heads\//, ""),
    );
  await github.deleteBranch(repository, branch);
}

// After a task lands, the claim branch this runner created goes from origin
// with its leases (rule 16.1). A claim another runner
// created stays: a person deletes that one. Returns whether it was deleted.
export async function deleteOwnClaim(
  store: ClaimStore,
  github: ClaimGitHub | null | undefined,
  repository: string,
  taskId: string,
) {
  const claim = claimOf(store, repository, taskId);
  if (!claim?.own || !github || !canDelete(github)) return false;
  await deleteWithLeases(asJob("land", github), repository, claim);
  forgetClaim(store, repository, claim.branch);
  return true;
}

// One Needs you row per pull request that closed unmerged: its task stays
// claimed, so Delete claim branch (the high-risk claim-delete job) makes it
// ready again. A newer landing of the same task clears the row.
export function closedPullNeedsYou(store: Store) {
  const repositories = new Map(
      store
        .list<ClaimRepository>("repositories")
        .map((repository) => [repository.id, repository]),
    ),
    entries = store.list<QueueEntry>("landing_queue"),
    newest = new Map<string, QueueEntry>();
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
        ...(claim && github
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
export function claimsDue(store: Store, now = Date.now()) {
  if (
    !store
      .list<ClaimRepository>("repositories")
      .some((repository) => repository.github)
  )
    return false;
  if (now - (store.getMeta<number>("claims.readAt") ?? 0) < READ_EVERY)
    return false;
  store.setMeta("claims.readAt", now);
  return true;
}

// Each GitHub repository's stale hours (`claims.staleHours`, default 24).
function staleHoursOf(store: Pick<ReadStore, "list">) {
  const hours = new Map<string, number>();
  for (const repository of store.list<ClaimRepository>("repositories"))
    if (repository.github && !hours.has(repository.github))
      hours.set(
        repository.github,
        repository.claims?.staleHours ?? DEFAULT_STALE_HOURS,
      );
  return hours;
}

// The newer of a claim's head time and its newest lease's time: a claim is
// stale only when both are older than the stale hours (15.6), so a fresh
// lease on a quiet base is not stale.
const lastActive = (claim: Claim) =>
  Math.max(Date.parse(claim.at ?? ""), Date.parse(claim.lease?.at ?? "") || 0);

// Whether this runner may resume a claim (15.7): not its own, and its
// newest lease is released or stale, or it has no lease and a stale head.
export function resumable(claim: Claim, hours: number, now = Date.now()) {
  if (claim.own) return false;
  if (claim.lease?.released) return true;
  const at = lastActive(claim);
  return Number.isFinite(at) && now - at > hours * HOUR;
}

// Task IDs another runner's claim holds: its claim has a live lease. This
// runner works its own claims, and a claim it may resume is ready again.
export function heldTaskIds(store: Store, now = Date.now()) {
  const hours = staleHoursOf(store),
    held = new Set(
      Object.entries(cacheOf(store)).flatMap(([repository, claims]) =>
        claims
          .filter(
            (claim) =>
              !claim.own &&
              !resumable(
                claim,
                hours.get(repository) ?? DEFAULT_STALE_HOURS,
                now,
              ),
          )
          .map((claim) => claim.branch),
      ),
    );
  if (!held.size) return new Set<string>();
  return new Set(
    store
      .read()
      .tasks.filter((task) => held.has(claimBranch(task)))
      .map((task) => task.id),
  );
}

// Cached claims whose head commit and newest lease are both older than their
// repository's `claims.staleHours` (default 24), with their age in hours.
export function staleClaims(store: Store, now = Date.now()) {
  const all = cacheOf(store),
    stale: (Claim & {
      repository: string;
      hours: number;
      ageHours: number;
      staleAt: string;
    })[] = [];
  for (const [repository, hours] of staleHoursOf(store)) {
    for (const claim of all[repository] || []) {
      const at = lastActive(claim);
      if (Number.isFinite(at) && now - at > hours * HOUR)
        stale.push({
          ...claim,
          repository,
          hours,
          ageHours: Math.floor((now - at) / HOUR),
          staleAt: new Date(at + hours * HOUR).toISOString(),
        });
    }
  }
  return stale.sort((a, b) => a.staleAt.localeCompare(b.staleAt));
}

// In flight's claim rows: every cached claim branch, with
// its task, who holds it, its head and age, and whether it is stale. Reads
// the cache only.
// shortcut: the holder is this runner or another one; name the login once
// the claims read records each branch's pusher.
export function claimsView(store: Store, now = Date.now()) {
  const all = cacheOf(store),
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
export function claimsNeedsYou(store: Store, now = Date.now()) {
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
export async function deleteClaim(
  store: ClaimStore & {
    list(table: "repositories"): { github?: string | null }[];
  },
  github: DeleteGitHub,
  { repository, branch }: { repository?: unknown; branch?: unknown },
) {
  const claim = parseClaimRef({ ref: `refs/heads/${branch ?? ""}` });
  if (!claim) fail("Name a claim branch: avoozl/<spec>/<task>.", 400);
  const name = String(repository);
  if (
    !store
      .list("repositories")
      .some((r) => String(r.github).toLowerCase() === name.toLowerCase())
  )
    fail(`${name} is not a repository in this workspace.`, 404);
  await deleteWithLeases(github, name, claim);
  forgetClaim(store, name, claim.branch);
  return { deleted: branch, repository };
}

// Claim the first of `candidates` ({task, repository}) whose branch GitHub
// creates at its base head. A 422 means another runner holds it: take the
// next. Ten refusals in one call, or none left, end the call. With no
// candidate at all it returns null. `baseOf` may be async, and a null base
// skips the candidate (its integration branch could not take the default
// branch).
export async function claimFirst<
  C extends {
    task: LeaseTask;
    repository: { github: string; root?: string | null };
  },
>(
  github: CreateGitHub,
  candidates: C[],
  {
    baseOf,
  }: { baseOf: (candidate: C) => string | null | Promise<string | null> },
) {
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
    const head = shaOf(await github.branch(repository.github, base));
    if (!head) fail(`Cannot read the head of ${repository.github} ${base}.`);
    try {
      await github.createBranch(repository.github, branch, head);
    } catch (error) {
      if (!refused(error)) throw error;
      refusals += 1;
      continue;
    }
    // The next generation above any lease refs left by a claim branch
    // deleted outside Avoozl, else 1 (workflow rules 15.1 and 15.5). Its
    // commit records the base head as the start commit.
    const generation =
        ((await leaseRefs(github, repository.github, task))[0]?.generation ??
          0) + 1,
      lease = await takeLease(github, repository.github, task, generation, {
        head,
        start: head,
        signer: await leaseSigner(repository.root),
      });
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
// A branch read's head commit.
const shaOf = (branch: unknown) => {
  const commit =
    branch && typeof branch === "object" && "commit" in branch
      ? branch.commit
      : null;
  return commit &&
    typeof commit === "object" &&
    "sha" in commit &&
    typeof commit.sha === "string"
    ? commit.sha
    : undefined;
};
const leaseRef = (task: ClaimTask, generation: number | "") =>
  `${LEASE_PREFIX}${taskSpec(task)}/${refTask(task)}/${generation}`;

// A task's lease refs, newest (highest generation) first (15.5).
async function leaseRefs(
  github: Pick<CreateGitHub, "branchesUnder">,
  repository: string,
  task: ClaimTask,
) {
  const refs = await github.branchesUnder(repository, leaseRef(task, ""));
  return (Array.isArray(refs) ? refs : [])
    .map((lease) => ({
      generation: Number(String(lease.ref).split("/").pop()) || 0,
      sha: lease.object?.sha ?? null,
    }))
    .sort((a, b) => b.generation - a.generation);
}

// This runner's ID: `avoozl.runner` in the checkout's git config, made once.
// It lives in git, not SQLite, so a rebuilt workspace knows its own leases.
// shortcut: two workspaces sharing one checkout share one runner ID; give
// each its own ID if a person ever runs two on one checkout.
const runnerIds = new Map<string, Promise<string | null>>();
export function runnerId(root: string | null | undefined) {
  if (!root) return Promise.resolve(null);
  let known = runnerIds.get(root);
  if (!known) {
    known = git(root, ["config", "--get", "avoozl.runner"])
      .catch(() => "")
      .then(async (id) => {
        if (id) return id;
        const made = `runner-${randomUUID().slice(0, 12)}`;
        return git(root, ["config", "avoozl.runner", made]).then(
          () => made,
          () => null,
        );
      });
    runnerIds.set(root, known);
  }
  return known;
}

// Who writes a lease: this runner's ID, and the person's git identity as
// the commit's author.
export type Signer = { runner: string | null; author?: Author };
export async function leaseSigner(root: string | null | undefined) {
  const [runner, author] = await Promise.all([
    runnerId(root),
    root ? effectiveGitIdentity(root) : null,
  ]);
  return { runner, ...(author ? { author } : {}) } satisfies Signer;
}

const oneLine = (text: unknown) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();

// A lease commit's message (15.1): the start commit and the task text as
// approved, then lines another runner ignores: the runner that holds it, and
// a labeled issue's authorizing event (11.2).
export function leaseMessage(
  task: LeaseTask,
  generation: number,
  { start, runner }: { start: string; runner?: string | null },
) {
  const issue = task.labeledIssue;
  return [
    `Lease ${taskSpec(task)}/${refTask(task)} generation ${generation}`,
    "",
    `Start: ${start}`,
    `Task: ${oneLine(task.title || task.id)}`,
    ...(Array.isArray(task.acceptance) ? task.acceptance : []).map(
      (done) => `Done: ${oneLine(done)}`,
    ),
    ...(runner ? [`Runner: ${runner}`] : []),
    ...(issue?.number && issue.event?.id
      ? [`Issue #${issue.number} label event ${issue.event.id}`]
      : []),
  ].join("\n");
}

// What a lease or release commit's message names.
export function parseLease(message: string | null | undefined) {
  const lines = String(message ?? "").split("\n"),
    value = (key: string) =>
      lines
        .find((line) => line.startsWith(`${key}: `))
        ?.slice(key.length + 2)
        .trim() || null;
  return {
    released: /^Release /.test(lines[0] ?? ""),
    start: value("Start"),
    runner: value("Runner"),
  };
}

// A child of `parent` with the same tree and `message(parent's message)`:
// a lease, renewal, release or takeover commit. Returns its sha.
async function childCommit(
  github: CommitGitHub,
  repository: string,
  parent: string,
  message: (old: string) => string,
  author?: Author,
) {
  const commit = (await github.commit(repository, parent))?.commit,
    tree = commit?.tree?.sha;
  if (!tree) return fail(`Cannot read commit ${parent} in ${repository}.`, 502);
  const made = await github.createCommit(repository, {
    message: message(commit?.message ?? ""),
    tree,
    parents: [parent],
    ...(author ? { author } : {}),
  });
  return made?.sha ?? fail(`GitHub made no commit in ${repository}.`, 502);
}

// Take generation `generation` of a task's lease by creating its ref at a
// lease commit on the claim head; null when another runner created it
// first.
// shortcut: a client with no commit calls (a test fake) points the lease at
// the claim head, with no message; GitHub's client always writes the commit.
export async function takeLease(
  github: Pick<CreateGitHub, "createBranch"> & ClaimGitHub,
  repository: string,
  task: LeaseTask,
  generation: number,
  { head, start, signer }: { head: string; start: string; signer?: Signer },
) {
  const ref = leaseRef(task, generation),
    sha = canCommit(github)
      ? await childCommit(
          github,
          repository,
          head,
          () =>
            leaseMessage(task, generation, { start, runner: signer?.runner }),
          signer?.author,
        )
      : head;
  try {
    await github.createBranch(repository, ref, sha);
  } catch (error) {
    if (!refused(error)) throw error;
    return null;
  }
  return ref;
}

// Renew this runner's leases (15.6): each newest lease it holds whose commit
// is older than half the stale hours moves to a new lease commit with the
// same message, a fast-forward. Returns the repositories whose renewal
// failed.
export async function renewLeases(
  store: ReadStore,
  github: ClaimGitHub | null | undefined,
  now = Date.now(),
) {
  if (!github || !canCommit(github)) return [];
  const all = cacheOf(store),
    roots = new Map(
      store
        .list<ClaimRepository>("repositories")
        .map((repository) => [repository.github, repository.root]),
    ),
    errors: { repository: string; error: string }[] = [];
  let renewed = false;
  for (const [repository, hours] of staleHoursOf(store))
    for (const claim of all[repository] || []) {
      const lease = claim.lease,
        at = Date.parse(lease?.at ?? "");
      if (!claim.own || !lease?.sha || lease.released) continue;
      if (Number.isFinite(at) && now - at < (hours * HOUR) / 2) continue;
      try {
        const signer = await leaseSigner(roots.get(repository)),
          sha = await childCommit(
            github,
            repository,
            lease.sha,
            (message) => message,
            signer.author,
          );
        await github.moveBranch(repository, lease.ref, sha);
        Object.assign(lease, { sha, at: new Date(now).toISOString() });
        renewed = true;
      } catch (error) {
        errors.push({
          repository,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  if (renewed) store.setMeta(META, all);
  return errors;
}

// Resume a claim this runner may resume (15.7, `resumable`): take the next
// generation, with the start commit its newest lease named, then push the
// takeover commit (15.8). Null when the newest lease moved since the claims
// read, or another runner took that generation first: that runner holds it,
// and this one stops. Returns the new lease and the claim's new head.
export async function resumeClaim(
  github: CreateGitHub,
  {
    repository,
    claim,
    task,
    signer,
  }: { repository: string; claim: Claim; task: LeaseTask; signer: Signer },
) {
  const [newest] = await leaseRefs(github, repository, task);
  if ((newest?.sha ?? null) !== (claim.lease?.sha ?? null)) return null;
  const head = shaOf(await github.branch(repository, claim.branch));
  if (!head) return null;
  const generation = (newest?.generation ?? 0) + 1,
    start = claim.lease?.start ?? head,
    ref = await takeLease(github, repository, task, generation, {
      head,
      start,
      signer,
    });
  if (!ref) return null;
  return {
    lease: {
      ref,
      generation,
      sha: null,
      at: new Date().toISOString(),
      runner: signer.runner,
      start,
    },
    head: await pushTakeover(github, repository, claim.branch, signer.author),
  };
}

// The takeover commit (workflow rule 15.8): a runner that took a lease on an
// existing claim moves the claim branch to a child of its head that changes
// no file, before it works or lands. The old holder's later push builds on
// the head before it, so it is not a fast-forward and is rejected. A
// rejected takeover reads the head again and moves on top of it. Returns the
// takeover commit.
export async function pushTakeover(
  github: ClaimGitHub & Pick<CreateGitHub, "branch">,
  repository: string,
  branch: string,
  author?: Author,
  tries = 3,
) {
  if (!canCommit(github))
    return fail("Taking over a claim needs GitHub's commit calls.", 500);
  for (let attempt = 1; ; attempt++) {
    const head = shaOf(await github.branch(repository, branch));
    if (!head) return fail(`Cannot read the head of ${branch}.`, 502);
    const sha = await childCommit(
      github,
      repository,
      head,
      () => `Take over ${branch}`,
      author,
    );
    try {
      await github.moveBranch(repository, branch, sha);
      return sha;
    } catch (error) {
      if (!refused(error) || attempt >= tries) throw error;
    }
  }
}

// After a takeover, the local claim branch takes origin's head, so the
// worker builds on the takeover commit: a missing branch is made there, the
// worktree that holds it merges it, and an idle branch behind it moves up.
// Never forced.
// shortcut: an idle local branch with commits origin lacks is left as it
// is, and its push is refused; merge it by hand if that ever happens.
export async function syncClaimBranch(
  root: string,
  branch: string,
  { env }: { env?: NodeJS.ProcessEnv } = {},
) {
  const options = env ? { env } : {},
    local = `refs/heads/${branch}`;
  await remoteGit(root, ["fetch", "--quiet", "origin", branch], options);
  const remote = await git(root, ["rev-parse", `origin/${branch}`], options),
    holder = [...(await listWorktrees(root))].find(
      ([, ref]) => ref === local,
    )?.[0];
  if (holder)
    return void (await git(
      holder,
      ["merge", "--quiet", "--no-edit", remote],
      options,
    ));
  const current = await git(
    root,
    ["rev-parse", "--verify", "--quiet", local],
    options,
  ).catch(() => "");
  if (!current) return void (await git(root, ["branch", branch, remote]));
  const behind = await git(root, [
    "merge-base",
    "--is-ancestor",
    current,
    remote,
  ]).then(
    () => true,
    () => false,
  );
  if (behind) await git(root, ["update-ref", local, remote, current], options);
}

// Rules 15.3 and 15.9: refuse (409) unless this runner, by its checkout
// `root`, holds the newest lease of claim `claim` and has not released it.
// A claim with no lease ref is not Avoozl's and passes.
async function refuseUnlessHeld(
  root: string,
  claim: Claim,
  newest: { ref: string; message: string } | null,
) {
  if (!newest) return;
  const lease = parseLease(newest.message),
    runner = await runnerId(root);
  if (lease.released || !lease.runner || lease.runner !== runner)
    fail(
      `${claim.branch} has a newer lease than this runner holds, or its lease is released (${newest.ref}), so Avoozl stops work on ${claim.task} and pushes nothing.`,
      409,
    );
}

// The lease check before a push to a claim branch or a land, read with git
// from `url`. A branch that is no claim passes.
export async function holdLease(
  root: string,
  url: string,
  branch: string,
  { env }: { env?: NodeJS.ProcessEnv } = {},
) {
  const claim = parseClaimRef({ ref: `refs/heads/${branch}` });
  if (!claim) return;
  const options = {
      env: { ...(env ?? process.env), GIT_TERMINAL_PROMPT: "0" },
    },
    prefix = `refs/heads/${leaseRef({ id: claim.task, planId: claim.spec }, "")}`,
    [newest] = (
      await remoteGit(root, ["ls-remote", url, `${prefix}*`], options)
    )
      .split("\n")
      .map((line) => line.split(/\s+/))
      .filter(([sha, ref]) => sha && ref?.startsWith(prefix))
      .map(([sha, ref]) => ({
        sha,
        ref: ref.slice("refs/heads/".length),
        generation: Number(ref.slice(prefix.length)) || 0,
      }))
      .sort((a, b) => b.generation - a.generation);
  if (newest)
    await remoteGit(root, ["fetch", "--quiet", url, newest.ref], options);
  await refuseUnlessHeld(
    root,
    claim,
    newest && {
      ref: newest.ref,
      message: await git(
        root,
        ["log", "-1", "--format=%B", newest.sha],
        options,
      ),
    },
  );
}

// The same check read through GitHub's API, for a merge GitHub makes. A
// client without the reads (a test fake) is not checked.
export async function holdLeaseOnGitHub(
  github: ClaimGitHub,
  repository: string,
  root: string,
  branch: string,
) {
  const claim = parseClaimRef({ ref: `refs/heads/${branch}` });
  if (!claim || !github.branchesUnder || !github.commit) return;
  const newest = (await newestLeases(github, repository)).get(
    `${claim.spec}/${claim.task}`,
  );
  await refuseUnlessHeld(
    root,
    claim,
    newest?.sha
      ? {
          ref: newest.ref,
          message:
            (await github.commit(repository, newest.sha))?.commit?.message ??
            "",
        }
      : null,
  );
}
