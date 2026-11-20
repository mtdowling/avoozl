// The phase and branch stages of plugin checks (plugin-checks pk-2.1,
// pk-2.2, D7) and results never posted to GitHub (pk-1.5, D8). Real git;
// landings are recorded on the tasks as landing does.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  phaseNeedsYou,
  queuePhaseChecks,
  stageResults,
} from "../check-stages.mjs";
import { checkRuns, drainCheckRuns } from "../../delivery/check-runs.mjs";
import { selectedChecks } from "../../workspace/repository-checks.mjs";
import { headStep, integrationView } from "../../epics/integration-head.mjs";
import { git, leaf } from "../../test/delivery-fixture.mjs";
import { pluginWorkspace } from "../../test/plugin-checks-fixture.mjs";
import { approvedPluginChecks } from "../plugin-checks.mjs";

const phase = { id: "p1", title: "Phase 1" };
// Only parity, at `stage`, without its decide prompt unless asked.
const stageWorkspace = (t, stage, { decide = false, tasks } = {}) =>
  pluginWorkspace(t, {
    edit: (m) => {
      delete m.checks["parity-review"];
      delete m.servers;
      m.checks.parity.stage = stage;
      if (!decide) {
        delete m.checks.parity.decide;
        delete m.checks.parity.decideAt;
      }
    },
    tasks: tasks ?? [
      leaf("a", { planId: "plan", phase }),
      leaf("b", { planId: "plan", phase }),
    ],
  });

// Commit `files` on main and record it as task `id`'s landing.
function land(workspace, id, files, at) {
  const checkout = workspace.checkout;
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(checkout, file)), { recursive: true });
    fs.writeFileSync(path.join(checkout, file), text);
  }
  git(checkout, "add", "-A");
  git(checkout, "commit", "-qm", `Land ${id}`);
  const commit = git(checkout, "rev-parse", "HEAD");
  workspace.store.mutate("land", (data) => {
    data.tasks.find((t) => t.id === id).integration = {
      commit,
      into: "main",
      at,
    };
  });
  return commit;
}

test("pk-2.1: a two-task phase runs its phase check once, after both landed, from before the first", async (t) => {
  const workspace = stageWorkspace(t, "phase"),
    { store } = workspace,
    start = git(workspace.checkout, "rev-parse", "HEAD"),
    plugins = approvedPluginChecks(workspace.options);
  // No task waits on it: a task's run selects no phase check.
  assert.deepEqual(
    selectedChecks(store.get("repositories", "app"), null, plugins).map(
      (c) => c.name,
    ),
    ["git status"],
  );
  land(workspace, "a", { "src/api/a.js": "a\n" }, "2026-11-19T01:00:00Z");
  assert.deepEqual(queuePhaseChecks(store), [], "one task still to land");
  const last = land(
    workspace,
    "b",
    { "schema/api.json": "{}\n" },
    "2026-11-19T02:00:00Z",
  );
  const [queued] = queuePhaseChecks(store);
  assert.deepEqual(
    [queued.commit, queued.scope.kind, queued.scope.tasks],
    [last, "phase", ["a", "b"]],
  );
  assert.deepEqual(queuePhaseChecks(store), [], "once per last landing");
  await drainCheckRuns(store);
  const [run] = checkRuns(store),
    parity = run.checks.find((c) => c.name === "parity");
  assert.equal(run.state, "finished");
  assert.match(parity.tail, new RegExp(`from=${start} to=${last}`));
  assert.equal(parity.exitCode, 1, "the phase changed the schema");
  assert.deepEqual(run.selected, ["parity"], "only plugin checks of the stage");
  // One Needs you row, with the proposed fix as untrusted text.
  const rows = phaseNeedsYou(store);
  assert.equal(rows.length, 1);
  assert.match(rows[0].title, /Phase Phase 1 failed plugin check parity/);
  assert.match(rows[0].phaseFix.text, /```untrusted\n[\s\S]*schema changed/);
  assert.equal(
    stageResults(store).phases["plan:p1"].checks[0].result,
    "failed",
  );
  // Start makes the fix in that phase; its landing runs the check again.
  const started = await workspace.ops.execute("check.phase.fix", {
    run: rows[0].phaseFix.run,
  });
  const fix = store.read().tasks.find((task) => task.id === started.taskId);
  assert.deepEqual(fix.fixFor.plan, "plan");
  assert.deepEqual(fix.phase.id, "p1");
  assert.deepEqual(phaseNeedsYou(store), [], "started once");
  fs.rmSync(path.join(workspace.checkout, "schema"), { recursive: true });
  land(workspace, fix.id, {}, "2026-11-19T03:00:00Z");
  const [again] = queuePhaseChecks(store);
  assert.equal(again.scope.tasks.at(-1), fix.id);
  await drainCheckRuns(store);
  const rerun = checkRuns(store).find((r) => r.id === again.id);
  assert.equal(rerun.checks[0].exitCode, 0, rerun.checks[0].tail);
});

test("pk-2.1: a phase whose combined diff misses the paths runs nothing; decide applies when either task had true", async (t) => {
  const quiet = stageWorkspace(t, "phase");
  land(quiet, "a", { "docs/a.md": "a\n" }, "2026-11-19T01:00:00Z");
  land(quiet, "b", { "docs/b.md": "b\n" }, "2026-11-19T02:00:00Z");
  queuePhaseChecks(quiet.store);
  await drainCheckRuns(quiet.store);
  const [run] = checkRuns(quiet.store);
  assert.deepEqual(run.checks, []);
  assert.deepEqual(
    run.skipped.map((s) => s.filter),
    ["paths"],
  );

  const decided = stageWorkspace(t, "phase", { decide: true }),
    check = decided.check("parity");
  for (const [id, needed] of [
    ["a", false],
    ["b", true],
  ])
    decided.store.put("flow_records", {
      id: `check-decide:${id}:acme-checks:parity:approve`,
      kind: "check-decide",
      taskId: id,
      check: "parity",
      plugin: "acme-checks",
      at: "approve",
      state: "done",
      needed,
      reason: needed ? "It changes the API." : "Docs only.",
    });
  assert.ok(check.decide);
  land(decided, "a", { "src/api/a.js": "a\n" }, "2026-11-19T01:00:00Z");
  land(decided, "b", { "src/api/b.js": "b\n" }, "2026-11-19T02:00:00Z");
  queuePhaseChecks(decided.store);
  await drainCheckRuns(decided.store);
  const [ran] = checkRuns(decided.store);
  assert.deepEqual(ran.selected, ["parity"]);
});

test("pk-2.2: each new branch head queues one branch run; pending holds it, a failure reds it, a pass with CI greens it", async (t) => {
  const workspace = stageWorkspace(t, "branch", {
      tasks: [leaf("a", { planId: "rewrite" })],
    }),
    { store } = workspace,
    checkout = workspace.checkout;
  store.put("plans", { id: "rewrite", spec: "rewrite", state: "approved" });
  git(checkout, "checkout", "-qb", "rewrite/x");
  fs.mkdirSync(path.join(checkout, "src", "api"), { recursive: true });
  fs.writeFileSync(path.join(checkout, "src", "api", "x.js"), "x\n");
  git(checkout, "add", "-A");
  git(checkout, "commit", "-qm", "Branch work");
  const green = git(checkout, "rev-parse", "HEAD");
  fs.mkdirSync(path.join(checkout, "schema"));
  fs.writeFileSync(path.join(checkout, "schema", "a.json"), "{}\n");
  git(checkout, "add", "-A");
  git(checkout, "commit", "-qm", "Schema");
  const red = git(checkout, "rev-parse", "HEAD");
  git(checkout, "checkout", "-q", "main");
  const remote = { head: green },
    writes = [],
    github = new Proxy(
      {
        available: () => true,
        repository: async () => ({ default_branch: "main" }),
        branch: async () => ({ commit: { sha: remote.head } }),
        checkRuns: async () => [
          { name: "build", status: "completed", conclusion: "success" },
        ],
        commitStatus: async () => ({ statuses: [] }),
        compareCommits: async () => ({ ahead_by: 0 }),
      },
      {
        get: (target, name) =>
          target[name] ??
          ((...args) => {
            writes.push([name, ...args]);
            return Promise.resolve(null);
          }),
      },
    ),
    policy = {
      mode: "single-repo",
      repositories: {
        "acme/api": { baseBranch: "main", requiredChecks: ["build"] },
      },
    },
    targets = [
      { spec: "rewrite", repository: "acme/api", branch: "rewrite/x" },
    ],
    step = () => headStep(store, github, targets, { policy }),
    state = () => integrationView(store).branches[0].checks;
  await step();
  assert.equal(state(), "pending", "the branch run has not run");
  await step();
  assert.equal(
    checkRuns(store).filter((r) => r.scope?.kind === "branch").length,
    1,
    "one run per head",
  );
  await drainCheckRuns(store);
  await step();
  assert.equal(state(), "green");
  remote.head = red;
  await step();
  await drainCheckRuns(store);
  await step();
  assert.equal(state(), "red");
  assert.ok(
    stageResults(store).branches["acme/api@rewrite/x"].checks.some(
      (c) => c.name === "parity" && c.result === "failed",
    ),
  );
  // Nothing about the check reached GitHub.
  assert.deepEqual(writes, []);
});

test("pk-1.5: run, MCP, phase and branch plugin checks write nothing to GitHub", async (t) => {
  const calls = [],
    recording = new Proxy(
      {},
      {
        get: (_target, name) =>
          name === "then"
            ? undefined
            : (...args) => {
                calls.push([String(name), JSON.stringify(args)]);
                return Promise.resolve(null);
              },
      },
    );
  const workspace = pluginWorkspace(t, {
      edit: (m) => {
        m.checks.parity.stage = "phase";
        delete m.checks.parity.decide;
        delete m.checks.parity.decideAt;
        m.checks["parity-review"].stage = "task";
      },
      tasks: [leaf("a", { planId: "plan", phase })],
    }),
    { store } = workspace;
  // The check runner is never handed a GitHub client: its options have
  // no place for one, and it runs with a recording one bound nowhere.
  land(workspace, "a", { "src/api/a.js": "a\n" }, "2026-11-19T01:00:00Z");
  queuePhaseChecks(store);
  await drainCheckRuns(store, { github: recording });
  assert.equal(checkRuns(store)[0].state, "finished");
  assert.deepEqual(calls, []);
});
