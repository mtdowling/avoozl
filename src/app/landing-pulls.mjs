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
//   across a base merge or when the rule does not (`reviewVerdict`
//   `standing`). A rule that requires the last push to be approved needs
//   an approval on the exact head.
// - Source push rights are not merge rights. With merge rights the merge is
//   guarded by the head (`headGuardedMerge`). Without them Avoozl keeps the
//   portion queued and observes an authorized maintainer's merge.
// - The kept record holds the actual approvers and the actual merger.
//
// shortcut: required checks are read from rulesets and classic protection
// only; a repository that requires none needs `checks` names passed in.
// Upgrade when setup (42.2) records a repository's check names.
import { landingMessage } from "./landing-trailers.mjs";
import { commitSubject } from "./landing-config.mjs";
import { branchReviewRule } from "./github-branch-rules.mjs";
import { reviewVerdict } from "./github-reviews.mjs";
import { headGuardedMerge } from "./driver-generations.mjs";
import { journalChecks, landWithIntents } from "./merge-batch.mjs";
import {
  landingRights,
  pushHead,
  qualifiedRef,
  verifyRelationship,
} from "./working-heads.mjs";
import { postVerified } from "./setup-landing.mjs";
import { fail } from "./store.mjs";
import { firstErrorLine } from "./verify.mjs";

const lower = (value) => String(value).toLowerCase();
const PASS = new Set(["success", "neutral", "skipped"]);

// The pull request for an entry: by number, else the open one for its head
// branch and base. A fork's head is `owner:branch`. A fork in the target's
// own organization shares that owner, and GitHub's head filter then names
// the target's own branch (checked live 2026-11-18), so those are listed by
// base and matched by head repository and branch.
// shortcut: that listing reads every pull request on the base; keep the
// number on the queue entry when a busy repository lands from such forks.
async function findPull(github, target, entry, base) {
  if (entry.pr) return github.pullRequest(target, entry.pr);
  const { repository, branch } = entry.source,
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
//   store       the workspace, whose content rules check every push
//   commitPrefix  the repository's landing.commitPrefix, for pull request titles
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
  store,
  commitPrefix = "",
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
    intents = (entry, candidate, base, ref, passed = []) => {
      const given = intent(entry.spec, [entry]),
        evidence = journalChecks(passed);
      return [
        {
          journal: given.journal,
          options: given.options,
          input: {
            op: `land.${candidate.slice(0, 16)}`,
            // The required checks that passed on this head, unless given.
            ...(current?.passed ? { checks: current.passed } : {}),
            ...given.input,
            ...(evidence.length ? { checks: evidence } : {}),
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
            tasks: entry.tasks.map(({ task, definition }) => ({
              task,
              definition,
            })),
          },
        },
      ];
    };
  let current = null; // the pull request the last prepare settled on
  // Every required check at `candidate`: its result, whether it is still
  // pending, and whether it failed.
  const headChecks = async (candidate, branch) => {
    const required = await requiredChecks(github, target, branch, declared);
    if (!required.length) return { required, results: [] };
    const [runs, status] = await Promise.all([
      github.checkRuns(target, candidate),
      github.commitStatus(target, candidate),
    ]);
    return {
      required,
      results: required.map((name) => {
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
    };
  };
  const passing = (r) =>
    !r.pending && (PASS.has(r.conclusion) || r.conclusion === "success");
  return {
    log,
    async readBase() {
      return (await github.branchHead(target, base)).oid;
    },
    // Someone else merged exactly this head: record their landing once.
    // The evidence is the required checks GitHub shows on that head, read
    // here, so a later tick with fresh steps records it too. A head whose
    // required checks did not all pass is recorded without evidence.
    async observe(entry) {
      const pull = await findPull(github, target, entry, entry.base);
      if (!pull?.merged_at || pull.head?.sha !== entry.commit) return null;
      const { results } = await headChecks(entry.commit, entry.base),
        passed =
          results.length && results.every(passing)
            ? results.map((r) => ({
                name: r.command,
                conclusion: r.conclusion,
              }))
            : [],
        ref = { ...refOf(entry, entry.base), pr: pull.number },
        { pushed } = await landWithIntents(
          intents(
            entry,
            entry.commit,
            pull.base?.sha ?? entry.commit,
            ref,
            passed,
          ),
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
        pull = await github.createPullRequest(target, {
          title: commitSubject(
            commitPrefix,
            `Land ${entry.tasks.length === 1 && entry.tasks[0].public ? entry.tasks[0].public : entry.key}`,
          ),
          head:
            fork && !sameOwner
              ? `${sourceOwner}:${ref.source.branch}`
              : ref.source.branch,
          ...(sameOwner ? { head_repo: `${sourceOwner}/${sourceName}` } : {}),
          base: entry.base,
          body: entry.tasks
            .map((t) => `Avoozl-Task: ${t.public ?? t.task}@${t.definition}`)
            .join("\n"),
        });
      }
      if (pull.head?.sha !== entry.commit)
        fail(
          `Pull request #${pull.number} does not carry the exact commit.`,
          409,
        );
      // The exact verified head says so on GitHub. A login that may not
      // write statuses on the target skips it; landing does not depend on it.
      await postVerified(github, target, entry.commit).catch((error) => {
        if (error?.status !== 403 && error?.status !== 404) throw error;
      });
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
      const { pull } = current,
        { required, results } = await headChecks(candidate, entry.base);
      if (!required.length)
        return {
          ok: false,
          checks: [{ command: "no required check", exitCode: 1 }],
        };
      const shown = results.map(
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
      if (results.some((r) => r.pending))
        return { wait: true, reason: "checks", checks: shown };
      current.passed = results.map((r) => ({
        name: r.command,
        conclusion: r.conclusion,
      }));
      // Standing reviews on this exact head, by the repository's own rule.
      const rule = await branchReviewRule(github, target, entry.base);
      if (rule.hidden) return { wait: true, reason: "review", checks: shown };
      let approvers = [];
      if (rule.approvals) {
        const reviews = await github.pullRequestReviews(target, pull.number),
          verdict = await reviewVerdict(
            { minimumPermission: "write" },
            { number: pull.number, url: pull.html_url, headRefOid: candidate },
            reviews,
            async (who) => (await github.permission(target, who))?.permission,
            { standing: !rule.lastPushApproval, approvals: rule.approvals },
          );
        if (verdict.state !== "approved")
          return { wait: true, reason: "review", checks: shown };
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
    async land({ entry, candidate, baseHead, checks = [] }) {
      const { pull, ref } = current,
        rights = await landingRights(github, ref, login);
      if (rights.land !== "merge") return false;
      const { pushed, results } = await landWithIntents(
        intents(entry, candidate, baseHead, ref, checks),
        // Avoozl writes the merge commit's message: the same trailers a
        // direct landing carries, so its metrics live in git (§4.42). A
        // private task keeps its public name and no metrics.
        () =>
          headGuardedMerge(github, target, pull.number, candidate, method, {
            title: `${pull.title ?? commitSubject(commitPrefix, `Land ${entry.key}`)} (#${pull.number})`,
            message: landingMessage(
              "",
              entry.tasks
                .filter((t) => typeof t !== "string")
                .map((t) =>
                  t.public ? { task: t.public, definition: t.definition } : t,
                ),
            ),
          }),
      );
      log.results.push(results);
      return pushed;
    },
  };
}
