// What GitHub's own rules on a repository's base branch say, read only:
// rulesets (`rules/branches`) and classic branch protection. Avoozl follows
// them instead of keeping its own copy (owner decision 2026-11-12, R36.13):
// when the branch requires approving reviews, a GitHub leaf's pull-request
// review verdict (task 9.10) needs that many; when it does not, Avoozl's
// reviewer chats are the review gate.
import { parseRepository } from "./github.ts";
import { asJob } from "./github-jobs.ts";

// A ruleset rule GitHub lists for a branch.
interface Rule {
  type?: string;
  parameters?: {
    required_approving_review_count?: unknown;
    dismiss_stale_reviews_on_push?: unknown;
    require_last_push_approval?: unknown;
    required_status_checks?: ({ context?: string } | null)[];
  };
}
// The checks classic protection requires.
type RequiredChecks = {
  contexts?: string[];
  checks?: ({ context?: string } | null)[];
} | null;
// Classic branch protection, as GitHub answers it.
interface Protection {
  required_pull_request_reviews?: {
    required_approving_review_count?: unknown;
    dismiss_stale_reviews?: unknown;
    require_last_push_approval?: unknown;
  } | null;
  required_status_checks?: RequiredChecks;
}
// The GitHub reads the rules make.
export interface RulesReader {
  repository(name: ReturnType<typeof parseRepository>): Promise<{
    default_branch?: string;
    permissions?: { admin?: boolean };
  } | null>;
  branch(
    repository: string,
    branch: string,
  ): Promise<{
    protection?: { enabled?: boolean; required_status_checks?: RequiredChecks };
  } | null>;
  branchRules(repository: string, branch: string): Promise<Rule[] | null>;
  branchProtection(
    repository: string,
    branch: string,
  ): Promise<Protection | null>;
  listCommits(
    repository: string,
    branch: string,
    options: { limit: number },
  ): Promise<({ sha?: string } | null)[] | null>;
  listPullRequests?(
    repository: string,
    options: Record<string, unknown>,
  ): Promise<({ head?: { sha?: string } } | null)[]>;
  checkRuns(
    repository: string,
    sha: string,
  ): Promise<
    ({
      name?: string;
      app?: { name?: string };
      completed_at?: string;
      started_at?: string;
    } | null)[]
  >;
  commitStatus(
    repository: string,
    sha: string,
  ): Promise<{
    statuses?: ({
      context?: string;
      updated_at?: string;
      created_at?: string;
    } | null)[];
  } | null>;
}

const settingsPage = (repository: string, page: string) =>
  `https://github.com/${repository}/settings/${page}`;

// The branch a repository's rules are read on: the policy's base branch,
// else GitHub's default branch.
export async function ruleBranch(
  github: Pick<RulesReader, "repository">,
  repository: string,
  policyEntry: { baseBranch?: string | null } | null | undefined,
) {
  if (policyEntry?.baseBranch) return policyEntry.baseBranch;
  const remote = await github.repository(parseRepository(repository));
  return remote?.default_branch || null;
}

// Whether classic protection is on but hidden from this token: GitHub
// answers 404 on `branches/B/protection` to anyone who is not an admin,
// while `branches/B` still says `protection.enabled`. (`protected` alone is
// also true for rulesets, checked live 2026-11-13.) An admin's 404 is
// real (no classic protection), so this needs the repository's own
// `permissions.admin`; an unreadable answer counts as hidden.
async function classicHidden(
  github: RulesReader,
  repository: string,
  branch: string,
  protection: Protection | null,
) {
  if (protection) return false;
  const remote = await github.branch(repository, branch);
  if (remote?.protection?.enabled !== true) return false;
  const admin = await github
    .repository(parseRepository(repository))
    .then((repo) => repo?.permissions?.admin === true)
    .catch(() => false);
  return !admin;
}

// { approvals, dismissStale, lastPushApproval, sources, hidden,
//   hiddenReason, url }.
// `approvals` is the count GitHub showed: both kinds of rule apply on
// GitHub, so the stricter count wins. `hidden` means classic protection is
// on but GitHub shows its review rule only to admins, so `approvals` is a
// floor and the real count is unknown; Avoozl invents none. Throws when
// GitHub cannot be read; the caller decides what that means.
export async function branchReviewRule(
  github: RulesReader,
  repository: string,
  branch: string,
) {
  const [rules, protection] = await Promise.all([
    asJob("rules-read", github).branchRules(repository, branch),
    asJob("rules-read", github)
      .branchProtection(repository, branch)
      .catch((error) => {
        // Classic protection needs admin access to read; rulesets do not.
        if ((error as { status?: number }).status === 403) return null;
        throw error;
      }),
  ]);
  const hidden = await classicHidden(github, repository, branch, protection);
  let approvals = 0,
    dismissStale = false,
    lastPushApproval = false;
  const sources: string[] = [];
  for (const rule of rules || [])
    if (rule?.type === "pull_request") {
      const count =
        Number(rule.parameters?.required_approving_review_count) || 0;
      approvals = Math.max(approvals, count);
      dismissStale ||= rule.parameters?.dismiss_stale_reviews_on_push === true;
      lastPushApproval ||= rule.parameters?.require_last_push_approval === true;
      sources.push("ruleset");
    }
  const reviews = protection?.required_pull_request_reviews;
  if (reviews) {
    approvals = Math.max(
      approvals,
      Number(reviews.required_approving_review_count) || 0,
    );
    dismissStale ||= reviews.dismiss_stale_reviews === true;
    lastPushApproval ||= reviews.require_last_push_approval === true;
    sources.push("branch protection");
  }
  return {
    branch,
    approvals,
    dismissStale,
    lastPushApproval,
    sources: [...new Set(sources)],
    hidden,
    hiddenReason: hidden
      ? `Classic branch protection is on for ${branch}, but GitHub shows its review rule only to admins.`
      : null,
    url: settingsPage(
      repository,
      hidden ||
        (sources.includes("branch protection") && !sources.includes("ruleset"))
        ? "branches"
        : "rules",
    ),
  };
}

// Check names Avoozl can see for a repository: the check runs and commit
// statuses on the branch's recent commits, and the checks its rules require.
export async function seenCheckNames(
  github: RulesReader,
  repository: string,
  branch: string,
  { commits = 5, pulls = 5 } = {},
) {
  const [recent, open, rules, protection, remote] = await Promise.all([
    github.listCommits(repository, branch, { limit: commits }),
    // Open pull requests into the branch run the checks a task's PR will
    // run; a repo whose CI runs only on PRs shows none on its commits.
    github.listPullRequests
      ? github
          .listPullRequests(repository, {
            state: "open",
            base: branch,
            per_page: pulls,
          })
          .catch(() => [])
      : [],
    asJob("rules-read", github)
      .branchRules(repository, branch)
      .catch(() => []),
    asJob("rules-read", github)
      .branchProtection(repository, branch)
      .catch(() => null),
    // Anyone who can read the repository sees classic required checks here,
    // even when the protection endpoint is admin-only.
    github.branch(repository, branch).catch(() => null),
  ]);
  const seen = new Set<string>(),
    required = new Set<string>(),
    // Where each name was seen last: the app or "status", and when.
    sources: Record<string, { source: string; at: string | null }> = {};
  const note = (name: string, source: string, at: string | undefined) => {
    seen.add(name);
    const last = sources[name];
    if (!last || (at && (!last.at || at > last.at)))
      sources[name] = { source, at: at || null };
  };
  const shas = [
    ...(recent || []).map((commit) => commit?.sha),
    ...(open || []).slice(0, pulls).map((pull) => pull?.head?.sha),
  ].filter(
    (sha, index, all): sha is string =>
      Boolean(sha) && all.indexOf(sha) === index,
  );
  for (const sha of shas) {
    const [runs, status] = await Promise.all([
      github.checkRuns(repository, sha).catch(() => [] as never[]),
      github.commitStatus(repository, sha).catch(() => ({ statuses: [] })),
    ]);
    for (const run of runs)
      if (run?.name)
        note(
          run.name,
          run.app?.name || "Check run",
          run.completed_at || run.started_at,
        );
    for (const entry of status?.statuses || [])
      if (entry?.context)
        note(
          entry.context,
          "Commit status",
          entry.updated_at || entry.created_at,
        );
  }
  for (const rule of rules || [])
    if (rule?.type === "required_status_checks")
      for (const check of rule.parameters?.required_status_checks || [])
        if (check?.context) required.add(check.context);
  for (const classic of [
    protection?.required_status_checks,
    remote?.protection?.required_status_checks,
  ]) {
    for (const context of classic?.contexts || []) required.add(context);
    for (const check of classic?.checks || [])
      if (check?.context) required.add(check.context);
  }
  const sort = (set: Set<string>) =>
    [...set].sort((a, b) => a.localeCompare(b));
  return {
    branch,
    seen: sort(new Set([...seen, ...required])),
    required: sort(required),
    sources,
    url: `https://github.com/${repository}/settings/rules`,
  };
}
