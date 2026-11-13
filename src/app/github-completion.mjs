import { fail } from "./store.mjs";

function text(value) {
  return String(value || "").trim();
}

function latestByName(checkRuns, statuses) {
  const values = new Map();
  for (const check of checkRuns || []) {
    const name = text(check.name);
    if (!name) continue;
    const candidate = {
      name,
      state: text(check.conclusion || check.status).toLowerCase(),
      source: "check-run",
      order: Number(check.id) || 0,
      url: check.html_url || check.details_url || null,
      // Timing (§4.11, F95): when the run started and completed.
      ...(check.started_at ? { startedAt: check.started_at } : {}),
      ...(check.completed_at ? { completedAt: check.completed_at } : {}),
    };
    if ((values.get(name)?.order || -1) <= candidate.order)
      values.set(name, candidate);
  }
  for (const status of statuses || []) {
    const name = text(status.context);
    if (!name) continue;
    const candidate = {
      name,
      state: text(status.state).toLowerCase(),
      source: "commit-status",
      order: Number(status.id) || 0,
      url: status.target_url || null,
    };
    if ((values.get(name)?.order || -1) <= candidate.order)
      values.set(name, candidate);
  }
  return values;
}

export async function inspectGitHubTaskCompletion(
  github,
  task,
  {
    baseBranch = "main",
    requiredChecks = [],
    // The leaf's registered code repository; the closer must live there and
    // its checks are read there. Defaults to the issue's repository.
    codeRepository,
    // An issue and closers already read this tick.
    issue: known,
    closing: knownClosing,
  } = {},
) {
  const repository = text(task?.github?.repository),
    number = Number(task?.github?.number);
  if (!repository || !Number.isSafeInteger(number) || number <= 0)
    fail("The task has no GitHub issue identity.", 409);
  if (
    !Array.isArray(requiredChecks) ||
    requiredChecks.some((name) => !text(name))
  )
    fail("Required GitHub checks must be non-empty names.");

  const issue = known || (await github.issue(repository, number)),
    code = text(codeRepository || repository);
  if (text(issue.state).toLowerCase() !== "closed")
    return { completed: false, reason: "The GitHub issue is still open." };
  if (text(issue.state_reason).toLowerCase() !== "completed")
    return {
      completed: false,
      reason: "The GitHub issue did not close as completed.",
    };

  const closing =
    knownClosing || (await github.closingPullRequests(repository, number));
  if (closing.length > 1)
    return {
      completed: false,
      conflict: true,
      reason: "Several pull requests claim to close this task.",
      pullRequests: closing.map((pull) => pull.url),
    };
  if (!closing.length)
    return {
      completed: false,
      reason: "No pull request claims to close this task.",
    };

  const pull = closing[0],
    pullRepository = text(pull.repository?.nameWithOwner || repository);
  if (pullRepository.toLowerCase() !== code.toLowerCase())
    return {
      completed: false,
      conflict: true,
      reason: "The closing pull request belongs to another repository.",
      pullRequest: pull.url,
    };
  if (pull.merged !== true || !pull.mergedAt)
    return {
      completed: false,
      reason: "The closing pull request has not merged.",
      pullRequest: pull.url,
    };
  if (text(pull.baseRefName) !== text(baseBranch || "main"))
    return {
      completed: false,
      conflict: true,
      mergedCloser: true,
      reason: `The closing pull request targeted ${text(pull.baseRefName) || "an unknown branch"}, not ${baseBranch}.`,
      pullRequest: pull.url,
    };
  const headSha = text(pull.headRefOid);
  if (!/^[0-9a-f]{40}$/i.test(headSha))
    return {
      completed: false,
      mergedCloser: true,
      reason: "The closing pull request has no exact head commit.",
      pullRequest: pull.url,
    };

  const [checkRuns, status] = await Promise.all([
      github.checkRuns(code, headSha),
      github.commitStatus(code, headSha),
    ]),
    byName = latestByName(checkRuns, status.statuses),
    checks = requiredChecks.map((required) => {
      const found = byName.get(text(required));
      return (
        found || {
          name: text(required),
          state: "missing",
          source: null,
          order: 0,
          url: null,
        }
      );
    }),
    failed = checks.filter((check) => check.state !== "success");
  if (failed.length)
    return {
      completed: false,
      mergedCloser: true,
      reason: "Required checks are missing or unsuccessful.",
      pullRequest: pull.url,
      headSha,
      checks,
    };

  return {
    completed: true,
    repository,
    issue: issue.html_url,
    pullRequest: pull.url,
    pullRequestNumber: pull.number,
    baseBranch,
    headSha,
    mergedAt: pull.mergedAt,
    checks,
  };
}
