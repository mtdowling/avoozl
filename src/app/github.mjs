import { execFileSync } from "node:child_process";
import {
  RateState,
  ResponseCache,
  limitOf,
  rateLimitError,
  resourceOf,
} from "./github-rate.mjs";
import { fail } from "./store.mjs";

const API_VERSION = "2022-11-28";
const PAGE_SIZE = 100;
export const DEFAULT_CACHE_SECONDS = 60;
const MAX_PAGES = 20;
// GitHub's built-in repository roles (github-policy.mjs PERMISSIONS).
const ROLES = new Set(["read", "triage", "write", "maintain", "admin"]);

export function parseRepository(value) {
  const match = String(value || "")
    .trim()
    .match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) fail("Use a GitHub repository in owner/name form.");
  return { id: `${match[1]}/${match[2]}`, owner: match[1], repo: match[2] };
}

// A pull request node with its commits flattened to {oid, message}, the text
// the plans-repo leak screen reads.
function pullRequestText(node) {
  return {
    ...node,
    commits: (node?.commits?.nodes || []).map((entry) => ({
      oid: entry?.commit?.oid || null,
      message: String(entry?.commit?.message || ""),
    })),
  };
}

// A pull request's feedback node as plain records (task 15.1). A commit
// status reads like a check run: its state is the conclusion once final.
const STATUS = { SUCCESS: "SUCCESS", FAILURE: "FAILURE", ERROR: "FAILURE" };
export function feedbackOf(node) {
  if (!node) return null;
  const who = (entry) => entry?.author?.login || null,
    contexts =
      node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ||
      [];
  return {
    number: node.number,
    url: node.url,
    updatedAt: node.updatedAt,
    head: node.headRefOid,
    base: node.baseRefName,
    mergeable: node.mergeable,
    autoMerge: Boolean(node.autoMergeRequest),
    // Up to date and review state (§4.23, §4.25); GitHub says BEHIND only
    // when the base branch requires branches to be up to date.
    mergeState: node.mergeStateStatus ?? null,
    reviewDecision: node.reviewDecision ?? null,
    baseHead: node.baseRef?.target?.oid ?? null,
    checks: contexts.filter(Boolean).map((entry) =>
      entry.__typename === "StatusContext"
        ? {
            id: `status:${entry.id}`,
            name: entry.context,
            status: STATUS[entry.state] ? "COMPLETED" : "PENDING",
            conclusion: STATUS[entry.state] || null,
            url: entry.targetUrl || null,
            runId: null,
          }
        : {
            id: `check:${entry.databaseId}`,
            name: entry.name,
            status: entry.status,
            conclusion: entry.conclusion || null,
            url: entry.detailsUrl || null,
            runId: entry.checkSuite?.workflowRun?.databaseId ?? null,
          },
    ),
    reviews: (node.reviews?.nodes || []).filter(Boolean).map((review) => ({
      id: review.databaseId,
      state: review.state,
      body: String(review.body || ""),
      url: review.url || null,
      login: who(review),
      commit: review.commit?.oid || null,
      at: review.submittedAt || null,
    })),
    threads: (node.reviewThreads?.nodes || [])
      .filter(Boolean)
      .map((thread) => ({
        id: thread.id,
        resolved: thread.isResolved === true,
        path: thread.path || null,
        comments: (thread.comments?.nodes || []).filter(Boolean).map((c) => ({
          id: c.databaseId,
          body: String(c.body || ""),
          url: c.url || null,
          login: who(c),
          commit: c.originalCommit?.oid || null,
          at: c.createdAt || null,
        })),
      })),
    comments: (node.comments?.nodes || []).filter(Boolean).map((c) => ({
      id: c.databaseId,
      body: String(c.body || ""),
      url: c.url || null,
      login: who(c),
      commit: null,
      at: c.createdAt || null,
    })),
  };
}

export async function requirePrivateRepository(github, value) {
  const repository = typeof value === "string" ? parseRepository(value) : value,
    remote = await github.repository(repository);
  if (remote.private !== true)
    fail(
      `Avoozl refuses public repositories. ${repository.id} must remain private.`,
      403,
    );
  return remote;
}

function localToken() {
  const configured =
    process.env.AVOOZL_GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN;
  if (configured?.trim()) return configured.trim();
  try {
    return execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return "";
  }
}

export class GitHubClient {
  constructor({
    token,
    apiUrl = process.env.GITHUB_API_URL || "https://api.github.com",
    fetch: fetchImpl = globalThis.fetch,
    timeoutMs = 30000,
  } = {}) {
    this.token = token || "";
    this.discoverToken = token === undefined;
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    // The newest x-ratelimit-* headers per resource (core, search, graphql).
    this.rateLimits = new Map();
    this.cacheSeconds = () => DEFAULT_CACHE_SECONDS;
  }

  // { limit, remaining, resetAt } from the newest response for `resource`,
  // or null before any.
  rateLimit(resource = "core") {
    return this.rateLimits.get(resource) ?? null;
  }

  // Keeps conditional-request answers and the rate state in `store`, so a
  // GET GitHub answers 304 costs nothing and a limit holds every process of
  // the workspace back. Without it the client behaves as before.
  bind(store, { now, cacheSeconds } = {}) {
    // How long an answer stays fresh, in seconds, for a repository id (or
    // none). Within it a read makes no call. Settings > GitHub sets it.
    if (cacheSeconds) this.cacheSeconds = cacheSeconds;
    this.cache = store ? new ResponseCache(store, { now }) : null;
    this.rate = store ? new RateState(store, { now }) : null;
    return this;
  }

  available() {
    return Boolean(this.token) || this.discoverToken;
  }

  // True only when a token is in hand; discovery (gh auth token) runs here
  // once. available() also says yes while discovery is pending, so a reader
  // that must not go out unauthenticated (GitHub's anonymous limit is 60
  // requests an hour, and private repositories answer 404) asks this.
  signedIn() {
    if (!this.token && this.discoverToken) {
      this.token = localToken();
      this.discoverToken = false;
    }
    return Boolean(this.token);
  }

  // `etag` makes the read conditional: GitHub answers 304, which does not
  // count against the rate limit (checked live 2026-11-13), and this
  // returns { notModified: true }.
  async request(method, pathname, { query, body, accept, headers, etag } = {}) {
    if (!this.token && this.discoverToken) {
      this.token = localToken();
      this.discoverToken = false;
    }
    if (!this.token)
      fail(
        "GitHub authentication is unavailable. Run gh auth login or set AVOOZL_GITHUB_TOKEN.",
        503,
      );
    const url = new URL(this.apiUrl + pathname);
    for (const [key, value] of Object.entries(query || {}))
      if (value !== undefined && value !== null && value !== "")
        url.searchParams.set(key, String(value));
    const resource = resourceOf(pathname),
      wanted = accept || "application/vnd.github+json",
      repoId = /^\/repos\/([^/]+\/[^/?]+)/.exec(pathname)?.[1] || "",
      // A GET, or a GraphQL query, is kept; any other call is a write.
      readable =
        method === "GET" ||
        (pathname === "/graphql" && /^\s*(query\b|\{)/.test(body?.query || "")),
      key =
        readable && !etag && this.cache
          ? this.cache.key(
              this.token,
              wanted,
              url.href,
              method === "GET" ? "" : JSON.stringify(body),
            )
          : null,
      stored = key ? this.cache.get(key) : null,
      fresh = (this.cacheSeconds(repoId) || 0) * 1000,
      reply = (entry) => {
        const value = entry.body ? JSON.parse(entry.body) : null;
        return headers
          ? {
              value,
              link: entry.link || "",
              scopes: entry.scopes,
              etag: entry.etag,
            }
          : value;
      };
    // The one cache: within its max age a read makes no call, and while the
    // rate limit holds calls back it answers with what was stored.
    if (stored && fresh > 0 && this.cache.now() - stored.fetched < fresh)
      return reply(stored);
    const held = this.rate?.held(resource);
    if (held) {
      if (stored) return reply(stored);
      throw rateLimitError(held);
    }
    let response;
    try {
      response = await this.fetch(url, {
        method,
        headers: {
          Accept: wanted,
          Authorization: "Bearer " + this.token,
          "X-GitHub-Api-Version": API_VERSION,
          "User-Agent": "avoozl",
          ...(etag ? { "If-None-Match": etag } : {}),
          ...(stored?.etag ? { "If-None-Match": stored.etag } : {}),
          ...(stored?.lastModified
            ? { "If-Modified-Since": stored.lastModified }
            : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      fail("GitHub is unreachable: " + error.message, 503);
    }
    const header = (name) => response.headers?.get?.(name);
    if (header("x-ratelimit-remaining") != null) {
      const seen = {
        limit: Number(header("x-ratelimit-limit")),
        remaining: Number(header("x-ratelimit-remaining")),
        resetAt: new Date(
          Number(header("x-ratelimit-reset")) * 1000,
        ).toISOString(),
      };
      this.rateLimits.set(header("x-ratelimit-resource") || resource, seen);
      this.rate?.observe(header("x-ratelimit-resource") || resource, {
        limit: seen.limit,
        remaining: seen.remaining,
        resetAtMs: Date.parse(seen.resetAt),
      });
    }
    this.rate?.count(response.status === 304);
    if (etag && response.status === 304) {
      this.rate?.flush();
      return { notModified: true, etag };
    }
    const reused = response.status === 304 && stored,
      text = reused ? stored.body : await response.text();
    let value = null;
    try {
      value = text ? JSON.parse(text) : null;
    } catch (error) {
      if (response.ok) throw error;
    }
    if (!response.ok && !reused) {
      const limit = limitOf(
        response.status,
        response.headers,
        value?.message,
        resource,
        (this.rate?.now ?? Date.now)(),
      );
      if (limit && this.rate) this.rate.limit(limit);
      this.rate?.flush();
      if (limit && stored) return reply(stored);
      const error = limit
        ? rateLimitError({ ...limit, scope: limit.reason })
        : Error(
            value?.message || `GitHub request failed with ${response.status}.`,
          );
      error.status = limit ? 429 : response.status;
      error.details = value;
      throw error;
    }
    const link = reused ? stored.link || "" : header("link") || "",
      scopes = reused ? stored.scopes : (header("x-oauth-scopes") ?? null),
      tag = reused ? stored.etag : header("etag") || null;
    if (key && reused) this.cache.refreshed(key);
    else if (key && response.ok && !value?.errors?.length)
      this.cache.put(
        key,
        {
          etag: tag,
          lastModified: header("last-modified"),
          body: text,
          link,
          scopes,
        },
        { ttlOnly: method !== "GET" },
      );
    // A write makes what it touched stale (not gone: a 304 still revalidates).
    if (!readable && response.ok && this.cache)
      this.cache.invalidate(this.token, repoId);
    this.rate?.flush();
    // `headers` asks for the Link and scope headers beside the body.
    return headers ? { value, link, scopes, etag: tag } : value;
  }

  // Cursor pages, as the Projects REST API returns them (`after` in Link).
  async paginateCursor(pathname, { query } = {}) {
    const items = [];
    let after;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const { value, link } = await this.request("GET", pathname, {
        query: { ...query, per_page: PAGE_SIZE, after },
        headers: true,
      });
      if (!Array.isArray(value))
        fail("GitHub returned an invalid paginated response.", 502);
      items.push(...value);
      const next = /<([^>]+)>;\s*rel="next"/.exec(link)?.[1];
      after = next ? new URL(next).searchParams.get("after") : null;
      if (!after) return items;
    }
    fail(
      `GitHub returned more than ${MAX_PAGES * PAGE_SIZE} items. Narrow the Project before retrying.`,
      413,
    );
  }

  // A Projects v2 board by owner and number: the organization's first, then
  // the user's. `base` is the REST path the other Project calls use.
  async projectV2({ owner, number }) {
    for (const kind of ["orgs", "users"]) {
      const base = `/${kind}/${encodeURIComponent(owner)}/projectsV2/${Number(number)}`;
      try {
        const { value, scopes } = await this.request("GET", base, {
          headers: true,
        });
        return { ...value, base, scopes };
      } catch (error) {
        if (kind === "users" || error.status !== 404) throw error;
      }
    }
  }

  projectFields(project) {
    return this.paginateCursor(`${project.base}/fields`);
  }

  projectItems(project, fieldIds = []) {
    return this.paginateCursor(`${project.base}/items`, {
      query: fieldIds.length ? { fields: fieldIds.join(",") } : {},
    });
  }

  addProjectItem(project, { owner, repo, number }) {
    return this.request("POST", `${project.base}/items`, {
      body: { type: "Issue", owner, repo, number: Number(number) },
    });
  }

  // `fields` is [{id, value}]: a number, an option or iteration ID, or null.
  updateProjectItem(project, itemId, fields) {
    return this.request("PATCH", `${project.base}/items/${Number(itemId)}`, {
      body: { fields },
    });
  }

  // Status moves on one issue, newest last, with who made each. Checked
  // live 2026-11-12: REST timeline events carry no status or project, so
  // this reads GraphQL `ProjectV2ItemStatusChangedEvent`.
  async projectStatusChanges(issueNodeId) {
    const data = await this.graphql(
        `query($id:ID!){node(id:$id){... on Issue{timelineItems(last:50,itemTypes:[PROJECT_V2_ITEM_STATUS_CHANGED_EVENT]){nodes{... on ProjectV2ItemStatusChangedEvent{actor{login} createdAt status previousStatus project{id}}}}}}}`,
        { id: issueNodeId },
        "read Project status changes",
      ),
      nodes = data?.node?.timelineItems?.nodes;
    if (!Array.isArray(nodes))
      fail("GitHub returned invalid Project status data.", 502);
    return nodes.map((node) => ({
      actor: node?.actor?.login || null,
      at: node?.createdAt || null,
      status: node?.status || "",
      previousStatus: node?.previousStatus || "",
      projectId: node?.project?.id || null,
    }));
  }

  async paginate(pathname, { query, accept } = {}) {
    const items = [];
    for (let page = 1; page <= MAX_PAGES + 1; page += 1) {
      const batch = await this.request("GET", pathname, {
        query: { ...query, per_page: PAGE_SIZE, page },
        accept,
      });
      if (!Array.isArray(batch))
        fail("GitHub returned an invalid paginated response.", 502);
      if (page > MAX_PAGES) {
        if (batch.length)
          fail(
            `GitHub returned more than ${MAX_PAGES * PAGE_SIZE} items. Narrow the monitored repository before retrying.`,
            413,
          );
        return items;
      }
      items.push(...batch);
      if (batch.length < PAGE_SIZE) return items;
    }
    return items;
  }

  currentUser() {
    return this.request("GET", "/user");
  }

  repository(value) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request("GET", `/repos/${owner}/${repo}`);
  }

  // The actor's repository role as `permission`. GitHub's `permission` field
  // reports maintain as write and triage as read; `role_name` names the
  // real role. A custom role's name is not a built-in role, so its base
  // `permission` counts, which can only rank it lower (checked live
  // 2026-11-13: smithy-java answered permission write, role_name maintain).
  permission(value, actor) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/collaborators/${encodeURIComponent(actor)}/permission`,
    ).then(
      (result) =>
        ROLES.has(result?.role_name)
          ? { ...result, permission: result.role_name }
          : result,
      (error) => {
        if (error.status === 404)
          return { permission: "none", user: { login: actor } };
        throw error;
      },
    );
  }

  // Whether anything on the repository's issues or pull requests changed
  // since `etag`: the most recently updated one, read conditionally. Every
  // label, assignee, body or state change moves an issue's updated_at, so
  // an unchanged answer (a free 304) means intake has nothing new to read.
  async issueActivity(value, etag) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      result = await this.request("GET", `/repos/${owner}/${repo}/issues`, {
        query: {
          state: "all",
          sort: "updated",
          direction: "desc",
          per_page: 1,
        },
        headers: true,
        etag: etag || undefined,
      });
    return result.notModified
      ? { changed: false, etag }
      : { changed: true, etag: result.etag };
  }

  // Every open issue carrying any of `labels`, in one search (pages of 100)
  // so all of a repository's rules share one call per tick. GitHub search
  // returns at most 1,000 results; more, or results GitHub marks
  // incomplete, fail rather than silently drop an issue.
  async searchIssuesWithAnyLabel(value, labels) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      quote = (label) => (/[\s,"]/.test(label) ? `"${label}"` : label),
      q = `repo:${owner}/${repo} is:issue is:open label:${[...new Set(labels)]
        .map(quote)
        .join(",")}`,
      items = [];
    for (let page = 1; page <= 10; page += 1) {
      const result = await this.request("GET", "/search/issues", {
        query: { q, per_page: PAGE_SIZE, page, sort: "updated", order: "asc" },
      });
      if (!Array.isArray(result?.items))
        fail("GitHub returned invalid search data.", 502);
      if (result.incomplete_results)
        fail(
          "GitHub search returned incomplete results; retrying next tick.",
          503,
        );
      items.push(...result.items);
      if (items.length >= result.total_count || result.items.length < PAGE_SIZE)
        return items.filter((item) => !item.pull_request);
    }
    fail(
      "More than 1,000 open issues carry a trigger label. Narrow the rules before retrying.",
      413,
    );
  }

  listIssues(value, { state = "all", label } = {}) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(`/repos/${owner}/${repo}/issues`, {
      query: {
        state,
        labels: label,
        sort: "created",
        direction: "asc",
      },
    }).then((items) => items.filter((item) => !item.pull_request));
  }

  // Open issues matching a GitHub search line, newest first (Settings
  // trigger preview). Read only; one page.
  searchOpenIssues(value, search, { perPage = 10, pullRequests = false } = {}) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request("GET", "/search/issues", {
      query: {
        q: `repo:${owner}/${repo}${pullRequests ? "" : " is:issue"} is:open ${search}`,
        per_page: perPage,
        sort: "updated",
        order: "desc",
      },
    });
  }

  // The repository's label names (Settings > Untriaged). Read only.
  listLabels(value) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(`/repos/${owner}/${repo}/labels`);
  }

  listOpenIssues(value) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(`/repos/${owner}/${repo}/issues`, {
      query: {
        state: "open",
        sort: "updated",
        direction: "desc",
      },
    }).then((items) => items.filter((item) => !item.pull_request));
  }

  listIssueComments(value, number) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(`/repos/${owner}/${repo}/issues/${number}/comments`);
  }

  issueEvents(value, number) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/issues/${number}/events`,
      { query: { per_page: 100 } },
    );
  }

  issueTimeline(value, number) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/issues/${number}/timeline`,
      {
        query: { per_page: 100 },
        accept: "application/vnd.github+json",
      },
    );
  }

  issue(value, number) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request("GET", `/repos/${owner}/${repo}/issues/${number}`);
  }

  listIssueBlockers(value, number) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(
      `/repos/${owner}/${repo}/issues/${number}/dependencies/blocked_by`,
    );
  }

  addIssueBlocker(value, number, blockerIssueId) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "POST",
      `/repos/${owner}/${repo}/issues/${number}/dependencies/blocked_by`,
      { body: { issue_id: blockerIssueId } },
    );
  }

  removeIssueBlocker(value, number, blockerIssueId) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "DELETE",
      `/repos/${owner}/${repo}/issues/${number}/dependencies/blocked_by/${blockerIssueId}`,
    ).catch((error) => {
      if (error.status !== 404) throw error;
      return null;
    });
  }

  ensureLabel(value, { name, color = "1d76db", description = "" }) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`,
    ).catch((error) => {
      if (error.status !== 404) throw error;
      return this.request("POST", `/repos/${owner}/${repo}/labels`, {
        body: { name, color, description },
      });
    });
  }

  createIssue(value, input) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request("POST", `/repos/${owner}/${repo}/issues`, {
      body: input,
    });
  }

  createIssueComment(value, number, body) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "POST",
      `/repos/${owner}/${repo}/issues/${number}/comments`,
      { body: { body } },
    );
  }

  updateIssueComment(value, commentId, body) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "PATCH",
      `/repos/${owner}/${repo}/issues/comments/${commentId}`,
      { body: { body } },
    );
  }

  createCommitComment(value, sha, body) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "POST",
      `/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}/comments`,
      { body: { body } },
    );
  }

  updateCommitComment(value, commentId, body) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "PATCH",
      `/repos/${owner}/${repo}/comments/${commentId}`,
      { body: { body } },
    );
  }

  addSubIssue(value, parentNumber, subIssueId) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "POST",
      `/repos/${owner}/${repo}/issues/${parentNumber}/sub_issues`,
      { body: { sub_issue_id: subIssueId } },
    ).catch((error) => {
      if (error.status === 409 || error.status === 422) return null;
      throw error;
    });
  }

  // Sub-issues may sit in other repositories and organizations (F37, F38):
  // the child is named by its database ID, never by its repository.
  listSubIssues(value, parentNumber) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(
      `/repos/${owner}/${repo}/issues/${parentNumber}/sub_issues`,
    );
  }

  removeSubIssue(value, parentNumber, subIssueId) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "DELETE",
      `/repos/${owner}/${repo}/issues/${parentNumber}/sub_issue`,
      { body: { sub_issue_id: subIssueId } },
    ).catch((error) => {
      if (error.status !== 404) throw error;
      return null;
    });
  }

  parentIssue(value, number) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/issues/${number}/parent`,
    ).catch((error) => {
      if (error.status !== 404) throw error;
      return null;
    });
  }

  listIssueBlocking(value, number) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(
      `/repos/${owner}/${repo}/issues/${number}/dependencies/blocking`,
    );
  }

  // Issue types belong to an organization (F44; L8: creating one needs an
  // organization admin). A user account has none, so 404 reads as empty.
  listIssueTypes(org) {
    return this.request(
      "GET",
      `/orgs/${encodeURIComponent(org)}/issue-types`,
    ).catch((error) => {
      if (error.status !== 404) throw error;
      return [];
    });
  }

  createIssueType(org, { name, description = "", color, enabled = true }) {
    return this.request(
      "POST",
      `/orgs/${encodeURIComponent(org)}/issue-types`,
      {
        body: {
          name,
          description,
          is_enabled: enabled,
          ...(color ? { color } : {}),
        },
      },
    );
  }

  setIssueType(value, number, type) {
    return this.updateIssue(value, number, { type });
  }

  async graphql(query, variables, what) {
    const result = await this.request("POST", "/graphql", {
      body: { query, variables },
    });
    if (result?.errors?.length)
      fail(
        `GitHub could not ${what}: ` +
          result.errors.map((error) => error.message).join("; "),
        502,
      );
    return result?.data;
  }

  // Turns on GitHub auto-merge for one pull request (RC5.2). GitHub merges
  // later, when its own rules pass; this never merges and has no admin path.
  armAutoMerge(_repository, pullRequestId, method = "MERGE") {
    return this.graphql(
      `mutation($id:ID!,$method:PullRequestMergeMethod!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:$method}){pullRequest{number}}}`,
      { id: pullRequestId, method },
      "arm auto-merge",
    );
  }

  // Turns GitHub auto-merge off for one pull request (RC5.4, Disarm).
  disarmAutoMerge(_repository, pullRequestId) {
    return this.graphql(
      `mutation($id:ID!){disablePullRequestAutoMerge(input:{pullRequestId:$id}){pullRequest{number}}}`,
      { id: pullRequestId },
      "disarm auto-merge",
    );
  }

  // Links a branch in `repositoryId` (may differ from the issue's repository)
  // to the issue, created at `oid` (F51, L13). Needs push access there.
  async createLinkedBranch({ issueId, repositoryId, oid, name }) {
    const data = await this.graphql(
        `mutation($input:CreateLinkedBranchInput!){createLinkedBranch(input:$input){linkedBranch{id ref{name repository{id nameWithOwner}}}}}`,
        { input: { issueId, repositoryId, oid, name } },
        "create a linked branch",
      ),
      branch = data?.createLinkedBranch?.linkedBranch;
    if (!branch?.ref?.name)
      fail("GitHub returned invalid linked-branch data.", 502);
    return {
      id: branch.id,
      name: branch.ref.name,
      repository: branch.ref.repository?.nameWithOwner || null,
      repositoryId: branch.ref.repository?.id || null,
    };
  }

  // The repository's node ID and the head commit of `branch`, the inputs
  // createLinkedBranch needs.
  async branchHead(value, branch) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      data = await this.graphql(
        `query($owner:String!,$repo:String!,$ref:String!){repository(owner:$owner,name:$repo){id ref(qualifiedName:$ref){target{oid}}}}`,
        { owner, repo, ref: `refs/heads/${branch}` },
        "read a branch head",
      ),
      repository = data?.repository,
      oid = repository?.ref?.target?.oid;
    if (!repository?.id) fail("GitHub returned invalid repository data.", 502);
    if (!/^[0-9a-f]{40}$/i.test(oid || ""))
      fail(`Branch ${branch} was not found in ${owner}/${repo}.`, 409);
    return { repositoryId: repository.id, oid };
  }

  // Pull requests in the repository whose head branch is `branch`, any state,
  // with the text the leak screen reads. shortcut: the newest 10 pull requests
  // and each one's first 100 commits; a longer branch history needs paging.
  async branchPullRequests(value, branch) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      data = await this.graphql(
        `query($owner:String!,$repo:String!,$branch:String!){repository(owner:$owner,name:$repo){pullRequests(headRefName:$branch,first:10,orderBy:{field:CREATED_AT,direction:DESC}){nodes{id number url state title body merged mergedAt headRefName headRefOid baseRefName repository{nameWithOwner} commits(first:100){nodes{commit{oid message}}}}}}}`,
        { owner, repo, branch },
        "read branch pull requests",
      ),
      nodes = data?.repository?.pullRequests?.nodes;
    if (!Array.isArray(nodes))
      fail("GitHub returned invalid pull-request data.", 502);
    return nodes.map(pullRequestText);
  }

  // Pull request feedback, first read (task 15.1, R54.2): for each branch,
  // its open pull request's cheap fields, in one query per repository.
  // {branch: {number, url, updatedAt, head, base, mergeable, autoMerge} |
  // null}. pullRequestFeedback reads the rest only for changed ones.
  async pullRequestHeads(value, branches) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      list = [...branches];
    if (!list.length) return {};
    const fields = list
        .map(
          (_, i) =>
            `b${i}:pullRequests(headRefName:$b${i},states:OPEN,first:1,orderBy:{field:CREATED_AT,direction:DESC}){nodes{number url updatedAt headRefOid baseRefName baseRef{target{oid}} mergeable mergeStateStatus reviewDecision autoMergeRequest{enabledAt}}}`,
        )
        .join(" "),
      args = list.map((_, i) => `,$b${i}:String!`).join(""),
      data = await this.graphql(
        `query($owner:String!,$repo:String!${args}){repository(owner:$owner,name:$repo){${fields}}}`,
        {
          owner,
          repo,
          ...Object.fromEntries(list.map((branch, i) => [`b${i}`, branch])),
        },
        "read open pull requests",
      ),
      repository = data?.repository;
    if (!repository) fail("GitHub returned invalid pull-request data.", 502);
    return Object.fromEntries(
      list.map((branch, i) => {
        const node = repository[`b${i}`]?.nodes?.[0];
        return [
          branch,
          node
            ? {
                number: node.number,
                url: node.url,
                updatedAt: node.updatedAt,
                head: node.headRefOid,
                base: node.baseRefName,
                mergeable: node.mergeable,
                autoMerge: Boolean(node.autoMergeRequest),
                mergeState: node.mergeStateStatus ?? null,
                reviewDecision: node.reviewDecision ?? null,
                baseHead: node.baseRef?.target?.oid ?? null,
              }
            : null,
        ];
      }),
    );
  }

  // Pull request feedback, second read (task 15.1): checks and statuses on
  // the head commit, reviews, review threads and conversation comments, for
  // the pull requests numbered, in one query. {number: feedback}.
  // shortcut: the newest 100 checks, 50 reviews, 50 threads of 20 comments
  // and 50 comments; a busier pull request needs paging.
  async pullRequestFeedback(value, numbers) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      list = [...numbers];
    if (!list.length) return {};
    const actor = "author{login}",
      fields = list
        .map(
          (_, i) =>
            `p${i}:pullRequest(number:$p${i}){number url updatedAt headRefOid baseRefName baseRef{target{oid}} mergeable mergeStateStatus reviewDecision autoMergeRequest{enabledAt} commits(last:1){nodes{commit{oid statusCheckRollup{contexts(first:100){nodes{__typename ... on CheckRun{databaseId name status conclusion detailsUrl checkSuite{workflowRun{databaseId}}} ... on StatusContext{id context state targetUrl}}}}}}} reviews(last:50){nodes{databaseId state body url submittedAt ${actor} commit{oid}}} reviewThreads(last:50){nodes{id isResolved path comments(last:20){nodes{databaseId body url createdAt ${actor} originalCommit{oid}}}}} comments(last:50){nodes{databaseId body url createdAt ${actor}}}}`,
        )
        .join(" "),
      args = list.map((_, i) => `,$p${i}:Int!`).join(""),
      data = await this.graphql(
        `query($owner:String!,$repo:String!${args}){repository(owner:$owner,name:$repo){${fields}}}`,
        {
          owner,
          repo,
          ...Object.fromEntries(list.map((number, i) => [`p${i}`, number])),
        },
        "read pull request feedback",
      ),
      repository = data?.repository;
    if (!repository) fail("GitHub returned invalid pull-request data.", 502);
    return Object.fromEntries(
      list.map((number, i) => [number, feedbackOf(repository[`p${i}`])]),
    );
  }

  // An issue's linked branches (emptied by GitHub on close, F52) and its
  // open blocked-by count, the native Blocked signal (F53).
  async issueLinks(value, number) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      data = await this.graphql(
        `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){issue(number:$number){id linkedBranches(first:25){nodes{id ref{name repository{id nameWithOwner}}}} issueDependenciesSummary{blockedBy totalBlockedBy}}}}`,
        { owner, repo, number: Number(number) },
        "read issue links",
      ),
      issue = data?.repository?.issue;
    if (!issue || !Array.isArray(issue.linkedBranches?.nodes))
      fail("GitHub returned invalid issue-link data.", 502);
    return {
      nodeId: issue.id,
      linkedBranches: issue.linkedBranches.nodes
        .filter((node) => node?.ref?.name)
        .map((node) => ({
          id: node.id,
          name: node.ref.name,
          repository: node.ref.repository?.nameWithOwner || null,
          repositoryId: node.ref.repository?.id || null,
        })),
      openBlockedBy: Number(issue.issueDependenciesSummary?.blockedBy ?? 0),
      totalBlockedBy: Number(
        issue.issueDependenciesSummary?.totalBlockedBy ?? 0,
      ),
    };
  }

  // Recent discussions, newest update first, with what the discussions
  // answer step reads (task 8.2). shortcut: the newest 25 only; a busier
  // repository needs paging by updatedAt.
  async listDiscussions(value) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      data = await this.graphql(
        `query($owner:String!,$repo:String!){repository(owner:$owner,name:$repo){discussions(first:25,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{id number url title body closed locked isAnswered updatedAt category{name} author{login}}}}}`,
        { owner, repo },
        "read discussions",
      ),
      nodes = data?.repository?.discussions?.nodes;
    if (!Array.isArray(nodes))
      fail("GitHub returned invalid discussion data.", 502);
    return nodes.filter(Boolean).map((node) => ({
      id: node.id,
      number: node.number,
      url: node.url,
      title: node.title || "",
      body: node.body || "",
      closed: node.closed === true,
      locked: node.locked === true,
      isAnswered: node.isAnswered === true,
      updatedAt: node.updatedAt,
      category: node.category?.name || "",
      author: node.author?.login || "",
    }));
  }

  async addDiscussionComment(discussionId, body) {
    const data = await this.graphql(
        `mutation($input:AddDiscussionCommentInput!){addDiscussionComment(input:$input){comment{id url}}}`,
        { input: { discussionId, body } },
        "comment on a discussion",
      ),
      comment = data?.addDiscussionComment?.comment;
    if (!comment?.id) fail("GitHub returned invalid comment data.", 502);
    return { id: comment.id, html_url: comment.url };
  }

  updateIssue(value, number, input) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request("PATCH", `/repos/${owner}/${repo}/issues/${number}`, {
      body: input,
    });
  }

  addLabels(value, number, labels) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "POST",
      `/repos/${owner}/${repo}/issues/${number}/labels`,
      { body: { labels } },
    );
  }

  removeLabel(value, number, label) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "DELETE",
      `/repos/${owner}/${repo}/issues/${number}/labels/${encodeURIComponent(label)}`,
    ).catch((error) => {
      if (error.status !== 404) throw error;
      return null;
    });
  }

  addAssignees(value, number, assignees) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "POST",
      `/repos/${owner}/${repo}/issues/${number}/assignees`,
      { body: { assignees } },
    );
  }

  removeAssignees(value, number, assignees) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "DELETE",
      `/repos/${owner}/${repo}/issues/${number}/assignees`,
      { body: { assignees } },
    );
  }

  requestReviewers(value, number, reviewers) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "POST",
      `/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`,
      { body: { reviewers } },
    );
  }

  createPullRequest(value, input) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request("POST", `/repos/${owner}/${repo}/pulls`, {
      body: input,
    });
  }

  // A branch at `oid`, then one file written on it. Used by the approval
  // pull request (spec-approval.mjs). `content` is base64.
  createBranch(value, name, oid) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request("POST", `/repos/${owner}/${repo}/git/refs`, {
      body: { ref: `refs/heads/${name}`, sha: oid },
    });
  }

  // A branch with no parent: an empty tree, one root commit, and one ref
  // written by its full name (RC25.1). shortcut: assumes GitHub accepts an
  // empty tree through the API; not yet tried against a live repository.
  async createOrphanBranch(value, name) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      git = `/repos/${owner}/${repo}/git`,
      tree = await this.request("POST", `${git}/trees`, { body: { tree: [] } }),
      commit = await this.request("POST", `${git}/commits`, {
        body: {
          message: "Start the plans branch",
          tree: tree.sha,
          parents: [],
        },
      });
    return this.createBranch({ owner, repo }, name, commit.sha);
  }

  putFile(value, { path, branch, message, content }) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "PUT",
      `/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
      { body: { message, content, branch } },
    );
  }

  pullRequest(value, number) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request("GET", `/repos/${owner}/${repo}/pulls/${number}`);
  }

  listPullRequests(value, input = {}) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(`/repos/${owner}/${repo}/pulls`, {
      query: {
        state: input.state || "all",
        head: input.head,
        base: input.base,
      },
    });
  }

  // How `head` stands against `base`: ahead_by and behind_by, and the files
  // `head` changed since the merge base (the first 300).
  compareCommits(value, base, head) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      ref = (name) => name.split("/").map(encodeURIComponent).join("/");
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/compare/${ref(base)}...${ref(head)}`,
    );
  }

  // GitHub's merge of `head` into `base`: one merge commit on `base`, an
  // ordinary update of that branch. 201 made a commit, 204 had nothing to
  // merge (null), 409 is a conflict and changes nothing.
  mergeBranch(value, { base, head, message }) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request("POST", `/repos/${owner}/${repo}/merges`, {
      body: { base, head, commit_message: message },
    });
  }

  closingPullRequests(value, issueNumber) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      query = `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){issue(number:$number){closedByPullRequestsReferences(first:10){nodes{id number url state title body merged mergedAt headRefName headRefOid baseRefName repository{nameWithOwner} commits(first:100){nodes{commit{oid message}}}}}}}}`;
    return this.request("POST", "/graphql", {
      body: { query, variables: { owner, repo, number: Number(issueNumber) } },
    }).then((result) => {
      if (result?.errors?.length)
        fail(
          "GitHub could not read closing pull requests: " +
            result.errors.map((error) => error.message).join("; "),
          502,
        );
      const nodes =
        result?.data?.repository?.issue?.closedByPullRequestsReferences?.nodes;
      if (!Array.isArray(nodes))
        fail("GitHub returned invalid closing pull-request data.", 502);
      return nodes.map(pullRequestText);
    });
  }

  checkRuns(value, ref) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/check-runs`,
      { query: { per_page: 100 } },
    ).then((result) => {
      if (!Array.isArray(result?.check_runs))
        fail("GitHub returned invalid check-run data.", 502);
      return result.check_runs;
    });
  }

  commitStatus(value, ref) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/status`,
      { query: { per_page: 100 } },
    ).then((result) => {
      if (!Array.isArray(result?.statuses))
        fail("GitHub returned invalid commit-status data.", 502);
      return result;
    });
  }

  createCommitStatus(value, ref, input) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "POST",
      `/repos/${owner}/${repo}/statuses/${encodeURIComponent(ref)}`,
      { body: input },
    );
  }

  // The ruleset rules in force on a branch (read-only). Each has a `type`
  // such as `pull_request` or `required_status_checks` and its `parameters`.
  branchRules(value, branch) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(
      `/repos/${owner}/${repo}/rules/branches/${encodeURIComponent(branch)}`,
    );
  }

  // A branch as anyone who can read the repository sees it: `protected`,
  // and a `protection` summary with classic required status checks.
  branch(value, branch) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
    );
  }

  // Classic branch protection, or null when the branch has none. Reading it
  // needs admin or administration-read access; GitHub answers 404 without.
  branchProtection(value, branch) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`,
    ).catch((error) => {
      if (error.status === 404) return null;
      throw error;
    });
  }

  // Recent commits on a branch, newest first.
  listCommits(value, branch, { limit = 5 } = {}) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request("GET", `/repos/${owner}/${repo}/commits`, {
      query: { sha: branch, per_page: limit },
    }).then((result) => {
      if (!Array.isArray(result))
        fail("GitHub returned invalid commit data.", 502);
      return result;
    });
  }

  // Every review on a pull request, oldest first, each with its `state`,
  // `user`, and the `commit_id` it reviewed.
  pullRequestReviews(value, number) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(`/repos/${owner}/${repo}/pulls/${number}/reviews`);
  }

  // Review drafts (radar-coder RC20): a pending review, one review, and the
  // delete of a pending one. There is deliberately no call that submits,
  // approves, requests changes or dismisses: a draft is the person's to send.
  createPendingReview(value, number, { commit_id, body, comments }) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "POST",
      `/repos/${owner}/${repo}/pulls/${number}/reviews`,
      {
        body: { commit_id, body, comments },
      },
    );
  }

  pullRequestReview(value, number, reviewId) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}`,
    );
  }

  // GitHub deletes only a review that was never submitted.
  deletePendingReview(value, number, reviewId) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "DELETE",
      `/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}`,
    );
  }

  // The issues a pull request closes: [{repository, number, title, url}].
  async pullRequestClosingIssues(value, number) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      data = await this.graphql(
        `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){closingIssuesReferences(first:10){nodes{number title url repository{nameWithOwner}}}}}}`,
        { owner, repo, number: Number(number) },
        "read closing issues",
      ),
      nodes =
        data?.repository?.pullRequest?.closingIssuesReferences?.nodes ?? [];
    return nodes
      .filter((node) => node?.number)
      .map((node) => ({
        repository: node.repository?.nameWithOwner ?? `${owner}/${repo}`,
        number: node.number,
        title: node.title ?? "",
        url: node.url ?? null,
      }));
  }

  listPullRequestReviewComments(value, number) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(`/repos/${owner}/${repo}/pulls/${number}/comments`);
  }

  async listPullRequestFiles(value, number, { maxFiles = 300 } = {}) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      limit = Math.max(1, Math.min(Number(maxFiles) || 300, 300)),
      items = [];
    for (let page = 1; items.length < limit; page += 1) {
      const remaining = limit - items.length,
        batch = await this.request(
          "GET",
          `/repos/${owner}/${repo}/pulls/${number}/files`,
          { query: { per_page: Math.min(PAGE_SIZE, remaining), page } },
        );
      if (!Array.isArray(batch))
        fail("GitHub returned an invalid pull-request file response.", 502);
      items.push(...batch);
      if (batch.length < Math.min(PAGE_SIZE, remaining))
        return { files: items, truncated: false };
    }
    return { files: items, truncated: true };
  }
}

export function defaultGitHubClient() {
  return new GitHubClient();
}
