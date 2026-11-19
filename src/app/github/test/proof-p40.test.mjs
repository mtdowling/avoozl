// Proof P40: driver handoff (tasks.md Phase 26, design §6.10, Requirement
// 66). Tested against fakes only: one fake GitHub in plans-repo mode shared
// by three isolated temporary workspaces, A1 and A2 (login alice, two
// machine IDs) and B (login bob), fake time, and fake session rosters. The
// fake GitHub ignores assignee changes from a token without push access, as
// GitHub's REST API does. No network, no real Kiro Crew, no real GitHub.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../api/operations.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { parseMarker } from "../github-marker.mjs";
import { Store } from "../../store/store.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { writeSpec } from "../../test/spec-fixture.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const NAMESPACE = "avz_p40driverhandoff",
  PLANS = "example/plans",
  CODE = "example/code",
  BASE = "b".repeat(40),
  MINUTE = 60_000;

const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const save = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const names = (list) => (list || []).map((entry) => entry.name ?? entry);

// One GitHub for every workspace. Each client acts as one login; writes are
// logged by login so a test can say who wrote what.
class World {
  constructor() {
    this.issues = [];
    this.writes = [];
    this.push = new Map();
    this.linked = new Map();
    this.blockers = new Map();
    this.subIssues = [];
    this.events = new Map();
    this.closing = new Map();
    this.pulls = new Map();
    this.onRead = null;
  }
  as(login) {
    return new Client(this, login);
  }
  find(number) {
    return this.issues.find((issue) => issue.number === number);
  }
  planIssue() {
    return this.issues.find(
      (issue) => parseMarker(issue.body)?.kind === "plan",
    );
  }
  epicIssue() {
    return this.issues.find(
      (issue) => parseMarker(issue.body)?.kind === "epic",
    );
  }
  taskIssue(taskId) {
    return this.issues.find(
      (issue) =>
        parseMarker(issue.body)?.kind !== "plan" &&
        parseMarker(issue.body)?.taskId === taskId,
    );
  }
  // A person's own GitHub edit, outside every Avoozl.
  assign(number, logins) {
    this.find(number).assignees = logins.map((login) => ({ login }));
  }
  claim() {
    return parseMarker(this.planIssue().body)?.claim ?? null;
  }
}

class Client {
  constructor(world, login) {
    this.world = world;
    this.login = login;
  }
  log(method, ...args) {
    this.world.writes.push({ login: this.login, method, args });
  }
  canPush() {
    return this.world.push.get(this.login) !== false;
  }
  available() {
    return true;
  }
  currentUser() {
    return Promise.resolve({ login: this.login });
  }
  repository({ owner, repo }) {
    return Promise.resolve({
      node_id: "R_" + repo,
      full_name: owner + "/" + repo,
      private: true,
    });
  }
  ensureLabel(_repository, label) {
    return Promise.resolve(label);
  }
  listIssues(repository, { state = "all", label } = {}) {
    return Promise.resolve(
      this.world.issues
        .filter((issue) => issue.repository === repository.id)
        .filter((issue) => state === "all" || issue.state === state)
        .filter((issue) => !label || names(issue.labels).includes(label))
        .map((issue) => structuredClone(issue)),
    );
  }
  issue(_repository, number) {
    const copy = structuredClone(this.world.find(number));
    // A person's edit lands right after this read (action 6).
    this.world.onRead?.(number, this.login);
    return Promise.resolve(copy);
  }
  parentIssue(_repository, number) {
    const child = this.world.find(number),
      link = this.world.subIssues.find(([, id]) => id === child?.id);
    return Promise.resolve(
      link ? structuredClone(this.world.find(link[0])) : null,
    );
  }
  createIssue(repository, input) {
    this.log("createIssue", repository.id, input.title);
    const number = this.world.issues.length + 1,
      issue = {
        id: 1000 + number,
        node_id: "I_" + number,
        number,
        repository: repository.id,
        state: "open",
        state_reason: null,
        closed_at: null,
        updated_at: "2026-11-13T10:00:00Z",
        labels: (input.labels || []).map((name) => ({ name })),
        title: input.title,
        body: input.body,
        html_url: `https://github.com/${repository.id}/issues/${number}`,
        // GitHub drops assignees from a token without push access.
        assignees: this.canPush()
          ? (input.assignees || []).map((login) => ({ login }))
          : [],
      };
    this.world.issues.push(issue);
    return Promise.resolve(structuredClone(issue));
  }
  updateIssue(_repository, number, input) {
    this.log("updateIssue", number, Object.keys(input));
    const issue = this.world.find(number),
      { assignees, type: _type, ...rest } = input;
    Object.assign(issue, rest);
    if (assignees && this.canPush())
      issue.assignees = assignees.map((login) => ({ login }));
    return Promise.resolve(structuredClone(issue));
  }
  addAssignees(_repository, number, assignees) {
    this.log("addAssignees", number);
    const issue = this.world.find(number);
    if (this.canPush())
      issue.assignees = [
        ...issue.assignees,
        ...assignees.map((login) => ({ login })),
      ];
    return Promise.resolve({ assignees: issue.assignees });
  }
  addLabels(_repository, number, labels) {
    this.log("addLabels", number, labels);
    const issue = this.world.find(number),
      set = new Set(names(issue.labels));
    for (const label of labels) set.add(label);
    issue.labels = [...set].map((name) => ({ name }));
    return Promise.resolve(issue.labels);
  }
  removeLabel(_repository, number, label) {
    this.log("removeLabel", number, label);
    const issue = this.world.find(number);
    issue.labels = issue.labels.filter((item) => item.name !== label);
    return Promise.resolve(null);
  }
  listIssueBlockers(repository, number) {
    return Promise.resolve(
      structuredClone([
        ...(
          this.world.blockers.get(`${repository.id}#${number}`) || new Map()
        ).values(),
      ]),
    );
  }
  addIssueBlocker(repository, number, blockerId) {
    this.log("addIssueBlocker", number);
    const key = `${repository.id}#${number}`,
      map = this.world.blockers.get(key) || new Map(),
      blocker = this.world.issues.find((issue) => issue.id === blockerId);
    map.set(blockerId, blocker);
    this.world.blockers.set(key, map);
    return Promise.resolve(structuredClone(blocker));
  }
  removeIssueBlocker(repository, number, blockerId) {
    this.log("removeIssueBlocker", number);
    this.world.blockers.get(`${repository.id}#${number}`)?.delete(blockerId);
    return Promise.resolve(null);
  }
  addSubIssue(_repository, number, databaseId) {
    this.log("addSubIssue", number);
    this.world.subIssues.push([number, databaseId]);
    return Promise.resolve({});
  }
  listSubIssues(_repository, number) {
    return Promise.resolve(
      this.world.subIssues
        .filter(([parent]) => parent === number)
        .map(([, id]) =>
          structuredClone(this.world.issues.find((issue) => issue.id === id)),
        ),
    );
  }
  listIssueTypes() {
    return Promise.resolve([]);
  }
  issueEvents(_repository, number) {
    return Promise.resolve(
      structuredClone(this.world.events.get(number) || []),
    );
  }
  issueTimeline() {
    return Promise.resolve([]);
  }
  // The world writes no comments, so a spec journal reads empty.
  listIssueComments() {
    return Promise.resolve([]);
  }
  permission(_repository, actor) {
    return Promise.resolve({
      permission: ["alice", "bob"].includes(actor) ? "write" : "none",
    });
  }
  closingPullRequests(_repository, number) {
    return Promise.resolve(
      structuredClone(this.world.closing.get(number) || []),
    );
  }
  branchPullRequests(_repository, branch) {
    return Promise.resolve(structuredClone(this.world.pulls.get(branch) || []));
  }
  issueLinks(_repository, number) {
    return Promise.resolve({
      nodeId: "I_" + number,
      linkedBranches: structuredClone(this.world.linked.get(number) || []),
      openBlockedBy: 0,
      totalBlockedBy: 0,
    });
  }
  branchHead() {
    return Promise.resolve({ repositoryId: "R_code", oid: BASE });
  }
  createLinkedBranch(input) {
    this.log("createLinkedBranch", input.name);
    const number = Number(input.issueId.slice(2)),
      branch = {
        id: "LB_" + number,
        name: input.name,
        repository: CODE,
        repositoryId: input.repositoryId,
      };
    this.world.linked.set(number, [branch]);
    return Promise.resolve(branch);
  }
  checkRuns() {
    return Promise.resolve([]);
  }
  commitStatus() {
    return Promise.resolve({ statuses: [] });
  }
}

const clock = { t: Date.parse("2026-11-13T10:00:00Z") };
const now = () => clock.t;
const sleep = async (ms) => {
  clock.t += ms;
};

// Spec s1 under epic e1: leaves a1 and a2 (a2 requires a1) and a
// local-authority leaf l1. The same files in every workspace's checkout.
const leaf = (extra = {}) => ({
  kind: "leaf",
  summary: "Do it.",
  repository: "code",
  acceptance: ["It works."],
  checks: ["npm test"],
  ...extra,
});
function writeSpecs(root) {
  writeSpec(root, "s1", {
    "requirements.md": "---\nepic: e1\n---\n# Plan s1\n\nThe goal of s1.\n",
    "tasks.md":
      "# Tasks\n\n- [ ] 1 Task a1\n- [ ] 2 Task a2\n- [ ] 3 Local l1\n- [ ] 4 Task a3\n",
    "avoozl/manifest.json": JSON.stringify({
      tasks: {
        1: leaf(),
        2: leaf({ requires: ["1"] }),
        3: leaf({ authority: "local" }),
        // a3 waits on a2; it is here to be closed by someone not allowed.
        4: leaf({ requires: ["2"] }),
      },
    }),
  });
  writeSpec(root, "e1", {
    "requirements.md":
      "# Epic e1\n\nShip s1.\n\n## What done means\n\ns1 is done.\n",
    "design.md": "# Design\n\ns1.\n",
    "tasks.md": "# Plans\n\n- [ ] 1 s1\n",
    "avoozl/manifest.json": JSON.stringify({
      kind: "epic",
      tasks: { 1: { plan: "s1", summary: "Plan s1." } },
    }),
  });
}

async function approveSpec(ops, name) {
  const plan =
    ops.store.get("plans", name) ||
    (await ops.execute("plan.create", {
      spec: name,
      context: { repositoryId: "plans" },
    }));
  const preview = await ops.execute("plan.preview", { id: plan.id });
  return ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
}

// One isolated workspace: its own root, SQLite, checkout and driver
// settings file (its machine ID), on the shared fake GitHub as `login`.
async function workspace(
  t,
  world,
  login,
  { label, mode = "plans-repo", wait = sleep } = {},
) {
  const root = temporaryDirectory("avoozl-p40-"),
    machineDir = temporaryDirectory("avoozl-p40-machine-"),
    checkout = temporaryDirectory("avoozl-p40-code-"),
    settingsFile = path.join(machineDir, "driver.json"),
    pluginSettingsFile = path.join(machineDir, "plugins.json");
  if (label) save(settingsFile, { label });
  save(path.join(root, ".avoozl.json"), {
    version: 1,
    namespace: NAMESPACE,
    lanes: { local: 4 },
    delivery: { runner: "tick" },
    ...(mode === "plans-repo"
      ? {
          github: {
            mode: "plans-repo",
            planningRepository: PLANS,
            repositories: {
              [CODE]: { baseBranch: "main", allowedActors: ["alice", "bob"] },
            },
          },
        }
      : { github: { mode: "local" } }),
  });
  writeSpecs(root);
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot(snapshot());
  // The planning checkout holds the spec folders; code is a plain folder.
  store.put("repositories", {
    id: "plans",
    root,
    planning: true,
    baseBranch: "main",
    checks: [["npm", "test"]],
  });
  store.put("repositories", {
    id: "code",
    root: checkout,
    baseBranch: "main",
    github: CODE,
    checks: [["npm", "test"]],
  });
  const github = world?.as(login);
  const ops = new Operations(store, {
    github,
    operator: login,
    workspaceRoot: root,
    pluginSettingsFile,
    driver: { settingsFile, now, sleep: wait },
  });
  if (mode === "plans-repo") {
    const machine = machineIdentity(store).id;
    store.put("github_repositories", {
      id: PLANS,
      owner: "example",
      repo: "plans",
      repositoryId: "plans",
      managedLabel: "avoozl",
      label: "avoozl-ready",
      activeMachine: machine,
    });
  }
  await approveSpec(ops, "s1");
  await approveSpec(ops, "e1");
  // Spec task IDs are the plan ID and the tasks.md number.
  const ids = { a1: "s1.1", a2: "s1.2", l1: "s1.3", a3: "s1.4" };
  assert.ok(store.read().tasks.some((task) => task.id === ids.a1));
  const tick = (sessions = []) =>
    ops.execute("workspace.tick", { sessions, cron: true });
  const status = async () =>
    (await ops.execute("driver.status", { planId: "s1" })).specs[0];
  const dispatched = (result) =>
    result.dispatch.filter((d) => d.role === "worker").map((d) => d.task);
  return {
    login,
    root,
    store,
    ops,
    ids,
    tick,
    status,
    dispatched,
    settingsFile,
    pluginSettingsFile,
    machine: () => json(settingsFile).machine,
  };
}

const writesBy = (world, from) => world.writes.slice(from);

// (12) A Local only workspace copied to another machine ID reads only
// until a person presses Take over.
test("P40 (12): a copied Local only workspace reads only until Take over", async (t) => {
  const L = await workspace(t, null, "alice", { mode: "local" });
  await L.tick();
  assert.equal((await L.status()).state, "driver");
  const copyRoot = temporaryDirectory("avoozl-p40-copy-"),
    machineDir = temporaryDirectory("avoozl-p40-copy-machine-");
  fs.copyFileSync(
    path.join(L.root, ".avoozl.json"),
    path.join(copyRoot, ".avoozl.json"),
  );
  L.store.db.exec("PRAGMA wal_checkpoint(FULL)");
  fs.copyFileSync(
    path.join(L.root, "workspace.sqlite"),
    path.join(copyRoot, "workspace.sqlite"),
  );
  const store = new Store(path.join(copyRoot, "workspace.sqlite"));
  t.after(() => store.close());
  const ops = new Operations(store, {
    operator: "alice",
    workspaceRoot: copyRoot,
    pluginSettingsFile: path.join(machineDir, "plugins.json"),
    driver: { settingsFile: path.join(machineDir, "driver.json"), now, sleep },
  });
  const result = await ops.execute("workspace.tick", {
    sessions: [],
    cron: true,
  });
  let copy = (await ops.execute("driver.status", { planId: "s1" })).specs[0];
  assert.equal(copy.state, "read-only");
  assert.equal(copy.reason, "local-other-machine");
  assert.deepEqual(
    result.dispatch.filter((d) => d.role === "worker"),
    [],
  );
  await assert.rejects(
    ops.execute("driver.forceTakeover", { planId: "s1", confirm: "s1" }),
    /no forced take-over between machines/,
  );
  await ops.execute("driver.takeover", { planId: "s1" });
  copy = (await ops.execute("driver.status", { planId: "s1" })).specs[0];
  assert.equal(copy.state, "driver");
  // The original is another file: its row still names its own machine.
  await L.tick();
  assert.equal((await L.status()).state, "driver");
});

// R66.3: the claim holds IDs, a label, a login and times, only on a plan
// issue, and never a path.
test("P40: the machine claim's shape", async () => {
  const { renderMarker } = await import("../github-marker.mjs"),
    claim = {
      machine: "mch_7hw2c4n6r2t3y4pq",
      label: "laptop",
      login: "octocat",
      takenAt: "2026-11-13T10:00:00Z",
      heartbeatAt: "2026-11-13T10:00:00Z",
      from: null,
      forced: false,
      export: null,
    },
    marker = (kind, value) => ({
      version: 2,
      taskId: "s1",
      namespace: NAMESPACE,
      kind,
      source: { commit: null, manifest: "c".repeat(64) },
      applied: {
        title: "c".repeat(64),
        body: "c".repeat(64),
        labels: [],
        blockers: [],
      },
      claim: value,
    });
  assert.match(renderMarker(marker("plan", claim)), /"claim"/);
  assert.throws(() => renderMarker(marker("leaf", claim)), /only a plan issue/);
  assert.throws(
    () => renderMarker(marker("plan", { ...claim, label: "/var/x" })),
    /contains a path/,
  );
  assert.throws(
    () => renderMarker(marker("plan", { ...claim, host: "box.local" })),
    /unsupported fields: host/,
  );
});
