// The phase and branch stages of plugin checks (plugin-checks pk-2.1,
// pk-2.2, D7) and results never posted to GitHub (pk-1.5, D8). Real git;
// landings are recorded on the tasks as landing does.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  phaseNeedsYou,
  queuePhaseChecks,
  stageResults,
} from "../check-stages.ts";
import {
  checkRuns,
  drainCheckRuns,
  type DrainOptions,
} from "../../delivery/check-runs.ts";
import { selectedChecks } from "../../workspace/repository-checks.ts";
import { headStep, integrationView } from "../../epics/integration-head.ts";
import { git, leaf } from "../../test/delivery-fixture.ts";
import { pluginWorkspace } from "../../test/plugin-checks-fixture.ts";
import { approvedPluginChecks } from "../plugin-checks.ts";
import { found, storedRow } from "../../test/view-shapes.ts";

const phase = { id: "p1", title: "Phase 1" };
// Only parity, at `stage`, without its decide prompt unless asked.
const stageWorkspace = (
  t: TestContext,
  stage: string,
  {
    decide = false,
    tasks,
  }: { decide?: boolean; tasks?: ReturnType<typeof leaf>[] } = {},
) =>
  pluginWorkspace(t, {
    edit: (m) => {
      delete m.checks["parity-review"];
      delete m.servers;
      const parity = found(m.checks.parity);
      parity.stage = stage;
      if (!decide) {
        delete parity.decide;
        delete parity.decideAt;
      }
    },
    tasks: tasks ?? [
      leaf("a", { planId: "plan", phase }),
      leaf("b", { planId: "plan", phase }),
    ],
  });

// Commit `files` on main and record it as task `id`'s landing.
function land(
  workspace: ReturnType<typeof pluginWorkspace>,
  id: string,
  files: Record<string, string>,
  at: string,
) {
  const checkout = workspace.checkout;
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(checkout, file)), { recursive: true });
    fs.writeFileSync(path.join(checkout, file), text);
  }
  git(checkout, "add", "-A");
  git(checkout, "commit", "-qm", `Land ${id}`);
  const commit = git(checkout, "rev-parse", "HEAD");
  workspace.store.mutate("land", (data) => {
    found(data.tasks.find((t) => t.id === id)).integration = {
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
    selectedChecks(storedRow(store, "repositories", "app"), null, plugins).map(
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
  const queued = found(queuePhaseChecks(store)[0]);
  assert.deepEqual(
    [queued.commit, queued.scope?.kind, queued.scope?.tasks],
    [last, "phase", ["a", "b"]],
  );
  assert.deepEqual(queuePhaseChecks(store), [], "once per last landing");
  await drainCheckRuns(store);
  const run = found(checkRuns(store)[0]),
    parity = found(run.checks?.find((c) => c.name === "parity"));
  assert.equal(run.state, "finished");
  assert.match(parity.tail ?? "", new RegExp(`from=${start} to=${last}`));
  assert.equal(parity.exitCode, 1, "the phase changed the schema");
  assert.deepEqual(run.selected, ["parity"], "only plugin checks of the stage");
  // One Needs you row, with the proposed fix as untrusted text.
  const rows = phaseNeedsYou(store);
  assert.equal(rows.length, 1);
  assert.match(
    found(rows[0]).title,
    /Phase Phase 1 failed plugin check parity/,
  );
  assert.match(
    found(rows[0]).phaseFix.text,
    /```untrusted\n[\s\S]*schema changed/,
  );
  assert.equal(
    stageResults(store).phases["plan:p1"]?.checks[0]?.result,
    "failed",
  );
  // A later task in that phase lands the fix; its landing runs the check again.
  store.mutate("add c", (data) => {
    data.tasks.push(leaf("c", { planId: "plan", phase }));
  });
  fs.rmSync(path.join(workspace.checkout, "schema"), { recursive: true });
  land(workspace, "c", {}, "2026-11-19T03:00:00Z");
  const again = found(queuePhaseChecks(store)[0]);
  assert.equal(again.scope?.tasks?.at(-1), "c");
  await drainCheckRuns(store);
  const rerun = found(checkRuns(store).find((r) => r.id === again.id)),
    check = found(rerun.checks?.[0]);
  assert.equal(check.exitCode, 0, check.tail);
});

test("pk-2.1: a phase whose combined diff misses the paths runs nothing; decide applies when either task had true", async (t) => {
  const quiet = stageWorkspace(t, "phase");
  land(quiet, "a", { "docs/a.md": "a\n" }, "2026-11-19T01:00:00Z");
  land(quiet, "b", { "docs/b.md": "b\n" }, "2026-11-19T02:00:00Z");
  queuePhaseChecks(quiet.store);
  await drainCheckRuns(quiet.store);
  const run = found(checkRuns(quiet.store)[0]);
  assert.deepEqual(run.checks, []);
  assert.deepEqual(
    run.skipped?.map((s) => s.filter),
    ["paths"],
  );

  const decided = stageWorkspace(t, "phase", { decide: true }),
    check = found(decided.check("parity")),
    answers: [string, boolean][] = [
      ["a", false],
      ["b", true],
    ];
  for (const [id, needed] of answers)
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
  assert.deepEqual(checkRuns(decided.store)[0]?.selected, ["parity"]);
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
    writes: unknown[][] = [],
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
        get: (target, name) => {
          const read: unknown = Reflect.get(target, name);
          return (
            read ??
            ((...args: unknown[]) => {
              writes.push([name, ...args]);
              return Promise.resolve(null);
            })
          );
        },
      },
    ),
    policy = {
      mode: "single-repo",
      repositories: {
        "acme/api": { baseBranch: "main", requiredChecks: ["build"] },
      },
    },
    targets = [
      {
        spec: "rewrite",
        repository: "acme/api",
        branch: "rewrite/x",
        sync: "weekly",
      },
    ],
    step = () => headStep(store, github, targets, { policy }),
    state = () => integrationView(store).branches[0]?.checks;
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
    stageResults(store).branches["acme/api@rewrite/x"]?.checks.some(
      (c) => c.name === "parity" && c.result === "failed",
    ),
  );
  // Nothing about the check reached GitHub.
  assert.deepEqual(writes, []);
});

test("pk-1.5: run, MCP, phase and branch plugin checks write nothing to GitHub", async (t) => {
  const calls: string[][] = [],
    recording = new Proxy(
      {},
      {
        get: (_target, name) =>
          name === "then"
            ? undefined
            : (...args: unknown[]) => {
                calls.push([String(name), JSON.stringify(args)]);
                return Promise.resolve(null);
              },
      },
    );
  const workspace = pluginWorkspace(t, {
      edit: (m) => {
        const parity = found(m.checks.parity);
        parity.stage = "phase";
        delete parity.decide;
        delete parity.decideAt;
        found(m.checks["parity-review"]).stage = "task";
      },
      tasks: [leaf("a", { planId: "plan", phase })],
    }),
    { store } = workspace;
  // The check runner is never handed a GitHub client: its options have
  // no place for one, and it runs with a recording one bound nowhere.
  land(workspace, "a", { "src/api/a.js": "a\n" }, "2026-11-19T01:00:00Z");
  queuePhaseChecks(store);
  const options: DrainOptions & { github: unknown } = { github: recording };
  await drainCheckRuns(store, options);
  assert.equal(checkRuns(store)[0]?.state, "finished");
  assert.deepEqual(calls, []);
});
