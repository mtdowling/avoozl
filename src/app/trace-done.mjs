// Trace's Done work: the pull requests GitHub says merged for tasks of an
// approved spec, newest first, with the crew that claimed each issue. Read
// only. A claim comment that cannot be read leaves that row without a crew.
import { claimOf } from "./radar-events.mjs";

const LIMIT = 20;

export async function doneWork(store, github, { limit = LIMIT } = {}) {
  const finished = store
    .read()
    .tasks.filter(
      (task) =>
        task.githubVerdict?.state === "verified" &&
        task.githubVerdict.mergedAt &&
        task.github?.number,
    )
    .sort((a, b) =>
      b.githubVerdict.mergedAt.localeCompare(a.githubVerdict.mergedAt),
    )
    .slice(0, limit);
  const rows = [];
  for (const task of finished) {
    const { repository, number } = task.github,
      pr =
        task.githubVerdict.pullRequest ??
        task.github.pullRequests?.[0]?.number ??
        null;
    let claim = null;
    try {
      if (github?.available?.())
        claim = claimOf(await github.listIssueComments(repository, number));
    } catch {
      // No crew for this row; the merge itself is still shown.
    }
    rows.push({
      taskId: task.id,
      title: task.title,
      repository,
      issue: number,
      url:
        task.github.url ?? `https://github.com/${repository}/issues/${number}`,
      pr,
      prUrl: pr ? `https://github.com/${repository}/pull/${pr}` : null,
      mergedAt: task.githubVerdict.mergedAt,
      by:
        claim?.crewName || claim?.crewId
          ? { kind: "radar-crew", id: claim.crewId, name: claim.crewName }
          : null,
    });
  }
  return { rows };
}
