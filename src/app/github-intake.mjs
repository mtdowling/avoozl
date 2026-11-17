// Plan this and Deliver this for a GitHub issue (Requirement 102.19, design
// §4.32.11). A person starts it; nothing here runs from a label or a tick.
//
// - Deliver this: a bounded fix. The task carries a compact, versioned
//   acceptance definition, and the input issue is its journal home. No
//   spec is written.
// - Plan this: an inbox task for the planner, which writes a proportionate
//   spec (or an epic, for several separately owned areas).
// - Initial writes: at most two, each skipped when already there: the
//   crew:avoozl label and one status comment. The comment is fixed text, so
//   it names no spec, repository, path or machine, and it carries no Radar
//   claim marker.
// - Closing the input issue withdraws the request. It never completes the
//   task (watchInputs).
//
// shortcut: no unattended path writes these yet. Before a rule may start
// GitHub intake on its own, a scratch proof must show crews skip an issue
// that carries only crew:avoozl (design §4.32.11, P66).
import { digest } from "../model.mjs";
import { canonical, fail } from "./store.mjs";
import { enforce } from "./content-rules.mjs";
import { AVOOZL_CREW_LABEL, hasAvoozlLabel } from "./github.mjs";
import { workspaceRepositories } from "./workspace-repositories.mjs";
import {
  itemKey,
  patchTask,
  remember,
  setDispatch,
  startTask,
  withPolicy,
} from "./intake.mjs";

export const FIX_VERSION = 1;
export const INTAKE_MARKER = "<!-- avoozl-intake:v1 -->";
const ITEM_ID =
  /^([A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100})#([1-9]\d{0,9})$/;
const lower = (value) => String(value ?? "").toLowerCase();

// "owner/repo#12" -> {repository, number}.
export function parseItemId(id) {
  const found = ITEM_ID.exec(String(id ?? ""));
  if (!found) fail("Name the GitHub item as owner/repository#number.");
  return { repository: found[1], number: Number(found[2]) };
}

// The compact acceptance of a bounded fix. `definition` digests every other
// field, so a changed issue text is a changed definition.
export function boundedFix({ repository, number, title, body }) {
  const fields = {
    v: FIX_VERSION,
    kind: "bounded-fix",
    issue: { repository, number },
    snapshot: digest(`${title}\n\n${body || ""}`),
    acceptance: [
      `The change does what ${repository}#${number} asks, as its text read when it was started.`,
      "The repository's checks pass on the exact head that lands.",
    ],
  };
  return { ...fields, definition: digest(canonical(fields)) };
}

// The one status comment. Fixed text: it names no spec, so a private plan
// is never named on a public issue.
export function statusComment(action) {
  return [
    action === "deliver"
      ? "Avoozl is working on this issue as a bounded fix."
      : "Avoozl is planning this issue.",
    "",
    "Closing this issue withdraws the request.",
    "",
    INTAKE_MARKER,
  ].join("\n");
}

// An input issue may become a spec's journal home only in that home's own
// repository. The same repository has the same visibility.
export const reusableInput = (input, home) =>
  Boolean(input?.repository && home) &&
  Number.isInteger(input.number) &&
  lower(input.repository) === lower(home);

// The closing line a pull request body may carry: only for a person's
// Deliver this, and only in the issue's own repository. Plan this, another
// repository and every other task get none.
export function closingLine(task, repository) {
  const issue = task?.fix?.issue;
  if (task?.intake?.by !== "person" || !issue) return null;
  return lower(issue.repository) === lower(repository)
    ? `Fixes #${issue.number}`
    : null;
}

const labelNames = (issue) =>
  (issue?.labels || [])
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter(Boolean);

// Avoozl's status comment: the marker, written by Avoozl's own login, so
// another person's copy of the marker counts for nothing.
const hasStatus = (comments, login) =>
  comments.some(
    (entry) =>
      String(entry.body).includes(INTAKE_MARKER) &&
      Boolean(login) &&
      lower(entry.user?.login) === lower(login),
  );

// At most two writes, each skipped when it is already there, so a retry
// writes nothing. `comments` is the issue's comment list and `login` the
// signed-in login.
export async function initialWrites(
  github,
  repository,
  issue,
  action,
  { comments, login },
) {
  const writes = [];
  if (!hasAvoozlLabel(labelNames(issue))) {
    await github.addLabels(repository, issue.number, [AVOOZL_CREW_LABEL]);
    writes.push("label");
  }
  if (!hasStatus(comments, login)) {
    await github.createIssueComment(
      repository,
      issue.number,
      statusComment(action),
    );
    writes.push("comment");
  }
  return writes;
}

function itemOf(id, issue) {
  return {
    source: "github",
    id,
    link: issue.html_url,
    kind: "issue",
    title: String(issue.title ?? ""),
    body: String(issue.body ?? ""),
    labels: labelNames(issue),
    author: issue.user?.login ?? null,
    assignees: (issue.assignees || []).map((entry) => entry.login),
    state: "open",
    updatedAt: issue.updated_at ?? "",
    fields: {},
    trigger: null,
  };
}

// intake.plan and intake.deliver for source "github". The caller refuses a
// session or MCP caller, as for every other source.
export async function startGitHubItem(store, github, policy, input = {}) {
  const { action } = input;
  if (!["deliver", "plan"].includes(action)) fail("Choose deliver or plan.");
  const { repository, number } = parseItemId(input.id);
  const name = Object.keys(policy?.repositories || {}).find(
    (entry) => lower(entry) === lower(repository),
  );
  if (!name) fail(`${repository} is not a registered repository.`, 404);
  if (!github?.available?.()) fail("GitHub is not connected.", 409);
  const id = `${name}#${number}`,
    key = itemKey("github", id),
    stored = store.get("incoming_items", key);
  if (stored?.taskId && store.read().tasks.some((t) => t.id === stored.taskId))
    fail(`${id} is already tied to task ${stored.taskId}.`, 409);
  const issue = await github.issue(name, number);
  if (!issue) fail(`No issue ${id}.`, 404);
  if (issue.pull_request)
    fail("A pull request goes to Code review, never to delivery.", 409);
  if (issue.state !== "open") fail(`${id} is closed.`, 409);
  const [comments, user] = await Promise.all([
    github.listIssueComments(name, number),
    github.currentUser(),
  ]);
  const seen = { comments, login: user?.login ?? null };
  // An issue Avoozl owns already, unless an earlier start stopped after
  // its GitHub writes: that one finishes.
  if (hasAvoozlLabel(labelNames(issue)) && !hasStatus(comments, seen.login))
    fail(`${id} is Avoozl's own issue.`, 409);
  const repo = workspaceRepositories(store).find(
      (entry) => entry.github && lower(entry.github) === lower(name),
    ),
    source = withPolicy(
      {
        id: "github",
        repository: name,
        github: name,
        project: repo?.localCheckout ? repo.id : null,
      },
      policy,
    );
  if (action === "deliver" && !source.project)
    fail(
      `Repository ${name} has no local checkout, so Avoozl cannot code it.`,
      409,
    );
  const item = itemOf(id, issue);
  // Content rules at intake (R50.10) before anything is written.
  enforce(
    store,
    {
      boundary: "intake",
      repository: name,
      target: `intake:github/${id}`,
      text: [item.title, item.body, item.labels.join(" ")]
        .filter(Boolean)
        .join("\n"),
    },
    { mode: "refuse", source: { kind: "intake", source: "github", id } },
  );
  // GitHub first: both writes are idempotent, so a failure here leaves no
  // local task and a retry finishes the same two writes.
  const writes = await initialWrites(github, name, issue, action, seen);
  const now = new Date().toISOString(),
    reason = `${action === "deliver" ? "Delivered as a bounded fix" : "Sent to planning"} by a person from the Intake tab.`,
    row = {
      ...(stored || { firstSeenAt: now, findings: [], history: [] }),
      id: key,
      source: "github",
      itemId: id,
      record: {
        ...item,
        labels: [...new Set([...item.labels, AVOOZL_CREW_LABEL])],
      },
      seenAt: now,
    },
    taskId = startTask(store, row, source, action, { by: "person", reason });
  patchTask(store, taskId, `Tie ${taskId} to ${id}`, (task) => {
    task.intake.issue = { repository: name, number, nodeId: issue.node_id };
    if (action !== "deliver") return;
    const fix = boundedFix({
      repository: name,
      number,
      title: item.title,
      body: item.body,
    });
    // The input issue holds this fix's journal; there is no spec issue.
    task.fix = { ...fix, journal: { repository: name, number } };
    task.acceptance = fix.acceptance;
  });
  const next = {
    ...row,
    taskId,
    route: {
      state: action === "deliver" ? "delivered" : "planned",
      rule: null,
      action,
      by: "person",
      reason,
      at: now,
    },
  };
  remember(next, { at: now, result: action, state: next.route.state });
  store.transaction(() => store.put("incoming_items", next));
  return { source: "github", id, taskId, route: next.route, writes };
}

const NODES = `query($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Issue {
      id state
      closedByPullRequestsReferences(first: 5, includeClosedPrs: true) {
        nodes { merged }
      }
    }
  }
}`;

// Closed by a merged pull request (Deliver this's Fixes #N): that is a
// landing for reconcile to judge, not a withdrawal.
const closedByMerge = (node) =>
  (node?.closedByPullRequestsReferences?.nodes || []).some(
    (pull) => pull?.merged === true,
  );

// Closing an input issue withdraws its open task (R102.19): it is held,
// never completed, and nothing waits on it as if it were done. One
// GraphQL read covers every watched issue. Returns the withdrawn task IDs.
export async function watchInputs(store, github) {
  if (!github?.available?.() || typeof github.graphql !== "function") return [];
  const data = store.read(),
    complete = new Set(
      (data.statuses || []).filter((s) => s.complete).map((s) => s.id),
    ),
    watched = data.tasks.filter(
      (task) =>
        task.intake?.source === "github" &&
        task.intake.by === "person" &&
        task.intake.issue?.nodeId &&
        !complete.has(task.status) &&
        task.dispatch?.state !== "withdrawn",
    );
  if (!watched.length) return [];
  const answer = await github.graphql(
      NODES,
      { ids: watched.map((task) => task.intake.issue.nodeId) },
      "read the state of intake issues",
    ),
    closed = new Set(
      (answer?.nodes || [])
        .filter((node) => node?.state === "CLOSED" && !closedByMerge(node))
        .map((node) => node.id),
    ),
    withdrawn = [];
  for (const task of watched) {
    if (!closed.has(task.intake.issue.nodeId)) continue;
    patchTask(store, task.id, `Withdraw ${task.id}`, (next) =>
      setDispatch(
        next,
        false,
        "withdrawn",
        "Its GitHub issue was closed, which withdraws the request. The task is not done.",
      ),
    );
    const key = itemKey("github", task.intake.id),
      row = store.get("incoming_items", key);
    if (row?.record)
      store.transaction(() =>
        store.put("incoming_items", {
          ...row,
          record: { ...row.record, state: "closed" },
        }),
      );
    withdrawn.push(task.id);
  }
  return withdrawn;
}
