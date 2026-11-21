// The open items read: one read-only search per GitHub-mode repository per
// interval, kept in SQLite (design §4.12, R50.4).
//
// Each item the search returned is a `github` incoming item, and each
// repository's read state is its `intake_sources` row `github:<repository>`
// with the item keys the search returned.
import { itemKey, itemRows } from "../intake/intake.ts";
import type { ItemRow } from "../intake/intake.ts";
import type { Store } from "../store/store.ts";

// One open item as the search returned it.
export interface OpenItem {
  kind: string;
  number: number;
  title: string;
  url: string;
  author: string | null;
  createdAt: string | null;
  labels: string[];
  assignees: string[];
  comments: number;
  draft?: boolean;
  headSha?: string | null;
  branch?: string | null;
  base?: string | null;
  files?: { total: number; paths: string[] };
  checks?: string | null;
  closes?: { repository: string | null; number: number }[];
}
// One repository's read: its query, when, and what it returned.
interface Read {
  query?: string;
  readAt?: string;
  checkedAt?: string | null;
  error?: string | null;
  total?: number | null;
  truncated?: boolean;
  items?: OpenItem[];
  [key: string]: unknown;
}
type Cache = { version: number; repositories: Record<string, Read> };
// An incoming item row with the search's copy of it.
type Row = ItemRow & { search?: OpenItem };
// One node of the search's answer (GitHub's GraphQL), as item() reads it.
interface Node {
  __typename?: string;
  number: number;
  title?: string;
  url?: string;
  createdAt?: string;
  author?: { login?: string } | null;
  labels?: { nodes?: { name: string }[] };
  assignees?: { nodes?: { login: string }[] };
  comments?: { totalCount?: number };
  isDraft?: boolean;
  headRefOid?: unknown;
  headRefName?: string;
  baseRefName?: string;
  files?: { totalCount?: number; nodes?: { path: string }[] };
  closingIssuesReferences?: {
    nodes?: { number: number; repository?: { nameWithOwner?: string } }[];
  };
  commits?: {
    nodes?: { commit?: { statusCheckRollup?: { state?: string } } }[];
  };
}
// The search's answer.
interface Search {
  issueCount?: number;
  pageInfo?: { hasNextPage?: boolean; endCursor?: string };
  nodes?: (Node | null)[];
}
// The one GitHub call the read makes.
interface GraphQL {
  graphql(
    query: string,
    variables: Record<string, unknown>,
    what: string,
  ): Promise<unknown>;
}

const OPEN_READ_INTERVAL_MS = 10 * 60 * 1000;
const PAGE_SIZE = 100;
// GitHub search returns at most 1,000 results, so 10 pages read every item
// it will give; past that `truncated` says so.
const PAGES = 10;
const EMPTY: Cache = { version: 1, repositories: {} };

// One GitHub search line for a repository's open items.
const searchQuery = (repository: string) => `repo:${repository} is:open`;

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

const CHECKS: Record<string, string> = {
  SUCCESS: "passing",
  FAILURE: "failing",
  ERROR: "failing",
  PENDING: "pending",
  EXPECTED: "pending",
};

function item(node: Node): OpenItem {
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
          // further call.
          files: {
            total: node.files?.totalCount ?? 0,
            paths: (node.files?.nodes || []).map((file) => file.path),
          },
          checks: CHECKS[String(rollup)] ?? null,
          closes: (node.closingIssuesReferences?.nodes || []).map((ref) => ({
            repository: ref.repository?.nameWithOwner ?? null,
            number: ref.number,
          })),
        }
      : {}),
  };
}

// Every page of one search GitHub returns, read only.
async function readOpenItems(github: GraphQL, query: string) {
  const items: OpenItem[] = [];
  let after: string | null | undefined = null,
    total = 0,
    more = false;
  for (let page = 0; page < PAGES; page++) {
    const data = await github.graphql(
      SEARCH,
      { q: query, first: PAGE_SIZE, after },
      "search for open items",
    );
    const search = (data as { search?: Search } | null)?.search;
    total = search?.issueCount ?? 0;
    for (const node of search?.nodes || [])
      if (node && Number.isInteger(node.number)) items.push(item(node));
    more = Boolean(search?.pageInfo?.hasNextPage);
    if (!more) break;
    after = search?.pageInfo?.endCursor;
  }
  // GitHub stops at its search cap without a next page, so the total
  // shows the cut too.
  return { total, truncated: more || total > items.length, items };
}

const sourceId = (repository: string) => `github:${repository}`;
const githubKey = (repository: string, number: number) =>
  itemKey("github", `${repository}#${number}`);

function readCache(store: Store): Cache {
  const cache = structuredClone(EMPTY);
  try {
    const rows = new Map(
      (itemRows(store) as Row[]).map((row) => [row.id, row]),
    );
    for (const row of store.list<{
      id: string;
      source?: string;
      repository?: string;
      keys?: number[];
      [key: string]: unknown;
    }>("intake_sources")) {
      if (row.source !== "github" || !row.repository) continue;
      const { id, source, repository, keys, ...state } = row;
      cache.repositories[repository] = {
        ...state,
        items: (keys || [])
          .map((number) => rows.get(githubKey(repository, number))?.search)
          .filter((entry): entry is OpenItem => Boolean(entry)),
      };
    }
  } catch {
    // An older read-only database has no intake tables yet.
  }
  return cache;
}

function writeCache(store: Store, cache: Cache) {
  const rows = new Map((itemRows(store) as Row[]).map((row) => [row.id, row])),
    at = new Date().toISOString();
  store.transaction(() => {
    for (const [repository, entry] of Object.entries(cache.repositories)) {
      const { items = [], ...state } = entry,
        keys = items.map((entry) => entry.number),
        kept = new Set(keys.map((number) => githubKey(repository, number)));
      for (const entry of items) {
        const id = githubKey(repository, entry.number),
          current = rows.get(id),
          next: Row = current
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
                route: { state: "untriaged" } as Row["route"],
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
export function openPull(store: Store, repository: string, number: number) {
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
  store: Store,
  github: GraphQL | null | undefined,
  policy: {
    mode?: string | null;
    repositories?: Record<string, unknown>;
  } | null,
  { now = Date.now(), force = false } = {},
) {
  if (!policy?.mode || !github) return { read: 0 };
  const cache = readCache(store),
    next: Cache = { version: 1, repositories: {} };
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
        error: `GitHub could not be read: ${(error as Error).message}`,
        total: old?.total ?? null,
        truncated: old?.truncated === true,
        items: old?.items ?? [],
      };
    }
  }
  writeCache(store, next);
  return { read };
}
