// Shared fixture for the merge tests: a single-repo workspace on a fake
// GitHub that records every arm and disarm.
import fs from "node:fs";
import path from "node:path";
import { machineIdentity } from "../github-sync.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

export const NAMESPACE = "avz_mergemergemerge1",
  REPO = "example/code";

export class MergeGitHub {
  constructor() {
    this.issues = new Map();
    this.pulls = new Map();
    this.closes = new Map();
    this.armed = [];
    this.squashTitles = [];
    this.allows = {};
    this.disarmed = [];
    this.calls = [];
  }
  available() {
    return true;
  }
  // The merge path check reads these: ready, with one required check.
  repository() {
    return Promise.resolve({
      default_branch: "main",
      allow_auto_merge: true,
      ...this.allows,
    });
  }
  branch() {
    return Promise.resolve({ protected: true });
  }
  branchRules() {
    return Promise.resolve([
      {
        type: "required_status_checks",
        parameters: { required_status_checks: [{ context: "build" }] },
      },
    ]);
  }
  branchProtection() {
    return Promise.resolve(null);
  }
  listCommits() {
    return Promise.resolve([]);
  }
  checkRuns() {
    return Promise.resolve([]);
  }
  commitStatus() {
    return Promise.resolve({ statuses: [] });
  }
  issue(_repository, number) {
    return Promise.resolve(structuredClone(this.issues.get(number)));
  }
  addIssue(number, body) {
    this.issues.set(number, {
      number,
      state: "open",
      labels: [],
      body,
      user: { login: "maintainer" },
    });
  }
  listIssues(_repository, { state = "all" } = {}) {
    this.calls.push("listIssues");
    return Promise.resolve(
      structuredClone(
        [...this.issues.values()].filter(
          (issue) => state === "all" || issue.state === state,
        ),
      ),
    );
  }
  addPull(
    number,
    { author = "maintainer", head = REPO, draft = false, ref } = {},
  ) {
    this.pulls.set(number, {
      number,
      node_id: "PR_" + number,
      state: "open",
      draft,
      user: { login: author },
      head: { repo: { full_name: head } },
      base: { repo: { full_name: REPO }, ...(ref ? { ref } : {}) },
      auto_merge: null,
    });
  }
  listPullRequests() {
    this.calls.push("listPullRequests");
    return Promise.resolve(structuredClone([...this.pulls.values()]));
  }
  closingPullRequests(_repository, number) {
    return Promise.resolve(
      (this.closes.get(number) || []).map((pull) => ({
        number: pull,
        state: "OPEN",
        merged: false,
        repository: { nameWithOwner: REPO },
      })),
    );
  }
  permission(_repository, actor) {
    return Promise.resolve({
      permission: actor === "maintainer" ? "write" : "none",
    });
  }
  armAutoMerge(_repository, nodeId, method, commit = {}) {
    this.armed.push([nodeId, method]);
    if (commit.headline) this.squashTitles.push(commit.headline);
    this.pulls.get(Number(nodeId.slice(3))).auto_merge = {
      merge_method: "merge",
    };
    return Promise.resolve({});
  }
  pullRequest(_repository, number) {
    return Promise.resolve(structuredClone(this.pulls.get(number)));
  }
  disarmAutoMerge(_repository, nodeId) {
    this.disarmed.push(nodeId);
    this.pulls.get(Number(nodeId.slice(3))).auto_merge = null;
    return Promise.resolve({});
  }
}

export function setup(
  t,
  { ship = "auto-merge", github = new MergeGitHub(), repository = {} } = {},
) {
  const { store } = fixture(t),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: {
            baseBranch: "main",
            allowedActors: ["maintainer"],
            minimumPermission: "write",
            requiredChecks: ["build"],
            managedLabels: { ready: "go" },
            ...repository,
          },
        },
      },
      delivery: { ship },
    }),
  );
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    checks: [],
  });
  store.put("github_repositories", {
    id: REPO,
    owner: "example",
    repo: "code",
    projectId: "code",
    activeMachine: machineIdentity(store).id,
    private: true,
  });
  const ops = new Operations(store, {
    github,
    workspaceRoot: root,
  });
  return {
    store,
    github,
    tick: () => ops.execute("workspace.tick", { sessions: [] }),
  };
}
