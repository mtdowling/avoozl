// GitHub's issues and pull requests, read within GitHub's limits
// (triage-agent TA10, design §D7). The Issues and Pull requests pages and
// the triage agent read only these rows; nothing here writes to GitHub.
//
// - Changed items: one conditional REST list per repository, the issues and
//   pull requests updated since a stored cursor, newest first. An unchanged
//   repository answers 304, which GitHub does not count. The first read
//   takes the open items; later reads take every state, so a close is seen
//   and the item leaves the open list. No search API call: search has its
//   own small limit and no conditional requests.
// - Pull request counts: one GraphQL query per 50 changed pull requests for
//   checks, files and lines, never one call per pull request.
// - Detail: one GraphQL query per item, kept with the item's `updatedAt`, so
//   opening an unchanged item makes no call.
// - Diff: a pull request's changed files and patches, kept by head commit.
// - Counting and yielding: triage's calls are counted per day by kind, and
//   triage reads nothing below the rate's low mark while other work waits.
import { parseRepository } from "./github.mjs";
import { LOW_REMAINING } from "./github-rate.mjs";
import { fail } from "./store.mjs";

const PAGE = 100;
const MAX_PAGES = 20;
export const COUNT_BATCH = 50;
const TIMELINE = 30;
const ITEMS = "github_items";
const lower = (value) => String(value ?? "").toLowerCase();
export const itemId = (repository, number) => `${lower(repository)}#${number}`;
const cursorId = (repository) => `items:${lower(repository)}`;

// ---- Counting ---------------------------------------------------------------

const CALLS = "triageCalls";
const today = (now) => new Date(now).toISOString().slice(0, 10);

// Triage's calls today: {day, rest, notModified, graphql, writes}.
export function triageCalls(store, now = Date.now()) {
  const value = store.getMeta(CALLS);
  return value?.day === today(now)
    ? value
    : { day: today(now), rest: 0, notModified: 0, graphql: 0, writes: 0 };
}

function countCall(store, kind, now) {
  const value = triageCalls(store, now);
  value[kind] += 1;
  store.setMeta(CALLS, value);
}

const isQuery = (method, pathname, options) =>
  pathname === "/graphql" &&
  /^\s*(query\b|\{)/.test(options?.body?.query || "");

// The client triage reads and writes with: the same client, its pacer and
// cache, with each call counted by kind. Every method that goes through
// `request` is counted, since methods call `this.request`.
export function countingClient(github, store, { now = Date.now } = {}) {
  if (!github) return github;
  const counted = Object.create(github);
  counted.request = async (method, pathname, options = {}) => {
    const kind =
      method === "GET"
        ? "rest"
        : isQuery(method, pathname, options)
          ? "graphql"
          : "writes";
    countCall(store, kind, now());
    const result = await github.request.call(
      counted,
      method,
      pathname,
      options,
    );
    if (kind === "rest" && result?.notModified)
      countCall(store, "notModified", now());
    return result;
  };
  return counted;
}

// Whether triage may read or start now (TA10.6). Below the low mark it
// starts nothing, and reads only when no other GitHub work waits.
export function triageBudget(github, { othersWaiting = false } = {}) {
  const seen = github?.rateLimit?.("core") ?? null,
    low =
      seen && Number.isFinite(seen.remaining) && seen.remaining < LOW_REMAINING;
  return {
    remaining: seen?.remaining ?? null,
    low: Boolean(low),
    read: !low || !othersWaiting,
    start: !low,
  };
}

// ---- Rows -------------------------------------------------------------------

export const itemRows = (store) => {
  try {
    return store.list(ITEMS);
  } catch {
    return [];
  }
};
export const itemRow = (store, repository, number) =>
  store.get(ITEMS, itemId(repository, number));

const labelNames = (labels) =>
  (labels || [])
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter(Boolean);

// One REST list entry as the row's own fields.
function listFields(repository, entry) {
  return {
    repository,
    number: entry.number,
    kind: entry.pull_request ? "pr" : "issue",
    title: String(entry.title ?? ""),
    body: String(entry.body ?? ""),
    author: entry.user?.login ?? null,
    authorAssociation: entry.author_association ?? null,
    labels: labelNames(entry.labels),
    assignees: (entry.assignees || []).map((user) => user.login),
    state: entry.state === "closed" ? "closed" : "open",
    merged: Boolean(entry.pull_request?.merged_at),
    comments: entry.comments ?? 0,
    url: entry.html_url ?? null,
    createdAt: entry.created_at ?? null,
    updatedAt: entry.updated_at ?? null,
    closedAt: entry.closed_at ?? null,
    draft: entry.draft === true,
  };
}

// ---- Changed items (TA10.2) ---------------------------------------------------

const nextLink = (link) => /<([^>]+)>;\s*rel="next"/.exec(link || "")?.[1];

// Read what changed in one repository since its cursor and store it.
// Returns {notModified, changed: [rows]}. The first page is conditional on
// the stored ETag; a 304 costs nothing and changes nothing.
export async function readChangedItems(store, github, repository) {
  const { owner, repo } = parseRepository(repository),
    source = store.get("intake_sources", cursorId(repository)),
    cursor = source?.cursor ?? null,
    pathname = `/repos/${owner}/${repo}/issues`,
    query = {
      state: cursor ? "all" : "open",
      sort: "updated",
      direction: "desc",
      per_page: PAGE,
      ...(cursor ? { since: cursor } : {}),
    };
  const first = await github.request("GET", pathname, {
    query,
    headers: true,
    etag: source?.etag || undefined,
  });
  if (first?.notModified) return { notModified: true, changed: [] };
  if (!Array.isArray(first?.value))
    fail("GitHub returned an invalid issue list.", 502);
  const entries = [...first.value];
  let next = nextLink(first.link);
  for (let page = 2; next && page <= MAX_PAGES; page += 1) {
    const url = new URL(next),
      more = await github.request("GET", pathname, {
        query: Object.fromEntries(url.searchParams),
        headers: true,
      });
    if (!Array.isArray(more?.value))
      fail("GitHub returned an invalid issue list.", 502);
    entries.push(...more.value);
    next = nextLink(more.link);
  }
  const changed = [];
  let newest = cursor;
  store.transaction(() => {
    for (const entry of entries) {
      if (!Number.isInteger(entry?.number)) continue;
      const id = itemId(repository, entry.number),
        stored = store.get(ITEMS, id),
        fields = listFields(repository, entry);
      if (newest === null || String(fields.updatedAt) > String(newest))
        newest = fields.updatedAt;
      if (
        stored?.updatedAt === fields.updatedAt &&
        stored?.state === fields.state
      )
        continue;
      const row = {
        ...(stored || { firstSeenAt: new Date().toISOString() }),
        ...fields,
        id,
      };
      store.put(ITEMS, row);
      changed.push(row);
    }
    store.put("intake_sources", {
      id: cursorId(repository),
      source: "github-items",
      repository,
      cursor: newest,
      etag: first.etag ?? null,
      readAt: new Date().toISOString(),
    });
  });
  return { notModified: false, changed };
}

// ---- Pull request counts (TA10.3) ---------------------------------------------

const CHECK_FIELDS = `commits(last: 1) { nodes { commit { oid statusCheckRollup { contexts(first: 100) { nodes { __typename ... on CheckRun { status conclusion } ... on StatusContext { state } } } } } } }`;

function checkCounts(commit) {
  const counts = { failed: 0, passed: 0, skipped: 0, pending: 0 };
  for (const node of commit?.statusCheckRollup?.contexts?.nodes || []) {
    const outcome =
      node.__typename === "StatusContext"
        ? node.state
        : node.status === "COMPLETED"
          ? node.conclusion
          : "PENDING";
    if (["SUCCESS", "NEUTRAL"].includes(outcome)) counts.passed += 1;
    else if (outcome === "SKIPPED") counts.skipped += 1;
    else if (["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS"].includes(outcome))
      counts.pending += 1;
    else counts.failed += 1;
  }
  return counts;
}

// Each changed pull request's checks, files and lines, 50 to a query.
// `numbers` are pull requests in the item table. Returns how many queries
// it made.
export async function readPullCounts(store, github, repository, numbers) {
  const { owner, repo } = parseRepository(repository);
  let queries = 0;
  for (let at = 0; at < numbers.length; at += COUNT_BATCH) {
    const batch = numbers.slice(at, at + COUNT_BATCH),
      fields = batch
        .map(
          (number) =>
            `p${number}: pullRequest(number: ${Number(number)}) { number updatedAt changedFiles additions deletions isDraft reviewDecision headRefOid headRefName reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login } } } } ${CHECK_FIELDS} }`,
        )
        .join(" "),
      data = await github.graphql(
        `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
        { owner, name: repo },
        "read pull request counts",
        { uncached: true },
      );
    queries += 1;
    store.transaction(() => {
      for (const number of batch) {
        const node = data?.repository?.[`p${number}`],
          row = itemRow(store, repository, number);
        if (!node || !row) continue;
        store.put(ITEMS, {
          ...row,
          head: node.headRefOid ?? row.head ?? null,
          branch: node.headRefName ?? row.branch ?? null,
          counts: {
            files: node.changedFiles ?? 0,
            additions: node.additions ?? 0,
            deletions: node.deletions ?? 0,
            checks: checkCounts(node.commits?.nodes?.[0]?.commit),
            reviewDecision: node.reviewDecision ?? null,
            reviewers: (node.reviewRequests?.nodes || [])
              .map((entry) => entry.requestedReviewer?.login)
              .filter(Boolean),
            draft: node.isDraft === true,
            at: row.updatedAt,
          },
        });
      }
    });
  }
  return queries;
}

// ---- Detail (TA10.4) ----------------------------------------------------------

const ACTOR = "author { login }";
const DETAIL = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issueOrPullRequest(number: $number) {
      __typename
      ... on Issue {
        number title body url state createdAt updatedAt authorAssociation ${ACTOR}
        labels(first: 30) { nodes { name color } }
        assignees(first: 10) { nodes { login } }
        timelineItems(last: ${TIMELINE}) { nodes { __typename ... on IssueComment { id body createdAt authorAssociation ${ACTOR} } ... on LabeledEvent { createdAt actor { login } label { name } } ... on ClosedEvent { createdAt actor { login } } ... on ReopenedEvent { createdAt actor { login } } ... on CrossReferencedEvent { createdAt source { ... on Issue { number title } ... on PullRequest { number title } } } } }
      }
      ... on PullRequest {
        number title body url state merged isDraft createdAt updatedAt authorAssociation ${ACTOR}
        baseRefName headRefName headRefOid changedFiles additions deletions reviewDecision
        files(first: 100) { nodes { path } }
        labels(first: 30) { nodes { name color } }
        assignees(first: 10) { nodes { login } }
        reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login } ... on Team { name } } } }
        latestReviews(first: 10) { nodes { state ${ACTOR} } }
        ${CHECK_FIELDS}
        timelineItems(last: ${TIMELINE}) { nodes { __typename ... on IssueComment { id body createdAt authorAssociation ${ACTOR} } ... on PullRequestReview { id body state createdAt ${ACTOR} } ... on LabeledEvent { createdAt actor { login } label { name } } ... on ClosedEvent { createdAt actor { login } } ... on MergedEvent { createdAt actor { login } } ... on HeadRefForcePushedEvent { createdAt } } }
      }
    }
  }
}`;

function timelineOf(nodes) {
  return (nodes || []).filter(Boolean).map((node) => ({
    kind: node.__typename,
    at: node.createdAt ?? null,
    by: node.author?.login ?? node.actor?.login ?? null,
    association: node.authorAssociation ?? null,
    ...(node.body !== undefined ? { body: String(node.body ?? "") } : {}),
    ...(node.state ? { state: node.state } : {}),
    ...(node.label ? { label: node.label.name } : {}),
    ...(node.source?.number
      ? { ref: { number: node.source.number, title: node.source.title } }
      : {}),
  }));
}

function detailOf(node) {
  const pull = node.__typename === "PullRequest";
  return {
    kind: pull ? "pr" : "issue",
    number: node.number,
    title: String(node.title ?? ""),
    body: String(node.body ?? ""),
    url: node.url ?? null,
    state: lower(node.state) === "open" ? "open" : "closed",
    author: node.author?.login ?? null,
    authorAssociation: node.authorAssociation ?? null,
    firstTime: ["FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER"].includes(
      node.authorAssociation,
    ),
    createdAt: node.createdAt ?? null,
    updatedAt: node.updatedAt ?? null,
    labels: (node.labels?.nodes || []).map((label) => label.name),
    assignees: (node.assignees?.nodes || []).map((user) => user.login),
    timeline: timelineOf(node.timelineItems?.nodes),
    ...(pull
      ? {
          merged: node.merged === true,
          draft: node.isDraft === true,
          base: node.baseRefName ?? null,
          branch: node.headRefName ?? null,
          head: node.headRefOid ?? null,
          counts: {
            files: node.changedFiles ?? 0,
            additions: node.additions ?? 0,
            deletions: node.deletions ?? 0,
            checks: checkCounts(node.commits?.nodes?.[0]?.commit),
          },
          reviewDecision: node.reviewDecision ?? null,
          files: (node.files?.nodes || []).map((file) => file.path),
          reviewers: [
            ...(node.reviewRequests?.nodes || []).map((entry) => ({
              login:
                entry.requestedReviewer?.login ??
                entry.requestedReviewer?.name ??
                null,
              state: "REQUESTED",
            })),
            ...(node.latestReviews?.nodes || []).map((entry) => ({
              login: entry.author?.login ?? null,
              state: entry.state,
            })),
          ].filter((entry) => entry.login),
        }
      : {}),
  };
}

// One item's detail: the stored copy while the item's `updatedAt` has not
// moved, else one GraphQL query. Returns {detail, read} where `read` says
// whether a call was made.
export async function itemDetail(store, github, repository, number) {
  const row = itemRow(store, repository, number);
  if (row?.detail && row.detail.updatedAt === row.updatedAt)
    return { detail: row.detail, read: false };
  const { owner, repo } = parseRepository(repository),
    data = await github.graphql(
      DETAIL,
      { owner, name: repo, number: Number(number) },
      "read an issue or pull request",
      { uncached: true },
    ),
    node = data?.repository?.issueOrPullRequest;
  if (!node) fail(`No issue or pull request ${repository}#${number}.`, 404);
  const detail = detailOf(node),
    base = row || {
      id: itemId(repository, number),
      repository,
      number: detail.number,
      firstSeenAt: new Date().toISOString(),
    };
  // The list's `updatedAt` is the key: a newer detail moves it forward.
  const updatedAt =
    String(detail.updatedAt) > String(base.updatedAt ?? "")
      ? detail.updatedAt
      : (base.updatedAt ?? detail.updatedAt);
  store.put(ITEMS, {
    ...base,
    kind: detail.kind,
    title: detail.title,
    body: detail.body,
    author: detail.author,
    authorAssociation: detail.authorAssociation,
    labels: detail.labels,
    assignees: detail.assignees,
    state: detail.state,
    url: detail.url,
    updatedAt,
    ...(detail.kind === "pr" ? { head: detail.head } : {}),
    detail: { ...detail, updatedAt },
  });
  return { detail: { ...detail, updatedAt }, read: true };
}

// A pull request's changed files with their patches, kept by head commit:
// a second read of the same head makes no call.
export async function pullFiles(store, github, repository, number, head) {
  const row = itemRow(store, repository, number);
  if (row?.diff && head && row.diff.head === head)
    return { files: row.diff.files, read: false };
  const { files, truncated } = await github.listPullRequestFiles(
      repository,
      number,
    ),
    kept = files.map((file) => ({
      path: file.filename,
      status: file.status ?? null,
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
      patch: file.patch ?? "",
    }));
  if (row)
    store.put(ITEMS, {
      ...row,
      diff: { head: head ?? row.head ?? null, files: kept, truncated },
    });
  return { files: kept, read: true };
}
