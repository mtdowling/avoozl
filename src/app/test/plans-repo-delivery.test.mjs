// Plans-repo delivery, leak screen and completion (tasks 4.7–4.9, §6.5–§6.6).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { queryTasks } from "../../model.mjs";
import { Operations } from "../operations.mjs";
import { renderMarker } from "../github-marker.mjs";
import { findPlanningLeak, pullRequestLeak } from "../github-plans-repo.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const NAMESPACE = "avz_0123456789abcdef",
  PLANS = "example/plans",
  CODE = "example/code",
  SHA = "a".repeat(40),
  BASE = "b".repeat(40),
  hash = "c".repeat(64);

// Every way the planning repository's name must never reach the code
// repository, in one place for the brief and the pull request checks.
const LEAKS = [
  ["owner/name", "Port example/plans timers"],
  ["owner/name#", "Fixes example/plans#3"],
  ["URL", "See https://github.com/example/plans/issues/3"],
  ["upper case", "See EXAMPLE/PLANS"],
  ["mixed case URL", "https://GitHub.com/Example/Plans"],
  ["percent-encoded slash", "example%2Fplans"],
  ["double-encoded", "example%252Fplans"],
  ["encoded name", "%65xample/plans"],
  ["HTML entity", "example&#47;plans"],
  ["backslash escape", "example\\/plans"],
  ["split after slash", "example/\nplans"],
  ["split inside name", "example/pla\n  ns"],
  ["split around slash", "example \n/ plans#4"],
  ["zero-width", "example/\u200bplans"],
  ["git suffix", "git@github.com:example/plans.git"],
];
const CLEAN = [
  ["other repository", "example/code#3"],
  ["longer name", "example/plans-v2"],
  ["other owner", "my-example/plans"],
  ["name alone", "the plans repository"],
  ["owner alone", "example/"],
  ["empty", ""],
];

test("the leak screen finds every form of the planning name and nothing else", () => {
  for (const [label, text] of LEAKS)
    assert.ok(findPlanningLeak([["body", text]], PLANS), label);
  for (const [label, text] of CLEAN)
    assert.equal(findPlanningLeak([["body", text]], PLANS), null, label);
  assert.equal(
    findPlanningLeak([["body", "Fixes example/plans#3"]], PLANS).form,
    "owner/name#",
  );
  assert.equal(
    findPlanningLeak([["body", "https://github.com/example/plans"]], PLANS)
      .form,
    "URL",
  );
  assert.equal(findPlanningLeak([["body", "example/plans"]], null), null);
  const pull = {
    url: "u",
    number: 9,
    title: "Add timers",
    body: "Clean",
    commits: [
      { oid: "d".repeat(40), message: "Add timers" },
      { oid: "e".repeat(40), message: "Refs example/plans#3" },
    ],
  };
  assert.deepEqual(pullRequestLeak([pull], PLANS), {
    url: "u",
    number: 9,
    field: "commit eeeeeeeeeeee message",
    form: "owner/name#",
  });
});

const marker = (taskId) =>
  renderMarker({
    version: 2,
    taskId,
    namespace: NAMESPACE,
    kind: "leaf",
    source: { commit: null, manifest: hash },
    applied: { title: hash, body: hash, labels: [], blockers: [] },
  });

class FakeGitHub {
  constructor() {
    this.issues = new Map();
    this.closing = new Map();
    this.branchPulls = new Map();
    this.linked = new Map();
    this.events = new Map();
    this.permissions = new Map([["maintainer", "write"]]);
    this.checks = [{ id: 1, name: "build", conclusion: "success" }];
    this.updates = [];
    this.created = [];
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
  pull(number, taskId, extra = {}) {
    const pull = {
      id: "PR_" + number,
      number: 100 + number,
      url: `https://github.com/${CODE}/pull/${100 + number}`,
      state: "OPEN",
      title: "Task " + taskId,
      body: "Task " + taskId + " works.",
      merged: false,
      mergedAt: null,
      headRefName: "avoozl/" + taskId,
      headRefOid: SHA,
      baseRefName: "main",
      repository: { nameWithOwner: CODE },
      commits: [{ oid: SHA, message: "Do " + taskId }],
      ...extra,
    };
    this.branchPulls.set("avoozl/" + taskId, [pull]);
    return pull;
  }
  merge(number, taskId) {
    const [pull] = this.branchPulls.get("avoozl/" + taskId);
    Object.assign(pull, {
      state: "MERGED",
      merged: true,
      mergedAt: "2026-11-12T10:04:00Z",
    });
    return pull;
  }
  // GitHub closes the planning issue through the linked branch (F51).
  closeByPull(number, taskId) {
    const pull = this.merge(number, taskId);
    this.closing.set(number, [structuredClone(pull)]);
    this.close(number);
    this.linked.set(number, []);
  }
  close(number, { actor = "maintainer", reason = "completed" } = {}) {
    const at = "2026-11-12T10:05:00Z";
    Object.assign(this.issues.get(number), {
      state: "closed",
      state_reason: reason,
      closed_at: at,
      updated_at: at,
    });
    this.events.set(number, [
      {
        event: "closed",
        actor: { login: actor },
        state_reason: reason,
        created_at: at,
      },
    ]);
  }
  issue(repository, number) {
    assert.equal(repository, PLANS);
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
    assert.deepEqual([repository, branch], [CODE, "main"]);
    return Promise.resolve({ repositoryId: "R_code", oid: BASE });
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
    return Promise.resolve(structuredClone(this.checks));
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
    const issue = this.issues.get(number);
    Object.assign(issue, input, { updated_at: "2026-11-12T12:00:00Z" });
    return Promise.resolve(structuredClone(issue));
  }
}

// Leaves a (issue 1) and b (issue 2) in the planning repository, coded in
// example/code; a-next (issue 3) requires a. Each summary names the plan,
// which a plans-repo brief must leave out.
function workspace(t, { runner = "tick", tasks = {} } = {}) {
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
  store.mutate("Seed plans-repo leaves", (data) => {
    const leaf = (id, number) => ({
      id,
      title: "Task " + id,
      summary: `Tracked in ${PLANS}#${number}`,
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
      ...(tasks[id] || {}),
    });
    data.tasks.push(leaf("a", 1), leaf("b", 2), leaf("a-next", 3));
    data.edges.push({
      id: "a:requires:a-next",
      from: "a",
      to: "a-next",
      kind: "requires",
    });
  });
  for (const [taskId, number] of [
    ["a", 1],
    ["b", 2],
    ["a-next", 3],
  ])
    github.open(number, taskId);
  const ops = new Operations(store, { github, workspaceRoot: root }),
    run = (sessions = []) => ops.execute("workspace.tick", { sessions }),
    task = (id) => store.read().tasks.find((item) => item.id === id),
    ready = () =>
      new Set(
        queryTasks(store.read(), { scope: "all", q: "ready:true" }).map(
          (item) => item.id,
        ),
      );
  return { store, github, ops, run, task, ready, checkout };
}

const leaked = (text) => findPlanningLeak([["text", text]], PLANS);
const briefOf = (result, id) =>
  result.dispatch.find((d) => d.task === id && d.role === "worker")?.brief;

test("the tick creates the linked branch before the brief, and the brief sends the worker to it", async (t) => {
  const { store, github, run } = workspace(t);
  const result = await run();
  // a and b are ready; a-next waits on a. Both branches are made from the
  // head of main in the code repository, linked to the planning issue.
  assert.deepEqual(
    github.created.map(({ issueId, repositoryId, oid, name }) => [
      issueId,
      repositoryId,
      oid,
      name,
    ]),
    [
      ["I_1", "R_code", BASE, "avoozl/a"],
      ["I_2", "R_code", BASE, "avoozl/b"],
    ],
  );
  assert.equal(store.get("github_linked_branches", "a").baseBranch, "main");
  const brief = briefOf(result, "a");
  assert.ok(brief, "a is dispatched in the same tick");
  for (const step of [
    /fetch origin avoozl\/a/,
    /git push origin HEAD:avoozl\/a/,
    /gh pr create --base main --head avoozl\/a/,
    /no closing keyword/,
    /gh pr merge --auto/,
    /Fix failing checks and answer review on that pull request until it merges/,
    /Acceptance: a works/,
  ])
    assert.match(brief, step);
  // The planning repository is in no form in the brief: the summary that
  // names it is left out, and so are the issue number and URL.
  assert.equal(leaked(brief), null);
  assert.doesNotMatch(brief, /Tracked in|issues\/1|#1\b/);
  assert.equal(briefOf(result, "a-next"), undefined);
  // Nothing on the code repository was written but the two branches.
  assert.deepEqual(github.updates, []);
});

test("an existing linked branch is reused, and a second tick creates nothing", async (t) => {
  const { store, github, run } = workspace(t);
  github.linked.set(1, [
    {
      id: "LB_old",
      name: "avoozl/a",
      repository: CODE,
      repositoryId: "R_code",
    },
  ]);
  await run();
  assert.deepEqual(
    github.created.map((input) => input.name),
    ["avoozl/b"],
  );
  assert.equal(store.get("github_linked_branches", "a").reused, true);
  assert.equal(
    store.get("github_linked_branches", "a").linkedBranchId,
    "LB_old",
  );
  const revision = store.read().revision;
  await run();
  assert.equal(github.created.length, 1);
  assert.equal(store.read().revision, revision);
});

test("a leaf whose own text names the planning repository is never dispatched", async (t) => {
  // Nearby inputs: the title in mixed case, an encoded acceptance, a check
  // with the name split across lines.
  const { store, github, run } = workspace(t, {
    tasks: {
      a: { title: "Port Example/Plans timers" },
      b: {
        acceptance: ["matches example%2Fplans"],
        checks: ["example/\nplans#2"],
      },
    },
  });
  const result = await run();
  assert.deepEqual(github.created, []);
  assert.equal(briefOf(result, "a"), undefined);
  assert.equal(briefOf(result, "b"), undefined);
  assert.match(
    store.get("github_linked_branches", "a").error,
    /names the planning repository/,
  );
  assert.equal(
    result.notify.filter(
      (n) => n.channel === "decision" && /cannot start/.test(n.title),
    ).length,
    2,
  );
  // The same cause is reported once.
  assert.equal((await run()).notify.length, 0);
});

test("a planted leak in a pull request title, body, or commit opens a decision and blocks completion until fixed", async (t) => {
  const planted = [
    ["title", { title: "Fix EXAMPLE/PLANS#1" }],
    ["body", { body: "Context: https://github.com/example/plans/issues/1" }],
    ["body", { body: "see example%2Fplans" }],
    ["body", { body: "see example/\nplans" }],
    ["commit", { commits: [{ oid: SHA, message: "Refs example/plans#1" }] }],
  ];
  for (const [field, extra] of planted) {
    const { github, run, task, ready, store } = workspace(t);
    await run();
    store.put("session_bindings", {
      id: "worker-a",
      slot: "worker-a",
      taskId: "a",
      role: "worker",
      attempt: 1,
      source: "tick",
      boundAt: new Date().toISOString(),
    });
    github.pull(1, "a", extra);
    // Open: the screen runs every tick for a dispatched leaf.
    let result = await run([{ target: "worker-a", status: "idle" }]);
    assert.equal(task("a").githubVerdict.state, "held", field);
    assert.equal(task("a").githubVerdict.leak, true);
    assert.match(task("a").githubVerdict.reason, new RegExp(field));
    assert.equal(task("a").decision, "github-completion:a");
    assert.ok(
      result.notify.some(
        (n) => n.channel === "decision" && /a needs a decision/.test(n.title),
      ),
    );
    const message = result.messages.find((m) => m.slot === "worker-a");
    assert.match(message.text, /names the planning repository/);
    assert.equal(leaked(message.text), null);
    // GitHub merges and closes the planning issue: still held.
    github.closeByPull(1, "a");
    result = await run([{ target: "worker-a", status: "idle" }]);
    assert.equal(task("a").githubVerdict.state, "held");
    assert.equal(ready().has("a-next"), false);
    assert.equal(briefOf(result, "a-next"), undefined);
    // The worker edits the text; the next tick completes and releases.
    const clean = {
      title: "Task a",
      body: "Task a works.",
      commits: [{ oid: SHA, message: "Do a" }],
    };
    Object.assign(github.branchPulls.get("avoozl/a")[0], clean);
    Object.assign(github.closing.get(1)[0], clean);
    result = await run([{ target: "worker-a", status: "idle" }]);
    assert.equal(task("a").githubVerdict.state, "verified", field);
    assert.equal(task("a").decision, null);
    assert.ok(briefOf(result, "a-next"), "a-next starts in the same tick");
  }
});

test("GitHub's close through the linked branch completes the leaf and releases its dependent in the same tick; Avoozl closes nothing", async (t) => {
  const { store, github, run, task } = workspace(t);
  await run();
  github.pull(1, "a");
  github.closeByPull(1, "a");
  const result = await run();
  assert.equal(task("a").githubVerdict.state, "verified");
  assert.equal(task("a").githubVerdict.headSha, SHA);
  // a-next's branch is made and its brief sent in the tick that saw the close.
  assert.deepEqual(
    github.created.map((input) => input.name),
    ["avoozl/a", "avoozl/b", "avoozl/a-next"],
  );
  assert.ok(briefOf(result, "a-next"));
  // No issue state, Status, or code-repository write.
  assert.deepEqual(github.updates, []);
  assert.equal(store.get("receipts", "github-order:a"), null);
});

test("a merged, passing pull request whose planning issue stayed open opens a decision", async (t) => {
  const { github, run, task, ready } = workspace(t);
  await run();
  github.pull(1, "a");
  github.merge(1, "a");
  const result = await run();
  assert.equal(task("a").githubVerdict.state, "held");
  assert.match(
    task("a").githubVerdict.reason,
    /merged and passed, but issue #1 is still open/,
  );
  assert.ok(result.notify.some((n) => /a needs a decision/.test(n.title)));
  assert.equal(ready().has("a-next"), false);
  assert.deepEqual(github.updates, []);
});

test("a planning issue closed without code follows 3.11: an allowed closer releases with a plain note, any other holds", async (t) => {
  const { github, run, task, ready } = workspace(t);
  await run();
  github.close(1, { reason: "not_planned" });
  github.close(2, { actor: "intruder" });
  const result = await run();
  assert.equal(task("a").githubVerdict.state, "order");
  const brief = briefOf(result, "a-next");
  assert.match(
    brief,
    /Blocker a "Task a" closed without merged code: maintainer/,
  );
  assert.equal(leaked(brief), null);
  assert.doesNotMatch(brief, /issues\//);
  assert.equal(task("b").githubVerdict.state, "held");
  assert.equal(ready().has("a-next"), true);
  // Only the marker order was written; nothing was reopened.
  assert.deepEqual(
    github.updates.map(([number, input]) => [number, Object.keys(input)]),
    [[1, ["body"]]],
  );
});

test("a plans-repo worker's done report starts no verifier", async (t) => {
  const { ops, run, checkout } = workspace(t);
  execFileSync("git", ["init", "-q", "-b", "main", checkout]);
  execFileSync("git", [
    "-C",
    checkout,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.test",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "Merge",
  ]);
  const merged = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  await run();
  await ops.execute("session.bind", {
    taskId: "a",
    slot: "worker-a",
    attempt: 1,
    source: "tick",
    title: "avoozl:a Task a",
  });
  await ops.execute(
    "session.report",
    { taskId: "a", kind: "done", commit: merged },
    undefined,
    { caller: { sessionKey: "dashboard:worker-a" } },
  );
  const result = await run([{ target: "worker-a", status: "idle" }]);
  assert.equal(result.dispatch.filter((d) => d.role === "verifier").length, 0);
});

test("a Crew Mode conductor sees a plans-repo leaf ready only once its branch exists, and claims it without a worktree", async (t) => {
  const { ops, run, checkout } = workspace(t, { runner: "crew-mode" });
  let view = await ops.execute("runner.next", {});
  assert.deepEqual(
    view.waiting
      .filter((row) => ["a", "b"].includes(row.id))
      .map((row) => row.reason),
    ["linked branch", "linked branch"],
  );
  const result = await run();
  assert.equal(
    result.dispatch.length,
    0,
    "the conductor opens sessions, not the tick",
  );
  view = await ops.execute("runner.next", {});
  const a = view.ready.find((row) => row.id === "a");
  assert.match(a.brief, /fetch origin avoozl\/a/);
  assert.equal(leaked(a.brief), null);
  const claim = await ops.execute(
    "runner.claim",
    { taskId: "a", slot: "worker-a" },
    undefined,
    { caller: { sessionKey: "dashboard:conductor" } },
  );
  assert.deepEqual(claim.linkedBranch, {
    name: "avoozl/a",
    baseBranch: "main",
  });
  assert.equal(claim.worktree, undefined);
  assert.deepEqual(
    fs
      .readdirSync(path.dirname(checkout))
      .filter((n) => n === ".avoozl-worktrees"),
    [],
  );
});
