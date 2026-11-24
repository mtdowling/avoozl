// Pull request landing from a target repository or a fork (Requirements
// 87.3, 87.4, 91.2, 102.8 and 102.18, design §4.32.3a, §4.32.5 and §4.32.6,
// task 42.1). Plugs into the per-base landing queue (landing-queue.mjs).
//
// - A portion is one pull request for an exact verified commit. Its head may
//   be a branch of an authorized fork; nothing is copied upstream. Each
//   portion lands alone: protected review never makes a merge batch.
// - Only the queue head is touched. If the pull request's head is not the
//   exact commit, Avoozl fast-forwards the source branch, and only when its
//   own login may write there (`landingRights`). A fork's maintainer-only
//   branch is never pushed to.
// - The head must pass every required check and meet the repository's review
//   rule on that exact head. Pending checks or reviews keep the portion
//   queued ("waiting", with reason "checks" or "review"); a failed check
//   fails it. An approval counts while GitHub still shows it: GitHub
//   dismisses stale ones itself when the rule says so, and keeps them
//   across a base merge or when the rule does not (`standingApprovals`). A rule that requires the last push to be approved needs
//   an approval on the exact head.
// - Source push rights are not merge rights. With merge rights the merge is
//   guarded by the head (`headGuardedMerge`). Without them Avoozl keeps the
//   portion queued and observes an authorized maintainer's merge.
// - The kept record holds the actual approvers and the actual merger.
// - `pr` (landing.pr, R119) says how a pull request opens and merges.
//   draft: it opens as a draft and waits ("waiting", reason "draft"),
//   never merged; a failed check on it still goes back to the worker. A
//   person releases it: Ready for review on GitHub, seen on the next read
//   of the pull request, or Approve in Avoozl (`releaseDraft`), which only
//   marks it ready. A push to a released pull request leaves it released.
//   draft and ready: once the checks and reviews pass on the exact head it
//   waits (reason "merge") for a person, who merges on GitHub (seen by
//   `observe`) or presses Merge in Avoozl (`approveMerge`) for that head.
//   auto: it opens ready and Avoozl merges it guarded by the head. A
//   labeled issue it closes is checked again first (rule 11.4); a failed
//   check holds the task in Needs you and leaves the merge to a person.
//   shortcut: auto merges from the tick and never arms GitHub auto-merge;
//   add that when a repository needs merges between ticks.
//
// shortcut: required checks are read from rulesets and classic protection
// only; a repository that requires none needs `checks` names passed in.
// Upgrade when setup (42.2) records a repository's check names.
import { commitSubject } from "./landing-config.ts";
import { branchReviewRule } from "../github/github-branch-rules.ts";
import { headGuardedMerge } from "./guarded-push.ts";
import {
  landingRights,
  pushHead,
  qualifiedRef,
  verifyRelationship,
} from "./push-head.ts";
import { fail } from "../store/store.ts";
import { firstErrorLine } from "../delivery/verify.ts";
import { asJob } from "../github/github-jobs.ts";
import {
  type CheckResult,
  type LandingSteps,
  landingQueue,
  type QueueEntry,
} from "./landing-queue.ts";
import type { Store } from "../store/store.ts";
import {
  holdLabeledIssue,
  type IssueReads,
  labeledIssueRefusal,
} from "../specs/labeled-issues.ts";

const lower = (value: unknown) => String(value).toLowerCase();
// Whether a client has the reads a labeled issue's check makes.
const readsIssues = <T extends Partial<IssueReads>>(
  github: T,
): github is T & IssueReads =>
  typeof github.issue === "function" && typeof github.permission === "function";
const PASS = new Set(["success", "neutral", "skipped"]);

// A pull request as the REST API returns it, in the fields read here.
interface Pull {
  number: number;
  state?: string;
  draft?: boolean;
  title?: string;
  node_id?: string;
  merged_at?: string | null;
  merge_commit_sha?: string | null;
  mergeable?: boolean | null;
  merged_by?: { login?: string } | null;
  head?: { sha?: string; ref?: string; repo?: { full_name?: string } | null };
}
// One check run or commit status on a head.
interface CheckRun {
  name?: string;
  status?: string;
  conclusion?: string | null;
  // GitHub sends null for an output field the check did not fill.
  output?: {
    summary?: string | null;
    text?: string | null;
    title?: string | null;
  } | null;
}
// One required check's state at a head.
interface HeadCheck {
  command: string;
  conclusion: string;
  pending: boolean;
  local?: boolean;
  firstError?: string | null;
}
// A protection or ruleset entry naming required checks.
interface CheckRule {
  type?: string;
  parameters?: { required_status_checks?: { context?: string }[] };
}
// The GitHub calls pull request landing makes.
// Its own reads come first, so their return shapes win over the narrower
// ones the shared helpers declare.
export type PullGitHub = {
  pullRequest(repository: string, number: number): Promise<Pull | null>;
  listPullRequests(
    repository: string,
    query: Record<string, unknown>,
  ): Promise<Pull[]>;
  branchRules(repository: string, branch: string): Promise<CheckRule[]>;
  branch(
    repository: string,
    branch: string,
  ): Promise<{
    protection?: {
      required_status_checks?: {
        contexts?: string[];
        checks?: { context?: string }[];
      };
    };
  } | null>;
  checkRuns(repository: string, commit: string): Promise<CheckRun[]>;
  commitStatus(
    repository: string,
    commit: string,
  ): Promise<{
    statuses: { context?: string; state: string; description?: string }[];
  }>;
  branchHead(repository: string, branch: string): Promise<{ oid: string }>;
  pullRequestReviews(
    repository: string,
    number: number,
  ): Promise<
    { state?: string; user?: { login?: string } | null; commit_id?: string }[]
  >;
  createPullRequest(
    repository: string,
    request: Record<string, unknown>,
  ): Promise<Pull>;
  markPullRequestReadyForReview(nodeId: string | undefined): Promise<unknown>;
} & Parameters<typeof verifyRelationship>[0] &
  Parameters<typeof landingRights>[0] &
  Parameters<typeof branchReviewRule>[0] &
  Parameters<typeof headGuardedMerge>[0] &
  Partial<IssueReads>;
// The plugin checks this machine provides for required names (D8).
interface LocalChecks {
  names: string[];
  result: (
    name: string,
    commit: string,
  ) => { conclusion: string; firstError?: string };
}

// The pull request for an entry: by number, else the open one for its head
// branch and base. A fork's head is `owner:branch`. A fork in the target's
// own organization shares that owner, and GitHub's head filter then names
// the target's own branch (checked live 2026-11-18), so those are listed by
// base and matched by head repository and branch.
// shortcut: that listing reads every pull request on the base; keep the
// number on the queue entry when a busy repository lands from such forks.
async function findPull(
  github: PullGitHub,
  target: string,
  entry: QueueEntry,
  base: string,
): Promise<Pull | null> {
  if (entry.pr) return github.pullRequest(target, entry.pr);
  const { repository, branch } =
      entry.source ?? fail(`${entry.key} has no source branch.`, 400),
    owner = repository.split("/")[0],
    sameOwner =
      lower(repository) !== lower(target) &&
      lower(owner) === lower(target.split("/")[0]),
    found = (
      await github.listPullRequests(target, {
        state: "all",
        ...(sameOwner ? {} : { head: `${owner}:${branch}` }),
        base,
      })
    ).filter(
      (pull) =>
        (!pull.head?.repo?.full_name ||
          lower(pull.head.repo.full_name) === lower(repository)) &&
        (!sameOwner || pull.head?.ref === branch),
    );
  // Newest first: an open one wins, else the newest merged one.
  const open = found.find((pull) => pull.state === "open");
  return open ?? found.find((pull) => pull.merged_at) ?? null;
}

async function requiredChecks(
  github: PullGitHub,
  target: string,
  base: string,
  declared: string[],
) {
  const names = new Set(declared),
    [rules, remote] = await Promise.all([
      asJob("rules-read", github)
        .branchRules(target, base)
        .catch((): CheckRule[] => []),
      github.branch(target, base).catch(() => null),
    ]);
  for (const rule of rules || [])
    if (rule?.type === "required_status_checks")
      for (const check of rule.parameters?.required_status_checks || [])
        if (check?.context) names.add(check.context);
  const classic = remote?.protection?.required_status_checks;
  for (const context of classic?.contexts || []) names.add(context);
  for (const check of classic?.checks || [])
    if (check?.context) names.add(check.context);
  return [...names].sort();
}

// The steps for `pr` landing of the queue's head portion.
//
// options:
//   github      the GitHub client
//   registry    sourceRegistry(...) of the trusted repositories
//   root        a checkout that can push the source branch (for an update)
//   target, base  the target repository, "owner/name", and its base branch
//   login       Avoozl's own login on GitHub
//   checks      check names required in addition to the repository's rules
//   local       {names, result(name, commit)}: required names an approved
//               plugin check on this machine provides, read from its local
//               result and never from GitHub (plugin-checks D8)
//   method      merge method (default "merge")
//   store       the workspace, whose content rules check every push
//   commitPrefix  the repository's landing.commitPrefix, for pull request titles
//   pr          the repository's landing.pr: draft (default), ready or auto
export function pullSteps({
  github,
  registry,
  root,
  target,
  base,
  login,
  checks: declared = [],
  local = { names: [], result: () => ({ conclusion: "pending" }) },
  method = "merge",
  env,
  machine,
  configFile,
  store,
  commitPrefix = "",
  pr = "draft",
}: {
  github: PullGitHub;
  registry: Parameters<typeof verifyRelationship>[2];
  root: string;
  target: string;
  base: string;
  login: string;
  checks?: string[];
  local?: LocalChecks;
  method?: string;
  env?: NodeJS.ProcessEnv;
  machine?: { hostname?: string; username?: string } | null;
  configFile?: string;
  store?: Store | null;
  commitPrefix?: string;
  pr?: string;
}): LandingSteps {
  const refOf = (entry: QueueEntry, base: string, commit = entry.commit) => {
    if (!entry.source?.repository || !entry.source?.branch)
      fail(`${entry.key} has no source repository and branch.`, 400);
    return qualifiedRef({
      source: { ...entry.source, commit },
      target: { repository: target, base },
    });
  };
  // The pull request the last prepare settled on, and its checks once passed.
  let current: {
    pull: Pull;
    ref: ReturnType<typeof qualifiedRef> & { pr: number };
    passed?: { name: string; conclusion: string }[];
  } | null = null;
  const settled = () =>
    current ?? fail("No pull request was prepared for this step.", 500);
  // The labeled-issue tasks a portion's pull request closes, and how many
  // it names.
  const closing = (entry: QueueEntry) => {
    const ids = new Set(
      entry.tasks.flatMap((t) =>
        typeof t === "object" && t.closes ? [t.task] : [],
      ),
    );
    return {
      named: ids.size,
      tasks:
        ids.size && store
          ? store.read().tasks.filter((task) => ids.has(task.id))
          : [],
    };
  };
  // Whether a labeled issue the portion closes is held (its decision).
  const heldIssues = (entry: QueueEntry) =>
    closing(entry).tasks.some((task) => task.decision);
  // Checks each labeled issue the portion closes again; the first refusal
  // holds its task with one Needs you row. A task it cannot find refuses.
  // Returns whether one refused.
  const issueRefused = async (entry: QueueEntry) => {
    const { named, tasks } = closing(entry);
    if (!named) return false;
    if (!store || tasks.length !== named || !readsIssues(github)) return true;
    for (const task of tasks) {
      const reason = await labeledIssueRefusal(store, github, task, login);
      if (!reason) continue;
      holdLabeledIssue(
        store,
        task.id,
        `Avoozl did not merge pull request #${settled().pull.number}, so issue #${task.labeledIssue?.number} stays open: ${reason}. Merge it yourself if the work is what you want.`,
      );
      return true;
    }
    return false;
  };
  // Every required check at `candidate`: its result, whether it is still
  // pending, and whether it failed.
  const headChecks = async (candidate: string, branch: string) => {
    const required = await requiredChecks(github, target, branch, [
      ...declared,
      ...local.names,
    ]);
    if (!required.length) return { required, results: [] };
    const [runs, status] = await Promise.all([
      github.checkRuns(target, candidate),
      github.commitStatus(target, candidate),
    ]);
    const results = required.map((name): HeadCheck => {
        // A plugin check's result is this machine's, on this exact head;
        // a GitHub check of the same name does not count.
        if (local.names.includes(name)) {
          const own = local.result(name, candidate);
          return {
            command: name,
            conclusion: own.conclusion,
            pending: own.conclusion === "pending",
            local: true,
            ...(own.firstError ? { firstError: own.firstError } : {}),
          };
        }
        const run = runs.find((r) => r.name === name),
          state = status.statuses.find((s) => s.context === name);
        if (run)
          return {
            command: name,
            conclusion: run.conclusion ?? "pending",
            pending: run.status !== "completed",
            // A line naming the error beats the title, which is often
            // only a count ("1 error"), so the title is read last.
            firstError: firstErrorLine(
              run.output?.summary,
              run.output?.text,
              run.output?.title,
            ),
          };
        if (state)
          return {
            command: name,
            conclusion: state.state,
            pending: state.state === "pending",
            firstError: firstErrorLine(state.description),
          };
        return { command: name, conclusion: "missing", pending: true };
      }),
      // A required name nothing here provides, with every other check
      // done: no machine here can run it (PK6.4). It waits.
      every = results.every((r) => !r.pending || r.conclusion === "missing");
    return {
      required,
      results: results.map((r) =>
        r.conclusion === "missing" && every && declared.includes(r.command)
          ? { ...r, conclusion: "unprovided" }
          : r,
      ),
    };
  };
  return {
    async readBase() {
      return (await github.branchHead(target, base)).oid;
    },
    // Someone else merged exactly this head: record their landing once. A
    // pull request closed unmerged is reported as closed.
    async observe(entry) {
      const pull = await findPull(github, target, entry, entry.base);
      if (pull?.state === "closed" && !pull.merged_at)
        return { closed: true, pr: pull.number };
      if (!pull?.merged_at || pull.head?.sha !== entry.commit) return null;
      return {
        merged: true,
        candidate: entry.commit,
        pr: pull.number,
        mergedBy: pull.merged_by?.login ?? null,
        mergeCommit: pull.merge_commit_sha ?? null,
      };
    },
    async prepare([entry], baseHead) {
      if (!entry) return fail("Pull request landing takes one portion.", 500);
      const ref = refOf(entry, entry.base);
      await verifyRelationship(github, ref, registry);
      let pull = await findPull(github, target, entry, entry.base);
      if (pull && pull.state !== "open")
        fail(`Pull request #${pull.number} is closed without landing.`, 409);
      if (pull && pull.head?.sha !== entry.commit) {
        // The head differs from the verified commit: update only a source
        // Avoozl may write, never force.
        const rights = await landingRights(github, ref, login);
        if (!rights.checkpoint)
          fail(
            `Pull request #${pull.number} is not at ${entry.commit.slice(0, 12)} and Avoozl cannot write ${entry.source?.repository}.`,
            409,
          );
        await pushHead(root, ref.source, registry, {
          since: baseHead,
          env,
          machine,
          configFile,
          store,
        });
        pull = await github.pullRequest(target, pull.number);
      }
      if (!pull) {
        const fork = lower(ref.source.repository) !== lower(target),
          [sourceOwner, sourceName] = ref.source.repository.split("/"),
          // A fork inside the target's own organization is named by
          // head_repo, its full owner/name, with the bare branch as head;
          // `owner:branch` would name the target's own branch (checked live
          // 2026-11-18: owner:branch with head_repo set to the name alone
          // is refused as an invalid head).
          sameOwner =
            fork && lower(sourceOwner) === lower(target.split("/")[0]);
        pull = await asJob("land", github).createPullRequest(target, {
          title: commitSubject(
            commitPrefix,
            `Land ${publicName(entry) ?? entry.key}`,
          ),
          head:
            fork && !sameOwner
              ? `${sourceOwner}:${ref.source.branch}`
              : ref.source.branch,
          ...(sameOwner ? { head_repo: `${sourceOwner}/${sourceName}` } : {}),
          base: entry.base,
          // landing.pr draft opens a draft a person releases (R119.1).
          draft: pr === "draft",
          body: entry.tasks
            .flatMap((t) =>
              typeof t === "object" && t.closes ? [`Closes #${t.closes}`] : [],
            )
            .join("\n"),
        });
      }
      if (pull.head?.sha !== entry.commit)
        fail(
          `Pull request #${pull.number} does not carry the exact commit.`,
          409,
        );
      current = { pull, ref: { ...ref, pr: pull.number } };
      if (pull.mergeable === false)
        return {
          conflict: ["(conflicts with the base)"],
          key: entry.key,
          pr: pull.number,
        };
      return { candidate: entry.commit, pr: pull.number };
    },
    async check(candidate, [entry]) {
      if (!entry) return fail("Pull request landing takes one portion.", 500);
      const now = settled(),
        { pull } = now,
        { required, results } = await headChecks(candidate, entry.base);
      if (!required.length)
        return {
          ok: false,
          checks: [{ command: "no required check", exitCode: 1 }],
        };
      const shown: CheckResult[] = results.map(
          ({ command, conclusion, pending, firstError }) => {
            const ok = PASS.has(conclusion) || conclusion === "success";
            return {
              command,
              conclusion,
              exitCode: ok ? 0 : 1,
              // The failing check's own first error line, kept for Needs you.
              ...(!ok && !pending && firstError ? { firstError } : {}),
            };
          },
        ),
        failed = results.some(
          (r) =>
            !r.pending && !PASS.has(r.conclusion) && r.conclusion !== "success",
        );
      if (failed) return { ok: false, checks: shown };
      // A failed check goes back to the worker even on a draft; otherwise a
      // draft waits for a person before any review read (R119.2).
      if (pull.draft) return { wait: true, reason: "draft", checks: shown };
      if (results.some((r) => r.pending))
        return { wait: true, reason: "checks", checks: shown };
      now.passed = results.map((r) => ({
        name: r.command,
        conclusion: r.conclusion,
      }));
      // Standing reviews on this exact head, by the repository's own rule.
      const rule = await branchReviewRule(github, target, entry.base);
      if (rule.hidden) return { wait: true, reason: "review", checks: shown };
      let approvers: string[] = [];
      if (rule.approvals) {
        approvers = standingApprovals(
          await github.pullRequestReviews(target, pull.number),
          candidate,
          { standing: !rule.lastPushApproval },
        );
        if (approvers.length < rule.approvals)
          return { wait: true, reason: "review", checks: shown };
      }
      // Unless landing.pr is auto, a person merges (R119.4): Merge in
      // Avoozl for this exact head, else it waits, and a merge on GitHub is
      // recorded by observe(). A labeled issue whose check failed before an
      // auto merge waits for a person the same way (rule 11.4).
      if (
        (pr !== "auto" || heldIssues(entry)) &&
        entry.mergeApproved?.commit !== candidate
      )
        return { wait: true, reason: "merge", checks: shown };
      return {
        ok: true,
        checks: shown,
        record: { pr: pull.number, approvers, mergedBy: login },
      };
    },
    // Merges only with merge rights; otherwise the next observe() records
    // the maintainer's merge and nothing is written here.
    async land({ entry, candidate }) {
      const { pull, ref } = settled();
      if (pull.draft) return false; // never a draft (R119.2)
      const rights = await landingRights(github, ref, login);
      if (rights.land !== "merge") return false;
      // An auto merge closes a labeled issue with no person's say, so the
      // issue is checked again first (rule 11.4). A person's Merge in
      // Avoozl is that person's own authorization.
      if (
        pr === "auto" &&
        entry.mergeApproved?.commit !== candidate &&
        (await issueRefused(entry))
      )
        return false;
      // Avoozl adds no trailer or attribution to the merge commit.
      return headGuardedMerge(github, target, pull.number, candidate, method, {
        title: `${pull.title ?? commitSubject(commitPrefix, `Land ${entry.key}`)} (#${pull.number})`,
        message: "",
      });
    },
  };
}

// The logins whose latest review approves: each reviewer's newest APPROVED
// or CHANGES_REQUESTED review counts, on `head` unless the rule keeps
// approvals across pushes (`standing`). GitHub's own rule decides who may
// approve when the merge is made.
function standingApprovals(
  reviews: Awaited<ReturnType<PullGitHub["pullRequestReviews"]>> | null,
  head: string,
  { standing = false } = {},
) {
  const latest = new Map<
    string,
    { login: string; state: string; commit?: string }
  >();
  for (const review of reviews ?? []) {
    const state = String(review?.state ?? "").toUpperCase(),
      login = review?.user?.login;
    if (
      !login ||
      !["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(state)
    )
      continue;
    latest.set(login.toLowerCase(), { login, state, commit: review.commit_id });
  }
  return [...latest.values()]
    .filter((r) => r.state === "APPROVED" && (standing || r.commit === head))
    .map((r) => r.login);
}

// The queued portion of `key`, in a `pr` repository, or a refusal.
// Which queued portion a person acts on.
// The request's fields, checked by queuedPull.
export interface PortionRef {
  repositoryId?: unknown;
  base?: unknown;
  key?: unknown;
}

// The public name a lone task lands under, if it has one.
const publicName = (entry: QueueEntry) => {
  const [only] = entry.tasks;
  return entry.tasks.length === 1 && typeof only === "object" && only.public
    ? only.public
    : null;
};

function queuedPull(store: Store, { repositoryId, base, key }: PortionRef) {
  if (typeof repositoryId !== "string" || !repositoryId)
    return fail("A landing queue names its repository.", 400);
  if (typeof base !== "string" || !base)
    return fail("A landing queue names its base branch.", 400);
  const repository = store.get<{ id: string; github?: string | null }>(
      "repositories",
      repositoryId,
    ),
    entry = landingQueue(store, { repositoryId, base }).find(
      (e) => e.key === key,
    );
  if (!repository?.github || !entry)
    return fail(`${key ?? "That portion"} is not waiting to land.`, 404);
  if (!entry.pr) return fail(`${key} has no pull request yet.`, 409);
  return {
    repository: { ...repository, github: repository.github },
    entry: { ...entry, pr: entry.pr },
  };
}

// Merge in Avoozl (R119.3): a person's go-ahead for the exact head whose
// checks and reviews passed. The next tick checks that head again and
// merges it, guarded by the head. A person's only (`landing.merge`).
export function approveMerge(
  store: Store,
  at: PortionRef,
  { commit, by }: { commit: string; by?: string },
) {
  const { entry } = queuedPull(store, at);
  if (
    entry.waiting?.reason !== "merge" ||
    entry.waiting.candidate !== commit ||
    entry.commit !== commit
  )
    fail(
      `Pull request #${entry.pr} is not ready to merge at ${String(commit ?? "").slice(0, 12)}: its checks have not passed on that head.`,
      409,
    );
  store.transaction(() =>
    store.put("landing_queue", {
      ...(store.get<QueueEntry>("landing_queue", entry.id) ??
        fail(`${entry.key} left the queue.`, 409)),
      mergeApproved: { commit, by, at: new Date().toISOString() },
    }),
  );
  return { pr: entry.pr, commit };
}

// Approve in Avoozl (R119.3): the queued portion's draft pull request is
// marked ready for review on GitHub. A person's only (the `landing.ready`
// operation). It only marks it ready; landing.pr says who merges. Returns
// {pr, released}; `released` is false when it was already ready.
export async function releaseDraft(
  store: Store,
  github: Pick<PullGitHub, "pullRequest" | "markPullRequestReadyForReview">,
  at: PortionRef,
) {
  const { repository, entry } = queuedPull(store, at),
    pull = await github.pullRequest(repository.github, entry.pr);
  if (pull?.state !== "open")
    fail(`Pull request #${entry.pr} is not open.`, 409);
  if (!pull.draft) return { pr: entry.pr, released: false };
  await asJob("land", github).markPullRequestReadyForReview(pull.node_id);
  return { pr: entry.pr, released: true };
}
