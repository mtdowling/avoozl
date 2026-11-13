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
import { handleMcp } from "../mcp.mjs";
import { Operations } from "../operations.mjs";
import { principalAllows } from "../app-backend.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { parseMarker } from "../github-marker.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

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
      context: { projectId: "plans" },
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
    delivery: { concurrency: 4, runner: "tick" },
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
  store.put("projects", {
    id: "plans",
    root,
    planning: true,
    baseBranch: "main",
    checks: [["npm", "test"]],
  });
  store.put("projects", {
    id: "code",
    root: checkout,
    baseBranch: "main",
    repository: CODE,
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
      projectId: "plans",
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

test("P40: one driver per spec, moved only by a person", async (t) => {
  const world = new World(),
    A1 = await workspace(t, world, "alice", { label: "laptop" }),
    A2 = await workspace(t, world, "alice", { label: "desk" }),
    B = await workspace(t, world, "bob", { label: "bob-mac" });
  const { ids } = A1;
  // A fake plugin and a fake terms file, on A1 only.
  const a1Json = path.join(A1.root, ".avoozl.json"),
    a1Config = json(a1Json);
  a1Config.contentRules = { sets: [{ id: "fake-terms" }] };
  save(a1Json, a1Config);
  const terms = path.join(A1.root, ".avoozl", "local", "content-rules");
  fs.mkdirSync(terms, { recursive: true });
  fs.writeFileSync(
    path.join(terms, "fake-terms.txt"),
    "codename: \\bzorblat\\b\n",
  );
  save(A1.pluginSettingsFile, {
    plugins: [
      { id: "fake-plugin", path: temporaryDirectory("avoozl-p40-plugin-") },
    ],
  });

  // (1) Approve on A1 (its projection makes the plan issue first); tick all
  // three. A1 drives and dispatches a1; A2 and B write nothing.
  await A1.ops.execute("github.project", { planId: "s1", repository: PLANS });
  const plan = world.planIssue();
  assert.ok(plan, "the plan issue exists");
  assert.equal(
    world.issues[0],
    plan,
    "the plan issue is made before any task issue",
  );
  assert.deepEqual(names(plan.assignees.map((a) => a.login)), ["alice"]);
  assert.equal(world.claim().machine, A1.machine());
  let tickA1 = await A1.tick();
  assert.deepEqual(A1.dispatched(tickA1).sort(), [ids.a1, ids.l1].sort());
  const before = world.writes.length;
  const tickA2 = await A2.tick(),
    tickB = await B.tick();
  assert.deepEqual(writesBy(world, before), [], "A2 and B write nothing");
  assert.deepEqual(A2.dispatched(tickA2), []);
  assert.deepEqual(B.dispatched(tickB), []);
  assert.equal((await A2.status()).reason, "other-machine");
  assert.match((await A2.status()).text, /Your other machine drives it/);
  assert.equal((await B.status()).reason, "other-person");
  assert.match((await B.status()).text, /assigned to alice/);

  // (2) Take over on A2 (same login, other machine); tick. A2 drives, A1
  // reads only, and no assignee changed.
  const assigneeWrites = () =>
    world.writes.filter(
      (w) =>
        w.method === "addAssignees" ||
        (w.method === "updateIssue" && w.args[1].includes("assignees")),
    );
  let taken = await A2.ops.execute("driver.takeover", { planId: "s1" });
  assert.equal(taken.won, true);
  assert.equal(world.claim().machine, A2.machine());
  assert.equal(world.claim().from.machine, A1.machine());
  await A2.tick();
  tickA1 = await A1.tick();
  assert.equal((await A2.status()).state, "driver");
  assert.equal((await A1.status()).reason, "other-machine");
  assert.deepEqual(A1.dispatched(tickA1), []);
  assert.deepEqual(assigneeWrites(), []);

  // (3) A second assignee: every workspace reads only and one decision
  // opens; removing him closes it.
  world.assign(plan.number, ["alice", "bob"]);
  for (const w of [A1, A2, B]) {
    const result = await w.tick();
    assert.deepEqual(w.dispatched(result), [], w.login);
    assert.equal((await w.status()).reason, "several");
  }
  const openDecisions = async (w) =>
    (await w.ops.execute("conflicts.view", {})).items.filter(
      (item) => item.kind === "driver",
    );
  assert.equal((await openDecisions(A2)).length, 1);
  assert.match(
    (await openDecisions(A2))[0].detail,
    /2 assignees \(alice, bob\)/,
  );
  world.assign(plan.number, ["alice"]);
  await A2.tick();
  assert.equal((await A2.status()).state, "driver");
  assert.equal((await openDecisions(A2)).length, 0);

  // (4) No assignee on the plan issue, alice on the epic issue: the epic's
  // assignee stands in and A2 still drives. A2 never projected the spec; it
  // finds the epic as the plan issue's parent.
  const epic = world.epicIssue();
  assert.ok(
    world.subIssues.some(
      ([parent, id]) => parent === epic.number && id === plan.id,
    ),
    "the plan issue sits under its epic issue",
  );
  world.assign(plan.number, []);
  world.assign(epic.number, ["alice"]);
  await A2.tick();
  let s2 = await A2.status();
  assert.equal(s2.state, "driver");
  assert.equal(s2.decidedBy, "epic");
  world.assign(plan.number, ["alice"]);
  world.assign(epic.number, []);

  // A1 takes the role back the same way, for the actions below.
  taken = await A1.ops.execute("driver.takeover", { planId: "s1" });
  assert.equal(taken.won, true);
  await A1.tick();

  // (5) A1 stops for two hours of fake time. A2 shows "not seen since" and
  // nothing moves: age never moves the role.
  clock.t += 120 * MINUTE;
  const quiet = world.writes.length,
    claimBefore = world.claim();
  const quietA2 = await A2.tick();
  s2 = await A2.status();
  assert.equal(s2.stale, true);
  assert.equal(s2.reason, "other-machine");
  assert.deepEqual(A2.dispatched(quietA2), []);
  assert.deepEqual(world.claim(), claimBefore);
  assert.deepEqual(writesBy(world, quiet), []);

  // (6) The plan issue is reassigned to bob between A1's sync read and its
  // dispatch step: A1 dispatches nothing.
  let flipped = false;
  world.onRead = (number, login) => {
    if (number === plan.number && login === "alice" && !flipped) {
      flipped = true;
      world.assign(plan.number, ["bob"]);
    }
  };
  tickA1 = await A1.tick();
  world.onRead = null;
  assert.ok(flipped);
  assert.deepEqual(A1.dispatched(tickA1), []);

  // (7) Assign alice again; start a1 on A1; Hand off driver. Nothing new
  // dispatches, a1 is never ended and its report applies, the export holds
  // no terms or instructions, its sha256 is in the claim, and Avoozl never
  // changes the assignee.
  world.assign(plan.number, ["alice"]);
  await A1.tick();
  // a1 has a linked branch from action 1 and no session here, so A1's take
  // back left it away with one decision; a person starts it here.
  assert.deepEqual(
    (await A1.status()).away.map((row) => row.taskId),
    [ids.a1],
  );
  await A1.ops.execute("driver.away.decide", {
    taskId: ids.a1,
    choice: "start",
  });
  tickA1 = await A1.tick();
  assert.ok(A1.dispatched(tickA1).includes(ids.a1));
  const a1Dispatch = tickA1.dispatch.find((d) => d.task === ids.a1);
  await A1.ops.execute("session.bind", {
    taskId: ids.a1,
    slot: "a1-slot",
    role: "worker",
    attempt: a1Dispatch.attempt,
    source: "tick",
    title: a1Dispatch.title,
  });
  const roster = [{ target: "a1-slot", status: "working" }];
  await A1.ops.execute("flow.instructions.update", {
    instructions: "PRIVATE-RETRO-INSTRUCTIONS",
  });
  A1.store.mutate("A private note", (data) => {
    data.tasks.find((task) => task.id === ids.a1).notes = "a1 private note";
  });
  await A1.ops.execute("driver.handoff", { planId: "s1", action: "start" });
  tickA1 = await A1.tick(roster);
  assert.deepEqual(A1.dispatched(tickA1), [], "nothing new while draining");
  let s1 = await A1.status();
  assert.deepEqual(
    s1.handoff.running.map((chat) => chat.taskId),
    [ids.a1],
  );
  const folder = temporaryDirectory("avoozl-p40-export-");
  await assert.rejects(
    A1.ops.execute("driver.handoff", {
      planId: "s1",
      action: "export",
      folder,
    }),
    /1 chat\(s\) still run/,
  );
  await A1.ops.execute(
    "session.report",
    { taskId: ids.a1, kind: "blocked", text: "a1 waits on a person" },
    undefined,
    { caller: { sessionKey: "dashboard:a1-slot" } },
  );
  await A1.tick(roster);
  const binding = A1.store.get("session_bindings", "a1-slot");
  assert.equal(binding.report.kind, "blocked", "its report applied");
  assert.notEqual(binding.status, "closed", "a1 was never ended");
  const exported = await A1.ops.execute("driver.handoff", {
    planId: "s1",
    action: "export",
    folder,
  });
  const fileText = fs.readFileSync(exported.file, "utf8");
  assert.doesNotMatch(fileText, /zorblat|PRIVATE-RETRO-INSTRUCTIONS/);
  assert.match(fileText, /a1 private note/);
  assert.equal(
    world.claim().export,
    A1.store.get("drivers", "s1").handoff.sha256,
  );
  assert.equal((await A1.status()).reason, "handed-off");
  assert.equal((await A1.status()).issue.url, plan.html_url);
  assert.deepEqual(assigneeWrites(), [], "Avoozl changed no assignee");
  world.assign(plan.number, ["bob"]);

  // (8) One changed byte is refused by name and changes nothing; the real
  // file takes over. B drives with l1, Flow spans and notes, and lists the
  // plugin and terms file to set up while their boundaries stay closed.
  const changed = path.join(folder, "changed.avoozl-driver.json");
  fs.writeFileSync(
    changed,
    fileText.replace("a1 private note", "a1 private notf"),
  );
  const revision = B.store.read().revision,
    claimNow = world.claim();
  await assert.rejects(
    B.ops.execute("driver.takeover", { planId: "s1", file: changed }),
    /changed\.avoozl-driver\.json does not match the export/,
  );
  assert.equal(B.store.read().revision, revision);
  assert.deepEqual(world.claim(), claimNow);
  taken = await B.ops.execute("driver.takeover", {
    planId: "s1",
    file: exported.file,
  });
  assert.equal(taken.won, true);
  const tickB2 = await B.tick();
  assert.equal((await B.status()).state, "driver");
  assert.ok(B.dispatched(tickB2).includes(ids.l1), "B drives with l1");
  const spans = B.store.db
    .prepare("SELECT COUNT(*) n FROM flow_spans WHERE task_id=?")
    .get(ids.a1).n;
  assert.ok(spans > 0, "Flow spans came over");
  assert.equal(
    B.store.read().tasks.find((task) => task.id === ids.a1).notes,
    "a1 private note",
  );
  const setup = (await B.status()).setup;
  assert.deepEqual(
    setup.map((item) => item.kind + (item.id ? ":" + item.id : "")).sort(),
    ["plugin:fake-plugin", "retro-instructions", "terms:fake-terms"],
  );
  assert.equal(
    fs.existsSync(B.pluginSettingsFile),
    false,
    "no plugin approval on B",
  );

  // (9) Agent sessions, MCP, the app token and plugins are refused.
  for (const name of [
    "driver.handoff",
    "driver.takeover",
    "driver.forceTakeover",
  ]) {
    for (const context of [
      { caller: { sessionKey: "dashboard:agent" } },
      { mcp: true },
      { plugin: { id: "fake-plugin" } },
    ])
      await assert.rejects(
        B.ops.execute(name, { planId: "s1" }, undefined, context),
        (error) => error.status === 403,
        name,
      );
    assert.equal(principalAllows({ kind: "app-token" }, name), false, name);
    assert.equal(principalAllows({ kind: "agent-tool" }, name), false, name);
    assert.equal(principalAllows({ kind: "owner-session" }, name), true, name);
  }
  assert.equal(principalAllows({ kind: "app-token" }, "driver.status"), true);
  const mcp = await handleMcp(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "plans_workspace", arguments: { action: "driver" } },
    },
    B.ops,
  );
  assert.match(JSON.stringify(mcp.body.result), /other-person|driver/);

  // (10) B starts a2 and stops with no hand off. A1 forces a take over
  // with a rebuild: without push access GitHub keeps bob and nothing else
  // changes; with it the loss list shows first, alice is the only assignee,
  // a2 is away with one decision instead of a restart, and the claim is
  // forced and names B.
  const a1Issue = world.taskIssue(ids.a1);
  Object.assign(a1Issue, {
    state: "closed",
    state_reason: "completed",
    closed_at: "2026-11-13T13:00:00Z",
    updated_at: "2026-11-13T13:00:00Z",
  });
  // GitHub empties a closed issue's linked branches (F52).
  world.linked.set(a1Issue.number, []);
  world.closing.set(a1Issue.number, [
    {
      number: 7,
      url: `https://github.com/${CODE}/pull/7`,
      state: "MERGED",
      merged: true,
      mergedAt: "2026-11-13T12:59:00Z",
      baseRefName: "main",
      headRefName: "avoozl/" + ids.a1,
      headRefOid: "d".repeat(40),
      repository: { nameWithOwner: CODE },
      title: "a1",
      body: "a1 works",
      commits: [{ oid: "d".repeat(40), message: "a1" }],
    },
  ]);
  world.events.set(a1Issue.number, [
    {
      event: "closed",
      actor: { login: "bob" },
      state_reason: "completed",
      created_at: "2026-11-13T13:00:00Z",
    },
  ]);
  let a2Dispatch = null;
  for (let i = 0; i < 4 && !a2Dispatch; i += 1)
    a2Dispatch = (await B.tick()).dispatch.find(
      (d) => d.task === ids.a2 && d.role === "worker",
    );
  assert.ok(a2Dispatch, "B starts a2 once a1 is done");
  await B.ops.execute("session.bind", {
    taskId: ids.a2,
    slot: "a2-slot",
    role: "worker",
    attempt: a2Dispatch.attempt,
    source: "tick",
    title: a2Dispatch.title,
  });
  // B stops: no more ticks from it. Someone the policy does not allow
  // closes a3's issue, a decision whose cause stays on GitHub.
  const a3Issue = world.taskIssue(ids.a3);
  Object.assign(a3Issue, {
    state: "closed",
    state_reason: "completed",
    closed_at: "2026-11-13T13:05:00Z",
    updated_at: "2026-11-13T13:05:00Z",
  });
  world.events.set(a3Issue.number, [
    {
      event: "closed",
      actor: { login: "mallory" },
      state_reason: "completed",
      created_at: "2026-11-13T13:05:00Z",
    },
  ]);
  world.push.set("alice", false);
  const preview = await A1.ops.execute("driver.forceTakeover", {
    planId: "s1",
    confirm: "s1",
  });
  assert.equal(preview.needs, "acknowledge");
  assert.ok(preview.lost.some((line) => /Flow timing/.test(line)));
  const claimB = world.claim();
  await assert.rejects(
    A1.ops.execute("driver.forceTakeover", {
      planId: "s1",
      confirm: "s1",
      acknowledgeLoss: true,
    }),
    /GitHub kept the plan issue's assignees as bob/,
  );
  assert.deepEqual(world.claim(), claimB, "nothing else changed");
  world.push.set("alice", true);
  await assert.rejects(
    A1.ops.execute("driver.forceTakeover", {
      planId: "s1",
      confirm: "wrong",
      acknowledgeLoss: true,
    }),
    /Type the spec name s1/,
  );
  const forced = await A1.ops.execute("driver.forceTakeover", {
    planId: "s1",
    confirm: "s1",
    acknowledgeLoss: true,
  });
  assert.equal(forced.won, true);
  assert.deepEqual(
    world.planIssue().assignees.map((a) => a.login),
    ["alice"],
  );
  assert.equal(world.claim().forced, true);
  assert.equal(world.claim().from.machine, B.machine());
  assert.equal(A1.store.get("drivers", "s1").reproject, true);
  tickA1 = await A1.tick();
  // The take-over projects the spec once more: the disallowed close is a
  // decision again, read from GitHub.
  assert.deepEqual(tickA1.github.projection.projected, ["s1"]);
  assert.ok(
    (await A1.ops.execute("conflicts.view", {})).items.some(
      (item) => item.kind === "github-conflict" && item.taskId === ids.a3,
    ),
  );
  assert.equal(
    A1.dispatched(tickA1).includes(ids.a2),
    false,
    "a2 is never restarted",
  );
  const away = (await A1.ops.execute("conflicts.view", {})).items.filter(
    (item) => item.kind === "driver-away",
  );
  assert.deepEqual(
    away.map((item) => item.taskId),
    [ids.a2],
  );
  await A1.tick();
  assert.equal(
    (await A1.ops.execute("conflicts.view", {})).items.filter(
      (item) => item.kind === "driver-away",
    ).length,
    1,
    "one decision, not one per tick",
  );
  assert.ok(
    A1.store
      .list("app_notifications")
      .some((n) => /took over s1 by force/.test(JSON.stringify(n.payload))),
  );

  // (11) B starts again: it reads only, names A1, and says forced.
  const back = world.writes.length;
  const tickB3 = await B.tick([{ target: "a2-slot", status: "working" }]);
  const sB = await B.status();
  assert.equal(sB.reason, "forced-away");
  assert.match(sB.text, /alice took it over by force on laptop/);
  assert.deepEqual(B.dispatched(tickB3), []);
  assert.deepEqual(
    writesBy(world, back).filter((w) => w.login === "bob"),
    [],
    "B writes nothing and never takes the role back",
  );
});

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

// R66.4 and R66.8: the heartbeat moves at most once per interval, and when
// two machines of one login press Take over at once the claim GitHub kept
// wins on both.
test("P40: heartbeat interval, and two Take overs at once", async (t) => {
  const world = new World(),
    A1 = await workspace(t, world, "alice", { label: "laptop" });
  await A1.ops.execute("github.project", { planId: "s1", repository: PLANS });
  const first = world.claim().heartbeatAt;
  clock.t += 5 * MINUTE;
  await A1.tick();
  assert.equal(world.claim().heartbeatAt, first, "not before 15 minutes");
  clock.t += 11 * MINUTE;
  await A1.tick();
  assert.equal(world.claim().heartbeatAt, new Date(clock.t).toISOString());
  // While A2 waits its 10 seconds, A3 (alice too) writes its own claim.
  let A3 = null;
  const A2 = await workspace(t, world, "alice", {
    label: "desk",
    wait: async (ms) => {
      assert.ok(ms >= 10_000);
      clock.t += ms;
      await A3.ops.execute("driver.takeover", { planId: "s1" });
    },
  });
  A3 = await workspace(t, world, "alice", { label: "spare" });
  await A2.tick();
  await A3.tick();
  const result = await A2.ops.execute("driver.takeover", { planId: "s1" });
  assert.equal(result.won, false);
  assert.equal(result.winner.label, "spare");
  assert.equal((await A2.status()).reason, "other-machine");
  assert.equal((await A3.status()).state, "driver");
  // Settings: a label that is a path is refused, heartbeat bounds hold.
  await assert.rejects(
    A1.ops.execute("driver.settings.update", { label: "a/b" }),
    /no slash/,
  );
  await assert.rejects(
    A1.ops.execute("driver.settings.update", { heartbeatMinutes: 2 }),
    /5 to 60/,
  );
  const saved = await A1.ops.execute("driver.settings.update", {
    label: "work laptop",
    heartbeatMinutes: 30,
  });
  assert.match(saved.machine.id, /^mch_[a-z2-7]{16}$/);
  assert.equal(saved.machine.label, "work laptop");
  assert.equal(saved.machine.heartbeatMinutes, 30);
  await assert.rejects(
    A1.ops.execute("driver.settings.update", { label: "x" }, undefined, {
      mcp: true,
    }),
    (error) => error.status === 403,
  );
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
