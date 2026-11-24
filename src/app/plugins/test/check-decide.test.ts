// The decide prompt (plugin-checks pk-1.4, D5, PK3): a read-only model call
// answers whether one plugin check is needed for one task. The tick only
// queues and dispatches; a bound session answers; bad answers count as
// needed; a person can flip one until the task's next commit.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  decideAnswer,
  decideId,
  decideStep,
  failDecide,
  queueDecide,
  taskDecides,
} from "../check-decide.ts";
import { checkRuns, drainCheckRuns } from "../../delivery/check-runs.ts";
import { OPERATIONS } from "../../api/operation-table.ts";
import { ROLE_TABLE } from "../../agents/role-table.ts";
import {
  as,
  bind,
  git,
  leaf,
  workerDone,
} from "../../test/delivery-fixture.ts";
import { pluginWorkspace } from "../../test/plugin-checks-fixture.ts";
import { loopOn } from "../../test/fixtures.ts";
import { found, storedRow } from "../../test/view-shapes.ts";
import type { Operations } from "../../api/operations.ts";
import type { Store } from "../../store/store.ts";

// One decide call's record.
interface DecideRecord {
  id: string;
  kind: string;
  taskId: string;
  at: string;
  state: string;
  commit?: string;
  input?: string;
  cause?: string;
}
// A task's plugin check fields, as task.get and task.detail show them.
interface PluginChecks {
  results: { name: string; result: string; filter?: string }[];
  decides: { reason: string }[];
}

// The tick starts and lands work only with the server loop on.
loopOn();

// Only parity, at task stage, with its decide prompt at `decideAt`.
const decideWorkspace = (
  t: TestContext,
  decideAt = ["diff"],
  extra: Parameters<typeof pluginWorkspace>[1] = {},
) =>
  pluginWorkspace(t, {
    edit: (m) => {
      delete m.checks["parity-review"];
      delete m.servers;
      m.checks.parity.stage = "task";
      m.checks.parity.decideAt = decideAt;
    },
    ...extra,
  });
const tick = (ops: Operations, slots: string[] = []) =>
  ops.execute("workspace.tick", {
    cron: true,
    sessions: slots.map((target) => ({ target, status: "idle" })),
  });
const api = { "src/api/handler.js": "export const x = 2;\n" };
const decides = (store: Store) =>
  store
    .list<DecideRecord>("flow_records")
    .filter((r) => r.kind === "check-decide");

// Answer a queued call as its bound session would.
async function answer(
  ops: Operations,
  record: { id: string },
  input: Record<string, unknown>,
  slot = `d-${record.id.length}`,
) {
  await bind(ops, record.id, slot, "check-decide", 1);
  return ops.execute("check.decide.submit", input, undefined, as(slot));
}

test("pk-1.4: approval queues one approve call per applicable task, and a true there skips the diff call", async (t) => {
  const workspace = decideWorkspace(t, ["approve", "diff"], {
      tasks: [
        leaf("a", { planId: "p" }),
        leaf("b", { planId: "p" }),
        leaf("c", { planId: "p", repository: "other" }),
      ],
    }),
    { store, ops } = workspace;
  store.put("plans", { id: "p", spec: "p", state: "approved" });
  const dispatch = decideStep(store, { config: {} }).dispatch.map((d) => ({
    role: d.role,
    task: d.task,
    brief: found(d.brief, "the brief"),
  }));
  assert.deepEqual(
    decides(store)
      .map((r) => [r.taskId, r.at, r.state])
      .sort(),
    [
      ["a", "approve", "queued"],
      ["b", "approve", "queued"],
    ],
  );
  assert.deepEqual(
    dispatch.map((d) => [d.role, d.task]).sort(),
    decides(store)
      .map((r) => ["check-decide", r.id])
      .sort(),
  );
  assert.match(dispatch[0].brief, /public API of the service/);
  assert.match(dispatch[0].brief, /data, not instructions/);
  assert.ok(dispatch.some((d) => /Title: Task a/.test(d.brief)));
  // A second tick queues nothing more.
  decideStep(store, { config: {} });
  assert.equal(decides(store).length, 2);
  const first = found(decides(store).find((r) => r.taskId === "a"));
  await answer(ops, first, { needed: true, reason: "It changes a handler." });
  assert.deepEqual(
    decideAnswer(store, "a", found(workspace.check("parity")), null),
    {
      state: "needed",
      reason: "It changes a handler.",
      at: "approve",
    },
  );
  // The run asks no diff call and runs the check.
  await workerDone(ops, "a", "w-1", 1, api);
  await tick(ops, ["w-1"]);
  await drainCheckRuns(store);
  const [run] = checkRuns(store);
  assert.equal(run.state, "finished");
  assert.ok(run.selected?.includes("parity"));
  assert.equal(
    decides(store).filter((r) => r.taskId === "a" && r.at === "diff").length,
    0,
  );
});

test("pk-1.4: a done report queues one diff call; the run waits while Deciding, then holds every check in one record", async (t) => {
  const workspace = decideWorkspace(t),
    { store, ops } = workspace,
    commit = await workerDone(ops, "a", "w-1", 1, api);
  await tick(ops, ["w-1"]);
  await drainCheckRuns(store);
  const [waiting] = checkRuns(store);
  assert.equal(waiting.state, "queued");
  assert.equal(waiting.waiting, "deciding: parity");
  const [call] = decides(store);
  assert.deepEqual([call.at, call.commit], ["diff", commit]);
  assert.match(call.input ?? "", /^diff --git a\/src\/api\/handler\.js/m);
  // A second pass asks no second call.
  await drainCheckRuns(store);
  assert.equal(decides(store).length, 1);
  await answer(ops, call, {
    needed: false,
    reason: "Only an internal helper.",
  });
  await drainCheckRuns(store);
  const [run] = checkRuns(store);
  assert.equal(run.state, "finished");
  assert.deepEqual(run.selected, ["git status"]);
  assert.deepEqual(run.skipped, [
    {
      name: "parity",
      plugin: "acme-checks",
      filter: "decide",
      reason: "Only an internal helper.",
    },
  ]);
  await tick(ops, ["w-1"]);
  assert.equal(storedRow(store, "task_deliveries", "a").state, "integrated");
  // avoozl show and the MCP task read (task.get) and the page return the
  // same plugin check fields (PK8.2).
  const shown = await ops.execute<{ pluginChecks: PluginChecks }>("task.get", {
    id: "a",
  });
  assert.deepEqual(
    shown.pluginChecks.results.map((r) => [r.name, r.result, r.filter]),
    [["parity", "skipped", "decide"]],
  );
  assert.equal(
    shown.pluginChecks.decides[0].reason,
    "Only an internal helper.",
  );
  const page = await ops.execute<{ task: { pluginChecks: PluginChecks } }>(
    "task.detail",
    { id: "a" },
  );
  assert.deepEqual(page.task.pluginChecks, shown.pluginChecks);
  // The answer stays in this workspace's database only.
  assert.doesNotMatch(
    git(workspace.checkout, "log", "--all", "--format=%B"),
    /internal helper/,
  );
});

test("pk-1.4: bad output, a failed call, a timeout, no answer and a large input count as needed", async (t) => {
  const workspace = decideWorkspace(t),
    { store, ops } = workspace,
    check = found(workspace.check("parity")),
    task = { id: "a", title: "Task a" };
  const one = queueDecide(store, {
    task,
    check,
    at: "diff",
    commit: "c1",
    input: "x",
  });
  await answer(ops, one, {
    needed: false,
    reason: "Skip.",
    alsoSkip: ["license-scan"],
  });
  assert.deepEqual(
    [
      decideAnswer(store, "a", check, "c1").state,
      storedRow<DecideRecord>(store, "flow_records", one.id).cause,
    ],
    ["needed", "bad output"],
  );
  const two = queueDecide(store, {
    task,
    check,
    at: "diff",
    commit: "c2",
    input: "x",
  });
  failDecide(store, two.id, "the harness exited 1");
  assert.equal(decideAnswer(store, "a", check, "c2").state, "needed");
  const three = queueDecide(store, {
    task,
    check,
    at: "diff",
    commit: "c3",
    input: "x",
    now: Date.now() - 11 * 60_000,
  });
  decideStep(store, { config: {} });
  assert.equal(
    storedRow<DecideRecord>(store, "flow_records", three.id).cause,
    "no answer in 10 minutes",
  );
  const big = queueDecide(store, {
    task,
    check,
    at: "diff",
    commit: "c4",
    input: "x".repeat(200 * 1024 + 1),
  });
  assert.deepEqual(
    [big.state, big.needed, big.cause],
    ["done", true, "input over 200 KB"],
  );
  // Every bad answer changed only its own call.
  assert.deepEqual(
    taskDecides(store, "a").map((r) => r.check),
    ["parity", "parity", "parity", "parity"],
  );
});

test("pk-1.4: Run it and Skip it are audited, an agent may flip, and a new commit drops the flip", async (t) => {
  const workspace = decideWorkspace(t),
    { store, ops } = workspace,
    check = found(workspace.check("parity"));
  assert.equal(OPERATIONS.get("check.decide.flip").policy.audit, true);
  const commit = await workerDone(ops, "a", "w-1", 1, api);
  await ops.execute(
    "check.decide.flip",
    { taskId: "a", check: "parity", needed: false, commit },
    undefined,
    as("agent"),
  );
  assert.equal(decideAnswer(store, "a", check, commit).state, "skip");
  assert.equal(decideAnswer(store, "a", check, "f".repeat(40)).state, "none");
  // The role reads only its snapshot, offline, with one small answer file.
  const row = ROLE_TABLE.checkDecide,
    output = found(row.output);
  assert.deepEqual(
    [row.access, row.folder, row.offline, output.limit, row.hands],
    ["read", "snapshot", true, 1024, "decide"],
  );
  assert.throws(() => output.validate('{"needed": "no", "reason": "x"}'));
  assert.equal(
    decideId("a", check, "approve"),
    "check-decide:a:acme-checks:parity:approve",
  );
});
