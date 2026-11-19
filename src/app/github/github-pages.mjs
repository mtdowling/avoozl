// The Issues and Pull requests pages (triage-agent TA8, design §D8): one
// list-detail layout over the item table (github-items.mjs) and the
// agent's record of each item (triage.mjs), and one operation per action.
//
// - The list reads only stored rows: no GitHub call.
// - The detail is one GraphQL query, kept by the item's `updatedAt`.
// - Each action is one write through Avoozl's client (its pacer), recorded
//   on the item. Approve, Request changes and Close are a person's: the
//   operation is refused over MCP and from an agent (mcp-policy.mjs).
import { fail } from "../store/store.mjs";
import { itemDetail, itemRow, itemRows } from "./github-items.mjs";
import {
  AGENT_LINE,
  askRun,
  itemTriage,
  ownerQueue,
  settleOwner,
} from "../intake/triage.mjs";
import { startGitHubItem } from "./github-intake.mjs";
import { openFixJournal } from "../intake/fix.mjs";
import { DEFAULT_SPECS_PATH, specsPathOf } from "../specs/specs-path.mjs";

const lower = (value) => String(value ?? "").toLowerCase();
const KINDS = new Set(["issue", "pr", "all"]);
const SORTS = new Set(["number", "updated"]);
const LIMIT = 500;

// What the list shows of one row.
function listRow(store, row) {
  const triage = itemTriage(store, row);
  return {
    repository: row.repository,
    number: row.number,
    kind: row.kind,
    title: row.title,
    author: row.author,
    state: row.state,
    labels: row.labels || [],
    assignees: row.assignees || [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    url: row.url,
    draft: row.draft === true,
    counts: row.counts ?? null,
    class: triage.class,
    result: triage.result,
    owner: triage.owner
      ? { reason: triage.owner.reason, kind: triage.owner.kind }
      : null,
    snoozed: triage.snoozed,
  };
}

// `items.list` {kind, repository?, state?, owner?, mine?, assigned?,
// review?, label?, q?, sort?}. `login` is the signed-in login, for the
// "me" filters.
export function itemsList(
  store,
  input = {},
  { login = null, now = Date.now() } = {},
) {
  const kind = input.kind ?? "issue";
  if (!KINDS.has(kind)) fail("kind is issue, pr or all.");
  const sort = input.sort ?? "updated";
  if (!SORTS.has(sort)) fail("sort is number or updated.");
  const state = input.state ?? "open",
    query = lower(input.q).trim(),
    queue = new Set(ownerQueue(store).map((row) => row.id)),
    me = lower(login);
  const rows = itemRows(store)
    .filter((row) => kind === "all" || row.kind === kind)
    .filter(
      (row) =>
        !input.repository || lower(row.repository) === lower(input.repository),
    )
    .filter((row) => state === "all" || row.state === state)
    .filter((row) => !input.owner || queue.has(row.id))
    .filter((row) => !input.mine || (me && lower(row.author) === me))
    .filter(
      (row) =>
        !input.assigned ||
        (me && (row.assignees || []).map(lower).includes(me)),
    )
    .filter(
      (row) =>
        !input.review ||
        (me && (row.counts?.reviewers || []).map(lower).includes(me)),
    )
    .filter(
      (row) =>
        !input.label ||
        (row.labels || []).map(lower).includes(lower(input.label)),
    )
    .filter(
      (row) =>
        !query ||
        lower(row.title).includes(query) ||
        lower(row.body).includes(query) ||
        String(row.number) === query.replace(/^#/, ""),
    )
    .filter(
      (row) =>
        input.owner ||
        !row.triage?.snoozed ||
        Date.parse(row.triage.snoozed) <= now,
    )
    .sort((a, b) =>
      sort === "number"
        ? b.number - a.number
        : String(b.updatedAt).localeCompare(String(a.updatedAt)),
    );
  const labels = new Set();
  for (const row of itemRows(store))
    if (kind === "all" || row.kind === kind)
      for (const label of row.labels || []) labels.add(label);
  return {
    kind,
    total: rows.length,
    items: rows.slice(0, LIMIT).map((row) => listRow(store, row)),
    labels: [...labels].sort(),
    repositories: [
      ...new Set(itemRows(store).map((row) => row.repository)),
    ].sort(),
    ownerQueue: queue.size,
  };
}

// The actions a detail offers, by kind (TA8.4, TA8.5, TA8.6).
// `specs` is the repository's specs path.
export function itemActions(row, detail, triage, specs = DEFAULT_SPECS_PATH) {
  if (row.kind === "issue")
    return [
      "fix",
      ...(triage.draft?.kind === "answer" ? ["answer"] : []),
      "spec",
      "again",
      "assign",
      "labels",
      "snooze",
      ...(row.state === "open" ? ["close"] : []),
    ];
  const specOnly =
    (detail?.files || row.diff?.files?.map((file) => file.path) || []).length >
      0 &&
    (detail?.files || row.diff.files.map((file) => file.path)).every((file) =>
      String(file).startsWith(`${specs}/`),
    );
  return [
    "review",
    ...(triage.draft?.kind === "review" ? ["editReview"] : []),
    "approve",
    "requestChanges",
    "comment",
    ...(row.state === "open" ? ["close"] : []),
    "labels",
    ...(specOnly ? ["reviewAsSpec"] : []),
  ];
}

// `items.detail` {repository, number}: the detail (one cached query), the
// agent's summary and runs, and the actions left.
export async function itemsDetail(store, github, input = {}) {
  if (!github) fail("GitHub is not connected.", 409);
  const { detail } = await itemDetail(
      store,
      github,
      input.repository,
      input.number,
    ),
    row = itemRow(store, input.repository, input.number),
    triage = itemTriage(store, row);
  return {
    ...detail,
    repository: row.repository,
    triage,
    actions: itemActions(
      row,
      detail,
      triage,
      specsPathOf(store, row.repository),
    ),
    history: row.actions || [],
  };
}

function requireText(value, label, limit = 65536) {
  if (typeof value !== "string" || !value.trim()) fail(`Write the ${label}.`);
  if (value.length > limit) fail(`The ${label} is over ${limit} characters.`);
  return value.trim();
}

function remember(store, row, entry) {
  const current = itemRow(store, row.repository, row.number);
  store.put("github_items", {
    ...current,
    actions: [
      ...(current.actions || []),
      { ...entry, at: new Date().toISOString() },
    ].slice(-50),
  });
}

function settle(store, row) {
  if (itemRow(store, row.repository, row.number)?.triage?.owner)
    settleOwner(store, { repository: row.repository, number: row.number });
}

function clearDraft(store, row) {
  const current = itemRow(store, row.repository, row.number);
  store.put("github_items", {
    ...current,
    triage: { ...(current.triage || {}), draft: null },
  });
}

const PERSON_ONLY = new Set(["approve", "requestChanges", "close"]);

// `items.act` {repository, number, action, ...}. One write, recorded on the
// item. `context` is {policy, workspaceRoot, actor, login, person}.
export async function itemsAct(store, github, input = {}, context = {}) {
  const row = itemRow(store, input.repository, input.number);
  if (!row) fail(`No item ${input.repository}#${input.number}.`, 404);
  const action = input.action;
  if (PERSON_ONLY.has(action) && !context.person)
    fail("Only a person approves, requests changes or closes.", 403);
  const { repository, number } = row,
    issue = row.kind === "issue",
    want = (kinds) => {
      if (!kinds.includes(row.kind))
        fail(
          `${action} is not an action on ${issue ? "an issue" : "a pull request"}.`,
        );
    };
  let out = {};
  switch (action) {
    case "fix": {
      want(["issue"]);
      const started = await startGitHubItem(store, github, context.policy, {
        id: `${repository}#${number}`,
        action: "deliver",
      });
      await openFixJournal(
        store,
        { workspaceRoot: context.workspaceRoot, actor: context.actor },
        started.taskId,
      );
      out = { taskId: started.taskId };
      settle(store, row);
      break;
    }
    case "spec": {
      want(["issue"]);
      const started = await startGitHubItem(store, github, context.policy, {
        id: `${repository}#${number}`,
        action: "plan",
      });
      out = { taskId: started.taskId };
      settle(store, row);
      break;
    }
    case "answer": {
      want(["issue"]);
      const body = requireText(input.body ?? row.triage?.draft?.body, "answer");
      await github.createIssueComment(
        repository,
        number,
        `${body}\n\n${AGENT_LINE}`,
      );
      clearDraft(store, row);
      settle(store, row);
      break;
    }
    case "again":
    case "review":
      out = { runId: askRun(store, { repository, number }).id };
      break;
    case "assign":
      if (!context.login) fail("Avoozl cannot read your GitHub login.", 409);
      await github.addAssignees(repository, number, [context.login]);
      break;
    case "labels": {
      const add = Array.isArray(input.add) ? input.add.filter(Boolean) : [],
        remove = Array.isArray(input.remove)
          ? input.remove.filter(Boolean)
          : [];
      if (!add.length && !remove.length) fail("Name a label to add or remove.");
      if (add.length) await github.addLabels(repository, number, add);
      for (const label of remove)
        await github.removeLabel(repository, number, label);
      out = { add, remove };
      break;
    }
    case "snooze": {
      want(["issue"]);
      const until = Date.parse(input.until ?? "");
      if (!Number.isFinite(until)) fail("Say until when: an ISO time.");
      const current = itemRow(store, repository, number);
      store.put("github_items", {
        ...current,
        triage: {
          ...(current.triage || {}),
          snoozed: new Date(until).toISOString(),
        },
      });
      break;
    }
    case "close": {
      const reason = issue ? (input.reason ?? "completed") : null;
      if (issue && !["completed", "not_planned"].includes(reason))
        fail("A close reason is completed or not_planned.");
      await github.updateIssue(repository, number, {
        state: "closed",
        ...(reason ? { state_reason: reason } : {}),
      });
      settle(store, row);
      break;
    }
    case "editReview":
    case "approve":
    case "requestChanges": {
      want(["pr"]);
      const draft =
          row.triage?.draft?.kind === "review" ? row.triage.draft : null,
        body =
          action === "editReview"
            ? requireText(input.body ?? draft?.body, "review")
            : action === "requestChanges"
              ? requireText(input.body, "change you ask for")
              : String(input.body ?? "").trim(),
        comments =
          action === "editReview"
            ? (input.comments ?? draft?.comments ?? [])
            : [];
      await github.submitReview(repository, number, {
        event:
          action === "approve"
            ? "APPROVE"
            : action === "requestChanges"
              ? "REQUEST_CHANGES"
              : "COMMENT",
        commit_id: row.head ?? undefined,
        body:
          action === "editReview" && !body.includes(AGENT_LINE)
            ? `${body}\n\n${AGENT_LINE}`
            : body,
        comments,
      });
      if (action === "editReview") clearDraft(store, row);
      settle(store, row);
      break;
    }
    case "comment": {
      const body = requireText(input.body, "comment");
      await github.createIssueComment(repository, number, body);
      break;
    }
    default:
      fail(`${action ?? "That"} is not an item action.`);
  }
  remember(store, row, { action, by: context.actor ?? null });
  return { repository, number, action, ...out };
}
