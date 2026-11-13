// The Untriaged list (design §8.5, R49): open issues and pull requests in a
// GitHub-mode repository that no trigger rule, triage label, managed label,
// or Avoozl task covers. Avoozl lists them and links out; Issue Radar,
// Code Review Sage, and GitHub do the work. The one write is Send to Issue
// Radar (radar-handoff.mjs, R52); issues handed to a crew, or carrying a
// crew's label, show under With Issue Radar instead.
//
// The tick cron reads GitHub at most once per repository per interval and
// caches the raw items beside the database; the view applies the exclusions
// at read time, so a rule, label, or task change shows at once.
import fs from "node:fs";
import path from "node:path";
import { parseMatch } from "./issue-match.mjs";
import {
  CREW_LABEL_DEFAULTS,
  ISSUE_RADAR_PATH,
  matchingRules,
} from "./github-policy.mjs";

export const UNTRIAGED_INTERVAL_MS = 10 * 60 * 1000;
export const UNTRIAGED_PAGE_SIZE = 100;
// GitHub search returns at most 1,000 results, so 10 pages read every item
// it will give; past that `truncated` says to narrow the filter.
export const UNTRIAGED_PAGES = 10;
export const UNTRIAGED_NOTICE_GAP_MS = 60 * 60 * 1000;
// Code Review Sage's page route (its app.json and Kiro Crew
// website/src/apps/builtinRegistry.ts).
export const CODE_REVIEW_SAGE_PATH = "/code-review-sage";
const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY = { version: 1, repositories: {}, notice: null };

const lower = (value) => String(value).toLocaleLowerCase();
const quote = (value) => (/[\s,"]/.test(value) ? `"${value}"` : value);

// The filter line for a repository: its own, or blank for none.
// Blank means "-label:<each triage label>" (R49.3).
export function defaultFilter(triageLabels = []) {
  return triageLabels.map((label) => `-label:${quote(label)}`).join(" ");
}

// The parsed terms the filter and the triage labels stand for together.
export function filterTerms(settings = {}) {
  const parsed = settings.filter
    ? parseMatch(settings.filter, "untriaged.filter", { needLabel: false })
    : {
        labelsAll: [],
        labelsAny: [],
        labelsNone: [],
        assignee: null,
        unassigned: false,
      };
  const none = new Set(parsed.labelsNone.map(lower));
  for (const label of settings.triageLabels || [])
    if (!none.has(lower(label))) {
      parsed.labelsNone.push(label);
      none.add(lower(label));
    }
  return parsed;
}

// One GitHub search line for a repository's untriaged candidates. Each
// excluded label is its own `-label:` term, whose meaning GitHub search
// documents; the cutoff is a whole UTC day.
export function searchQuery(repository, settings = {}, now = Date.now()) {
  const terms = filterTerms(settings),
    parts = [`repo:${repository}`, "is:open"];
  for (const label of terms.labelsAll) parts.push(`label:${quote(label)}`);
  if (terms.labelsAny.length)
    parts.push(`label:${terms.labelsAny.map(quote).join(",")}`);
  for (const label of terms.labelsNone) parts.push(`-label:${quote(label)}`);
  if (terms.assignee) parts.push(`assignee:${terms.assignee}`);
  if (terms.unassigned) parts.push("no:assignee");
  if (settings.ignoreOlderThanDays)
    parts.push(
      `created:>=${new Date(now - settings.ignoreOlderThanDays * DAY_MS)
        .toISOString()
        .slice(0, 10)}`,
    );
  return parts.join(" ");
}

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
        number title url createdAt isDraft
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
export async function readUntriaged(github, query) {
  const items = [];
  let after = null,
    total = 0,
    more = false;
  for (let page = 0; page < UNTRIAGED_PAGES; page++) {
    const data = await github.graphql(
      SEARCH,
      { q: query, first: UNTRIAGED_PAGE_SIZE, after },
      "search for untriaged items",
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

// The cache sits beside the database, like the tick's health receipt: the
// cron writes it and the app backend reads it.
export function untriagedPath(store) {
  return store.filename && store.filename !== ":memory:"
    ? path.join(path.dirname(path.resolve(store.filename)), "untriaged.json")
    : null;
}

const memory = new WeakMap();

export function readCache(store) {
  const filename = untriagedPath(store);
  if (!filename) return memory.get(store) ?? structuredClone(EMPTY);
  try {
    const value = JSON.parse(fs.readFileSync(filename, "utf8"));
    return value?.version === 1 ? value : structuredClone(EMPTY);
  } catch {
    return structuredClone(EMPTY);
  }
}

function writeCache(store, cache) {
  const filename = untriagedPath(store);
  if (!filename) return void memory.set(store, cache);
  const temporary = `${filename}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(cache) + "\n", { mode: 0o600 });
    fs.renameSync(temporary, filename);
  } catch {
    // The list is advisory; a failed write must not fail the tick.
    fs.rmSync(temporary, { force: true });
  }
}

const key = (repository, number) => `${lower(repository)}#${number}`;
const PULL_URL = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/;

// Issues and pull requests Avoozl tasks already own.
export function linkedItems(tasks = []) {
  const issues = new Set(),
    pulls = new Set();
  for (const task of tasks) {
    const github = task?.github;
    if (!github) continue;
    if (github.repository && Number.isInteger(github.number))
      issues.add(key(github.repository, github.number));
    for (const pull of github.pullRequests || []) {
      const found = PULL_URL.exec(String(pull?.url ?? ""));
      if (found) pulls.add(key(found[1], Number(found[2])));
      else if (github.repository && Number.isInteger(pull?.number))
        pulls.add(key(github.repository, pull.number));
    }
  }
  return { issues, pulls };
}

// Whether one cached item is untriaged now (R49.2).
export function isUntriaged(
  entry,
  repository,
  settings,
  linked,
  now = Date.now(),
) {
  const labels = new Set(entry.labels.map(lower)),
    terms = filterTerms(settings.untriaged),
    managed = Object.values(settings.managedLabels || {}).map(lower),
    assignees = new Set((entry.assignees || []).map(lower));
  // The filter, applied here too, so a changed line shows before the next read.
  if (!terms.labelsAll.every((label) => labels.has(lower(label)))) return false;
  if (
    terms.labelsAny.length &&
    !terms.labelsAny.some((label) => labels.has(lower(label)))
  )
    return false;
  if (terms.labelsNone.some((label) => labels.has(lower(label)))) return false;
  if (terms.assignee && !assignees.has(lower(terms.assignee))) return false;
  if (terms.unassigned && assignees.size) return false;
  const days = settings.untriaged?.ignoreOlderThanDays;
  if (
    days &&
    entry.createdAt &&
    Date.parse(entry.createdAt) < now - days * DAY_MS
  )
    return false;
  if (managed.some((label) => labels.has(label))) return false;
  if (entry.kind === "pr") {
    if (linked.pulls.has(key(repository, entry.number))) return false;
    return !(entry.closes || []).some((ref) =>
      linked.issues.has(key(ref.repository || repository, ref.number)),
    );
  }
  if (linked.issues.has(key(repository, entry.number))) return false;
  // A rule that would match but for who labeled it still covers the issue.
  const issue = {
    labels: entry.labels,
    assignees: (entry.assignees || []).map((login) => ({ login })),
    user: entry.author ? { login: entry.author } : null,
  };
  return matchingRules(settings, issue, []).length === 0;
}

// Send to Issue Radar's receipts (R52.5), by `repository#number`.
export const HANDOFF_KIND = "radar-handoff";
export const handoffId = (repository, number) =>
  `${HANDOFF_KIND}:${key(repository, number)}`;
export function handoffReceipts(store) {
  const map = new Map();
  for (const receipt of store?.list?.("receipts") || [])
    if (receipt.kind === HANDOFF_KIND)
      map.set(key(receipt.repository, receipt.number), receipt);
  return map;
}

// Which of Issue Radar's labels an item carries now.
export function crewState(entry, settings = {}) {
  const labels = new Set((entry.labels || []).map(lower)),
    crew = settings.crewLabels || CREW_LABEL_DEFAULTS;
  return {
    claimed: labels.has(lower(crew.claim)),
    needsHuman: labels.has(lower(crew.needsHuman)),
    needsHumanLabel: crew.needsHuman,
  };
}

// An issue not tied to a task that a crew has, or was sent to (R52.6).
function withRadar(entry, repository, settings, linked, handoffs) {
  if (entry.kind !== "issue") return null;
  if (linked.issues.has(key(repository, entry.number))) return null;
  const state = crewState(entry, settings),
    receipt = handoffs.get(key(repository, entry.number)) || null;
  if (!receipt && !state.claimed && !state.needsHuman) return null;
  return {
    claimed: state.claimed,
    needsHuman: state.needsHuman,
    needsHumanLabel: state.needsHumanLabel,
    handoff: receipt
      ? {
          label: receipt.label,
          crew: receipt.crew ?? null,
          actor: receipt.actor ?? null,
          at: receipt.at ?? null,
        }
      : null,
  };
}

// Where each button goes. Kiro Crew has no link to one item in Issue Radar
// or Code Review Sage (design F98, F99), so each opens the app's page and
// says what to pick there. shortcut: page links only; switch to exact links
// when Kiro Crew ships MC-14.
export function itemLinks(repository, entry) {
  const name = `${repository} #${entry.number}`;
  return {
    github: entry.url,
    issueRadar: {
      url: ISSUE_RADAR_PATH,
      exact: false,
      tooltip: `Issue Radar can't open one item from a link yet, so this opens Issue Radar. Pick ${name} there.`,
    },
    review:
      entry.kind === "pr"
        ? {
            url: CODE_REVIEW_SAGE_PATH,
            exact: false,
            tooltip: `Code Review Sage can't open one pull request from a link yet, so this opens Code Review Sage. Pick ${name} there.`,
          }
        : null,
  };
}

// Needs you items for With Issue Radar issues whose crew asked for a
// person (R52.10): plain words and the issue link, settled on GitHub.
export function radarNeedsYou(view) {
  return (view?.withRadar || [])
    .filter((entry) => entry.needsHuman)
    .map((entry) => ({
      kind: "needs-human",
      reason: "crew",
      id: `radar:${key(entry.repository, entry.number)}`,
      taskId: null,
      authority: "github",
      issue: {
        number: entry.number,
        url: entry.url,
        repository: entry.repository,
      },
      link: entry.url,
      title: `${entry.repository} #${entry.number} needs a person: ${entry.title}`,
      detail: `An Issue Radar crew added "${entry.needsHumanLabel}". Answer it on GitHub; the crew picks the issue up again when the label comes off.`,
    }));
}

// The view (`untriaged.view`): every repository's untriaged items now.
// shortcut: a handed-off issue that leaves the cached read (closed, or
// filtered out) leaves With Issue Radar too; read receipts for a history
// view if one is asked for.
export function untriagedView(
  policy,
  tasks,
  cache,
  now = Date.now(),
  handoffs = new Map(),
) {
  if (!policy?.mode)
    return {
      enabled: false,
      mode: null,
      total: 0,
      repositories: [],
      items: [],
      withRadar: [],
    };
  const linked = linkedItems(tasks),
    repositories = [],
    items = [],
    radar = [];
  for (const [repository, settings] of Object.entries(
    policy.repositories || {},
  )) {
    const entry = cache.repositories?.[repository],
      kept = [];
    let sent = 0;
    for (const candidate of entry?.items || []) {
      const crew = withRadar(candidate, repository, settings, linked, handoffs);
      if (crew) {
        sent += 1;
        radar.push({
          ...candidate,
          repository,
          ...crew,
          links: itemLinks(repository, candidate),
        });
      } else if (isUntriaged(candidate, repository, settings, linked, now))
        kept.push(candidate);
    }
    let query = null,
      queryError = null;
    try {
      query = searchQuery(repository, settings.untriaged, now);
    } catch (error) {
      queryError = error.message;
    }
    repositories.push({
      repository,
      checkedAt: entry?.checkedAt ?? null,
      error: queryError ?? entry?.error ?? null,
      searched: entry?.total ?? null,
      // How many items Avoozl read, before the exclusions.
      read: entry?.items?.length ?? 0,
      truncated: entry?.truncated === true,
      count: kept.length,
      withRadar: sent,
      query,
      filter: settings.untriaged?.filter ?? null,
      defaultFilter: defaultFilter(settings.untriaged?.triageLabels),
      notify: settings.untriaged?.notify === true,
    });
    for (const candidate of kept)
      items.push({
        ...candidate,
        repository,
        links: itemLinks(repository, candidate),
      });
  }
  const newest = (a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt));
  items.sort(newest);
  // Needs a person first, then newest.
  radar.sort(
    (a, b) => Number(b.needsHuman) - Number(a.needsHuman) || newest(a, b),
  );
  return {
    enabled: true,
    mode: policy.mode,
    total: items.length,
    repositories,
    items,
    withRadar: radar,
    interval: UNTRIAGED_INTERVAL_MS,
  };
}

// The tick's read: at most one search per repository per interval, unless
// `force` (Check now). Returns notices for repositories that notify.
export async function refreshUntriaged(
  store,
  github,
  policy,
  tasks,
  { now = Date.now(), force = false } = {},
) {
  if (!policy?.mode || !github) return { read: 0, notify: [] };
  const cache = readCache(store),
    next = { version: 1, repositories: {}, notice: cache.notice ?? null };
  let read = 0;
  for (const [repository, settings] of Object.entries(
    policy.repositories || {},
  )) {
    const old = cache.repositories?.[repository] ?? null;
    let query;
    try {
      query = searchQuery(repository, settings.untriaged, now);
    } catch {
      if (old) next.repositories[repository] = old;
      continue;
    }
    // The query's age cutoff moves daily, so compare the age in days
    // instead: a changed age reads again on the next tick (R49.6).
    const days = settings.untriaged?.ignoreOlderThanDays ?? null,
      same =
        old &&
        (old.days ?? null) === days &&
        old.query?.replace(/ created:>=\S+$/, "") ===
          query.replace(/ created:>=\S+$/, ""),
      fresh =
        old?.readAt && now - Date.parse(old.readAt) < UNTRIAGED_INTERVAL_MS;
    if (same && fresh && !force) {
      next.repositories[repository] = old;
      continue;
    }
    const at = new Date(now).toISOString();
    read += 1;
    try {
      const result = await readUntriaged(github, query);
      next.repositories[repository] = {
        query,
        days,
        readAt: at,
        checkedAt: at,
        error: null,
        ...result,
      };
    } catch (error) {
      next.repositories[repository] = {
        query,
        days,
        readAt: at,
        checkedAt: old?.checkedAt ?? null,
        error: `GitHub could not be read: ${error.message}`,
        total: old?.total ?? null,
        truncated: old?.truncated === true,
        items: old?.items ?? [],
      };
    }
  }
  const notify = noticeFor(policy, tasks, next, now, handoffReceipts(store));
  writeCache(store, next);
  return { read, notify };
}

// One notice for the workspace when a notifying repository's count rose
// since the last notice and an hour has passed (R49.14). A drop lowers the
// mark, so the next rise notifies again.
function noticeFor(policy, tasks, cache, now, handoffs) {
  const view = untriagedView(policy, tasks, cache, now, handoffs),
    watched = view.repositories.filter((row) => row.notify && !row.error);
  const last = cache.notice ?? { at: null, counts: {} },
    counts = { ...last.counts },
    rose = watched.filter(
      (row) => row.count > (last.counts?.[row.repository] ?? 0),
    ),
    due = !last.at || now - Date.parse(last.at) >= UNTRIAGED_NOTICE_GAP_MS;
  if (rose.length && due) {
    for (const row of watched) counts[row.repository] = row.count;
    cache.notice = { at: new Date(now).toISOString(), counts };
    const text = rose
      .map((row) => `${row.count} in ${row.repository}`)
      .join(", ");
    return [
      {
        channel: "untriaged",
        task: "untriaged",
        title: `Untriaged on GitHub: ${text}`,
        text: `Open issues and pull requests no trigger rule, triage label, or task covers: ${text}. Checked ${cache.notice.at}.`,
        resume:
          "Open Avoozl's Untriaged tab to hand them to Issue Radar or Code Review Sage.",
      },
    ];
  }
  for (const row of watched)
    if (row.count < (counts[row.repository] ?? 0))
      counts[row.repository] = row.count;
  cache.notice = { at: last.at, counts };
  return [];
}
