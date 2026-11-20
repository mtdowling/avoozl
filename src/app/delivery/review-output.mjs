// Review output (workflow v1 section 19): each review round's verdict and
// findings, and each failing run of Avoozl's own checks, go out as one
// comment on the task's pull request, or on its spec issue when the task has
// no pull request. The comment names the task and the reviewed commit, and
// starts with a hidden marker of IDs only. It is advisory: Avoozl never
// submits a GitHub approval or change request, and a posted finding approves
// nothing. Each text passes the content rules first; a refused one opens
// their decision and is not posted. One write per round, once.
import { asJob } from "../github/github-jobs.mjs";
import { contentBinding, enforce } from "../content/content-rules.mjs";
import { taskLinks } from "../tasks/scm-links.mjs";
import { taskRepository } from "../../work-model.mjs";

// Only rounds after the first pass are posted, so turning this on does not
// post every review a workspace already holds.
const SINCE = "review-output.since";
const posted = (key) => `review-output:${key}`;
const short = (sha) => String(sha ?? "").slice(0, 12);

export const reviewMarker = (taskId, round, kind) =>
  `<!-- avoozl:review task=${taskId} round=${round} kind=${kind} -->`;

// The comment for one review round: its verdict, then each finding.
export function reviewComment(binding) {
  const { report } = binding,
    { verdict, findings } = report.review;
  return [
    reviewMarker(binding.taskId, binding.attempt, binding.role),
    `Review of \`${binding.taskId}\` at ${short(report.commit)} (${binding.role}, round ${binding.attempt}): **${verdict}**.`,
    ...(report.text ? ["", report.text] : []),
    ...(findings.length
      ? [
          "",
          ...findings.map(
            (f) =>
              `- **${f.kind}** ${f.id} (${f.paths.map((p) => `\`${p}\``).join(", ")}): ${f.text}`,
          ),
        ]
      : []),
    "",
    "Advisory review output: it approves nothing and blocks nothing.",
  ].join("\n");
}

// The comment for one run of Avoozl's own checks that failed: each failing
// check's command and the tail of its output.
export function checksComment(run) {
  const failing = run.checks.filter((c) => c.exitCode !== 0);
  return [
    reviewMarker(run.taskId, run.attempt, "checks"),
    `Checks of \`${run.taskId}\` at ${short(run.head ?? run.commit)} (round ${run.attempt}): **${failing.length} failed**.`,
    ...failing.flatMap((c) => [
      "",
      `\`${c.command ?? c.name ?? "check"}\` ${c.exitCode === null ? `did not run: ${c.notRun ?? "unknown"}` : `exited ${c.exitCode}`}`,
      ...(c.tail ? ["", "```text", c.tail, "```"] : []),
    ]),
  ].join("\n");
}

// Where a task's output goes: its pull request, else its spec issue, as
// {repository, number}; null when it has neither yet.
function targetOf(store, task) {
  const pull = taskLinks(store, task.id)?.pr;
  if (pull?.number) return { repository: pull.repository, number: pull.number };
  const issue = task.planId
    ? store.get("receipts", `github-parent:plan:${task.planId}`)
    : null;
  return issue?.number
    ? { repository: issue.repository, number: issue.number }
    : null;
}

// What is due: review rounds and failing check runs since `since`, not yet
// posted, as {key, taskId, at, body}.
function due(store, since) {
  const items = [];
  for (const binding of store.list("session_bindings")) {
    const report = binding.report;
    if (report?.kind !== "done" || !report.review || !(report.at >= since))
      continue;
    items.push({
      key: `${binding.taskId}:${binding.attempt}:${binding.role}`,
      taskId: binding.taskId,
      body: reviewComment(binding),
    });
  }
  for (const run of store.list("flow_records")) {
    if (
      run.kind !== "check-run" ||
      run.state !== "finished" ||
      !(run.endedAt >= since) ||
      !(run.checks ?? []).some((c) => c.exitCode !== 0)
    )
      continue;
    items.push({
      key: `${run.taskId}:${run.attempt}:checks`,
      taskId: run.taskId,
      body: checksComment(run),
    });
  }
  return items.filter((item) => !store.get("receipts", posted(item.key)));
}

// Post what is due. Returns [{repository, error}]; a failed post is tried
// again on the next pass. `now` is for tests.
export async function postReviewOutput(store, github, { now } = {}) {
  if (!github?.createIssueComment) return [];
  let since = store.getMeta(SINCE);
  if (!since) {
    since = new Date(now ?? Date.now()).toISOString();
    store.setMeta(SINCE, since);
    return [];
  }
  const tasks = new Map(store.read().tasks.map((task) => [task.id, task])),
    errors = [],
    writer = asJob("review-output", github),
    checked = Boolean(contentBinding(store)?.workspaceRoot);
  for (const item of due(store, since)) {
    const task = tasks.get(item.taskId),
      target = task && targetOf(store, task);
    if (!target) continue;
    const record = (state) =>
      store.put("receipts", {
        id: posted(item.key),
        kind: "review-output",
        taskId: item.taskId,
        repository: target.repository,
        number: target.number,
        state,
        at: new Date(now ?? Date.now()).toISOString(),
      });
    if (
      checked &&
      !enforce(
        store,
        {
          boundary: "github",
          repository: taskRepository(task) || null,
          target: `review-output:${item.key}`,
          text: item.body,
        },
        { taskId: task.id },
      ).ok
    ) {
      record("held");
      continue;
    }
    try {
      await writer.createIssueComment(
        target.repository,
        target.number,
        item.body,
      );
      record("posted");
    } catch (error) {
      errors.push({ repository: target.repository, error: error.message });
    }
  }
  return errors;
}
