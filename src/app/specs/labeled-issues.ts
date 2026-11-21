// Labeled issues as one-task specs (workflow v1 rule 11, simplify §D5). An
// open issue in a repository whose `labels.require` it passes, each label
// added by a writer, assigned to this runner's login, and not a spec issue,
// is task `issue-<n>`: the issue's title, and its body as its one done
// bullet. It is kept in the workspace cache only, claims
// `avoozl/issue-<n>/issue-<n>` and lands like any task. Its landing record is
// the issue closing: `pr` mode writes `Closes #<n>` in the pull request, and
// `direct` mode closes the issue with a comment naming the landed commit
// (`closeLanded`). Avoozl writes nothing else to the issue.
import { digest, statusComplete } from "../../model.ts";
import { personOf } from "../github/github.ts";
import { asJob } from "../github/github-jobs.ts";
import { issuePasses, labelFilters } from "./label-filters.ts";
import type { IssueEvent, Label, LabelReader } from "./label-filters.ts";
import type { Store } from "../store/store.ts";
import type { Task } from "../../types.ts";

// One issue GitHub lists, as far as this reads it.
interface Issue {
  number: number;
  title?: string;
  body?: string | null;
  state?: string;
  pull_request?: unknown;
  labels?: Label[];
  assignees?: ({ login?: string } | string | null)[];
}
// The GitHub reads and writes labeled issues make.
interface IssueGitHub extends LabelReader {
  listIssues?(repository: string, options: { state: string }): Promise<Issue[]>;
  issueEvents?(repository: string, number: number): Promise<IssueEvent[]>;
  createIssueComment(
    repository: string,
    number: number,
    body: string,
  ): Promise<unknown>;
  updateIssue(
    repository: string,
    number: number,
    patch: Record<string, unknown>,
  ): Promise<unknown>;
}
type Repository = {
  id: string;
  github?: string | null;
  [key: string]: unknown;
};
// The issue a labeled-issue task stands for.
type LabeledIssue = { repository: string; number: number };

const lower = (value: unknown) => String(value ?? "").toLowerCase();
const SPEC_MARK = /<!-- avoozl[:-](spec|epic)[ :]/i;
const issueTaskId = (number: number) => `issue-${number}`;

// A labeled issue lands like a spec's task. It has no spec, so the "spec" a
// landing entry names is the task's plan, or the task itself.
export const landingSpecOf = (
  task:
    | { id: string; planId?: unknown; labeledIssue?: unknown }
    | null
    | undefined,
) => task?.planId ?? (task?.labeledIssue ? task.id : null);
const MAX_BODY = 4000;

// The task for one qualifying issue.
function issueTask(repository: Repository, issue: Issue, now: string): Task {
  const body = String(issue.body ?? "").trim() || String(issue.title),
    acceptance = [body.slice(0, MAX_BODY)];
  return {
    id: issueTaskId(issue.number),
    title: String(issue.title ?? "").slice(0, 200),
    acceptance,
    checks: [],
    status: "planned",
    scope: "runtime",
    kind: "leaf",
    authority: "local",
    repository: repository.id,
    track: "catalog",
    tags: [],
    labeledIssue: {
      repository: String(repository.github),
      number: issue.number,
    },
    // A writer's label is the approval: the definition is pinned here.
    approvedSource: {
      hash: digest(`${issue.title}\n\n${acceptance[0]}`),
      text: acceptance[0],
    },
    dispatch: {
      ready: true,
      state: "authorized",
      reason: "A writer labeled the issue for this runner.",
    },
    needsReview: false,
    createdAt: now,
    updatedAt: now,
  };
}

// Read each repository's open issues once and keep one task per qualifying
// issue. A task whose issue closed is done; one whose issue no longer
// qualifies goes unless its work has started. Returns the read errors.
export async function readLabeledIssues(
  store: Store,
  github: IssueGitHub | null | undefined,
) {
  const listIssues = github?.listIssues?.bind(github),
    issueEvents = github?.issueEvents?.bind(github);
  if (!github || !listIssues || !issueEvents) return [];
  const errors: { repository: unknown; error: string }[] = [],
    keep = new Map<string, { repository: Repository; issue: Issue }>(),
    closed = new Set<string>(),
    read = new Set<string>();
  for (const repository of store.list<Repository>("repositories")) {
    const filters = labelFilters(repository);
    const name = repository.github;
    if (!name || !filters.require.length) continue;
    try {
      const login = lower(await personOf(github, name)),
        roles = new Map<string | undefined, unknown>(),
        permission = async (who: string | undefined) => {
          if (!roles.has(who))
            roles.set(who, (await github.permission(name, who))?.permission);
          return roles.get(who);
        },
        issues = await listIssues(name, { state: "all" });
      read.add(repository.id);
      for (const issue of issues ?? []) {
        if (issue.pull_request || SPEC_MARK.test(issue.body ?? "")) continue;
        const id = issueTaskId(issue.number);
        if (issue.state !== "open") {
          closed.add(id);
          continue;
        }
        const assigned = (issue.assignees ?? []).some(
          (a) => lower((a as { login?: string } | null)?.login ?? a) === login,
        );
        if (!assigned) continue;
        const events = await issueEvents(name, issue.number);
        if ((await issuePasses(issue, events, filters, permission)).pass)
          keep.set(id, { repository, issue });
      }
    } catch (error) {
      errors.push({ repository: name, error: (error as Error).message });
    }
  }
  if (!read.size) return errors;
  const started = new Set(
      store
        .list<{ taskId: string }>("task_deliveries")
        .map((delivery) => delivery.taskId),
    ),
    now = new Date().toISOString(),
    have = new Map(
      store
        .read()
        .tasks.filter((t) => t.labeledIssue)
        .map((t) => [t.id, t]),
    ),
    add = [...keep].filter(([id]) => !have.has(id)),
    // A task whose issue closed is done; one that no longer qualifies goes
    // unless its work started. A repository not read keeps its tasks.
    change = [...have.values()].filter(
      (task) =>
        !keep.has(task.id) &&
        read.has(String(task.repository)) &&
        (closed.has(task.id)
          ? !statusComplete(store.read(), task.status)
          : !started.has(task.id)),
    );
  if (!add.length && !change.length) return errors;
  const gone = new Set(
    change.filter((task) => !closed.has(task.id)).map((task) => task.id),
  );
  store.mutate("Read labeled issues", (data) => {
    const done = data.statuses.find((status) => status.complete)?.id;
    for (const [, { repository, issue }] of add)
      data.tasks.push(issueTask(repository, issue, now));
    data.tasks = data.tasks.filter((task) => !gone.has(task.id));
    for (const task of data.tasks)
      if (
        task.labeledIssue &&
        closed.has(task.id) &&
        done &&
        task.status !== done
      ) {
        // The issue closing is its landing record.
        task.status = done;
        task.updatedAt = now;
      }
  });
  return errors;
}

// `direct` mode's landing record: close the issue with a comment naming the
// landed commit. Returns whether it is closed.
export async function closeLanded(
  github: IssueGitHub,
  task: { labeledIssue?: unknown } | null | undefined,
  commit: string,
) {
  const issue = task?.labeledIssue as LabeledIssue | undefined;
  if (!issue) return false;
  // Closed already (an earlier pass, or by hand): nothing more to write.
  if (
    ((await github.issue(issue.repository, issue.number)) as Issue | null)
      ?.state === "closed"
  )
    return true;
  const writer = asJob("spec-issues", github);
  await writer.createIssueComment(
    issue.repository,
    issue.number,
    `Landed in ${commit}.`,
  );
  await writer.updateIssue(issue.repository, issue.number, {
    state: "closed",
    state_reason: "completed",
  });
  return true;
}
