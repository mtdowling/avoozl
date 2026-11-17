// Pull request landing from a target repository or a fork (Requirements
// 87.3, 87.4, 91.2, 102.8 and 102.18, design §4.32.3a, §4.32.5 and §4.32.6,
// task 42.1). Plugs into the per-base landing queue (landing-queue.mjs).
//
// - A portion is one pull request for an exact verified commit. Its head may
//   be a branch of an authorized fork; nothing is copied upstream. Each
//   portion lands alone: protected review never makes a train.
// - Only the queue head is touched. If the pull request's head is not the
//   exact commit, Avoozl fast-forwards the source branch, and only when its
//   own login may write there (`landingRights`). A fork's maintainer-only
//   branch is never pushed to.
// - The head must pass every required check and meet the repository's review
//   rule on that exact head. Pending checks or reviews keep the portion
//   queued ("waiting"); a failed check fails it. Stale approvals after an
//   update count for nothing (`reviewVerdict`).
// - Source push rights are not merge rights. With merge rights the merge is
//   guarded by the head (`headGuardedMerge`). Without them Avoozl keeps the
//   portion queued and observes an authorized maintainer's merge.
// - The kept record holds the actual approvers and the actual merger.
//
// shortcut: required checks are read from rulesets and classic protection
// only; a repository that requires none needs `checks` names passed in.
// Upgrade when setup (42.2) records a repository's check names.
import { branchReviewRule } from "./github-branch-rules.mjs";
import { reviewVerdict } from "./github-reviews.mjs";
import { headGuardedMerge } from "./driver-generations.mjs";
import { landWithIntents } from "./landing-trains.mjs";
import {
  landingRights,
  pushHead,
  qualifiedRef,
  verifyRelationship,
} from "./working-heads.mjs";
import { fail } from "./store.mjs";

const lower = (value) => String(value).toLowerCase();
const PASS = new Set(["success", "neutral", "skipped"]);

// The pull request for an entry: by number, else the open one for its head
// branch and base. A fork's head is `owner:branch`.
async function findPull(github, target, entry, base) {
  if (entry.pr) return github.pullRequest(target, entry.pr);
  const { repository, branch } = entry.source,
    head = `${repository.split("/")[0]}:${branch}`,
    found = await github.listPullRequests(target, {
      state: "all",
      head,
      base,
    });
  // Newest first: an open one wins, else the newest merged one.
  const open = found.find((pull) => pull.state === "open");
  return open ?? found.find((pull) => pull.merged_at) ?? null;
}

async function requiredChecks(github, target, base, declared) {
  const names = new Set(declared),
    [rules, remote] = await Promise.all([
      github.branchRules(target, base).catch(() => []),
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
//   method      merge method (default "merge")
//   intent(spec, entries) -> {journal, input, options} as in directSteps
export function pullSteps({
  github,
  registry,
  root,
  target,
  base,
  login,
  checks: declared = [],
  method = "merge",
  intent,
  env,
  machine,
  configFile,
}) {
  if (typeof intent !== "function")
    fail("Pull request landing writes an intent before every merge.", 400);
  const log = { results: [] },
    refOf = (entry, base, commit = entry.commit) => {
      if (!entry.source?.repository || !entry.source?.branch)
        fail(`${entry.key} has no source repository and branch.`, 400);
      return qualifiedRef({
        source: { ...entry.source, commit },
        target: { repository: target, base },
      });
    },
    intents = (entry, candidate, base, ref) => {
      const given = intent(entry.spec, [entry]);
      return [
        {
          journal: given.journal,
          options: given.options,
          input: {
            op: `land.${candidate.slice(0, 16)}`,
            ...given.input,
            refs: [
              {
                ...ref.source,
                commit: candidate,
                ...(ref.pr ? { pr: ref.pr } : {}),
              },
            ],
            spec: entry.spec,
            candidate,
            base,
            tasks: entry.tasks,
          },
        },
      ];
    };
  let current = null; // the pull request the last prepare settled on
  return {
    log,
    async readBase() {
      return (await github.branchHead(target, base)).oid;
    },
    // Someone else merged exactly this head: record their landing once.
    async observe(entry) {
      const pull = await findPull(github, target, entry, entry.base);
      if (!pull?.merged_at || pull.head?.sha !== entry.commit) return null;
      const ref = { ...refOf(entry, entry.base), pr: pull.number },
        { pushed } = await landWithIntents(
          intents(entry, entry.commit, pull.base?.sha ?? entry.commit, ref),
          async () => true,
        );
      if (!pushed) return null;
      return {
        merged: true,
        candidate: entry.commit,
        pr: pull.number,
        mergedBy: pull.merged_by?.login ?? null,
        mergeCommit: pull.merge_commit_sha ?? null,
      };
    },
    async prepare([entry], baseHead) {
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
            `Pull request #${pull.number} is not at ${entry.commit.slice(0, 12)} and Avoozl cannot write ${entry.source.repository}.`,
            409,
          );
        await pushHead(root, ref.source, registry, {
          since: baseHead,
          env,
          machine,
          configFile,
        });
        pull = await github.pullRequest(target, pull.number);
      }
      if (!pull) {
        const fork = lower(ref.source.repository) !== lower(target);
        pull = await github.createPullRequest(target, {
          title: `Land ${entry.key}`,
          head: fork
            ? `${ref.source.repository.split("/")[0]}:${ref.source.branch}`
            : ref.source.branch,
          base: entry.base,
          body: entry.tasks
            .map((t) => `Avoozl-Task: ${t.task}@${t.definition}`)
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
        return { conflict: ["(conflicts with the base)"], key: entry.key };
      return { candidate: entry.commit };
    },
    async check(candidate, [entry]) {
      const { pull } = current,
        required = await requiredChecks(github, target, entry.base, declared);
      if (!required.length)
        return {
          ok: false,
          checks: [{ command: "no required check", exitCode: 1 }],
        };
      const [runs, status] = await Promise.all([
          github.checkRuns(target, candidate),
          github.commitStatus(target, candidate),
        ]),
        results = required.map((name) => {
          const run = runs.find((r) => r.name === name),
            state = status.statuses.find((s) => s.context === name);
          if (run)
            return {
              command: name,
              conclusion: run.conclusion ?? "pending",
              pending: run.status !== "completed",
            };
          if (state)
            return {
              command: name,
              conclusion: state.state,
              pending: state.state === "pending",
            };
          return { command: name, conclusion: "missing", pending: true };
        }),
        shown = results.map(({ command, conclusion }) => ({
          command,
          conclusion,
          exitCode: PASS.has(conclusion) || conclusion === "success" ? 0 : 1,
        })),
        failed = results.some(
          (r) =>
            !r.pending && !PASS.has(r.conclusion) && r.conclusion !== "success",
        );
      if (failed) return { ok: false, checks: shown };
      if (results.some((r) => r.pending)) return { wait: true, checks: shown };
      // Standing reviews on this exact head, by the repository's own rule.
      const rule = await branchReviewRule(github, target, entry.base);
      if (rule.hidden) return { wait: true, checks: shown };
      let approvers = [];
      if (rule.approvals) {
        const reviews = await github.pullRequestReviews(target, pull.number),
          verdict = await reviewVerdict(
            {
              pullRequestReviews: { approvals: rule.approvals },
              minimumPermission: "write",
            },
            { number: pull.number, url: pull.html_url, headRefOid: candidate },
            reviews,
            async (who) => (await github.permission(target, who))?.permission,
          );
        if (verdict.state !== "approved") return { wait: true, checks: shown };
        approvers = verdict.reviews
          .filter((r) => r.allowed && !r.stale && r.state === "approved")
          .map((r) => r.reviewer);
      }
      return {
        ok: true,
        checks: shown,
        record: { pr: pull.number, approvers, mergedBy: login },
      };
    },
    // Merges only with merge rights; otherwise the next observe() records
    // the maintainer's merge and nothing is written here.
    async land({ entry, candidate, baseHead }) {
      const { pull, ref } = current,
        rights = await landingRights(github, ref, login);
      if (rights.land !== "merge") return false;
      const { pushed, results } = await landWithIntents(
        intents(entry, candidate, baseHead, ref),
        () => headGuardedMerge(github, target, pull.number, candidate, method),
      );
      log.results.push(results);
      return pushed;
    },
  };
}
