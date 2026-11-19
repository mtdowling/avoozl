// The open items read: one read-only search per GitHub-mode repository per
// interval, kept in SQLite (design §4.12, R50.4). Spec pull requests
// (spec-pull-requests.mjs) and the code review chat (pr-review.mjs) read it,
// and closed input issues withdraw their tasks at the same pace
// (github-intake.mjs watchInputs). It lists nothing on a page: the Issues
// and Pull requests pages read the triage agent's item table instead
// (triage-agent TA8.7).
//
// Each item the search returned is a `github` incoming item, and each
// repository's read state is its `intake_sources` row `github:<repository>`
// with the item keys the search returned.
import { itemKey, itemRows } from "../intake/intake.mjs";
import { watchInputs } from "./github-intake.mjs";

export const OPEN_READ_INTERVAL_MS = 10 * 60 * 1000;
const PAGE_SIZE = 100;
// GitHub search returns at most 1,000 results, so 10 pages read every item
// it will give; past that `truncated` says so.
const PAGES = 10;
const EMPTY = { version: 1, repositories: {} };

const lower = (value) => String(value).toLocaleLowerCase();

// One GitHub search line for a repository's open items.
export const searchQuery = (repository) => `repo:${repository} is:open`;

const SEARCH = `query($q: String!, $first: Int!, $after: String) {
  search(query: $q, type: ISSUE, first: $first, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      ... on Issue {
        number title url createdAt
        author { login }
        labels(first: 30) { nodes { name } }
        assignees(first: 10) { nodes { login } }
        comments { totalCount }
      }
      ... on PullRequest {
        number title url createdAt isDraft headRefOid headRefName baseRefName
        files(first: 20) { totalCount nodes { path } }
        author { login }
        labels(first: 30) { nodes { name } }
        assignees(first: 10) { nodes { login } }
        comments { totalCount }
        closingIssuesReferences(first: 10) {
          nodes { number repository { nameWithOwner } }
        }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}`;

const CHECKS = {
  SUCCESS: "passing",
  FAILURE: "failing",
  ERROR: "failing",
  PENDING: "pending",
  EXPECTED: "pending",
};

function item(node) {
  const pull = node.__typename === "PullRequest";
  const rollup = pull
    ? node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state
    : null;
  return {
    kind: pull ? "pr" : "issue",
    number: node.number,
    title: String(node.title ?? ""),
    url: String(node.url ?? ""),
    author: node.author?.login ?? null,
    createdAt: node.createdAt ?? null,
    labels: (node.labels?.nodes || []).map((label) => label.name),
    assignees: (node.assignees?.nodes || []).map((entry) => entry.login),
    comments: node.comments?.totalCount ?? 0,
    ...(pull
      ? {
          draft: node.isDraft === true,
          headSha: typeof node.headRefOid === "string" ? node.headRefOid : null,
          branch: node.headRefName ?? null,
          base: node.baseRefName ?? null,
          // The changed files, so a spec-only pull request is seen with no
          // further call (R107.8).
          files: {
            total: node.files?.totalCount ?? 0,
            paths: (node.files?.nodes || []).map((file) => file.path),
          },
          checks: CHECKS[rollup] ?? null,
          closes: (node.closingIssuesReferences?.nodes || []).map((ref) => ({
            repository: ref.repository?.nameWithOwner ?? null,
            number: ref.number,
          })),
        }
      : {}),
  };
}

// Every page of one search GitHub returns, read only.
export async function readOpenItems(github, query) {
  const items = [];
  let after = null,
    total = 0,
    more = false;
  for (let page = 0; page < PAGES; page++) {
    const data = await github.graphql(
      SEARCH,
      { q: query, first: PAGE_SIZE, after },
      "search for open items",
    );
    const search = data?.search;
    total = search?.issueCount ?? 0;
    for (const node of search?.nodes || [])
      if (node && Number.isInteger(node.number)) items.push(item(node));
    more = Boolean(search?.pageInfo?.hasNextPage);
    if (!more) break;
    after = search.pageInfo.endCursor;
  }
  // GitHub stops at its search cap without a next page, so the total
  // shows the cut too.
  return { total, truncated: more || total > items.length, items };
}

const sourceId = (repository) => `github:${repository}`;
const githubKey = (repository, number) =>
  itemKey("github", `${repository}#${number}`);
const key = (repository, number) => `${lower(repository)}#${number}`;

export function readCache(store) {
  const cache = structuredClone(EMPTY);
  // Adopted spec pull requests (spec-pull-requests.mjs).
  cache.specPulls = new Set();
  try {
    for (const receipt of store.list("receipts"))
      if (receipt.kind === "spec-pr" && receipt.state === "open")
        cache.specPulls.add(key(receipt.repository, receipt.number));
    const rows = new Map(itemRows(store).map((row) => [row.id, row]));
    for (const row of store.list("intake_sources")) {
      if (row.source !== "github" || !row.repository) continue;
      const { id, source, repository, keys, ...state } = row;
      cache.repositories[repository] = {
        ...state,
        items: (keys || [])
          .map((number) => rows.get(githubKey(repository, number))?.search)
          .filter(Boolean),
      };
    }
  } catch {
    // An older read-only database has no intake tables yet.
  }
  return cache;
}

function writeCache(store, cache) {
  const rows = new Map(itemRows(store).map((row) => [row.id, row])),
    at = new Date().toISOString();
  store.transaction(() => {
    for (const [repository, entry] of Object.entries(cache.repositories)) {
      const { items = [], ...state } = entry,
        keys = items.map((entry) => entry.number),
        kept = new Set(keys.map((number) => githubKey(repository, number)));
      for (const entry of items) {
        const id = githubKey(repository, entry.number),
          current = rows.get(id),
          next = current
            ? { ...current, search: entry }
            : {
                id,
                source: "github",
                itemId: `${repository}#${entry.number}`,
                record: {
                  source: "github",
                  id: `${repository}#${entry.number}`,
                  link: entry.url,
                  kind: entry.kind,
                  title: entry.title,
                  body: "",
                  labels: entry.labels,
                  author: entry.author,
                  assignees: entry.assignees || [],
                  state: "open",
                  updatedAt: entry.createdAt ?? "",
                  fields: {},
                  trigger: null,
                },
                firstSeenAt: at,
                seenAt: at,
                taskId: null,
                route: { state: "untriaged" },
                findings: [],
                history: [],
                search: entry,
              };
        if (
          !current ||
          JSON.stringify(current.search) !== JSON.stringify(entry)
        )
          store.put("incoming_items", next);
      }
      // Items the last search no longer returned leave the read; one a task
      // holds keeps its record.
      for (const row of rows.values())
        if (
          row.source === "github" &&
          row.search &&
          row.itemId.startsWith(`${repository}#`) &&
          !kept.has(row.id)
        ) {
          if (row.taskId) {
            const { search, ...rest } = row;
            store.put("incoming_items", rest);
          } else store.remove("incoming_items", row.id);
        }
      const next = {
          id: sourceId(repository),
          source: "github",
          repository,
          ...state,
          keys,
        },
        current = store.get("intake_sources", next.id);
      if (JSON.stringify(current) !== JSON.stringify(next))
        store.put("intake_sources", next);
    }
  });
}

// The open pull request `number` of `repository` as the last read saw it,
// or null.
export function openPull(store, repository, number) {
  const read = readCache(store).repositories?.[repository];
  return (
    (read?.items || []).find(
      (entry) => entry.kind === "pr" && entry.number === number,
    ) ?? null
  );
}

// The tick's read: at most one search per repository per interval, unless
// `force`.
export async function refreshOpenItems(
  store,
  github,
  policy,
  { now = Date.now(), force = false } = {},
) {
  if (!policy?.mode || !github) return { read: 0 };
  const cache = readCache(store),
    next = { version: 1, repositories: {} };
  let read = 0;
  for (const repository of Object.keys(policy.repositories || {})) {
    const old = cache.repositories?.[repository] ?? null,
      query = searchQuery(repository),
      fresh =
        old?.readAt && now - Date.parse(old.readAt) < OPEN_READ_INTERVAL_MS;
    if (old?.query === query && fresh && !force) {
      next.repositories[repository] = old;
      continue;
    }
    const at = new Date(now).toISOString();
    read += 1;
    try {
      next.repositories[repository] = {
        query,
        readAt: at,
        checkedAt: at,
        error: null,
        ...(await readOpenItems(github, query)),
      };
    } catch (error) {
      next.repositories[repository] = {
        query,
        readAt: at,
        checkedAt: old?.checkedAt ?? null,
        error: `GitHub could not be read: ${error.message}`,
        total: old?.total ?? null,
        truncated: old?.truncated === true,
        items: old?.items ?? [],
      };
    }
  }
  writeCache(store, next);
  // Closed input issues withdraw their tasks, read at the same pace.
  if (read > 0)
    try {
      await watchInputs(store, github);
    } catch {
      // The next read tries again.
    }
  return { read };
}
