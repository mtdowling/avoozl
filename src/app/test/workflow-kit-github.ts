// The workflow kit's GitHub-side probes: each runs Avoozl's own reader or
// writer over a workspace cache in memory and a fake GitHub made from the
// case. Labeled issues (rule 11), publishing a spec issue (8.1), arming
// auto-merge (17.7) and review output (19).
import { Store } from "../store/store.ts";
import {
  closeLanded,
  landingSpecOf,
  readLabeledIssues,
} from "../specs/labeled-issues.ts";
import { publishApproved, queuePublish } from "../specs/spec-publication.ts";
import { armAutoMerge } from "../landing/pr-landing.ts";
import { postReviewOutput } from "../delivery/review-output.ts";
import { claimBranch } from "../workers/claims.ts";
import type { QueueEntry } from "../landing/landing-queue.ts";
import { snapshot } from "./fixtures.ts";
import { found } from "./view-shapes.ts";

// The GitHub name of a case's repository, and the writer who adds a case's
// `stops`.
export const GITHUB = "acme/widget";
export const STOPPER = "acme-maintainer";

// What these probes read of a case.
export interface GitHubCase {
  runner: {
    login: string;
    labels?: { require?: string[]; exclude?: string[]; stop?: string };
  };
  writers?: string[];
  readers?: string[];
  labeledIssues?: KitIssue[];
  issueLanding?: {
    number: number;
    after?: Partial<Pick<KitIssue, "assignees" | "editedAt" | "events">>;
  };
  publish?: {
    spec: string;
    commit: string;
    mergedBy: string;
    assignees: string[];
    existing?: number;
  };
  autoMerge?: { waiting: string; behind: number };
  review?: { task: string; commit: string; issue: number };
}

// One labeled issue of a case (rule 11), with its events oldest first. An
// `at` or `editedAt` is hours into the case's day; `editedAt` is unset or
// null for an issue never edited.
export interface KitIssue {
  number: number;
  title: string;
  body?: string;
  state?: string;
  assignees: string[];
  events?: { event: string; name?: string; by: string; at: number }[];
  editedAt?: number | null;
}

// Each login's permission on the repository: `writers` write, `readers`
// read, the stopper writes, and everyone else has none.
export const roleOf = (
  testCase: Pick<GitHubCase, "writers" | "readers">,
  login: string | undefined,
) =>
  login === STOPPER || (login && testCase.writers?.includes(login))
    ? "write"
    : login && testCase.readers?.includes(login)
      ? "read"
      : "none";

export const hour = (at: number) =>
  new Date(Date.UTC(2026, 0, 1, at)).toISOString();

// An empty workspace cache in memory with the case's one repository.
export function kitWorkspace(
  repository: Record<string, unknown> = { github: GITHUB },
) {
  const store = new Store(":memory:");
  store.initialize(snapshot());
  store.put("repositories", { id: "widget", ...repository });
  return store;
}

// The labels an issue carries after its events.
export const labelsAfter = (events: KitIssue["events"]) =>
  [
    ...(events ?? []).reduce((on, event) => {
      if (event.name && event.event === "labeled") on.add(event.name);
      if (event.name && event.event === "unlabeled") on.delete(event.name);
      return on;
    }, new Set<string>()),
  ].map((name) => ({ name }));

// An issue's events as GitHub lists them.
export const eventsOf = (number: number, events: KitIssue["events"]) =>
  (events ?? []).map((event, index) => ({
    id: number * 100 + index + 1,
    event: event.event,
    created_at: hour(event.at),
    ...(event.name ? { label: { name: event.name } } : {}),
    actor: { login: event.by },
  }));

// Rule 11: Avoozl's labeled issue reader over the case's `labeledIssues`, as
// one repository with the runner's `labels`. `issueTasks` are the tasks it
// keeps, each with its claim branch. `issueClose` lands the
// `issueLanding.number` issue's task in `direct` mode, after `after` changes
// the issue, and says whether Avoozl closed it.
export async function labeledIssues(testCase: GitHubCase) {
  const issues = (testCase.labeledIssues ?? []).map((issue) => ({
      ...issue,
    })),
    byNumber = (number: number) =>
      found(
        issues.find((issue) => issue.number === number),
        `issue #${number}`,
      ),
    closed: number[] = [],
    asIssue = (issue: KitIssue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      state: closed.includes(issue.number) ? "closed" : (issue.state ?? "open"),
      assignees: issue.assignees.map((login) => ({ login })),
      labels: labelsAfter(issue.events),
    }),
    github = {
      personLogin: async () => testCase.runner.login,
      listIssues: async () => issues.map(asIssue),
      issue: async (_repository: string, number: number) =>
        asIssue(byNumber(number)),
      issueEvents: async (_repository: string, number: number) =>
        eventsOf(number, byNumber(number).events),
      // GitHub's GraphQL `lastEditedAt` of each issue.
      graphql: async () => ({
        repository: Object.fromEntries(
          issues.map((issue) => [
            `i${issue.number}`,
            {
              lastEditedAt:
                typeof issue.editedAt === "number"
                  ? hour(issue.editedAt)
                  : null,
            },
          ]),
        ),
      }),
      permission: async (_repository: string, login: string | undefined) => ({
        permission: roleOf(testCase, login),
      }),
      createIssueComment: async () => null,
      updateIssue: async (
        _repository: string,
        number: number,
        patch: Record<string, unknown>,
      ) => {
        if (patch.state === "closed") closed.push(number);
        return null;
      },
    },
    store = kitWorkspace({ github: GITHUB, labels: testCase.runner.labels });
  try {
    await readLabeledIssues(store, github);
    const tasks = store.read().tasks.filter((task) => task.labeledIssue),
      out: Record<string, unknown> = {
        issueTasks: tasks.map((task) => ({
          task: task.id,
          branch: claimBranch({
            id: task.id,
            planId: String(landingSpecOf(task)),
          }),
        })),
      },
      landing = testCase.issueLanding;
    if (landing) {
      const issue = byNumber(landing.number);
      Object.assign(issue, {
        ...landing.after,
        events: [...(issue.events ?? []), ...(landing.after?.events ?? [])],
      });
      await closeLanded(
        store,
        github,
        tasks.find((item) => item.labeledIssue?.number === landing.number),
        "c0ffee",
      );
      out.issueClose = closed.includes(landing.number) ? "closed" : "open";
    }
    return out;
  } finally {
    store.close();
  }
}

// Rule 8.1: Avoozl's publisher for one queued approval of `publish.spec`,
// approved by the pull request `publish.mergedBy` merged, whose assignees
// are `publish.assignees`. `existing` is the number of an open spec issue a
// writer already opened for it. Answers the issue Avoozl creates, with its
// assignees, or null.
export async function published(testCase: GitHubCase) {
  const publish = found(testCase.publish, "publish"),
    created: { assignees: string[] }[] = [],
    store = kitWorkspace();
  try {
    store.put("github_repositories", {
      id: GITHUB,
      owner: GITHUB.split("/")[0],
      repo: GITHUB.split("/")[1],
    });
    store.put("plans", {
      id: publish.spec,
      spec: publish.spec,
      state: "approved",
      title: publish.spec,
      files: {},
    });
    queuePublish(store, publish.spec, publish.commit);
    const github: Parameters<typeof publishApproved>[1]["github"] & {
      personLogin(): Promise<string>;
    } = {
      available: () => true,
      personLogin: async () => testCase.runner.login,
      listIssues: async () =>
        publish.existing
          ? [
              {
                number: publish.existing,
                state: "open",
                author_association: "OWNER",
                user: { login: publish.mergedBy },
                body: `<!-- avoozl-spec:${publish.spec} -->`,
              },
            ]
          : [],
      permission: async (_repository, login) => ({
        permission: roleOf(testCase, login),
      }),
      issue: async () => null,
      commit: async () => ({ author: { login: publish.mergedBy } }),
      pullRequest: async () => ({ assignees: publish.assignees }),
      createIssue: async (_config, issue) => {
        created.push({ assignees: (issue.assignees as string[]) ?? [] });
        return { number: 100 + created.length };
      },
    };
    await publishApproved(store, {
      github,
      identity: { mode: "single-repo", epicIssueType: null },
      evidence: {
        get: () => ({ mergedBy: publish.mergedBy, pull: 1 }),
      },
      homeOf: async () => GITHUB,
    });
    return created[0] ?? null;
  } finally {
    store.close();
  }
}

// Rule 17.7: Avoozl's auto-merge arming for one queued `auto` pull request
// that waits for `autoMerge.waiting` ("checks" or "review") and whose head
// is `autoMerge.behind` commits behind the base. Answers "armed" or
// "not-armed".
export async function autoMerge(testCase: GitHubCase) {
  const { waiting, behind } = found(testCase.autoMerge, "autoMerge"),
    store = kitWorkspace(),
    entry: QueueEntry = {
      id: "entry-1",
      repositoryId: "widget",
      base: "main",
      key: "parser/p-2",
      commit: "head",
      tasks: [{ task: "p-2" }],
      spec: "parser",
      pr: 1,
      seq: 1,
      state: "queued",
      queuedAt: hour(0),
      waiting: { reason: waiting, candidate: "head", checks: [] },
    };
  let armed = false;
  try {
    store.put("landing_queue", entry);
    await armAutoMerge(
      store,
      {
        compareCommits: async () => ({ behind_by: behind }),
        pullRequest: async () => ({ head: { sha: "head" }, node_id: "PR_1" }),
        enablePullRequestAutoMerge: async () => {
          armed = true;
          return null;
        },
      } as unknown as Parameters<typeof armAutoMerge>[1],
      { target: GITHUB, base: "main", entry, method: "squash" },
    );
    return armed ? "armed" : "not-armed";
  } finally {
    store.close();
  }
}

// Rule 19: Avoozl's review output for one finished review round of
// `review.task` at `review.commit`, whose spec issue is `review.issue` and
// which has no pull request. Answers each write it made to GitHub, as
// `{kind, number, namesTask, namesCommit}`.
export async function reviewOutput(testCase: GitHubCase) {
  const review = found(testCase.review, "review"),
    [spec, id] = review.task.split("/"),
    writes: Record<string, unknown>[] = [],
    store = kitWorkspace();
  try {
    const data = store.read(),
      [sample] = data.tasks;
    data.tasks = [{ ...sample, id, planId: spec, repository: "widget" }];
    store.write(data);
    store.put("receipts", {
      id: `github-parent:plan:${spec}`,
      repository: GITHUB,
      number: review.issue,
    });
    store.setMeta("review-output.since", hour(0));
    store.put("session_bindings", {
      id: "review-1",
      taskId: id,
      attempt: 1,
      role: "reviewer",
      report: {
        kind: "done",
        at: hour(1),
        commit: review.commit,
        review: {
          verdict: "changes requested",
          findings: [
            {
              kind: "bug",
              id: "f-1",
              paths: ["src/parser.ts"],
              text: "An unknown token is dropped",
            },
          ],
        },
      },
    });
    const record =
      (kind: string) =>
      async (_repository: string, number: number, body?: string) => {
        writes.push({
          kind,
          number,
          namesTask: String(body).includes(`\`${id}\``),
          namesCommit: String(body).includes(review.commit.slice(0, 12)),
        });
        return null;
      };
    await postReviewOutput(
      store,
      Object.assign(
        { createIssueComment: record("comment") },
        { createReview: record("review") },
      ),
    );
    return writes;
  } finally {
    store.close();
  }
}
