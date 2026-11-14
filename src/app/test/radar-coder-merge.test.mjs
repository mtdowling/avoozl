// rc-5.2 and rc-5.5: the tick arms merge-commit auto-merge on crew pull
// requests, only on the right ones, once, after one re-verify per issue per
// marker hash (RC5.2, RC5.8, design D7). Fake GitHub only: nothing is armed on
// a real pull request.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderMarker } from "../github-marker.mjs";
import { renderProvenance } from "../github-provenance.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { Operations } from "../operations.mjs";
import { fixture, snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const NAMESPACE = "avz_mergemergemerge1",
  REPO = "example/code",
  hash = "c".repeat(64),
  COMMIT = "0123456789abcdef0123456789abcdef01234567";

const managed = (namespace = NAMESPACE) =>
  renderMarker({
    version: 2,
    taskId: "rc-x",
    namespace,
    kind: "leaf",
    source: { commit: null, manifest: hash },
    applied: { title: hash, body: hash, labels: [], blockers: [] },
  });
const provenance = (tasks = ["rc-x"]) =>
  renderProvenance({
    spec: "demo",
    tasks,
    commit: COMMIT,
    approvedBy: "maintainer",
  });

class MergeGitHub {
  constructor() {
    this.issues = new Map();
    this.pulls = new Map();
    this.closes = new Map();
    this.armed = [];
    this.disarmed = [];
    this.calls = [];
  }
  available() {
    return true;
  }
  // The merge path check reads these: ready, with one required check.
  repository() {
    return Promise.resolve({ default_branch: "main", allow_auto_merge: true });
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
  addPull(number, { author = "maintainer", head = REPO, draft = false } = {}) {
    this.pulls.set(number, {
      number,
      node_id: "PR_" + number,
      state: "open",
      draft,
      user: { login: author },
      head: { repo: { full_name: head } },
      base: { repo: { full_name: REPO } },
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
  armAutoMerge(_repository, nodeId, method) {
    this.armed.push([nodeId, method]);
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

function setup(t, { ship = "auto-merge" } = {}) {
  const { store } = fixture(t),
    root = temporaryDirectory(),
    github = new MergeGitHub(),
    verified = [],
    verdicts = new Map();
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
            coder: "issue-radar",
            allowedActors: ["maintainer"],
            minimumPermission: "write",
            requiredChecks: ["build"],
            managedLabels: { ready: "go" },
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
  });
  const issueVerifier = (reference) => {
    verified.push(reference);
    return Promise.resolve(
      verdicts.get(reference) || { ok: true, couldNotRun: false, checks: [] },
    );
  };
  const ops = new Operations(store, {
    github,
    workspaceRoot: root,
    issueVerifier,
  });
  return {
    store,
    github,
    verified,
    verdicts,
    tick: () => ops.execute("workspace.tick", { sessions: [] }),
  };
}

const MARKED = managed() + "\n" + provenance() + "\nBody";

test("only the right pull request is armed, and only once across three ticks", async (t) => {
  const { github, tick } = setup(t);
  github.addIssue(1, MARKED); // closed by a fork pull request
  github.addIssue(2, MARKED); // closed by a stranger's pull request
  github.addIssue(3, MARKED); // closed by a draft
  github.addIssue(4, managed() + "\nBody"); // no provenance marker
  github.addIssue(5, managed("avz_otherotherother1") + "\n" + provenance());
  github.addIssue(6, MARKED); // the right one
  github.addPull(11, { head: "stranger/code" });
  github.addPull(12, { author: "stranger" });
  github.addPull(13, { draft: true });
  github.addPull(14);
  github.addPull(15);
  github.addPull(16);
  for (const [issue, pull] of [
    [1, 11],
    [2, 12],
    [3, 13],
    [4, 14],
    [5, 15],
    [6, 16],
  ])
    github.closes.set(issue, [pull]);
  for (let round = 0; round < 3; round += 1) await tick();
  assert.deepEqual(github.armed, [["PR_16", "MERGE"]]);
});

test("a pull request already armed on GitHub is not armed again", async (t) => {
  const { github, tick } = setup(t);
  github.addIssue(6, MARKED);
  github.addPull(16);
  github.pulls.get(16).auto_merge = { merge_method: "merge" };
  github.closes.set(6, [16]);
  await tick();
  assert.deepEqual(github.armed, []);
});

test("manual mode arms nothing", async (t) => {
  const { github, tick } = setup(t, { ship: "manual" });
  github.addIssue(6, MARKED);
  github.addPull(16);
  github.closes.set(6, [16]);
  await tick();
  assert.deepEqual(github.armed, []);
});

test("an edited marker blocks arming and opens one row", async (t) => {
  const { github, store, verdicts, tick } = setup(t);
  github.addIssue(6, MARKED);
  github.addPull(16);
  github.closes.set(6, [16]);
  verdicts.set(`${REPO}#6`, {
    ok: false,
    couldNotRun: false,
    checks: [{ name: "spec", status: "fail", reason: "x" }],
  });
  for (let round = 0; round < 3; round += 1) await tick();
  assert.deepEqual(github.armed, []);
  assert.equal(store.getMeta("radarMerge").notified.length, 1);
  // A fixed marker is a new hash: it is checked again and then armed.
  verdicts.delete(`${REPO}#6`);
  github.issues.get(6).body = managed() + "\n" + provenance(["rc-y"]);
  await tick();
  assert.deepEqual(github.armed, [["PR_16", "MERGE"]]);
});

test("an unchanged marker runs the check once across three ticks", async (t) => {
  const { github, verified, tick } = setup(t);
  github.addIssue(6, MARKED);
  github.addPull(16);
  github.closes.set(6, [16]);
  for (let round = 0; round < 3; round += 1) await tick();
  assert.deepEqual(verified, [`${REPO}#6`]);
});

test("a check that could not run arms nothing and is tried again", async (t) => {
  const { github, verified, verdicts, tick } = setup(t);
  github.addIssue(6, MARKED);
  github.addPull(16);
  github.closes.set(6, [16]);
  verdicts.set(`${REPO}#6`, { ok: false, couldNotRun: true, checks: [] });
  await tick();
  await tick();
  assert.deepEqual(github.armed, []);
  assert.equal(verified.length, 2);
  verdicts.delete(`${REPO}#6`);
  await tick();
  assert.deepEqual(github.armed, [["PR_16", "MERGE"]]);
});

test("no pull request is verified before its author and origin pass", async (t) => {
  const { github, verified, tick } = setup(t);
  github.addIssue(2, MARKED);
  github.addPull(12, { author: "stranger" });
  github.closes.set(2, [12]);
  await tick();
  assert.deepEqual(verified, []);
});

test("nothing is armed while the merge path is not ready", async (t) => {
  const { github, tick } = setup(t);
  github.repository = () =>
    Promise.resolve({ default_branch: "main", allow_auto_merge: false });
  github.addIssue(6, MARKED);
  github.addPull(16);
  github.closes.set(6, [16]);
  await tick();
  assert.deepEqual(github.armed, []);
});

// rc-5.4: Stop the line stops arming, and Disarm is a person's.
const task = (id) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "code",
});

test("a stop keeps a new pull request unarmed until it is resumed", async (t) => {
  const { github, store, tick } = setup(t);
  store.importSnapshot({ ...snapshot(), tasks: [task("rc-x")], edges: [] });
  github.addIssue(6, MARKED);
  github.addPull(16);
  github.closes.set(6, [16]);
  const ops = new Operations(store, { github, workspaceRoot: "/nope" });
  const { stop } = await ops.execute("flow.stop", {
    scope: "all",
    reason: "bad",
  });
  for (let round = 0; round < 3; round += 1) await tick();
  assert.deepEqual(github.armed, []);
  await ops.execute("flow.resume", { stopId: stop.id });
  await tick();
  assert.deepEqual(github.armed, [["PR_16", "MERGE"]]);
});

test("Disarm turns auto-merge off for a person, is refused for an agent, and the tick does not arm again", async (t) => {
  const { github, store, tick } = setup(t);
  github.addIssue(6, MARKED);
  github.addPull(16);
  github.closes.set(6, [16]);
  await tick();
  const ops = new Operations(store, { github, workspaceRoot: "/nope" });
  assert.deepEqual(
    (await ops.execute("radar.armed", {})).pullRequests.map((p) => [
      p.repository,
      p.number,
    ]),
    [[REPO, 16]],
  );
  const input = { repository: REPO, pullRequest: 16 };
  await assert.rejects(
    ops.execute("radar.disarm", input, undefined, { mcp: true }),
    /person/,
  );
  await assert.rejects(
    ops.execute("radar.disarm", input, undefined, { caller: "s" }),
    /person/,
  );
  assert.deepEqual(github.disarmed, []);
  await ops.execute("radar.disarm", input);
  assert.deepEqual(github.disarmed, ["PR_16"]);
  assert.deepEqual((await ops.execute("radar.armed", {})).pullRequests, []);
  await tick();
  await tick();
  assert.equal(github.armed.length, 1);
  await assert.rejects(
    ops.execute("radar.disarm", { repository: REPO, pullRequest: 99 }),
    /did not arm/,
  );
});
