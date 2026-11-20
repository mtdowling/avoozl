import { sharedGitHubRead } from "./github-read-snapshot.mjs";
import {
  RateState,
  ResponseCache,
  limitOf,
  rateLimitError,
  resourceOf,
} from "./github-rate.mjs";
import { fail } from "../store/store.mjs";
import { WritePacer } from "./github-pacer.mjs";
import {
  tokenTransportAllowed,
  currentGrants,
  currentJob,
  graphqlNeeds,
  jobOf,
  missingFrom,
  restNeeds,
  useGrant,
} from "./github-jobs.mjs";
import { AsyncLocalStorage } from "node:async_hooks";

const API_VERSION = "2022-11-28";
const SNAPSHOT_CLIENT = Symbol("GitHub read snapshot client");
const PAGE_SIZE = 100;
export const DEFAULT_CACHE_SECONDS = 60;
// Only the metadata CI accounting consumes is kept for this endpoint. GitHub's
// full 100-run response contains repository/actor prose and can exceed 1 MiB.
// Closed pull requests for the CI waste counts (§4.30), read in the open
// pull request query's first page.
const RECENT_PULLS =
  "recent:pullRequests(states:[MERGED,CLOSED],first:50,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number createdAt closedAt mergedAt mergeCommit{oid} author{login} headRefName headRefOid files(first:100){totalCount nodes{path}}}} ";
const WORKFLOW_RUNS_PROJECTION = {
  version: "workflow-runs-v3",
  project(data) {
    const invalid = () =>
        fail("GitHub returned invalid workflow run data.", 502),
      text = (value, max) =>
        typeof value === "string" && value.length > 0 && value.length <= max,
      time = (value) =>
        value == null ||
        (text(value, 64) && Number.isFinite(Date.parse(value)));
    if (!Array.isArray(data?.workflow_runs) || data.workflow_runs.length > 100)
      invalid();
    return data.workflow_runs.map((run) => {
      if (
        !run ||
        !Number.isSafeInteger(run.id) ||
        run.id < 1 ||
        !text(run.path, 4096) ||
        !text(run.head_sha, 128) ||
        !text(run.event, 128) ||
        !text(run.status, 64) ||
        (run.run_attempt !== undefined &&
          (!Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1)) ||
        ![run.run_started_at, run.created_at, run.updated_at].every(time) ||
        (run.pull_requests != null &&
          (!Array.isArray(run.pull_requests) ||
            run.pull_requests.some(
              (pull) => !Number.isSafeInteger(pull?.number) || pull.number < 1,
            )))
      )
        invalid();
      return {
        id: run.id,
        workflow: run.path.replace(/@.*$/, ""),
        headSha: run.head_sha,
        headBranch: text(run.head_branch, 512) ? run.head_branch : null,
        event: run.event,
        attempt: run.run_attempt ?? 1,
        status: run.status,
        conclusion: text(run.conclusion, 64) ? run.conclusion : null,
        startedAt: run.run_started_at || run.created_at || null,
        endedAt: run.status === "completed" ? run.updated_at || null : null,
        pullRequests: (run.pull_requests || []).map((pull) => pull.number),
      };
    });
  },
};
// Only what the receipt reader needs of an artifact list (§4.31).
const ARTIFACTS_PROJECTION = {
  version: "artifacts-v2",
  project(data) {
    if (!Array.isArray(data?.artifacts) || data.artifacts.length > 100)
      fail("GitHub returned invalid artifact data.", 502);
    return data.artifacts
      .filter(
        (a) => a && Number.isSafeInteger(a.id) && typeof a.name === "string",
      )
      .map((a) => ({
        id: a.id,
        name: a.name.slice(0, 200),
        expired: a.expired === true,
        created_at: typeof a.created_at === "string" ? a.created_at : null,
        workflow_run: {
          id: Number.isSafeInteger(a.workflow_run?.id)
            ? a.workflow_run.id
            : null,
          head_sha:
            typeof a.workflow_run?.head_sha === "string"
              ? a.workflow_run.head_sha
              : null,
        },
      }));
  },
};
const MAX_PAGES = 20;
// GitHub's built-in repository roles (github-policy.mjs PERMISSIONS).
const ROLES = new Set(["read", "triage", "write", "maintain", "admin"]);
// The highest role in a repository's `permissions` flags, or none.
const roleFromPermissions = (granted = {}) =>
  granted?.admin
    ? "admin"
    : granted?.maintain
      ? "maintain"
      : granted?.push
        ? "write"
        : granted?.triage
          ? "triage"
          : granted?.pull
            ? "read"
            : "none";

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
function closingOf(nodes, owner, repo) {
  return nodes
    .filter((node) => node?.number)
    .map((node) => ({
      repository: node.repository?.nameWithOwner ?? `${owner}/${repo}`,
      number: node.number,
      title: node.title ?? "",
      url: node.url ?? null,
    }));
}

// The cheap fields of an open pull request node.
function headOf(node) {
  return {
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
  };
}

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

// The repository (or owner) a call is for: `{repository, owner}`, from
// "owner/name", {owner, repo}, or an owner alone. None is this machine's
// built-in sign-in (a call about the person, such as GET /user).
export function targetOf(value) {
  if (!value) return { repository: null, owner: null };
  if (typeof value === "string")
    return value.includes("/")
      ? (({ id, owner }) => ({ repository: id, owner }))(parseRepository(value))
      : { repository: null, owner: value };
  if (value.owner && (value.repo || value.name))
    return {
      repository: `${value.owner}/${value.repo || value.name}`,
      owner: value.owner,
    };
  if (value.repository) return targetOf(value.repository);
  return { repository: null, owner: value.owner || null };
}
const ownerOf = (value) => targetOf(value).owner;

// The target of one request, read from its path, its search or its GraphQL
// variables. A token minted for one repository is only sent on its calls
// (PC5.6).
function targetOfRequest(pathname, { query, body } = {}) {
  const repo = /^\/repos\/([^/]+)\/([^/?]+)/.exec(pathname);
  if (repo) return targetOf({ owner: repo[1], repo: repo[2] });
  const org = /^\/(?:orgs|users)\/([^/?]+)/.exec(pathname);
  if (org) return { repository: null, owner: decodeURIComponent(org[1]) };
  const q = String(query?.q || body?.variables?.q || "");
  const searched = /\brepo:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/.exec(q);
  if (searched) return targetOf({ owner: searched[1], repo: searched[2] });
  const variables = body?.variables || {};
  if (variables.owner && (variables.repo || variables.name))
    return targetOf(variables);
  if (variables.owner || variables.login)
    return { repository: null, owner: variables.owner || variables.login };
  return { repository: null, owner: null };
}

// The client method a call came from, for the guard's errors.
const calls = new AsyncLocalStorage();
const currentCall = () => calls.getStore() || null;
const INTERNAL = new Set([
  "constructor",
  "bind",
  "authorize",
  "request",
  "send",
  "available",
  "signedIn",
  "gitRemote",
  "countGit",
  "rateLimit",
  "currentUser",
  "personLogin",
]);

// Files read in one GraphQL query.
export const BLOB_CHUNK = 100;

export class GitHubClient {
  constructor({
    credentials,
    apiUrl = process.env.GITHUB_API_URL || "https://api.github.com",
    fetch: fetchImpl = globalThis.fetch,
    timeoutMs = 30000,
    gitUrl = process.env.AVOOZL_GIT_URL,
  } = {}) {
    // Read guards forward this identity, so wrapped and direct readers share.
    this[SNAPSHOT_CLIENT] = {};
    this.apiUrl = apiUrl.replace(/\/$/, "");
    // Who signs each call in (github-credentials.mjs): a token per job and
    // repository, asked for per call and never kept on the client.
    this.credentials =
      credentials ||
      lazyCredentials({ apiUrl: this.apiUrl, gitUrl, fetch: fetchImpl });
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    // The newest x-ratelimit-* headers per resource (core, search, graphql),
    // and each token login's newest core numbers.
    this.rateLimits = new Map();
    this.loginLimits = new Map();
    this.cacheSeconds = () => DEFAULT_CACHE_SECONDS;
    // Where `git fetch` reaches repositories: github.com, or the host named
    // here. Another API host with no git host named reads over the API only.
    this.gitUrl = (
      gitUrl ||
      (this.apiUrl === "https://api.github.com" ? "https://github.com" : "")
    ).replace(/\/$/, "");
  }

  // The git URL of a repository, or null when git cannot be used.
  gitRemote(value) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.gitUrl ? `${this.gitUrl}/${owner}/${repo}.git` : null;
  }

  // A git call that reached the remote. It costs no API quota.
  countGit() {
    this.rate?.countGit();
  }

  // { limit, remaining, resetAt } from the newest response for `resource`,
  // or null before any.
  rateLimit(resource = "core") {
    return this.rateLimits.get(resource) ?? null;
  }

  // Keeps conditional-request answers and the rate state in `store`, so a
  // GET GitHub answers 304 costs nothing and a limit holds every process of
  // the workspace back. Without it the client behaves as before.
  bind(store, { now, cacheSeconds, countFile, writeLimits, sleep } = {}) {
    // How long an answer stays fresh, in seconds, for a repository id (or
    // none). Within it a read makes no call. Settings > GitHub sets it.
    if (cacheSeconds) this.cacheSeconds = cacheSeconds;
    this.cache = store ? new ResponseCache(store, { now }) : null;
    this.rate = store ? new RateState(store, { now, countFile }) : null;
    // Writes are paced (github-pacer.mjs); `writeLimits` reads the settings.
    this.pacer = store
      ? new WritePacer(store, {
          now,
          sleep,
          limits: writeLimits,
          // The core limit of the login that writes (PC9.1).
          primary: (login) => {
            const seen =
              (login !== undefined && this.loginLimits.get(login)) ||
              this.rateLimits.get("core");
            return seen
              ? {
                  limit: seen.limit,
                  remaining: seen.remaining,
                  resetAtMs: Date.parse(seen.resetAt),
                }
              : null;
          },
          // A write cut off mid-call may have landed: the next read must see.
          onInterrupted: () => this.cache?.invalidate(this.lastIdentity, ""),
        })
      : null;
    return this;
  }

  // True when a provider is chosen for the owner (plugin-credentials §D3):
  // false only when two plugins clash or a claiming plugin is unusable.
  available(value) {
    return this.credentials.available?.(ownerOf(value)) ?? true;
  }

  // True once a check-in token was obtained for the owner (or, with none,
  // this machine's built-in sign-in). A reader that must not go out
  // unauthenticated asks this.
  async signedIn(value) {
    try {
      const target = targetOf(value);
      await this.credentials.token({ ...target, job: "check-in" });
      return true;
    } catch {
      return false;
    }
  }

  // The job, the guard and the token for one call (§D6, §D7, §D8). The
  // guard runs in production too: a missing binding is a bug, not full
  // access.
  async authorize(method, pathname, options) {
    const job = currentJob(),
      call = currentCall() || `${method} ${pathname.split("?")[0]}`;
    if (!job) {
      const error = Error(`GitHub call ${call} runs outside any job.`);
      error.status = 500;
      throw error;
    }
    const entry = jobOf(job),
      needs =
        pathname === "/graphql"
          ? graphqlNeeds(options.body?.query)
          : restNeeds(method, pathname),
      missing = missingFrom(entry.permissions, needs);
    if (missing.length) {
      const error = Error(
        `GitHub call ${call} needs ${missing.join(", ")}, which job ${job} does not have.`,
      );
      error.status = 500;
      throw error;
    }
    const target = options.repository
      ? targetOf(options.repository)
      : targetOfRequest(pathname, options);
    if (entry.risk === "high") {
      const where = target.repository || target.owner;
      if (!useGrant(currentGrants(), job, where)) {
        const error = Error(
          `${entry.description} on ${where} is high risk: only a person can allow it, in the Avoozl page or the CLI.`,
        );
        error.status = 403;
        error.code = "person-only";
        throw error;
      }
    }
    if (!tokenTransportAllowed(this.apiUrl))
      fail(`Avoozl sends GitHub tokens over https only (${this.apiUrl}).`, 503);
    return { job, target };
  }

  // `etag` makes the read conditional: GitHub answers 304, which does not
  // count against the rate limit (checked live 2026-11-13), and this
  // returns { notModified: true }.
  async request(method, pathname, options = {}) {
    const { job, target } = await this.authorize(method, pathname, options);
    const write =
      method !== "GET" &&
      !(
        pathname === "/graphql" &&
        /^\s*(query\b|\{)/.test(options.body?.query || "")
      );
    // A 401 drops that token, asks once more and retries once (PC5.4).
    const attempt = async (retry) => {
      const auth = await this.credentials.token({ ...target, job });
      this.lastIdentity = auth;
      try {
        if (!write || !this.pacer)
          return await this.send(method, pathname, { ...options, auth });
        // Every write waits its turn: one at a time, inside the write pace.
        const held = this.rate?.held(resourceOf(pathname), auth.login);
        if (held) throw rateLimitError(held);
        return await this.pacer.run(
          { method, pathname, login: auth.login },
          () => this.send(method, pathname, { ...options, auth }),
        );
      } catch (error) {
        if (error.status !== 401 || !retry) throw error;
        this.credentials.drop?.(auth);
        return attempt(false);
      }
    };
    return attempt(true);
  }

  // The token's login (for a plugin, the reply's `login`, with no call:
  // GET /user fails for installation tokens). `value` names the repository
  // or owner whose provider is meant; without it, this machine's built-in.
  async currentUser(value) {
    const auth = await this.credentials.token({
      ...targetOf(value),
      job: currentJob() || "check-in",
    });
    if (!auth.login)
      fail("GitHub did not say who this token signs in as.", 503);
    return { login: auth.login };
  }

  // The person this machine signs in for (§D12): a plugin's `person`, or for
  // gh and env the token's own login. Null when a plugin names no person.
  async personLogin(value) {
    const auth = await this.credentials.token({
      ...targetOf(value),
      job: currentJob() || "check-in",
    });
    if (!auth.person) this.onNoPerson?.(auth.provider, targetOf(value).owner);
    return auth.person || null;
  }

  async send(
    method,
    pathname,
    {
      query,
      body,
      accept,
      headers,
      etag,
      responseProjection,
      uncached,
      auth,
    } = {},
  ) {
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
      // `uncached` skips the answer cache: the caller keys its own copy (a
      // detail kept by the item's updatedAt, github-items.mjs).
      key =
        readable && !etag && !uncached && this.cache
          ? this.cache.key(
              auth,
              responseProjection
                ? wanted + "|projection:" + responseProjection.version
                : wanted,
              url.href,
              method === "GET" ? "" : JSON.stringify(body),
            )
          : null,
      stored = key ? this.cache.get(key) : null,
      fresh = (this.cacheSeconds() || 0) * 1000,
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
    if (stored && fresh > 0 && this.cache.now() - stored.fetched < fresh) {
      this.rate?.cached();
      return reply(stored);
    }
    const held = this.rate?.held(resource, auth.login);
    if (held) {
      if (stored) {
        this.rate?.cached();
        return reply(stored);
      }
      throw rateLimitError(held);
    }
    let response;
    try {
      response = await this.fetch(url, {
        method,
        headers: {
          Accept: wanted,
          Authorization: "Bearer " + auth.token,
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
      if ((header("x-ratelimit-resource") || resource) === "core")
        this.loginLimits.set(auth.login, seen);
      this.rate?.observe(
        header("x-ratelimit-resource") || resource,
        {
          limit: seen.limit,
          remaining: seen.remaining,
          resetAtMs: Date.parse(seen.resetAt),
        },
        auth.login,
      );
    }
    this.rate?.count(response.status === 304, undefined, auth.login);
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
      if (limit && this.rate) this.rate.limit({ ...limit, login: auth.login });
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
    if (responseProjection && !reused) {
      try {
        value = responseProjection.project(value);
      } catch (error) {
        this.rate?.flush();
        throw error;
      }
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
          body: responseProjection ? JSON.stringify(value) : text,
          link,
          scopes,
        },
        { ttlOnly: method !== "GET" },
      );
    // A write makes what it touched stale (not gone: a 304 still revalidates).
    if (!readable && response.ok && this.cache)
      this.cache.invalidate(auth, repoId);
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
  //
  // GitHub shows that endpoint only to logins with push access. Refused
  // (403), the signed-in login's own role comes from the repository's
  // `permissions`, which any reader sees; another login's role is unknown
  // and reads as none, so a read-only login never grants anyone rights.
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
      async (error) => {
        if (error.status === 404)
          return { permission: "none", user: { login: actor } };
        if (error.status !== 403) throw error;
        const me = await this.currentUser({ owner, repo }).catch(() => null);
        if (
          me?.login &&
          String(me.login).toLowerCase() === String(actor).toLowerCase()
        ) {
          const granted = (await this.repository({ owner, repo }))?.permissions;
          return {
            permission: roleFromPermissions(granted),
            user: { login: actor },
            source: "repository",
          };
        }
        return { permission: "none", user: { login: actor }, unknown: true };
      },
    );
  }

  // The numbers of the issues updated at or after `since` (ISO), pull
  // requests left out. Pages of 100, newest first.
  async issuesUpdatedSince(value, since) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    const items = await this.paginate(`/repos/${owner}/${repo}/issues`, {
      query: { state: "all", since, sort: "updated", direction: "desc" },
    });
    return new Set(
      items.filter((item) => !item.pull_request).map((item) => item.number),
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

  // `nodes` ({ issueId, blockingIssueId }, GraphQL node IDs) sends the
  // addBlockedBy mutation; without it the REST call names the blocker by
  // database ID. Either is one content write.
  async addIssueBlocker(value, number, blockerIssueId, nodes) {
    if (nodes?.issueId && nodes.blockingIssueId) {
      await this.graphql(
        `mutation($input:AddBlockedByInput!){addBlockedBy(input:$input){issue{id}}}`,
        { input: nodes },
        "add a blocked-by link",
        { repository: value },
      );
      return { id: blockerIssueId };
    }
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

  // The labels named, as GitHub has them. A missing one fails with 409
  // `labels-missing` and is recorded for Needs you's Create labels.
  async existingLabels(value, names = []) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      found = [],
      missing = [];
    for (const name of names || [])
      try {
        found.push(
          await this.request(
            "GET",
            `/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`,
          ),
        );
      } catch (error) {
        if (error.status !== 404) throw error;
        missing.push(name);
      }
    if (missing.length) {
      this.onMissingLabels?.(`${owner}/${repo}`, missing);
      const error = Error(
        `${owner}/${repo} has no label ${missing.join(", ")}. Create it from Needs you (Create labels), then try again.`,
      );
      error.status = 409;
      error.code = "labels-missing";
      error.missingLabels = missing;
      throw error;
    }
    return found;
  }

  // One content write. With `parentIssueId` (the parent's node ID) the issue
  // is made under its parent in the same GraphQL mutation, so it needs no
  // addSubIssue call after; a `type` name goes in as its issueTypeId. With
  // neither, REST makes it the same way as before.
  async createIssue(value, input) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      { parentIssueId, ...rest } = input || {};
    // Creating a label is high risk (PC13.1): an issue names only labels
    // the repository has, and a missing one refuses the issue.
    const labels = await this.existingLabels({ owner, repo }, rest.labels);
    if (!parentIssueId && !rest.type)
      return this.request("POST", `/repos/${owner}/${repo}/issues`, {
        body: rest,
      });
    const typeId = rest.type
      ? (await this.listIssueTypes(owner)).find(
          (entry) => entry.name === rest.type,
        )?.node_id
      : null;
    if (rest.type && !typeId)
      fail(`${owner} has no ${rest.type} issue type.`, 409);
    const [repository, assignees] = await Promise.all([
        this.repository({ owner, repo }),
        Promise.all(
          (rest.assignees || []).map((login) =>
            this.request("GET", `/users/${encodeURIComponent(login)}`),
          ),
        ),
      ]),
      data = await this.graphql(
        `mutation($input:CreateIssueInput!){createIssue(input:$input){issue{id databaseId number url state title body labels(first:50){nodes{name}} assignees(first:20){nodes{login}} subIssuesSummary{total}}}}`,
        {
          input: {
            repositoryId: repository.node_id,
            title: rest.title,
            body: rest.body,
            ...(parentIssueId ? { parentIssueId } : {}),
            ...(typeId ? { issueTypeId: typeId } : {}),
            ...(labels.length
              ? { labelIds: labels.map((l) => l.node_id) }
              : {}),
            ...(assignees.length
              ? { assigneeIds: assignees.map((user) => user.node_id) }
              : {}),
          },
        },
        "create an issue",
        { repository: { owner, repo } },
      ),
      issue = data?.createIssue?.issue;
    if (!issue?.id || !issue.number)
      fail("GitHub returned invalid issue data.", 502);
    return {
      id: issue.databaseId,
      node_id: issue.id,
      number: issue.number,
      html_url: issue.url,
      state: String(issue.state).toLowerCase(),
      title: issue.title,
      body: issue.body,
      labels: issue.labels.nodes,
      assignees: issue.assignees.nodes,
      sub_issues_summary: { total: issue.subIssuesSummary?.total ?? 0 },
      ...(rest.type ? { type: { name: rest.type } } : {}),
    };
  }

  // Actions variables of one repository: [{name, value}]. The list answers
  // {total_count, variables}, not an array, so it is read as one page.
  async listRepoVariables(value) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      page = await this.request(
        "GET",
        `/repos/${owner}/${repo}/actions/variables`,
        { query: { per_page: PAGE_SIZE } },
      );
    return Array.isArray(page?.variables) ? page.variables : [];
  }

  // Creates or updates one Actions variable (what `gh variable set` does).
  async setRepoVariable(value, name, text) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    try {
      return await this.request(
        "POST",
        `/repos/${owner}/${repo}/actions/variables`,
        {
          body: { name, value: text },
        },
      );
    } catch (error) {
      if (error.status !== 409 && error.status !== 422) throw error;
      return this.request(
        "PATCH",
        `/repos/${owner}/${repo}/actions/variables/${name}`,
        { body: { name, value: text } },
      );
    }
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

  async graphql(
    query,
    variables,
    what,
    { uncached = false, repository = null } = {},
  ) {
    const result = await this.request("POST", "/graphql", {
      body: { query, variables },
      uncached,
      ...(repository ? { repository } : {}),
    });
    if (result?.errors?.length)
      fail(
        `GitHub could not ${what}: ` +
          result.errors.map((error) => error.message).join("; "),
        502,
      );
    return result?.data;
  }

  // One commit, with its parents.
  commit(value, sha) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}`,
    );
  }

  // Links a branch in `repositoryId` (may differ from the issue's repository)
  // to the issue, created at `oid` (F51, L13). Needs push access there;
  // `repository` names it for the token.
  async createLinkedBranch({ issueId, repositoryId, oid, name, repository }) {
    const data = await this.graphql(
        `mutation($input:CreateLinkedBranchInput!){createLinkedBranch(input:$input){linkedBranch{id ref{name repository{id nameWithOwner}}}}}`,
        { input: { issueId, repositoryId, oid, name } },
        "create a linked branch",
        { repository },
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

  // Every open pull request of a repository in one query (pages of 100, at
  // most 5): head, merge state, labels, the check rollup state and the
  // issues it closes, and for the CI waste counts (§4.30) its author, its
  // first 100 changed paths and the head commit's check run times. Each view reads this through the client's cache, so
  // ten pull requests cost one call, not ten.
  // shortcut: 500 open pull requests; a busier repository fails here and
  // pullRequestHeads falls back to one alias per branch.
  async openPullRequests(value) {
    return (await this.pullRequestSnapshot(value)).open;
  }

  // The 50 most recently updated closed pull requests, from the same query
  // as openPullRequests (no extra call): number, author, times, head and
  // the first 100 changed paths. The CI waste counts (§4.30) need them
  // because a pull request opened and merged between two checks is never
  // listed open, and a new workspace has seen none of its window.
  // shortcut: 50 per check; a repository closing more than 50 pull requests
  // between two checks misses the oldest, read a second page if that shows.
  async recentPullRequests(value) {
    return (await this.pullRequestSnapshot(value)).recent;
  }

  pullRequestSnapshot(value) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return sharedGitHubRead(
      this[SNAPSHOT_CLIENT],
      "pulls:" + (owner + "/" + repo).toLowerCase(),
      () => this.readOpenPullRequests({ owner, repo }),
    );
  }

  async readOpenPullRequests(value) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      pulls = [];
    let after = null,
      recent = [];
    for (let page = 0; page < 5; page += 1) {
      const data = await this.graphql(
          `query($owner:String!,$repo:String!,$after:String){repository(owner:$owner,name:$repo){${page ? "" : RECENT_PULLS}pullRequests(states:OPEN,first:100,after:$after,orderBy:{field:CREATED_AT,direction:DESC}){pageInfo{hasNextPage endCursor} nodes{number url createdAt updatedAt isDraft author{login} headRefName headRefOid baseRefName baseRef{target{oid}} mergeable mergeStateStatus reviewDecision autoMergeRequest{enabledAt} labels(first:20){nodes{name}} closingIssuesReferences(first:10){nodes{number title url repository{nameWithOwner}}} files(first:100){totalCount nodes{path}} commits(last:1){nodes{commit{statusCheckRollup{state contexts(first:100){nodes{... on CheckRun{name startedAt completedAt checkSuite{workflowRun{databaseId event file{path}}}}}}}}}}}}}}`,
          { owner, repo, after },
          "read open pull requests",
        ),
        list = data?.repository?.pullRequests;
      if (!Array.isArray(list?.nodes))
        fail("GitHub returned invalid pull-request data.", 502);
      pulls.push(...list.nodes.filter(Boolean));
      if (!page)
        recent = (data.repository.recent?.nodes || []).filter(
          (pull) => pull && Number.isSafeInteger(pull.number),
        );
      if (!list.pageInfo?.hasNextPage) return { open: pulls, recent };
      after = list.pageInfo.endCursor;
    }
    fail(
      "More than 500 open pull requests in " + owner + "/" + repo + ".",
      413,
    );
  }

  // The newest 100 workflow runs created since `since` (a date), one REST
  // read through the HTTP cache, so an unchanged list is a 304 (§4.30,
  // R100.6). Each run: id, workflow path, head commit, event, attempt,
  // times and the pull requests GitHub links it to.
  // shortcut: one page; a repository with more than 100 runs in the window
  // undercounts the oldest, read more pages if that shows up.
  async workflowRuns(value, since) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return sharedGitHubRead(
      this[SNAPSHOT_CLIENT],
      JSON.stringify([
        "workflow-runs",
        (owner + "/" + repo).toLowerCase(),
        since,
      ]),
      () =>
        this.request("GET", `/repos/${owner}/${repo}/actions/runs`, {
          query: { per_page: 100, created: `>=${since}` },
          responseProjection: WORKFLOW_RUNS_PROJECTION,
        }),
    );
  }

  // Pull request feedback, first read (task 15.1, R54.2): for each branch,
  // its open pull request's cheap fields. {branch: {number, url, updatedAt,
  // head, base, mergeable, autoMerge, ...} | null}. Read from the one
  // open-pull-request query; pullRequestFeedback reads the rest only for
  // changed ones.
  async pullRequestHeads(value, branches) {
    const list = [...branches];
    if (!list.length) return {};
    let pulls;
    try {
      pulls = await this.openPullRequests(value);
    } catch (error) {
      if (error.status !== 413) throw error;
      return this.pullRequestHeadsByBranch(value, list);
    }
    return Object.fromEntries(
      list.map((branch) => {
        const node = pulls
          .filter((pull) => pull.headRefName === branch)
          .sort((a, b) => b.number - a.number)[0];
        return [branch, node ? headOf(node) : null];
      }),
    );
  }

  async pullRequestHeadsByBranch(value, list) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      fields = list
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
        return [branch, node ? headOf(node) : null];
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

  // `repository` names the discussion's repository for the token.
  async addDiscussionComment(discussionId, body, repository = null) {
    const data = await this.graphql(
        `mutation($input:AddDiscussionCommentInput!){addDiscussionComment(input:$input){comment{id url}}}`,
        { input: { discussionId, body } },
        "comment on a discussion",
        { repository },
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
  // The public crew audit's reads (R85.6): issue and pull request comments,
  // issues and pull requests updated since `since`, the most recently
  // updated pull requests, and the branches under `prefix`.
  issueCommentsSince(value, since) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(`/repos/${owner}/${repo}/issues/comments`, {
      query: { since, sort: "updated", direction: "asc" },
    });
  }

  issuesSince(value, since) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(`/repos/${owner}/${repo}/issues`, {
      query: { state: "all", since, sort: "updated", direction: "asc" },
    });
  }

  // shortcut: one page of 100; enough at one read a minute.
  recentlyUpdatedPullRequests(value) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request("GET", `/repos/${owner}/${repo}/pulls`, {
      query: {
        state: "all",
        sort: "updated",
        direction: "desc",
        per_page: PAGE_SIZE,
      },
    });
  }

  branchesUnder(value, prefix) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(
      `/repos/${owner}/${repo}/git/matching-refs/heads/${prefix.split("/").map(encodeURIComponent).join("/")}`,
    );
  }

  // Deletes, so no edit history is left (R85.7). A 404 is already gone.
  deleteIssueComment(value, commentId) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "DELETE",
      `/repos/${owner}/${repo}/issues/comments/${commentId}`,
    ).catch((error) => {
      if (error.status !== 404) throw error;
      return null;
    });
  }

  deleteBranch(value, name) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "DELETE",
      `/repos/${owner}/${repo}/git/refs/heads/${name.split("/").map(encodeURIComponent).join("/")}`,
    ).catch((error) => {
      if (error.status !== 404 && error.status !== 422) throw error;
      return null;
    });
  }

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

  // A file (base64 `content`) or a folder (an array) at `ref`.
  contents(value, pathname, ref) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/contents/${pathname.split("/").map(encodeURIComponent).join("/")}`,
      { query: { ref } },
    );
  }

  // Every file in one commit on `branch` (GraphQL createCommitOnBranch).
  // `files` maps path -> base64 contents. GitHub refuses the commit when the
  // branch head is no longer `expectedHeadOid`. Returns the new commit oid.
  async commitFiles(value, { branch, message, files, expectedHeadOid }) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    const data = await this.graphql(
      `mutation($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{oid}}}`,
      {
        input: {
          branch: {
            repositoryNameWithOwner: `${owner}/${repo}`,
            branchName: branch,
          },
          message: { headline: message },
          expectedHeadOid,
          fileChanges: {
            additions: Object.entries(files).map(([path, contents]) => ({
              path,
              contents,
            })),
          },
        },
      },
      "commit files",
      { repository: { owner, repo } },
    );
    return data?.createCommitOnBranch?.commit?.oid ?? null;
  }

  // GitHub refuses an update to an existing file unless the request names the
  // file's current blob `sha`, so read it first; a 404 means a new file.
  async putFile(value, { path, branch, message, content }) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    let sha;
    try {
      sha = (await this.contents({ owner, repo }, path, branch))?.sha;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    return this.request(
      "PUT",
      `/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
      { body: { message, content, branch, ...(sha ? { sha } : {}) } },
    );
  }

  pullRequest(value, number) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request("GET", `/repos/${owner}/${repo}/pulls/${number}`);
  }

  // Merges one pull request only while its head is still `sha`: GitHub
  // refuses (409) when the head moved, so a landing never takes a commit
  // nobody checked (R102.13). No admin bypass.
  // `title` and `message`, when given, are the merge or squash commit's
  // (landing trailers, landing-trailers.mjs).
  mergePullRequest(value, number, { sha, method = "merge", title, message }) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    if (!/^[0-9a-f]{40}$/.test(sha ?? ""))
      fail("A guarded merge needs the exact head commit.", 400);
    return this.request(
      "PUT",
      `/repos/${owner}/${repo}/pulls/${number}/merge`,
      {
        body: {
          sha,
          merge_method: method,
          ...(title ? { commit_title: title } : {}),
          ...(message ? { commit_message: message } : {}),
        },
      },
    );
  }

  // One page of 100 artifacts, newest first, or those called `name`, each
  // with the run and commit that made it. One REST read through the HTTP
  // cache, so an unchanged page is a 304 (§4.31, R101.5).
  async listArtifacts(value, name, { page = 1 } = {}) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      list = await this.request(
        "GET",
        `/repos/${owner}/${repo}/actions/artifacts`,
        {
          query: { name, per_page: 100, ...(page > 1 ? { page } : {}) },
          responseProjection: ARTIFACTS_PROJECTION,
        },
      );
    return Array.isArray(list) ? list : [];
  }

  // One artifact's zip. GitHub answers with a redirect to a signed address;
  // that address takes no token, so the token is not sent to it.
  async downloadArtifact(value, id) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    const pathname = `/repos/${owner}/${repo}/actions/artifacts/${Number(id)}/zip`,
      { job, target } = await this.authorize("GET", pathname, {}),
      auth = await this.credentials.token({ ...target, job }),
      url = this.apiUrl + pathname;
    let location;
    try {
      const response = await this.fetch(url, {
        redirect: "manual",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer " + auth.token,
          "X-GitHub-Api-Version": API_VERSION,
          "User-Agent": "avoozl",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      this.rate?.count(false, undefined, auth.login);
      this.rate?.flush();
      location = response.headers?.get?.("location");
      if (!location) fail(`GitHub gave no download for artifact ${id}.`, 502);
      const file = await this.fetch(location, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!file.ok) fail(`The artifact download failed (${file.status}).`, 502);
      return Buffer.from(await file.arrayBuffer());
    } catch (error) {
      if (error.status) throw error;
      fail("GitHub is unreachable: " + error.message, 503);
    }
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

  // The repository's own rulesets, each read whole (the list omits rules).
  async rulesets(value) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      list = await this.paginate(`/repos/${owner}/${repo}/rulesets`, {
        query: { includes_parents: false },
      });
    return Promise.all(
      list.map((item) =>
        this.request("GET", `/repos/${owner}/${repo}/rulesets/${item.id}`),
      ),
    );
  }

  // Starts a `workflow_dispatch` run of `workflow` (a file name or ID) on
  // `ref` with string `inputs`. GitHub answers 204 with no run ID: find the
  // run with workflowRuns by its head commit and event.
  dispatchWorkflow(value, workflow, ref, inputs = {}) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "POST",
      `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      { body: { ref, inputs } },
    );
  }

  createRuleset(value, body) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request("POST", `/repos/${owner}/${repo}/rulesets`, { body });
  }

  updateRuleset(value, id, body) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "PUT",
      `/repos/${owner}/${repo}/rulesets/${Number(id)}`,
      { body },
    );
  }

  updateRepository(value, body) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request("PATCH", `/repos/${owner}/${repo}`, { body });
  }

  // A branch as anyone who can read the repository sees it: `protected`,
  // and a `protection` summary with classic required status checks.
  // Every entry of a commit's tree: { path, type, sha }. One call. A tree too
  // large for GitHub to list whole is refused rather than read short.
  async treeEntries(value, ref) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      tree = await this.request(
        "GET",
        `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}`,
        { query: { recursive: 1 } },
      );
    if (tree?.truncated)
      fail("GitHub listed only part of this repository's tree.", 502);
    return tree?.tree ?? [];
  }

  // Text of the files at `ref`, as Map(path -> text, or null when the file is
  // missing, binary or too large). One GraphQL query per BLOB_CHUNK files,
  // each file one aliased `object(expression:)`.
  async blobTexts(value, ref, paths) {
    const { owner, repo } =
        typeof value === "string" ? parseRepository(value) : value,
      texts = new Map();
    for (let at = 0; at < paths.length; at += BLOB_CHUNK) {
      const chunk = paths.slice(at, at + BLOB_CHUNK),
        variables = { owner, repo };
      chunk.forEach((file, i) => (variables[`e${i}`] = `${ref}:${file}`));
      const data = await this.graphql(
        `query($owner:String!,$repo:String!${chunk.map((_, i) => `,$e${i}:String!`).join("")}){repository(owner:$owner,name:$repo){${chunk
          .map(
            (_, i) =>
              `f${i}:object(expression:$e${i}){...on Blob{isBinary text}}`,
          )
          .join(" ")}}}`,
        variables,
        "read files",
      );
      chunk.forEach((file, i) => {
        const blob = data?.repository?.[`f${i}`];
        texts.set(file, blob && !blob.isBinary ? (blob.text ?? null) : null);
      });
    }
    return texts;
  }

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
  // The commits of a pull request, oldest first (the first 250).
  pullRequestCommits(value, number) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(`/repos/${owner}/${repo}/pulls/${number}/commits`);
  }

  pullRequestReviews(value, number) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(`/repos/${owner}/${repo}/pulls/${number}/reviews`);
  }

  // A submitted review (triage-agent TA4.3, TA8.5): `event` COMMENT for the
  // triage agent's review; APPROVE and REQUEST_CHANGES only for a person's
  // press on the Pull requests page (the operation refuses anyone else).
  submitReview(value, number, { event, commit_id, body, comments = [] }) {
    if (!["COMMENT", "APPROVE", "REQUEST_CHANGES"].includes(event))
      fail("A review event is COMMENT, APPROVE or REQUEST_CHANGES.");
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "POST",
      `/repos/${owner}/${repo}/pulls/${number}/reviews`,
      {
        body: {
          event,
          body,
          ...(commit_id ? { commit_id } : {}),
          ...(comments.length ? { comments } : {}),
        },
      },
    );
  }

  // The issues a pull request closes: [{repository, number, title, url}].
  async pullRequestClosingIssues(value, number) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    // An open pull request is already in the one open-pull-request read.
    const open = (
      await this.openPullRequests({ owner, repo }).catch(() => [])
    ).find((pull) => pull.number === Number(number));
    if (open?.closingIssuesReferences?.nodes?.length < 10)
      return closingOf(open.closingIssuesReferences.nodes, owner, repo);
    const data = await this.graphql(
      `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){closingIssuesReferences(first:10){nodes{number title url repository{nameWithOwner}}}}}}`,
      { owner, repo, number: Number(number) },
      "read closing issues",
    );
    return closingOf(
      data?.repository?.pullRequest?.closingIssuesReferences?.nodes ?? [],
      owner,
      repo,
    );
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

// Each public method names itself for the guard (the outermost one wins).
for (const name of Object.getOwnPropertyNames(GitHubClient.prototype)) {
  const method = GitHubClient.prototype[name];
  if (INTERNAL.has(name) || typeof method !== "function") continue;
  GitHubClient.prototype[name] = function (...args) {
    return currentCall()
      ? method.apply(this, args)
      : calls.run(name, () => method.apply(this, args));
  };
}

// The person this machine signs in for, on `value`'s owner (§D12): a
// plugin's `person`, or the login of gh or env. Null when a plugin names no
// person. Clients without personLogin (fakes) answer with currentUser.
export async function personOf(github, value) {
  if (typeof github?.personLogin === "function")
    return github.personLogin(value);
  return (await github?.currentUser?.())?.login ?? null;
}

export function defaultGitHubClient({ credentials } = {}) {
  return new GitHubClient({ credentials });
}

// This machine's providers, loaded on the first token call: the module
// reads plugins, which import much of Avoozl.
function lazyCredentials(options) {
  let loaded = null;
  const load = () =>
    (loaded ??= import("./github-credentials.mjs").then((module) =>
      module.machineCredentials(options),
    ));
  return {
    available: () => true,
    token: async (input) => (await load()).token(input),
    drop: async (entry) => (await load()).drop(entry),
    signIns: async () => (await load()).signIns(),
    on: async (event, fn) => (await load()).on(event, fn),
    close: async () => loaded && (await loaded).close(),
  };
}
