// Plan this and Deliver this for a GitHub issue (Requirement 102.19, design
// §4.32.11). A person starts it; nothing here runs from a label or a tick.
//
// - Deliver this: a bounded fix. The task carries a compact, versioned
//   acceptance definition, and the input issue is its journal home. No
//   spec is written.
// - Plan this: an inbox task for the planner, which writes a proportionate
//   spec (or an epic, for several separately owned areas).
// - Initial write: one status comment, skipped when already there. It is
//   fixed text plus, where visibility permits, the spec issue the input
//   already feeds (source-backlinks.mjs). It names no path or machine.
// - Closing the input issue withdraws the request. It never completes the
//   task (watchInputs).
import { fail } from "../store/store.mjs";
import { fixRecord } from "../intake/fix.mjs";
import { enforce } from "../content/content-rules.mjs";
import { workspaceRepositories } from "../workspace/workspace-repositories.mjs";
import { intakeSpecIssue, reference } from "./source-backlinks.mjs";
import {
  itemKey,
  patchTask,
  remember,
  setDispatch,
  startTask,
  withPolicy,
} from "../intake/intake.mjs";
import { asJob } from "./github-jobs.mjs";

export const INTAKE_MARKER = "<!-- avoozl-intake:v1 -->";
const ITEM_ID =
  /^([A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100})#([1-9]\d{0,9})$/;
const lower = (value) => String(value ?? "").toLowerCase();

// "owner/repo#12" -> {repository, number}.
function parseItemId(id) {
  const found = ITEM_ID.exec(String(id ?? ""));
  if (!found) fail("Name the GitHub item as owner/repository#number.");
  return { repository: found[1], number: Number(found[2]) };
}

// The one status comment. Fixed text, plus `spec` ({repository, number}),
// the spec issue, only when the caller found that visibility permits it
// (intakeSpecIssue), so a private plan is never named on a public issue.
export function statusComment(action, spec = null) {
  return [
    action === "deliver"
      ? "Avoozl is working on this issue as a bounded fix."
      : "Avoozl is planning this issue.",
    ...(spec ? ["", `Spec: ${reference(spec)}`] : []),
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

// One write, skipped when it is already there, so a retry writes nothing.
// `comments` is the issue's comment list, `login` the signed-in login and
// `spec` the spec issue the comment may name.
export async function initialWrites(
  github,
  repository,
  issue,
  action,
  { comments, login, spec = null },
) {
  const writes = [];
  if (!hasStatus(comments, login)) {
    await asJob("spec-issues", github).createIssueComment(
      repository,
      issue.number,
      statusComment(action, spec),
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
  const seen = {
    comments,
    login: user?.login ?? null,
    spec: intakeSpecIssue(store, { repository: name, number }),
  };
  const repo = workspaceRepositories(store).find(
      (entry) => entry.github && lower(entry.github) === lower(name),
    ),
    source = withPolicy(
      {
        id: "github",
        repository: name,
        github: name,
        executionRepository: repo?.localCheckout ? repo.id : null,
      },
      policy,
    );
  if (action === "deliver" && !source.executionRepository)
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
  // What goes out (R102.23): the privacy scan and content rules see the
  // comment before it is written.
  enforce(
    store,
    {
      boundary: "github",
      repository: name,
      target: `intake:github/${id}:status`,
      text: statusComment(action, seen.spec),
    },
    { mode: "refuse", source: { kind: "intake", source: "github", id } },
  );
  // GitHub first: the write is idempotent, so a failure here leaves no
  // local task and a retry finishes it.
  const writes = await initialWrites(github, name, issue, action, seen);
  const now = new Date().toISOString(),
    reason = `${action === "deliver" ? "Delivered as a bounded fix" : "Sent to planning"} by a person from the Intake tab.`,
    row = {
      ...(stored || { firstSeenAt: now, findings: [], history: [] }),
      id: key,
      source: "github",
      itemId: id,
      record: item,
      seenAt: now,
    },
    taskId = startTask(store, row, source, action, { by: "person", reason });
  patchTask(store, taskId, `Tie ${taskId} to ${id}`, (task) => {
    task.intake.issue = { repository: name, number, nodeId: issue.node_id };
    if (action !== "deliver") return;
    const fix = fixRecord({
      issue: { repository: name, number },
      title: item.title,
      body: item.body,
    });
    // The input issue holds this fix's journal; there is no spec issue.
    task.fix = { ...fix, journal: { repository: name, number } };
    task.acceptance = fix.acceptance;
    task.approvedSource = { hash: fix.definition, text: item.body };
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
  // One read per repository: a token is minted for one repository (PC5.6).
  const byRepository = new Map();
  for (const task of watched) {
    const name = task.intake.issue.repository || "";
    if (!byRepository.has(name)) byRepository.set(name, []);
    byRepository.get(name).push(task.intake.issue.nodeId);
  }
  const nodes = [];
  for (const [repository, ids] of byRepository) {
    const answer = await github.graphql(
      NODES,
      { ids },
      "read the state of intake issues",
      repository ? { repository } : {},
    );
    nodes.push(...(answer?.nodes || []));
  }
  const closed = new Set(
      nodes
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
