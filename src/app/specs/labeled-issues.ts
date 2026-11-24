// Labeled issues as one-task specs (workflow v1 rule 11). An
// open issue in a repository whose `labels.require` it passes, each label
// added by a writer, assigned to this runner's login alone, not edited since
// the label, and not a spec issue, is task `issue-<n>`: the issue's title,
// and its body as its one done bullet. The task keeps the label event that
// authorized it. It is kept in the workspace cache only, claims
// `avoozl/issue-<n>/issue-<n>` and lands like any task. Its landing record is
// the issue closing: `pr` mode writes `Closes #<n>` in the pull request, and
// `direct` mode closes the issue with a comment naming the landed commit
// (`closeLanded`). Before Avoozl itself merges (`auto`) or closes
// (`direct`), it checks the issue again (rule 11.4); a failed check leaves
// the issue open with one Needs you row. A person's merge is that person's
// own authorization. Avoozl writes nothing else to the issue.
import { digest, statusComplete } from "../../model.ts";
import { personOf } from "../github/github.ts";
import { asJob } from "../github/github-jobs.ts";
import { issuePasses, labelFilters, newestLabeled } from "./label-filters.ts";
import type {
  IssueEvent,
  Label,
  LabelReader,
  Permission,
} from "./label-filters.ts";
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
// The GitHub reads a labeled issue's check makes. `graphql` reads when the
// issues were last edited; without it every issue is refused (rule 11.4).
export interface IssueReads extends LabelReader {
  issueEvents?(repository: string, number: number): Promise<IssueEvent[]>;
  graphql?<T = unknown>(
    query: string,
    variables: Record<string, unknown>,
    what: string,
  ): Promise<T | undefined>;
}
// The GitHub reads and writes labeled issues make.
interface IssueGitHub extends IssueReads {
  listIssues?(repository: string, options: { state: string }): Promise<Issue[]>;
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
// The label event that authorized an issue (rule 11.2).
type LabelEvent = { id: string; createdAt: string };
// An issue's check: the event that authorizes it, and why it is held if
// its body is too long; or why it is refused.
type Verdict = { event: LabelEvent; hold?: string } | { reason: string };
// What a GraphQL read of edit times answers: alias -> issue.
type EditReply = {
  repository?: Record<string, { lastEditedAt?: string | null } | null> | null;
};

const lower = (value: unknown) => String(value ?? "").toLowerCase();
const SPEC_MARK = /<!-- avoozl[:-](spec|epic)[ :]/i;
const issueTaskId = (number: number) => `issue-${number}`;
// shortcut: a body over this is held, not cut; raise it when real issues
// need more.
const MAX_BODY = 4000;

// A labeled issue lands like a spec's task. It has no spec, so the "spec" a
// landing entry names is the task's plan, or the task itself.
export const landingSpecOf = (
  task:
    | { id: string; planId?: unknown; labeledIssue?: unknown }
    | null
    | undefined,
) => task?.planId ?? (task?.labeledIssue ? task.id : null);

// The text a task pins from its issue, and its hash.
function pinned(issue: Issue) {
  const text = String(issue.body ?? "").trim() || String(issue.title);
  return { text, hash: digest(`${issue.title}\n\n${text}`) };
}

// Whether `login` is the issue's only assignee (rule 11.2).
const soleAssignee = (issue: Issue, login: string) => {
  const assignees = issue.assignees ?? [];
  return (
    assignees.length === 1 &&
    lower(
      typeof assignees[0] === "string" ? assignees[0] : assignees[0]?.login,
    ) === login
  );
};

// Each issue's last edit, from one GraphQL query for the repository:
// number -> lastEditedAt, null when never edited. An issue the answer
// leaves out is unknown.
// shortcut: one alias per issue in one query; page it when a runner holds
// hundreds of assigned issues.
async function editTimes(
  github: IssueReads,
  repository: string,
  numbers: number[],
) {
  const times = new Map<number, string | null>(),
    valid = numbers.filter((n) => Number.isSafeInteger(n) && n > 0);
  if (!valid.length || typeof github.graphql !== "function") return times;
  const [owner, name] = repository.split("/"),
    fields = valid
      .map((n) => `i${n}: issue(number: ${n}) { lastEditedAt }`)
      .join(" "),
    data = await github.graphql<EditReply>(
      `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
      { owner, name },
      "read when labeled issues were edited",
    );
  for (const n of valid) {
    const node = data?.repository?.[`i${n}`];
    if (node && node.lastEditedAt !== undefined)
      times.set(n, node.lastEditedAt);
  }
  return times;
}

// Whether `issue` authorizes `login` now (rule 11): open, assigned to it
// alone, passing the filters, its label event known, and neither renamed
// nor edited after that event. `edited` is its lastEditedAt: null when
// never edited, undefined when GitHub did not say, which refuses it (11.4).
async function authorization(
  issue: Issue | null,
  events: IssueEvent[] | null | undefined,
  edited: string | null | undefined,
  filters: ReturnType<typeof labelFilters>,
  permission: Permission,
  login: string,
): Promise<Verdict> {
  if (!issue) return { reason: "GitHub did not return it" };
  if (issue.state !== "open") return { reason: "it is closed" };
  if (!soleAssignee(issue, login))
    return { reason: `it is not assigned to ${login} alone` };
  const passes = await issuePasses(issue, events, filters, permission);
  if (!passes.pass) return { reason: String(passes.reason) };
  // The require label that went on last made the issue qualify.
  const event = filters.require
      .map((name) => newestLabeled(events, name))
      .sort(
        (a, b) =>
          Date.parse(String(b?.created_at)) - Date.parse(String(a?.created_at)),
      )[0],
    at = Date.parse(String(event?.created_at));
  if (!event?.id || !event.created_at || Number.isNaN(at))
    return { reason: "its label event is unclear" };
  if (
    (events ?? []).some(
      (e) =>
        e?.event === "renamed" && !(Date.parse(String(e.created_at)) <= at),
    )
  )
    return { reason: "its title changed after the label" };
  if (edited === undefined)
    return { reason: "GitHub did not say whether it was edited" };
  if (edited !== null && !(Date.parse(edited) <= at))
    return { reason: "its text changed after the label" };
  const verdict = {
    event: { id: String(event.id), createdAt: event.created_at },
  };
  return String(issue.body ?? "").length > MAX_BODY
    ? { ...verdict, hold: `its body is over ${MAX_BODY} characters` }
    : verdict;
}

// The task for one qualifying issue. An issue held for its body's length
// gets a decision, so it waits in Needs you and is never started.
function issueTask(
  repository: Repository,
  issue: Issue,
  { event, hold }: { event: LabelEvent; hold?: string },
  now: string,
): Task {
  const { text, hash } = pinned(issue);
  return {
    id: issueTaskId(issue.number),
    title: String(issue.title ?? "").slice(0, 200),
    acceptance: [text],
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
      event,
    },
    // A writer's label is the approval: the definition is pinned here.
    approvedSource: { hash, text },
    dispatch: {
      ready: true,
      state: "authorized",
      reason: "A writer labeled the issue for this runner.",
    },
    ...(hold
      ? {
          decision: `Issue #${issue.number} is held: ${hold}. Shorten it, then label it again.`,
        }
      : {}),
    needsReview: false,
    createdAt: now,
    updatedAt: now,
  };
}

// One permission read per login.
function permissionOf(github: LabelReader, repository: string): Permission {
  const roles = new Map<string | undefined, unknown>();
  return async (who) => {
    if (!roles.has(who))
      roles.set(who, (await github.permission(repository, who))?.permission);
    return roles.get(who);
  };
}

// Read each repository's open issues once and keep one task per qualifying
// issue. A task whose issue closed is done; one whose issue no longer
// qualifies goes unless its work has started, and one labeled again since
// is read again on the same terms. Returns the read errors.
export async function readLabeledIssues(
  store: Store,
  github: IssueGitHub | null | undefined,
) {
  const listIssues = github?.listIssues?.bind(github),
    issueEvents = github?.issueEvents?.bind(github);
  if (!github || !listIssues || !issueEvents) return [];
  const errors: { repository: unknown; error: string }[] = [],
    keep = new Map<
      string,
      { repository: Repository; issue: Issue; event: LabelEvent; hold?: string }
    >(),
    closed = new Set<string>(),
    read = new Set<string>();
  for (const repository of store.list<Repository>("repositories")) {
    const filters = labelFilters(repository);
    const name = repository.github;
    if (!name || !filters.require.length) continue;
    try {
      const login = lower(await personOf(github, name)),
        permission = permissionOf(github, name),
        issues = await listIssues(name, { state: "all" }),
        shut: string[] = [],
        candidates: { issue: Issue; events: IssueEvent[] }[] = [];
      for (const issue of issues ?? []) {
        if (issue.pull_request || SPEC_MARK.test(issue.body ?? "")) continue;
        if (issue.state !== "open") shut.push(issueTaskId(issue.number));
        else if (soleAssignee(issue, login))
          candidates.push({
            issue,
            events: await issueEvents(name, issue.number),
          });
      }
      // One GraphQL read for every candidate's last edit.
      const edited = await editTimes(
        github,
        name,
        candidates.map((c) => c.issue.number),
      );
      const found: [string, Verdict, Issue][] = [];
      for (const { issue, events } of candidates)
        found.push([
          issueTaskId(issue.number),
          await authorization(
            issue,
            events,
            edited.get(issue.number),
            filters,
            permission,
            login,
          ),
          issue,
        ]);
      // Only a repository read whole changes its tasks.
      for (const id of shut) closed.add(id);
      for (const [id, verdict, issue] of found)
        if ("event" in verdict) keep.set(id, { repository, issue, ...verdict });
      read.add(repository.id);
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
    // New, or labeled again before its work started.
    add = [...keep].filter(([id, { event }]) => {
      const task = have.get(id);
      return (
        !task || (!started.has(id) && task.labeledIssue?.event?.id !== event.id)
      );
    }),
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
  const gone = new Set([
    ...change.filter((task) => !closed.has(task.id)).map((task) => task.id),
    ...add.map(([id]) => id),
  ]);
  store.mutate("Read labeled issues", (data) => {
    const done = data.statuses.find((status) => status.complete)?.id;
    data.tasks = data.tasks.filter((task) => !gone.has(task.id));
    for (const [, { repository, issue, ...verdict }] of add)
      data.tasks.push(issueTask(repository, issue, verdict, now));
    for (const task of data.tasks)
      if (
        task.labeledIssue &&
        closed.has(task.id) &&
        done &&
        task.status !== done
      ) {
        // The issue closing is its landing record, and answers any hold.
        task.status = done;
        delete task.decision;
        task.updatedAt = now;
      }
  });
  return errors;
}

// Why landing must not close `task`'s issue (rule 11.4), or null. The issue
// is read again now: it must still authorize `login` by the same label
// event, and say what the task pinned.
export async function labeledIssueRefusal(
  store: Store,
  github: IssueReads,
  task: Pick<Task, "labeledIssue" | "approvedSource"> | null | undefined,
  login?: string | null,
) {
  const issue = task?.labeledIssue;
  if (!issue?.repository || !issue.number) return "it names no issue";
  if (!issue.event) return "it kept no label event";
  const issueEvents = github.issueEvents?.bind(github);
  if (!issueEvents) return "Avoozl cannot read its events";
  const repository = store
      .list<Repository>("repositories")
      .find((r) => lower(r.github) === lower(issue.repository)),
    [current, events, edited] = await Promise.all([
      github.issue(issue.repository, issue.number) as Promise<Issue | null>,
      issueEvents(issue.repository, issue.number),
      editTimes(github, issue.repository, [issue.number]),
    ]),
    verdict = await authorization(
      current,
      events,
      edited.get(issue.number),
      labelFilters(repository),
      permissionOf(github, issue.repository),
      lower(login ?? (await personOf(github, issue.repository))),
    );
  if ("reason" in verdict) return verdict.reason;
  if (verdict.event.id !== issue.event.id)
    return "it was labeled again after its work started";
  const source = task?.approvedSource;
  if (!current || pinned(current).hash !== source?.hash)
    return "its text is not the text its work was for";
  return null;
}

// One Needs you row for a labeled issue that landing will not close: the
// task's decision, set once.
export function holdLabeledIssue(store: Store, id: string, text: string) {
  const task = store.read().tasks.find((t) => t.id === id);
  if (!task || task.decision) return;
  store.mutate("Hold a labeled issue", (data) => {
    const held = data.tasks.find((t) => t.id === id);
    if (held && !held.decision) {
      held.decision = text;
      held.updatedAt = new Date().toISOString();
    }
  });
}

// `direct` mode's landing record: check the issue again, then close it
// with a comment naming the landed commit. A failed check leaves it open
// with one Needs you row. Returns whether its landing is finished.
export async function closeLanded(
  store: Store,
  github: IssueGitHub,
  task:
    | (Pick<Task, "labeledIssue" | "approvedSource"> & { id: string })
    | null
    | undefined,
  commit: string,
) {
  const issue = task?.labeledIssue;
  if (!task || !issue?.repository || !issue.number) return false;
  // Closed already (an earlier pass, or by hand): nothing more to write.
  if (
    ((await github.issue(issue.repository, issue.number)) as Issue | null)
      ?.state === "closed"
  )
    return true;
  const refused = await labeledIssueRefusal(store, github, task);
  if (refused) {
    holdLabeledIssue(
      store,
      task.id,
      `${task.id} landed in ${commit.slice(0, 12)}, but issue #${issue.number} stays open: ${refused}. Close it on GitHub if the work is what you want.`,
    );
    return true;
  }
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
