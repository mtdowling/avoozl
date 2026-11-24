// The GitHub jobs (plugin-credentials §D6, §D7): every GitHub call runs
// inside one named job, and a token is asked for that job's permission set
// only. A job is bound where work starts (an operation entry, a tick step,
// a queue runner), in an AsyncLocalStorage like call sources
// (github-rate.mjs). A high-risk job runs only with a person's grant.
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

const r = "read",
  w = "write";

// A permission set: GitHub's permission names to read, write or admin.
export type Permissions = Record<string, string>;
// One GitHub job.
export interface Job {
  description: string;
  risk: string;
  permissions: Permissions;
}
// A person's Allow for one high-risk step.
export interface Grant {
  id: string;
  job: string;
  target: string;
  permissionsHash: string;
  at: number;
  used: boolean;
  usedFor?: unknown;
}
// One high-risk step a person confirms.
interface Step {
  job: string;
  target: string;
  permissionsHash?: string;
  action?: string;
  [key: string]: unknown;
}

// Permission names checked on 2026-11-19 against GitHub's "Create an
// installation access token for an app" and "Permissions required for
// GitHub Apps" pages: organization_projects (read, write, admin) and
// variables (read, write) are token permissions as named here.
// Changes from the design's table: check-in also reads checks and
// statuses (every pull request read carries its check rollup), ci-receipts
// also reads pull requests and contents (CI is counted per pull request
// and per workflow file), and
// spec-issues also reads contents and pull_requests (spec issues are made
// from the spec files and name their pull requests), and land writes
// statuses (the avoozl/verify status on each head it verified, a write
// PC13.1 does not count as high risk). board-sync and comment-delete have
// no row: no code calls the Projects methods or deletes a comment.
const repo = (permissions: Permissions): Permissions => ({
  metadata: r,
  ...permissions,
});
export const JOBS: Readonly<Record<string, Job>> = Object.freeze({
  "check-in": {
    description: "Read issues, pull requests, files and checks",
    risk: "low",
    permissions: repo({
      contents: r,
      issues: r,
      pull_requests: r,
      checks: r,
      statuses: r,
    }),
  },
  "ci-receipts": {
    description: "Read CI runs, checks and their receipts",
    risk: "low",
    permissions: repo({
      actions: r,
      checks: r,
      statuses: r,
      contents: r,
      pull_requests: r,
    }),
  },
  "rules-read": {
    description: "Read branch rules and repository settings",
    risk: "low",
    permissions: repo({ administration: r, contents: r, variables: r }),
  },
  land: {
    description: "Land approved work",
    risk: "low",
    permissions: repo({
      contents: w,
      pull_requests: w,
      issues: r,
      checks: r,
      statuses: w,
    }),
  },
  "land-workflows": {
    description: "Land approved work that changes .github/workflows",
    risk: "low",
    permissions: repo({
      contents: w,
      pull_requests: w,
      issues: r,
      checks: r,
      statuses: w,
      workflows: w,
    }),
  },
  "spec-branch": {
    description: "Push spec branches and their pull requests",
    risk: "low",
    permissions: repo({ contents: w, pull_requests: w, issues: w }),
  },
  "spec-issues": {
    description: "Publish spec and task issues, claims and assignees",
    risk: "low",
    permissions: repo({ issues: w, contents: r, pull_requests: r }),
  },
  "review-output": {
    description: "Post review output on a pull request or spec issue",
    risk: "low",
    permissions: repo({ pull_requests: r, issues: w, contents: r }),
  },
  respond: {
    description: "Answer discussions and issues",
    risk: "low",
    permissions: repo({ discussions: w, issues: w }),
  },
  integration: {
    description: "Move an epic's integration branch",
    risk: "low",
    permissions: repo({ contents: w, checks: r, statuses: r }),
  },
  "worker-grants": {
    description: "Open and checkpoint worker branches",
    risk: "low",
    permissions: repo({ contents: w, issues: w }),
  },
  "workspace-publish": {
    description: "Publish a workspace repository",
    risk: "low",
    permissions: repo({ contents: w, pull_requests: w }),
  },
  // Deleting a claim branch frees a task another runner holds, so only a person does it, after the confirm.
  "claim-delete": {
    description: "Delete a stale claim branch",
    risk: "high",
    permissions: repo({ contents: w }),
  },
});

const LEVEL: Record<string, number> = { read: 1, write: 2, admin: 3 };

export function jobOf(name: string): Job {
  const job = Object.hasOwn(JOBS, name) ? JOBS[name] : undefined;
  if (!job)
    throw Object.assign(Error(`${name} is not a GitHub job.`), { status: 500 });
  return job;
}

// `{metadata: "read", ...}` as one stable text, for cache keys and hashes.
export const permissionText = (permissions: Permissions) =>
  Object.entries(permissions)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, level]) => `${name}: ${level}`)
    .join(", ");

// ---- Binding a job ------------------------------------------------------

const scope = new AsyncLocalStorage<{
  job: string | null;
  grants: Grant[];
}>();

// Runs `fn` as `job`. `grants` are a person's Allows for high-risk steps
// (D7); an inner job keeps the outer scope's grants, which each name the one
// job and target they serve.
export function withJob<T>(
  job: string | null,
  fn: () => T,
  grants: Grant[] = currentGrants(),
): T {
  if (job !== null) jobOf(job);
  return scope.run({ job, grants }, fn);
}
export const currentJob = () => scope.getStore()?.job ?? null;
export const currentGrants = (): Grant[] => scope.getStore()?.grants ?? [];

// `github` whose every method runs as `job`: a write site names its job
// (a step that does two jobs runs the second in its own, §D6).
export function asJob<T extends object>(job: string, github: T): T {
  jobOf(job);
  // A client made from this one with Object.create keeps its own methods:
  // calls run with the object they were made on.
  const proxy = new Proxy(github, {
    get(target, prop, receiver) {
      const value = (target as Record<PropertyKey, unknown>)[prop],
        self = receiver === proxy ? target : receiver;
      return typeof value === "function"
        ? (...args: unknown[]) => {
            const result = withJob(job, () => value.apply(self, args));
            return result === target ? proxy : result;
          }
        : value;
    },
  });
  return proxy;
}

// ---- What a request needs ----------------------------------------------

// The permission one REST call needs, from its method and path, in
// GitHub's own names ("Permissions required for GitHub Apps").
export function restNeeds(method: string, pathname: string): Permissions {
  const level = method === "GET" ? r : w,
    p = pathname.split("?")[0];
  if (p === "/user" || p.startsWith("/user/") || p.startsWith("/users/"))
    return /\/projectsV2/.test(p) ? { organization_projects: level } : {};
  if (/^\/orgs\/[^/]+\/projectsV2/.test(p))
    return { organization_projects: level };
  if (/^\/orgs\/[^/]+\/issue-types/.test(p))
    return level === r ? {} : { organization_administration: w };
  if (/^\/orgs\/[^/]+$/.test(p)) return {};
  if (p.startsWith("/search/issues")) return { issues: r, pull_requests: r };
  const match = /^\/repos\/[^/]+\/[^/]+(\/.*)?$/.exec(p);
  if (!match) return { administration: level };
  const rest = match[1] || "";
  const rules: [RegExp, Permissions | null][] = [
    [/^$/, level === r ? { metadata: r } : { administration: w }],
    [/^\/collaborators/, { metadata: r }],
    [/^\/(rulesets|rules)\b/, level === r ? { metadata: r } : null],
    [/^\/branches\/.+\/protection/, null],
    [/^\/actions\/variables/, { variables: level }],
    [/^\/actions\b/, { actions: level }],
    [/^\/(check-runs|check-suites)\b/, { checks: level }],
    [/^\/commits\/[^/]+\/(check-runs|check-suites)/, { checks: level }],
    [/^\/commits\/[^/]+\/(status|statuses)\b/, { statuses: level }],
    [/^\/statuses\//, { statuses: level }],
    [/^\/pulls\/\d+\/merge$/, { contents: level, pull_requests: level }],
    [/^\/pulls\b/, { pull_requests: level }],
    [/^\/(issues|labels|milestones)\b/, { issues: level }],
    [/^\/comments\b/, level === r ? { metadata: r } : { contents: w }],
    [
      /^\/commits\/[^/]+\/comments/,
      level === r ? { metadata: r } : { contents: w },
    ],
    [/^\/hooks\b/, { repository_hooks: level }],
    [
      /^\/(contents|git|branches|commits|compare|merges|tarball|zipball|dispatches)\b/,
      { contents: level },
    ],
  ];
  for (const [pattern, needs] of rules)
    if (pattern.test(rest)) return needs ?? { administration: level };
  return { administration: level };
}

// GraphQL fields and mutations Avoozl uses, and what each needs.
const GRAPHQL_MUTATIONS: Record<string, Permissions> = {
  addBlockedBy: { issues: w },
  removeBlockedBy: { issues: w },
  addDiscussionComment: { discussions: w },
  createCommitOnBranch: { contents: w },
  createIssue: { issues: w },
  createLinkedBranch: { contents: w, issues: w },
  markPullRequestReadyForReview: { pull_requests: w },
};
const GRAPHQL_READS: [RegExp, Permissions][] = [
  [/\bpullRequests?\b|\bissueOrPullRequest\b/, { pull_requests: r }],
  [/\bissues?\b|\bissueOrPullRequest\b|\bsearch\b/, { issues: r }],
  [/\bdiscussions?\b/, { discussions: r }],
  [/\bprojectV2\b|\bprojectsV2\b/, { organization_projects: r }],
  [/\bstatusCheckRollup\b|\bcheckSuite\b/, { checks: r, statuses: r }],
  [/\bobject\(|\bref\(|\bhistory\b|\bTree\b|\bBlob\b/, { contents: r }],
];

export function graphqlNeeds(query: unknown): Permissions {
  const text = String(query || "");
  const mutation = /^\s*mutation\b[^{]*\{\s*([A-Za-z]+)/.exec(text);
  if (mutation)
    return (
      GRAPHQL_MUTATIONS[mutation[1]] ?? {
        [`unknown mutation ${mutation[1]}`]: w,
      }
    );
  const needs: Permissions = { metadata: r };
  for (const [pattern, add] of GRAPHQL_READS)
    if (pattern.test(text)) Object.assign(needs, add);
  return needs;
}

// What the job lacks of `needs`, as "name: level" texts.
export function missingFrom(permissions: Permissions, needs: Permissions) {
  return Object.entries(needs)
    .filter(
      ([name, level]) =>
        !((LEVEL[permissions[name]] || 0) >= (LEVEL[level] || 9)),
    )
    .map(([name, level]) => `${name}: ${level}`);
}

// PC11.7: a token goes over https, or http to a loopback address.
export function tokenTransportAllowed(url: string) {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" ||
      (protocol === "http:" &&
        ["127.0.0.1", "::1", "[::1]", "localhost"].includes(hostname))
    );
  } catch {
    return false;
  }
}

// ---- Grants (D7) --------------------------------------------------------

export const GRANT_MS = 10 * 60 * 1000;

// What the page showed for one high-risk step: the hash it sends back.
export function permissionsHash({ job, target }: Step) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        job,
        target: String(target || "").toLowerCase(),
        permissions: permissionText(jobOf(job).permissions),
      }),
    )
    .digest("hex");
}

// One step the confirm shows: {job, target, action, permissions, hash}.
export function confirmStep({ job, target, action }: Step) {
  const entry = jobOf(job);
  return {
    job,
    target,
    action: action || entry.description,
    risk: entry.risk,
    permissions: { ...entry.permissions },
    permissionsText: permissionText(entry.permissions),
    permissionsHash: permissionsHash({ job, target }),
  };
}

// The grants a person's Allow made, in this process's memory only.
export class Grants {
  now: () => number;
  held: Map<string, Grant>;
  constructor({ now = Date.now }: { now?: () => number } = {}) {
    this.now = now;
    this.held = new Map();
  }
  // Checks each step against the job table now; a changed table or target
  // refuses (PC13.4).
  allow(steps: (Step & { permissionsHash: string })[]) {
    const made: Grant[] = [];
    for (const step of steps) {
      if (jobOf(step.job).risk !== "high")
        fail409(`${step.job} is not a high-risk job; it needs no confirm.`);
      if (step.permissionsHash !== permissionsHash(step))
        fail409(
          `What you allowed for ${step.job} on ${step.target} changed since it was shown. Look again and allow it again.`,
        );
      const grant: Grant = {
        id: createHash("sha256")
          .update(`${step.permissionsHash}|${this.now()}|${Math.random()}`)
          .digest("hex")
          .slice(0, 24),
        job: step.job,
        target: String(step.target).toLowerCase(),
        permissionsHash: step.permissionsHash,
        at: this.now(),
        used: false,
      };
      this.held.set(grant.id, grant);
      made.push(grant);
    }
    return made;
  }
  // The live grants of these ids; expired ones are forgotten.
  get(ids: string[] = []) {
    const found: Grant[] = [];
    for (const grant of this.held.values())
      if (this.now() - grant.at > GRANT_MS) this.held.delete(grant.id);
      else if (ids.includes(grant.id)) found.push(grant);
    return found;
  }
}

// This process's grants: the CLI makes several Operations in one command,
// and the confirm and the apply must see the same ones.
export const processGrants = new Grants();

function fail409(message: string): never {
  throw Object.assign(Error(message), { status: 409 });
}

// A grant serves one step once (PC13.4): the first call under it spends it
// for its job scope, and that scope keeps it for the rest of its calls.
export function useGrant(
  grants: Grant[] | null | undefined,
  job: string,
  target: unknown,
  now = Date.now(),
) {
  const wanted = String(target || "").toLowerCase(),
    here = scope.getStore();
  const grant = (grants || []).find(
    (g) =>
      g.job === job &&
      g.target === wanted &&
      now - g.at <= GRANT_MS &&
      g.permissionsHash === permissionsHash({ job, target: wanted }) &&
      (!g.used || g.usedFor === here),
  );
  if (!grant) return false;
  grant.used = true;
  grant.usedFor = here;
  return true;
}
