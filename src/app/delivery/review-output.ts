// Review output (workflow v1 section 19): each review round's verdict and
// findings, and each failing run of Avoozl's own checks, go out as one
// comment on the task's pull request, or on its spec issue when the task has
// no pull request. The comment names the task and the reviewed commit, and
// starts with a hidden marker of IDs only. It is advisory: Avoozl never
// submits a GitHub approval or change request, and a posted finding approves
// nothing. Each text passes the content rules first; a refused one opens
// their decision and is not posted. One write per round, once.
import { asJob } from "../github/github-jobs.ts";
import { contentBinding, enforce } from "../content/content-rules.ts";
import { taskLinks } from "../tasks/scm-links.ts";
import { taskRepository } from "../../work-model.ts";
import type { Store } from "../store/store.ts";
import type { Task } from "../../types.ts";

// One review finding.
interface Finding {
  kind: string;
  id: string;
  paths: string[];
  text: string;
}
// A review round's binding, as far as its comment reads it.
interface ReviewBinding {
  taskId: string;
  attempt: number;
  role: string;
  report?: {
    kind?: string;
    at?: string;
    commit?: string;
    text?: string;
    review?: { verdict: string; findings: Finding[] };
  } | null;
}
// One check of a run.
interface RunCheck {
  exitCode: number | null;
  command?: string;
  name?: string;
  notRun?: string;
  tail?: string;
}
// A check run's flow record.
interface CheckRun {
  kind?: string;
  state?: string;
  endedAt?: string;
  taskId: string;
  attempt: number;
  head?: string;
  commit?: string;
  checks?: RunCheck[];
}
// Where a task's output goes.
type Target = { repository: string; number: number };

// Only rounds after the first pass are posted, so turning this on does not
// post every review a workspace already holds.
const SINCE = "review-output.since";
const posted = (key: string) => `review-output:${key}`;
const short = (sha: unknown) => String(sha ?? "").slice(0, 12);

const reviewMarker = (taskId: string, round: number, kind: string) =>
  `<!-- avoozl:review task=${taskId} round=${round} kind=${kind} -->`;

// The comment for one review round: its verdict, then each finding.
function reviewComment(binding: ReviewBinding) {
  const report = binding.report ?? {},
    { verdict, findings } = report.review ?? { verdict: "", findings: [] };
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
function checksComment(run: CheckRun) {
  const failing = (run.checks ?? []).filter((c) => c.exitCode !== 0);
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
function targetOf(store: Store, task: Task): Target | null {
  const pull = taskLinks(store, task.id)?.pr;
  if (pull?.number) return { repository: pull.repository, number: pull.number };
  const issue = task.planId
    ? store.get<{ id: string } & Partial<Target>>(
        "receipts",
        `github-parent:plan:${task.planId}`,
      )
    : null;
  return issue?.number
    ? { repository: String(issue.repository), number: issue.number }
    : null;
}

// What is due: review rounds and failing check runs since `since`, not yet
// posted, as {key, taskId, at, body}.
function due(store: Store, since: string) {
  const items: { key: string; taskId: string; body: string }[] = [];
  for (const binding of store.list<ReviewBinding & { id: string }>(
    "session_bindings",
  )) {
    const report = binding.report;
    if (
      report?.kind !== "done" ||
      !report.review ||
      !(typeof report.at === "string" && report.at >= since)
    )
      continue;
    items.push({
      key: `${binding.taskId}:${binding.attempt}:${binding.role}`,
      taskId: binding.taskId,
      body: reviewComment(binding),
    });
  }
  for (const run of store.list<CheckRun & { id: string }>("flow_records")) {
    if (
      run.kind !== "check-run" ||
      run.state !== "finished" ||
      !(typeof run.endedAt === "string" && run.endedAt >= since) ||
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
export async function postReviewOutput(
  store: Store,
  github:
    | { createIssueComment?: unknown; [key: string]: unknown }
    | null
    | undefined,
  { now }: { now?: number } = {},
) {
  if (!github?.createIssueComment) return [];
  let since = store.getMeta<string>(SINCE);
  if (!since) {
    // Written once, the first time there is any output to post, so a pass
    // with none writes nothing.
    if (!due(store, "").length) return [];
    since = new Date(now ?? Date.now()).toISOString();
    store.setMeta(SINCE, since);
    return [];
  }
  const tasks = new Map(store.read().tasks.map((task) => [task.id, task])),
    errors: { repository: string; error: string }[] = [],
    writer = asJob("review-output", github),
    checked = Boolean(contentBinding(store)?.workspaceRoot);
  for (const item of due(store, since)) {
    const task = tasks.get(item.taskId),
      target = task && targetOf(store, task);
    if (!target) continue;
    const record = (state: string) =>
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
      errors.push({
        repository: target.repository,
        error: (error as Error).message,
      });
    }
  }
  return errors;
}
