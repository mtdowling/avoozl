import { defaultJob, fixedCredentials } from "./github-credentials.ts";
// A fake GitHub behind the real GitHubClient: the client's `fetch` is
// answered here, so its pacer, conditional requests and rate handling run
// as they do live. Every call is counted by kind (REST, conditional 304,
// GraphQL, write). Every value is fake; nothing reaches the network.
import { createHash } from "node:crypto";
import { GitHubClient } from "../github/github.ts";
import { found } from "./view-shapes.ts";

// An issue or pull request as GitHub's REST API returns it, for the fields
// this fake keeps. A label or assignee may be a bare name.
export interface ApiItem {
  number: number;
  title: string;
  body: string;
  state: string;
  user: { login: string };
  author_association: string;
  labels: (string | { name: string })[];
  assignees: (string | { login: string })[];
  comments: number;
  created_at: string;
  updated_at: string;
  html_url: string;
  pull_request?: { url: string };
  head?: string;
  branch?: string;
  changedFiles?: number;
  additions?: number;
  deletions?: number;
  merged?: boolean;
  checks?: string[];
  [key: string]: unknown;
}
interface ApiComment {
  id: number;
  number: number;
  body: string;
  login: string;
  at?: string;
  association?: string;
}
// A write's JSON body, for the fields this fake reads.
interface WriteBody {
  body?: string;
  labels?: string[];
  assignees?: string[];
  event?: string;
  comments?: unknown[];
  [key: string]: unknown;
}
type Kind = "rest" | "notModified" | "graphql" | "writes";
const nameOf = (label: string | { name: string }) =>
  typeof label === "string" ? label : label.name;

const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(value === null ? "" : JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

// Headers the client sent as a plain object; any other form reads as none.
function plainHeaders(
  headers: RequestInit["headers"],
): Record<string, string | readonly string[]> {
  return headers && !(headers instanceof Headers) && !Array.isArray(headers)
    ? headers
    : {};
}

export class FakeGitHubApi {
  repository: string;
  remaining: number;
  items: Map<number, ApiItem>;
  comments: ApiComment[];
  reviews: Record<string, unknown>[];
  files: Map<number, { filename: string }[]>;
  permissions: Map<string, string>;
  repoLabels: string[];
  writes: Record<string, unknown>[];
  calls: Record<Kind, number>;
  log: { method: string; path: string; kind: Kind }[];
  clock: number;
  constructor({ repository = "o/app", remaining = 4000 } = {}) {
    this.repository = repository;
    this.remaining = remaining;
    this.items = new Map();
    this.comments = [];
    this.reviews = [];
    this.files = new Map();
    this.permissions = new Map();
    this.repoLabels = ["bug", "question", "enhancement"];
    this.writes = [];
    this.calls = { rest: 0, notModified: 0, graphql: 0, writes: 0 };
    this.log = [];
    this.clock = Date.now();
  }

  reset() {
    this.calls = { rest: 0, notModified: 0, graphql: 0, writes: 0 };
    this.log = [];
    this.writes = [];
  }

  tick(seconds = 1) {
    this.clock += seconds * 1000;
    return new Date(this.clock).toISOString();
  }

  // An issue or pull request; `pr` makes it a pull request.
  add(number: number, extra: Record<string, unknown> = {}) {
    const at = this.tick();
    const item: ApiItem = {
      number,
      title: `Item ${number}`,
      body: `Body of ${number}.`,
      state: "open",
      user: { login: "reporter" },
      author_association: "NONE",
      labels: [],
      assignees: [],
      comments: 0,
      created_at: at,
      updated_at: at,
      html_url: `https://github.example/${this.repository}/issues/${number}`,
      ...extra,
    };
    if (extra.pr) {
      item.pull_request = { url: "x" };
      item.head =
        typeof extra.head === "string" ? extra.head : `head-${number}`;
      item.changedFiles =
        typeof extra.changedFiles === "number" ? extra.changedFiles : 1;
      item.additions =
        typeof extra.additions === "number" ? extra.additions : 10;
      item.deletions =
        typeof extra.deletions === "number" ? extra.deletions : 2;
    }
    delete item.pr;
    this.items.set(number, item);
    return item;
  }

  edit(number: number, change: Partial<ApiItem>) {
    Object.assign(found(this.items.get(number)), change, {
      updated_at: this.tick(),
    });
  }

  client({
    job = "check-in",
    ...options
  }: {
    job?: string;
    timeoutMs?: number;
  } = {}) {
    return defaultJob(
      job,
      new GitHubClient({
        credentials: fixedCredentials("test-token"),
        apiUrl: "https://api.example.test",
        fetch: (url, init) => this.fetch(new URL(String(url)), init),
        ...options,
      }),
    );
  }

  headers() {
    return {
      "x-ratelimit-limit": "5000",
      "x-ratelimit-remaining": String(this.remaining),
      "x-ratelimit-reset": String(Math.floor(this.clock / 1000) + 3600),
      "x-ratelimit-resource": "core",
    };
  }

  async fetch(url: URL, init: RequestInit = {}) {
    const method = init.method || "GET",
      body = typeof init.body === "string" ? JSON.parse(init.body) : null,
      graph = url.pathname === "/graphql",
      kind: Kind =
        method === "GET"
          ? "rest"
          : graph && /^\s*(query\b|\{)/.test(body?.query || "")
            ? "graphql"
            : "writes";
    this.calls[kind] += 1;
    this.log.push({ method, path: url.pathname, kind });
    const answer = graph
      ? this.graphql(body)
      : method === "GET"
        ? this.get(url, plainHeaders(init.headers))
        : this.write(method, url, body);
    if (answer.status === 304) this.calls.notModified += 1;
    for (const [key, value] of Object.entries(this.headers()))
      answer.headers.set(key, value);
    return answer;
  }

  // ---- REST reads ----------------------------------------------------------

  get(url: URL, headers: Record<string, string | readonly string[]>) {
    const parts = url.pathname.split("/").filter(Boolean),
      [, , , section, number, sub] = parts;
    if (section === "issues" && !number) return this.list(url, headers);
    if (section === "issues" && number && !sub) {
      const item = this.items.get(Number(number));
      return item
        ? json({ ...item, node_id: `issue-${item.number}`, id: item.number })
        : json({ message: "Not Found" }, 404);
    }
    if (section === "issues" && sub === "comments")
      return json(
        this.comments
          .filter((comment) => comment.number === Number(number))
          .map((comment) => ({
            id: comment.id,
            body: comment.body,
            user: { login: comment.login },
          })),
      );
    if (section === "pulls" && sub === "files")
      return json(this.files.get(Number(number)) ?? []);
    if (section === "collaborators") {
      const login = decodeURIComponent(parts[4]),
        permission = this.permissions.get(login);
      return permission
        ? json({ permission, role_name: permission, user: { login } })
        : json({ message: "Not Found" }, 404);
    }
    if (section === "labels")
      return json(this.repoLabels.map((name) => ({ name })));
    if (url.pathname === "/user") return json({ login: "owner" });
    // The CI read (github.mjs workflowRuns): the fake runs no workflow.
    if (section === "actions" && number === "runs")
      return json({ total_count: 0, workflow_runs: [] });
    return json({ message: "Not Found" }, 404);
  }

  list(url: URL, headers: Record<string, string | readonly string[]>) {
    const state = url.searchParams.get("state") || "open",
      since = url.searchParams.get("since"),
      perPage = Number(url.searchParams.get("per_page") || 30),
      page = Number(url.searchParams.get("page") || 1);
    const all = [...this.items.values()]
      .filter((item) => state === "all" || item.state === state)
      .filter((item) => !since || item.updated_at >= since)
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    const slice = all.slice((page - 1) * perPage, page * perPage),
      text = JSON.stringify(slice),
      etag = `"${createHash("sha1").update(text).digest("hex")}"`;
    if (headers["If-None-Match"] === etag)
      return new Response(null, { status: 304, headers: { etag } });
    const next = new URL(url);
    next.searchParams.set("page", String(page + 1));
    return new Response(text, {
      status: 200,
      headers: {
        "content-type": "application/json",
        etag,
        ...(page * perPage < all.length
          ? { link: `<${next.href}>; rel="next"` }
          : {}),
      },
    });
  }

  // ---- GraphQL ---------------------------------------------------------------

  checks(item: ApiItem) {
    return {
      nodes: [
        {
          commit: {
            oid: item.head,
            statusCheckRollup: {
              contexts: {
                nodes: (item.checks ?? []).map((conclusion) => ({
                  __typename: "CheckRun",
                  status: "COMPLETED",
                  conclusion,
                })),
              },
            },
          },
        },
      ],
    };
  }

  node(item: ApiItem) {
    const pull = Boolean(item.pull_request);
    return {
      __typename: pull ? "PullRequest" : "Issue",
      number: item.number,
      title: item.title,
      body: item.body,
      url: item.html_url,
      state: item.state.toUpperCase(),
      merged: item.merged === true,
      isDraft: false,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      authorAssociation: item.author_association,
      author: { login: item.user.login },
      labels: {
        nodes: item.labels.map((label) => ({ name: nameOf(label) })),
      },
      assignees: {
        nodes: item.assignees.map((user) => ({
          login: typeof user === "string" ? user : user.login,
        })),
      },
      timelineItems: {
        nodes: this.comments
          .filter((comment) => comment.number === item.number)
          .map((comment) => ({
            __typename: "IssueComment",
            id: String(comment.id),
            body: comment.body,
            createdAt: comment.at,
            authorAssociation: comment.association ?? "NONE",
            author: { login: comment.login },
          })),
      },
      ...(pull
        ? {
            baseRefName: "main",
            headRefName: item.branch ?? `branch-${item.number}`,
            headRefOid: item.head,
            changedFiles: item.changedFiles,
            additions: item.additions,
            deletions: item.deletions,
            reviewDecision: null,
            reviewRequests: { nodes: [] },
            latestReviews: { nodes: [] },
            files: {
              nodes: (this.files.get(item.number) ?? []).map((file) => ({
                path: file.filename,
              })),
            },
            commits: this.checks(item),
          }
        : {}),
    };
  }

  graphql({
    query,
    variables,
  }: {
    query: string;
    variables: { number?: number };
  }) {
    if (/issueOrPullRequest/.test(query)) {
      const item = this.items.get(Number(variables.number));
      return json({
        data: {
          repository: { issueOrPullRequest: item ? this.node(item) : null },
        },
      });
    }
    const aliases = [
      ...query.matchAll(/p(\d+): pullRequest\(number: (\d+)\)/g),
    ];
    if (aliases.length) {
      const repository: Record<string, unknown> = {};
      for (const [, alias, number] of aliases) {
        const item = this.items.get(Number(number));
        repository[`p${alias}`] = item
          ? {
              number: item.number,
              updatedAt: item.updated_at,
              changedFiles: item.changedFiles,
              additions: item.additions,
              deletions: item.deletions,
              isDraft: false,
              reviewDecision: null,
              headRefOid: item.head,
              headRefName: item.branch ?? `branch-${item.number}`,
              commits: this.checks(item),
            }
          : null;
      }
      return json({ data: { repository } });
    }
    // The open pull requests read (github.mjs readOpenPullRequests): one
    // page of the fake's open pull requests, and none merged or closed.
    if (/pullRequests\(states:OPEN/.test(query)) {
      const nodes = [...this.items.values()]
        .filter((item) => item.pull_request && item.state === "open")
        .map((item) => ({
          number: item.number,
          url: item.html_url,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          isDraft: false,
          author: { login: item.user.login },
          headRefName: item.branch ?? `branch-${item.number}`,
          headRefOid: item.head,
          baseRefName: "main",
          baseRef: null,
          mergeable: "UNKNOWN",
          mergeStateStatus: "UNKNOWN",
          reviewDecision: null,
          autoMergeRequest: null,
          labels: {
            nodes: item.labels.map((label) => ({ name: nameOf(label) })),
          },
          closingIssuesReferences: { nodes: [] },
          files: { totalCount: item.changedFiles, nodes: [] },
          commits: this.checks(item),
        }));
      return json({
        data: {
          repository: {
            ...(/recent:pullRequests/.test(query)
              ? { recent: { nodes: [] } }
              : {}),
            pullRequests: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes,
            },
          },
        },
      });
    }
    return json({ data: null, errors: [{ message: "unknown query" }] });
  }

  // ---- Writes ------------------------------------------------------------------

  write(method: string, url: URL, body: WriteBody) {
    const parts = url.pathname.split("/").filter(Boolean),
      [, , , section, number, sub, extra] = parts,
      item = this.items.get(Number(number));
    // A write to an item the test never added is the test's own mistake.
    const target = () => found(item, `item ${number}`);
    const record = (entry: Record<string, unknown>) => {
      this.writes.push(entry);
      if (item) item.updated_at = this.tick();
    };
    if (section === "issues" && sub === "comments" && method === "POST") {
      const comment = {
        id: this.comments.length + 1,
        number: Number(number),
        body: String(body.body),
        login: "owner",
        at: this.tick(),
        association: "OWNER",
      };
      this.comments.push(comment);
      record({ kind: "comment", number: Number(number), body: body.body });
      return json(
        {
          id: comment.id,
          body: body.body,
          html_url: "https://github.example/c",
        },
        201,
      );
    }
    if (section === "issues" && sub === "labels" && method === "POST") {
      const labeled = target(),
        names = new Set(labeled.labels.map(nameOf));
      for (const name of body.labels ?? []) names.add(name);
      labeled.labels = [...names].map((name) => ({ name }));
      record({ kind: "labels", number: Number(number), labels: body.labels });
      return json(labeled.labels);
    }
    if (section === "issues" && sub === "labels" && method === "DELETE") {
      const name = decodeURIComponent(extra),
        unlabeled = target();
      unlabeled.labels = unlabeled.labels.filter(
        (label) => nameOf(label) !== name,
      );
      record({ kind: "unlabel", number: Number(number), label: name });
      return json([]);
    }
    if (section === "issues" && sub === "assignees" && method === "POST") {
      const assigned = target();
      assigned.assignees = (body.assignees ?? []).map((login) => ({ login }));
      record({
        kind: "assign",
        number: Number(number),
        assignees: body.assignees,
      });
      return json(assigned);
    }
    if (section === "issues" && !sub && method === "PATCH") {
      const updated = Object.assign(target(), body);
      record({ kind: "update", number: Number(number), ...body });
      return json(updated);
    }
    if (section === "pulls" && sub === "reviews" && method === "POST") {
      const review = {
        id: this.reviews.length + 1,
        number: Number(number),
        ...body,
      };
      this.reviews.push(review);
      record({
        kind: "review",
        number: Number(number),
        event: body.event ?? null,
        body: body.body,
        comments: body.comments ?? [],
      });
      return json({ id: review.id, state: body.event ?? "PENDING" });
    }
    record({ kind: "other", method, path: url.pathname });
    return json({});
  }
}
