// A fake GitHub and workspace for plans-repo mode proofs (task 8.2): issues
// in example/plans, code in example/code. Every value is fake.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Operations } from "../operations.mjs";
import { renderMarker } from "../github-marker.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// No machine-wide settings reach these workspaces.
process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

export const NAMESPACE = "avz_0123456789abcdef",
  PLANS = "example/plans",
  CODE = "example/code",
  SHA = "a".repeat(40),
  BASE = "b".repeat(40),
  A_HEAD = "d".repeat(40),
  hash = "c".repeat(64);

const marker = (taskId) =>
  renderMarker({
    version: 2,
    taskId,
    namespace: NAMESPACE,
    kind: "leaf",
    source: { commit: null, manifest: hash },
    applied: { title: hash, body: hash, labels: [], blockers: [] },
  });

export class FakeGitHub {
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
  comment(number, login, body, at = "2026-11-12T10:10:00Z") {
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
  listIssueComments(repository, number) {
    assert.equal(repository, PLANS);
    this.commentReads += 1;
    return Promise.resolve(
      structuredClone(this.issueComments.get(number) || []),
    );
  }
  available() {
    return true;
  }
  open(number, taskId) {
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
  pull(taskId, { state = "OPEN", base = "main" } = {}) {
    const pull = {
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
  closeByPull(number, taskId) {
    const [pull] = this.branchPulls.get("avoozl/" + taskId);
    Object.assign(pull, {
      state: "MERGED",
      merged: true,
      mergedAt: "2026-11-12T10:04:00Z",
      baseRefName: "main",
    });
    this.closing.set(number, [structuredClone(pull)]);
    const at = "2026-11-12T10:05:00Z";
    Object.assign(this.issues.get(number), {
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
  issue(_repository, number) {
    return Promise.resolve(structuredClone(this.issues.get(number)));
  }
  closingPullRequests(_repository, number) {
    return Promise.resolve(structuredClone(this.closing.get(number) || []));
  }
  branchPullRequests(repository, branch) {
    assert.equal(repository, CODE);
    return Promise.resolve(structuredClone(this.branchPulls.get(branch) || []));
  }
  issueLinks(repository, number) {
    assert.equal(repository, PLANS);
    return Promise.resolve({
      nodeId: "I_" + number,
      linkedBranches: structuredClone(this.linked.get(number) || []),
      openBlockedBy: 0,
      totalBlockedBy: 0,
    });
  }
  branchHead(repository, branch) {
    assert.equal(repository, CODE);
    assert.ok(this.heads.has(branch), `no branch ${branch}`);
    return Promise.resolve({
      repositoryId: "R_code",
      oid: this.heads.get(branch),
    });
  }
  createLinkedBranch(input) {
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
  issueEvents(_repository, number) {
    return Promise.resolve(structuredClone(this.events.get(number) || []));
  }
  issueTimeline() {
    return Promise.resolve([]);
  }
  permission(_repository, actor) {
    return Promise.resolve({
      permission: this.permissions.get(actor) || "none",
    });
  }
  updateIssue(_repository, number, input) {
    this.updates.push([number, input]);
    return Promise.resolve(structuredClone(this.issues.get(number)));
  }
}

// Leaves a (issue 1) and b (issue 2); a-next (issue 3) requires a; both
// (issue 4) requires a and b.
export function workspace(t, { repository = {}, runner = "tick" } = {}) {
  const { store } = fixture(t),
    root = temporaryDirectory(),
    checkout = temporaryDirectory(),
    github = new FakeGitHub();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      delivery: { concurrency: 4, runner },
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
  store.put("projects", {
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
    projectId: "code",
    activeMachine: machine,
  });
  const issues = [
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
    run = (sessions = []) => ops.execute("workspace.tick", { sessions }),
    task = (id) => store.read().tasks.find((item) => item.id === id),
    branch = (id) => store.get("github_linked_branches", id),
    names = () => github.created.map((input) => input.name);
  return { store, github, ops, run, task, branch, names, root };
}

export const briefOf = (result, id) =>
  result.dispatch.find((d) => d.task === id && d.role === "worker")?.brief;
