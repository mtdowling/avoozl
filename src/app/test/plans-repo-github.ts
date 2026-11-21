// A fake GitHub and workspace for plans-repo mode proofs (task 8.2): issues
// in example/plans, code in example/code. Every value is fake.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { TestContext } from "node:test";
import { Operations } from "../api/operations.ts";
import { renderMarker } from "../github/github-marker.ts";
import { machineIdentity } from "../github/github-sync.ts";
import { fixture } from "./fixtures.ts";
import { temporaryDirectory } from "./temporary.ts";
import { found, type TickResult } from "./view-shapes.ts";

// A planning issue as the REST API returns it, for the fields kept here.
interface Issue {
  number: number;
  state: string;
  state_reason: string | null;
  closed_at: string | null;
  updated_at: string;
  body: string;
  html_url: string;
}
// A pull request as the GraphQL reads return it.
interface Pull {
  id: string;
  number: number;
  url: string;
  state: string;
  title: string;
  body: string;
  merged: boolean;
  mergedAt: string | null;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  repository: { nameWithOwner: string };
  commits: { oid: string; message: string }[];
}
interface Comment {
  id: number;
  user: { login: string };
  body: string;
  created_at: string;
}
interface LinkedBranch {
  id: string;
  name: string;
  repository: string;
  repositoryId: string;
}

// No machine-wide settings reach these workspaces.
process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

export const NAMESPACE = "avz_0123456789abcdef",
  PLANS = "example/plans",
  CODE = "example/code",
  SHA = "a".repeat(40),
  BASE = "b".repeat(40),
  A_HEAD = "d".repeat(40),
  hash = "c".repeat(64);

const marker = (taskId: string) =>
  renderMarker({
    version: 2,
    taskId,
    namespace: NAMESPACE,
    kind: "leaf",
    source: { commit: null, manifest: hash },
    applied: { title: hash, body: hash, labels: [], blockers: [] },
  });

export class FakeGitHub {
  issues: Map<number, Issue>;
  closing: Map<number, Pull[]>;
  branchPulls: Map<string, Pull[]>;
  linked: Map<number, LinkedBranch[]>;
  events: Map<number, unknown[]>;
  heads: Map<string, string>;
  permissions: Map<string, string>;
  created: { issueId: string; name: string; repositoryId: string }[];
  updates: [number, unknown][];
  issueComments: Map<number, Comment[]>;
  commentReads: number;
  constructor() {
    this.issues = new Map();
    this.closing = new Map();
    this.branchPulls = new Map();
    this.linked = new Map();
    this.events = new Map();
    this.heads = new Map([
      ["main", BASE],
      ["avoozl/a", A_HEAD],
    ]);
    this.permissions = new Map([["maintainer", "write"]]);
    this.created = [];
    this.updates = [];
    this.issueComments = new Map();
    this.commentReads = 0;
  }
  comment(
    number: number,
    login: string,
    body: string,
    at = "2026-11-12T10:10:00Z",
  ) {
    const list = this.issueComments.get(number) || [],
      comment = {
        id: 900 + [...this.issueComments.values()].flat().length,
        user: { login },
        body,
        created_at: at,
      };
    this.issueComments.set(number, [...list, comment]);
    return comment;
  }
  listIssueComments(repository: string, number: number) {
    assert.equal(repository, PLANS);
    this.commentReads += 1;
    return Promise.resolve(
      structuredClone(this.issueComments.get(number) || []),
    );
  }
  available() {
    return true;
  }
  open(number: number, taskId: string) {
    this.issues.set(number, {
      number,
      state: "open",
      state_reason: null,
      closed_at: null,
      updated_at: "2026-11-12T10:00:00Z",
      body: marker(taskId) + "\nBody",
      html_url: `https://github.com/${PLANS}/issues/${number}`,
    });
  }
  pull(taskId: string, { state = "OPEN", base = "main" } = {}) {
    const pull: Pull = {
      id: "PR_" + taskId,
      number: 100 + this.branchPulls.size,
      url: `https://github.com/${CODE}/pull/${100 + this.branchPulls.size}`,
      state,
      title: "Task " + taskId,
      body: "Task " + taskId + " works.",
      merged: false,
      mergedAt: null,
      headRefName: "avoozl/" + taskId,
      headRefOid: SHA,
      baseRefName: base,
      repository: { nameWithOwner: CODE },
      commits: [{ oid: SHA, message: "Do " + taskId }],
    };
    this.branchPulls.set("avoozl/" + taskId, [pull]);
    return pull;
  }
  // GitHub merges the pull request and closes the planning issue (F51).
  closeByPull(number: number, taskId: string) {
    const [pull] = found(this.branchPulls.get("avoozl/" + taskId), taskId);
    Object.assign(pull, {
      state: "MERGED",
      merged: true,
      mergedAt: "2026-11-12T10:04:00Z",
      baseRefName: "main",
    });
    this.closing.set(number, [structuredClone(pull)]);
    const at = "2026-11-12T10:05:00Z";
    Object.assign(found(this.issues.get(number), `issue ${number}`), {
      state: "closed",
      state_reason: "completed",
      closed_at: at,
      updated_at: at,
    });
    this.events.set(number, [
      {
        event: "closed",
        actor: { login: "maintainer" },
        state_reason: "completed",
        created_at: at,
      },
    ]);
    this.linked.set(number, []);
  }
  issue(_repository: string, number: number) {
    return Promise.resolve(structuredClone(this.issues.get(number)));
  }
  closingPullRequests(_repository: string, number: number) {
    return Promise.resolve(structuredClone(this.closing.get(number) || []));
  }
  branchPullRequests(repository: string, branch: string) {
    assert.equal(repository, CODE);
    return Promise.resolve(structuredClone(this.branchPulls.get(branch) || []));
  }
  issueLinks(repository: string, number: number) {
    assert.equal(repository, PLANS);
    return Promise.resolve({
      nodeId: "I_" + number,
      linkedBranches: structuredClone(this.linked.get(number) || []),
      openBlockedBy: 0,
      totalBlockedBy: 0,
    });
  }
  branchHead(repository: string, branch: string) {
    assert.equal(repository, CODE);
    assert.ok(this.heads.has(branch), `no branch ${branch}`);
    return Promise.resolve({
      repositoryId: "R_code",
      oid: this.heads.get(branch),
    });
  }
  createLinkedBranch(input: {
    issueId: string;
    name: string;
    repositoryId: string;
  }) {
    this.created.push(input);
    const number = Number(input.issueId.slice(2)),
      branch = {
        id: "LB_" + number,
        name: input.name,
        repository: CODE,
        repositoryId: input.repositoryId,
      };
    this.linked.set(number, [branch]);
    return Promise.resolve(branch);
  }
  checkRuns() {
    return Promise.resolve([{ id: 1, name: "build", conclusion: "success" }]);
  }
  commitStatus() {
    return Promise.resolve({ statuses: [] });
  }
  issueEvents(_repository: string, number: number) {
    return Promise.resolve(structuredClone(this.events.get(number) || []));
  }
  issueTimeline() {
    return Promise.resolve([]);
  }
  permission(_repository: string, actor: string) {
    return Promise.resolve({
      permission: this.permissions.get(actor) || "none",
    });
  }
  updateIssue(_repository: string, number: number, input: unknown) {
    this.updates.push([number, input]);
    return Promise.resolve(structuredClone(this.issues.get(number)));
  }
}

// Leaves a (issue 1) and b (issue 2); a-next (issue 3) requires a; both
// (issue 4) requires a and b.
export function workspace(
  t: TestContext,
  { repository = {} }: { repository?: Record<string, unknown> } = {},
) {
  const { store } = fixture(t),
    root = temporaryDirectory(),
    checkout = temporaryDirectory(),
    github = new FakeGitHub();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      delivery: {},
      github: {
        mode: "plans-repo",
        planningRepository: PLANS,
        repositories: {
          [CODE]: {
            baseBranch: "main",
            allowedActors: ["maintainer"],
            requiredChecks: ["build"],
            ...repository,
          },
        },
      },
    }),
  );
  store.put("repositories", {
    id: "code",
    root: checkout,
    baseBranch: "main",
    checks: [],
  });
  const machine = machineIdentity(store).id;
  store.put("github_repositories", {
    id: PLANS,
    owner: "example",
    repo: "plans",
    activeMachine: machine,
  });
  store.put("github_repositories", {
    id: CODE,
    owner: "example",
    repo: "code",
    repositoryId: "code",
    activeMachine: machine,
  });
  const issues: [string, number][] = [
    ["a", 1],
    ["b", 2],
    ["a-next", 3],
    ["both", 4],
  ];
  store.mutate("Seed plans-repo leaves", (data) => {
    for (const [id, number] of issues)
      data.tasks.push({
        id,
        title: "Task " + id,
        scope: "catalog",
        status: "planned",
        epic: "sample",
        track: "catalog",
        kind: "leaf",
        authority: "github",
        repository: "code",
        acceptance: [id + " works"],
        checks: ["build"],
        github: {
          repository: PLANS,
          number,
          nodeId: "I_" + number,
          url: `https://github.com/${PLANS}/issues/${number}`,
        },
      });
    for (const [from, to] of [
      ["a", "a-next"],
      ["a", "both"],
      ["b", "both"],
    ])
      data.edges.push({
        id: `${from}:requires:${to}`,
        from,
        to,
        kind: "requires",
      });
  });
  for (const [id, number] of issues) github.open(number, id);
  const ops = new Operations(store, { github, workspaceRoot: root }),
    run = (sessions: unknown[] = []) =>
      ops.execute<TickResult>("workspace.tick", { sessions }),
    task = (id: string) => store.read().tasks.find((item) => item.id === id),
    branch = (id: string) => store.get("github_linked_branches", id),
    names = () => github.created.map((input) => input.name);
  return { store, github, ops, run, task, branch, names, root };
}

export const briefOf = (result: TickResult, id: string) =>
  result.dispatch.find((d) => d.task === id && d.role === "worker")?.brief;
