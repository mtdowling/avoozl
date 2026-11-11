import { execFileSync } from "node:child_process";
import { fail } from "./store.mjs";

const API_VERSION = "2022-11-28";
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export function parseRepository(value) {
  const match = String(value || "")
    .trim()
    .match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) fail("Use a GitHub repository in owner/name form.");
  return { id: `${match[1]}/${match[2]}`, owner: match[1], repo: match[2] };
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
  }

  available() {
    return Boolean(this.token) || this.discoverToken;
  }

  async request(method, pathname, { query, body, accept } = {}) {
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
    let response;
    try {
      response = await this.fetch(url, {
        method,
        headers: {
          Accept: accept || "application/vnd.github+json",
          Authorization: "Bearer " + this.token,
          "X-GitHub-Api-Version": API_VERSION,
          "User-Agent": "avoozl",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      fail("GitHub is unreachable: " + error.message, 503);
    }
    const text = await response.text();
    const value = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = Error(
        value?.message || `GitHub request failed with ${response.status}.`,
      );
      error.status = response.status;
      error.details = value;
      throw error;
    }
    return value;
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

  permission(value, actor) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/collaborators/${encodeURIComponent(actor)}/permission`,
    ).catch((error) => {
      if (error.status === 404)
        return { permission: "none", user: { login: actor } };
      throw error;
    });
  }

  listReadyIssues(value, { label = "avoozl:ready", assignee } = {}) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.paginate(`/repos/${owner}/${repo}/issues`, {
      query: {
        state: "open",
        labels: label,
        assignee,
        sort: "updated",
        direction: "asc",
      },
    }).then((items) => items.filter((item) => !item.pull_request));
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

  createPullRequest(value, input) {
    const { owner, repo } =
      typeof value === "string" ? parseRepository(value) : value;
    return this.request("POST", `/repos/${owner}/${repo}/pulls`, {
      body: input,
    });
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
