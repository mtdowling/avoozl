// 56.5: ordered task-issue binding retirement (R102.20, §4.32.13). Fake
// GitHub and an isolated temporary workspace only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { queryTasks } from "../../model.mjs";
import { readyCandidates } from "../delivery.mjs";
import { Operations } from "../operations.mjs";
import { linePausedTaskIds } from "../flow.mjs";
import { renderMarker } from "../github-marker.mjs";
import {
  projectPlanIssues,
  refreshProjectedReadiness,
} from "../github-projection.mjs";
import { rebuildFromGitHub } from "../github-rebuild.mjs";
import { machineIdentity } from "../github-sync.mjs";
import {
  applyRetirement,
  closeRetiredIssues,
  holdRetirement,
  previewRetirement,
  retirementOf,
  verifyRetirement,
} from "../task-issue-retirement.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const NAMESPACE = "avz_0123456789abcdef",
  REPO = "example/code",
  hash = "b".repeat(64);

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
    this.updates = [];
    this.readNumbers = [];
    this.created = [];
  }
  available() {
    return true;
  }
  issuesUpdatedSince() {
    return Promise.resolve(new Set());
  }
  open(number, taskId) {
    this.issues.set(number, {
      number,
      state: "open",
      state_reason: null,
      body: marker(taskId) + "\nBody",
      html_url: `https://example.test/${REPO}/issues/${number}`,
    });
  }
  close(number, reason) {
    Object.assign(this.issues.get(number), {
      state: "closed",
      state_reason: reason,
    });
  }
  issue(_repository, number) {
    this.readNumbers.push(number);
    return Promise.resolve(structuredClone(this.issues.get(number)));
  }
  closingPullRequests() {
    return Promise.resolve([]);
  }
  issueEvents() {
    return Promise.resolve([]);
  }
  issueTimeline() {
    return Promise.resolve([]);
  }
  permission() {
    return Promise.resolve({ permission: "write" });
  }
  createIssue(repository, input) {
    this.created.push([repository, input]);
    return Promise.resolve({ number: 99, ...input });
  }
  updateIssue(_repository, number, input) {
    this.updates.push([number, input]);
    Object.assign(this.issues.get(number), input);
    return Promise.resolve(structuredClone(this.issues.get(number)));
  }
}

// Leaves a (#1) and b (#2), each with a dependent; package parent (#20)
// holds a; the plan's spec issue (#30) and an intake task's input issue
// (#40) are not task projections.
function workspace(t) {
  const { store } = fixture(t),
    root = temporaryDirectory(),
    github = new FakeGitHub();
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
          },
        },
      },
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
  const binding = (number, origin = "design") => ({
    github: {
      repository: REPO,
      number,
      nodeId: "I_" + number,
      url: `https://example.test/${REPO}/issues/${number}`,
      origin,
    },
  });
  store.mutate("Seed GitHub leaves", (data) => {
    const leaf = (id, extra = {}) => ({
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
      approvedSource: { hash: "h-" + id, text: id },
      ...extra,
    });
    data.tasks.push(
      leaf("parent", {
        ...binding(20),
        kind: "package",
        acceptance: undefined,
      }),
      leaf("a", {
        ...binding(1),
        parent: "parent",
        dispatch: { ready: true, state: "authorized" },
        githubVerdict: { state: "open", key: "k1" },
      }),
      leaf("b", {
        ...binding(2),
        dispatch: { ready: true, state: "authorized" },
      }),
      leaf("a-next"),
      leaf("b-next"),
      leaf("intake", {
        ...binding(40, "issue"),
        dispatch: { ready: true, state: "authorized" },
      }),
    );
    for (const id of ["a", "b"])
      data.edges.push({
        id: `${id}:requires:${id}-next`,
        from: id,
        to: id + "-next",
        kind: "requires",
      });
  });
  store.put("github_issues", {
    id: `github:${REPO}:I_1`,
    repository: REPO,
    taskId: "a",
    number: 1,
    projectedPlanId: "sample-plan",
  });
  store.put("receipts", {
    id: "github-parent:plan:sample-plan",
    kind: "github-parent",
    level: "plan",
    planId: "sample-plan",
    repository: REPO,
    number: 30,
  });
  store.put("receipts", {
    id: "github-order:b",
    taskId: "b",
    repository: REPO,
    number: 2,
  });
  for (const [number, taskId] of [
    [1, "a"],
    [2, "b"],
    [20, "parent"],
    [30, "plan"],
    [40, "intake"],
  ])
    github.open(number, taskId);
  const tickWith = (client) =>
      new Operations(store, { github: client, workspaceRoot: root }).execute(
        "workspace.tick",
        { sessions: [] },
      ),
    task = (id) => store.read().tasks.find((item) => item.id === id),
    ready = () =>
      queryTasks(store.read(), { scope: "all", q: "ready:true" })
        .map((item) => item.id)
        .sort(),
    statuses = () =>
      Object.fromEntries(store.read().tasks.map((x) => [x.id, x.status]));
  return { store, github, tickWith, task, ready, statuses };
}

test("retirement runs in order: hold, apply, one verifying tick, then close", async (t) => {
  const { store, github, tickWith, task, ready, statuses } = workspace(t);
  const readyBefore = ready(),
    statusesBefore = statuses();
  assert.deepEqual(readyBefore, ["a", "b", "intake", "sample-task"]);

  // Nothing applies, verifies or closes before its step.
  assert.throws(() => applyRetirement(store), /Hold the workspace first/);
  await assert.rejects(
    closeRetiredIssues(store, { github }),
    /only after the verifying tick/,
  );

  const preview = previewRetirement(store);
  assert.deepEqual(preview.bindings.map((b) => [b.taskId, b.number]).sort(), [
    ["a", 1],
    ["b", 2],
    ["parent", 20],
  ]);
  assert.deepEqual(preview.changed, []);
  assert.deepEqual(preview.kept, [
    { level: "plan", repository: REPO, number: 30 },
  ]);
  // A preview writes nothing.
  assert.equal(retirementOf(store), null);

  holdRetirement(store, { actor: "owner" });
  assert.equal(retirementOf(store).state, "held");
  assert.equal(linePausedTaskIds(store).size, store.read().tasks.length);
  await assert.rejects(
    verifyRetirement(store, { github, runTick: tickWith }),
    /Apply the retirement/,
  );

  applyRetirement(store);
  assert.equal(retirementOf(store).state, "retired");
  for (const id of ["a", "b", "parent"]) {
    assert.equal(task(id).github, undefined, id);
    assert.equal(task(id).githubVerdict, undefined, id);
    assert.equal(task(id).dispatch, undefined, id);
  }
  // The intake task's input issue is not a projection; it keeps its link.
  assert.equal(task("intake").github.number, 40);
  assert.deepEqual(statuses(), statusesBefore);
  assert.deepEqual(ready(), readyBefore);
  assert.equal(task("a").approvedSource.hash, "h-a");
  assert.equal(store.get("github_issues", `github:${REPO}:I_1`), null);
  assert.equal(store.get("receipts", "github-order:b"), null);
  assert.ok(store.get("receipts", "github-parent:plan:sample-plan"));

  // A retry changes nothing.
  const revision = store.read().revision;
  applyRetirement(store);
  holdRetirement(store);
  assert.equal(store.read().revision, revision);
  assert.equal(retirementOf(store).state, "retired");

  const verified = await verifyRetirement(store, {
    github,
    runTick: tickWith,
  });
  assert.equal(verified.state, "verified", JSON.stringify(verified.failure));
  for (const number of [1, 2, 20])
    assert.equal(github.readNumbers.includes(number), false, `#${number}`);
  assert.deepEqual(github.created, []);
  assert.deepEqual(github.updates, []);
  assert.deepEqual(ready(), readyBefore);
  assert.equal(linePausedTaskIds(store).size, 0);

  // Only now may obsolete task issues close; the spec issue stays open.
  const closed = await closeRetiredIssues(store, { github });
  assert.equal(closed.state, "closed");
  assert.deepEqual(
    github.updates.map(([number, input]) => [number, input.state_reason]),
    [
      [20, "not_planned"],
      [1, "not_planned"],
      [2, "not_planned"],
    ],
  );
  assert.equal(github.issues.get(30).state, "open");
  assert.equal(github.issues.get(40).state, "open");
  const writes = github.updates.length;
  await closeRetiredIssues(store, { github });
  assert.equal(github.updates.length, writes);
});

test("closing retired issues as done or not planned releases no successor", async (t) => {
  const { store, github, tickWith, task, ready, statuses } = workspace(t);
  const readyBefore = ready(),
    statusesBefore = statuses();
  holdRetirement(store);
  applyRetirement(store);
  await verifyRetirement(store, { github, runTick: tickWith });
  // A person closes the old issues by hand; the tick reads neither.
  github.close(1, "completed");
  github.close(2, "not_planned");
  await tickWith(github);
  await tickWith(github);
  assert.deepEqual(ready(), readyBefore);
  assert.deepEqual(statuses(), statusesBefore);
  assert.equal(task("a").githubVerdict, undefined);
  assert.equal(ready().includes("a-next"), false);
  assert.equal(ready().includes("b-next"), false);
  // The close step keeps a person's close reason and closes the rest.
  const result = await closeRetiredIssues(store, {
    github,
    reason: "completed",
  });
  assert.equal(result.closed[`${REPO}#1`].reason, "completed");
  assert.equal(result.closed[`${REPO}#2`].reason, "not_planned");
  assert.deepEqual(github.updates, [
    [20, { state: "closed", state_reason: "completed" }],
  ]);
  await tickWith(github);
  assert.deepEqual(ready(), readyBefore);
  assert.deepEqual(statuses(), statusesBefore);
});

test("a migration that would change readiness, or stops part way, stays held", async (t) => {
  const { store, github, tickWith, task } = workspace(t);
  // b is held only by its projection's dispatch flag: retiring that flag
  // would make it ready, so apply refuses and nothing moves.
  store.mutate("Hold b on GitHub", (data) => {
    data.tasks.find((x) => x.id === "b").dispatch.ready = false;
  });
  assert.deepEqual(previewRetirement(store).changed, ["b"]);
  holdRetirement(store);
  assert.throws(
    () => applyRetirement(store),
    /would change which tasks are ready: b/,
  );
  assert.equal(retirementOf(store).state, "held");
  assert.equal(task("b").github.number, 2);
  assert.equal(task("a").github.number, 1);
  assert.equal(linePausedTaskIds(store).size, store.read().tasks.length);

  // Settled, it applies. Stopped before its verifying tick, it is held:
  // no release, no projection, no recreation, no rebuild.
  store.mutate("Settle b", (data) => {
    data.tasks.find((x) => x.id === "b").dispatch.ready = true;
  });
  applyRetirement(store);
  assert.equal(linePausedTaskIds(store).size, store.read().tasks.length);
  assert.deepEqual(
    await refreshProjectedReadiness(store, null, {
      identity: {},
      forcePlans: new Set(["sample-plan"]),
    }),
    { projected: [], errors: [] },
  );
  const projection = await projectPlanIssues(store, null, {
    planId: "sample-plan",
  });
  assert.equal(projection.retired, true);
  assert.deepEqual(projection.issues, []);
  await assert.rejects(rebuildFromGitHub(store, null, {}), /retired/);

  // A verifying tick that saw a change keeps it held and says what moved;
  // a clean retry then passes.
  const failed = await verifyRetirement(store, {
    github,
    runTick: async (client) => {
      await client.issue(REPO, 1);
      store.mutate("Status moved", (data) => {
        data.tasks.find((x) => x.id === "a").status = "blocked";
      });
    },
  });
  assert.equal(failed.state, "retired");
  assert.deepEqual(failed.failure.statusChanged, ["a"]);
  assert.deepEqual(failed.failure.readyChanged, ["a"]);
  assert.deepEqual(failed.failure.touched, [
    { call: "issue", repository: REPO, number: 1 },
  ]);
  assert.equal(linePausedTaskIds(store).size, store.read().tasks.length);
  store.mutate("Status back", (data) => {
    data.tasks.find((x) => x.id === "a").status = "planned";
  });
  const passed = await verifyRetirement(store, { github, runTick: tickWith });
  assert.equal(passed.state, "verified");
  assert.equal(passed.failure, undefined);
});

test("a task held by its plan's release policy is not a readiness change", async (t) => {
  const { store, github, tickWith, ready } = workspace(t);
  // b is the first task of its chain; the graph allows it, but its plan's
  // release policy gave it no ready label.
  store.mutate("Hold b by release policy", (data) => {
    Object.assign(
      data.tasks.find((x) => x.id === "b"),
      {
        planId: "held-plan",
        dispatch: { ready: false, graphReady: true, state: "blocked" },
      },
    );
  });
  const policy = (release) =>
    store.setMeta("releaseFingerprint", {
      "held-plan": JSON.stringify({ release, publicHold: false, steps: [] }),
    });
  // A policy that would release b: retiring the flag truly changes it.
  policy({ capacity: 2, mode: "automatic" });
  assert.deepEqual(previewRetirement(store).changed, ["b"]);

  policy({ capacity: 0, mode: "hold" });
  const readyBefore = ready();
  assert.equal(readyBefore.includes("b"), false);
  assert.deepEqual(previewRetirement(store).changed, []);
  holdRetirement(store);
  assert.equal(applyRetirement(store).state, "retired");
  const verified = await verifyRetirement(store, {
    github,
    runTick: tickWith,
  });
  assert.equal(verified.state, "verified", JSON.stringify(verified.failure));
  // Released from the hold, nothing starts b.
  assert.equal(
    readyCandidates(store).some((task) => task.id === "b"),
    false,
  );
});

test("ticks stop from the hold until the verifying tick, which runs once", async (t) => {
  const { store, github, tickWith } = workspace(t);
  holdRetirement(store);
  assert.deepEqual(await tickWith(github), { skipped: "retirement" });
  applyRetirement(store);
  assert.deepEqual(await tickWith(github), { skipped: "retirement" });
  let ran = null;
  await verifyRetirement(store, {
    github,
    runTick: async (client) => {
      ran = await tickWith(client);
    },
  });
  assert.equal(ran?.skipped, undefined);
  assert.equal(retirementOf(store).state, "verified");
  assert.equal((await tickWith(github)).skipped, undefined);
  // A tick that throws during verify leaves the workspace held.
  const { store: other, github: client, tickWith: tick } = workspace(t);
  holdRetirement(other);
  applyRetirement(other);
  await assert.rejects(
    verifyRetirement(other, {
      github: client,
      runTick: () => Promise.reject(Error("crashed")),
    }),
    /crashed/,
  );
  assert.equal(retirementOf(other).state, "retired");
  assert.deepEqual(await tick(client), { skipped: "retirement" });
});

test("the CLI maps retire-issues steps and refuses them in an agent session", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { initializeWorkspace } = await import("../workspace.mjs");
  const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url)),
    root = temporaryDirectory("avoozl-retire-cli-");
  initializeWorkspace(root, { name: "t" });
  const run = (args) =>
    spawnSync(process.execPath, [cli, ...args, "--workspace", root], {
      encoding: "utf8",
      env: { ...process.env, KIROCREW_SPAWNED: "", KIRO_SESSION_ID: "s1" },
    });
  const bad = run(["github", "retire-issues", "nope"]);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /preview, hold, apply, verify, or close/);
  for (const step of ["preview", "hold", "apply", "verify", "close"]) {
    const refused = run(["github", "retire-issues", step]);
    assert.notEqual(refused.status, 0, step);
    assert.match(refused.stderr, /agent session/, step);
  }
});

test("github.retireTaskIssues runs every step for a person and refuses agents", async (t) => {
  const { store, github, ready } = workspace(t);
  const root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, namespace: NAMESPACE }),
  );
  const ops = new Operations(store, { github, workspaceRoot: root }),
    client = ops.github,
    before = ready();
  await assert.rejects(
    ops.execute("github.retireTaskIssues", { step: "hold" }, undefined, {
      mcp: true,
    }),
    /Only a person/,
  );
  assert.equal(retirementOf(store), null);
  const preview = await ops.execute("github.retireTaskIssues", {});
  assert.equal(preview.bindings.length, 3);
  for (const step of ["hold", "apply"])
    await ops.execute("github.retireTaskIssues", { step });
  const verified = await ops.execute("github.retireTaskIssues", {
    step: "verify",
  });
  assert.equal(verified.state, "verified", JSON.stringify(verified.failure));
  assert.equal(ops.github, client);
  assert.deepEqual(ready(), before);
  const closed = await ops.execute("github.retireTaskIssues", {
    step: "close",
  });
  assert.equal(closed.state, "closed");
  await assert.rejects(
    ops.execute("github.retireTaskIssues", { step: "nope" }),
    /Choose preview/,
  );
});
