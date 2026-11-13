// Proof P41 (avoozl-p41): budgets and receipts (Requirement 67, design
// §4.17). One isolated workspace, fake workers, a fake usage feed, and a fake
// Kiro Crew that holds a message for a busy session until its turn ends.
// Every price here is made up.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { principalAllows } from "../app-backend.mjs";
import { budgetHeldTaskIds, budgetStep } from "../budget.mjs";
import { workspaceConfig } from "../config.mjs";
import { observeUsage } from "../flow-usage.mjs";
import { retroBrief } from "../flow-retro.mjs";
import { groupedCall } from "../mcp-tools.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-p41-xdg-");
const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "r1",
  ...extra,
});
const inSpec = (id, extra = {}) =>
  leaf(id, { planId: "s1", specBudget: { usd: 6 }, ...extra });

function checkout(root, name) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  git(dir, "init", "-b", "main");
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(dir, "README.md"), name + "\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "Start");
  return fs.realpathSync(dir);
}

// A fake Kiro Crew: a message to a session mid-turn waits for the turn to
// end (Inferred in §4.17; the first live stop records it). It has no stop,
// interrupt or close: Avoozl must never need one.
class FakeCrew {
  constructor() {
    this.busy = new Set();
    this.queued = new Map();
    this.delivered = [];
    this.calls = [];
  }
  send({ slot, text }) {
    this.calls.push("send");
    if (this.busy.has(slot)) {
      if (!this.queued.has(slot)) this.queued.set(slot, []);
      this.queued.get(slot).push(text);
    } else this.delivered.push({ slot, text });
  }
  endTurn(slot) {
    this.busy.delete(slot);
    for (const text of this.queued.get(slot) || [])
      this.delivered.push({ slot, text });
    this.queued.delete(slot);
  }
}

// Each model's dollars per million tokens: model-a $1 in, $2 out (made up).
const turn = (
  ts,
  { model = "model-a", input = 0, output = 0, credits = 0 } = {},
) => ({
  ts,
  model,
  input,
  output,
  credits,
});

function setup(t) {
  const root = temporaryDirectory("avoozl-p41-");
  initializeWorkspace(root);
  const config = workspaceConfig({
      workspace: root,
      env: { ...process.env, AVOOZL_WORKSPACE: root },
    }),
    store = new Store(config.dbPath);
  t.after(() => store.close());
  const base = snapshot();
  store.write({
    ...store.read(),
    statuses: base.statuses,
    epics: base.epics,
    tracks: base.tracks,
    tasks: [
      inSpec("a1", { budget: { usd: 2 } }),
      inSpec("a2"),
      inSpec("a3"),
      inSpec("a4"),
      inSpec("a5"),
      leaf("b1", { repository: "r2", title: "Task b1 secretword" }),
      inSpec("c1", { size: "small", budget: { usd: 4 } }),
      inSpec("c2", { size: "small", budget: { usd: 4 } }),
      inSpec("d1"),
      inSpec("d2"),
      inSpec("w1", { budget: { usd: 2, mode: "warn" } }),
    ],
    edges: [
      { from: "a1", to: "d1", kind: "requires" },
      { from: "a2", to: "d2", kind: "requires" },
    ],
  });
  store.put("projects", {
    id: "r1",
    root: checkout(root, "r1"),
    baseBranch: "main",
  });
  store.put("projects", {
    id: "r2",
    root: checkout(root, "r2"),
    baseBranch: "main",
  });
  store.put("plans", { id: "s1", title: "Spec one" });
  fs.mkdirSync(path.join(root, ".avoozl", "local", "content-rules"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, ".avoozl", "local", "content-rules", "names.txt"),
    "codename: \\bsecretword\\b\n",
  );
  const saved = JSON.parse(
    fs.readFileSync(path.join(root, ".avoozl.json"), "utf8"),
  );
  const tracked = {
    ...saved,
    version: 1,
    delivery: { concurrency: 20, retries: 3 },
    contentRules: { sets: [{ id: "names" }] },
    budget: { usd: 10 },
    projects: { r2: { budget: { usd: 4 } } },
  };
  const writeTracked = (value) =>
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      JSON.stringify(value, null, 2),
    );
  writeTracked(tracked);
  const ops = new Operations(store, { workspaceRoot: root });
  return { root, store, ops, tracked, writeTracked };
}

const bindings = (store) => store.list("session_bindings");
// The cron's tick with a roster of every bound session.
function tick(ops, store, statuses = {}) {
  return ops.execute("workspace.tick", {
    sessions: bindings(store).map((b) => ({
      target: b.slot,
      status: statuses[b.slot] ?? b.status ?? "working",
    })),
  });
}
async function bind(ops, store, taskId, slot, extra = {}) {
  await ops.execute("session.bind", {
    taskId,
    slot,
    role: "worker",
    attempt: 1,
    source: "tick",
    ...extra,
  });
  return store.get("session_bindings", slot);
}
const as = (slot) => ({
  caller: { sessionKey: "dashboard:" + slot },
  mcp: true,
});

test("P41: budgets cap a task in dollars, stop at the next turn, and never open a gate", async (t) => {
  const { root, store, ops, tracked, writeTracked } = setup(t);
  const crew = new FakeCrew(),
    feed = new Map(),
    failing = new Set(),
    reader = async (slot) => {
      if (failing.has(slot)) throw Error("usage read refused");
      return feed.get(slot) || [];
    },
    // The app backend's read: usage, then the budget check (app-backend.mjs).
    read = async () => {
      await observeUsage(store, reader);
      budgetStep(store, store.read());
    };
  await ops.execute("prices.save", {
    creditUsd: 0.01,
    models: { "model-a": { inputPerMTokUsd: 1, outputPerMTokUsd: 2 } },
  });

  // (1) Caps and their levels.
  const receipt = (id) => ops.execute("budget.receipt", { taskId: id });
  const caps = await Promise.all(["a1", "a2", "b1"].map(receipt));
  assert.deepEqual(
    caps.map((r) => [r.cap.usd, r.cap.level]),
    [
      [2, "task"],
      [6, "spec"],
      [4, "repository"],
    ],
  );
  const first = await tick(ops, store);
  assert.ok(first.dispatch.some((d) => d.task === "a1" && d.role === "worker"));

  // (2) a1 spends $1.50, then $0.80 while a tool call runs.
  await bind(ops, store, "a1", "a1-w");
  feed.set("a1-w", [
    turn("2026-11-13T10:00:00Z", { input: 1e6, output: 2.5e5 }),
  ]);
  await read();
  assert.equal(
    (await receipt("a1")).warning.at80,
    false,
    "75% is below the warning",
  );
  feed.get("a1-w").push(turn("2026-11-13T10:01:00Z", { output: 4e5 }));
  crew.busy.add("a1-w");
  await read();
  assert.ok(
    budgetHeldTaskIds(store).has("a1"),
    "the check after the usage read records the stop",
  );
  const stopped = await tick(ops, store);
  assert.ok(
    !stopped.dispatch.some((d) => d.task === "a1"),
    "no new session for a1",
  );
  const stopMessages = stopped.messages.filter((m) => m.slot === "a1-w");
  assert.equal(stopMessages.length, 1);
  assert.match(stopMessages[0].text, /Budget reached.*report `blocked`/);
  for (const key of ["close", "stop", "interrupt", "end"])
    assert.equal(stopped[key], undefined, `no ${key} intent`);
  for (const m of stopped.messages) crew.send(m);
  assert.deepEqual(crew.delivered, [], "held while the turn runs");
  crew.endTurn("a1-w");
  assert.equal(crew.delivered.length, 1, "delivered as the next turn");
  assert.deepEqual(
    [...new Set(crew.calls)],
    ["send"],
    "only messages, never a stop or close",
  );
  assert.equal(
    (await tick(ops, store)).messages.filter((m) => m.slot === "a1-w").length,
    0,
    "one stop message",
  );
  let a1 = await receipt("a1");
  assert.equal(a1.totals.usd, 2.3);
  assert.equal(a1.overrun, 0.3);
  assert.equal(a1.stops[0].overrun, 0.3);
  assert.equal(a1.warning.at80, true);

  // (3) Its Avoozl calls answer budget_reached; its report goes through.
  await assert.rejects(
    ops.execute("flow.checks.run", { taskId: "a1" }, undefined, as("a1-w")),
    (e) =>
      e.code === "budget_reached" &&
      /^budget_reached: Budget reached/.test(e.message),
  );
  await ops.execute(
    "session.report",
    { taskId: "a1", kind: "blocked", text: "budget" },
    undefined,
    as("a1-w"),
  );
  await tick(ops, store, { "a1-w": "idle" });
  const conflicts = (await ops.execute("conflicts.view", {})).items;
  assert.ok(conflicts.some((i) => i.kind === "budget" && i.taskId === "a1"));
  const a1Item = (await ops.execute("delivery.view", {})).items.find(
    (i) => i.id === "a1",
  );
  assert.match(a1Item.needsYou.reason, /^Budget reached: \$2\.30 of \$2\.00/);
  assert.equal(
    (store.get("task_deliveries", "a1")?.attempts || []).filter(
      (a) => a.outcome === "failed" && !a.budget,
    ).length,
    0,
    "no attempt lost",
  );

  // (4) Only a person raises or stops.
  for (const context of [as("a1-w"), { mcp: true }])
    for (const name of ["budget.raise", "budget.stop"])
      await assert.rejects(
        ops.execute(name, { taskId: "a1", usd: 4 }, undefined, context),
        (e) => e.status === 403,
      );
  for (const name of ["budget.raise", "budget.stop"])
    assert.equal(
      principalAllows({ kind: "app-token" }, name),
      false,
      "app tokens are refused",
    );
  const raised = await ops.execute("budget.raise", { taskId: "a1", usd: 4 });
  assert.deepEqual(
    [
      raised.raise.from,
      raised.raise.to,
      raised.raise.priceVersion,
      typeof raised.raise.by,
    ],
    [{ usd: 2 }, { usd: 4 }, 1, "string"],
  );
  const goOn = await tick(ops, store, { "a1-w": "idle" });
  assert.deepEqual(
    goOn.messages.filter((m) => m.slot === "a1-w").map((m) => m.text),
    ["Avoozl task a1: Budget raised to $4.00; go on."],
  );
  assert.ok(
    !goOn.dispatch.some((d) => d.task === "a1"),
    "the same session goes on",
  );
  assert.ok(
    !goOn.dispatch.some((d) => d.task === "d1"),
    "d1 still waits for a1",
  );

  // (5) Retries, the verifier and two review rounds share one $6 cap.
  const a2Turns = [
    ["a2-w1", { role: "worker", attempt: 1 }, 1.5e6],
    ["a2-w2", { role: "worker", attempt: 2 }, 1.5e6],
    ["a2-v", { role: "verifier", attempt: 1 }, 1e6],
    ["a2-r1", { role: "review:style", attempt: 1 }, 1e6],
    ["a2-r2", { role: "review:style", attempt: 2 }, 1.5e6],
  ];
  for (const [i, [slot, extra, input]] of a2Turns.entries()) {
    await bind(ops, store, "a2", slot, extra);
    feed.set(slot, [turn(`2026-11-13T11:0${i}:00Z`, { input })]);
    if (i === 3) {
      await read();
      assert.equal(
        (await receipt("a2")).warning.at80,
        true,
        "warns at 80% of $6",
      );
      assert.ok(!budgetHeldTaskIds(store).has("a2"));
    }
  }
  store.put("task_deliveries", {
    id: "a2",
    taskId: "a2",
    state: "done",
    commit: "0".repeat(40),
    attempts: [],
  });
  await read();
  const a2 = await receipt("a2");
  assert.equal(a2.totals.usd, 6.5);
  assert.equal(a2.byAttempt.length, 5, "every session on one receipt");
  assert.ok(budgetHeldTaskIds(store).has("a2"));
  const a2Tick = await tick(ops, store);
  assert.ok(
    !a2Tick.dispatch.some((d) => d.task === "a2"),
    "no third review round, no verifier",
  );

  // (6) Unpriced turns stop at the token and credit caps, and warn once.
  await bind(ops, store, "a3", "a3-w");
  feed.set("a3-w", [
    turn("2026-11-13T12:00:00Z", {
      model: "model-z",
      input: 1.5e6,
      output: 6e5,
    }),
  ]);
  await ops.execute("prices.save", {
    models: { "model-a": { inputPerMTokUsd: 1, outputPerMTokUsd: 2 } },
    expectedHash: (await ops.execute("prices.get", {})).hash,
  });
  await bind(ops, store, "a4", "a4-w");
  feed.set("a4-w", [
    turn("2026-11-13T12:01:00Z", { model: null, credits: 210 }),
  ]);
  await read();
  const six = await tick(ops, store);
  for (const id of ["a3", "a4"]) {
    assert.ok(
      budgetHeldTaskIds(store).has(id),
      `${id} stops at its fallback cap`,
    );
    assert.equal(
      six.notify.filter((n) => n.task === id && /no price/.test(n.title))
        .length,
      1,
    );
    assert.ok((await receipt(id)).byModel.some((row) => row.priced === false));
  }
  assert.equal((await receipt("a3")).stops[0].key, "tokens");
  assert.equal((await receipt("a4")).stops[0].key, "credits");
  assert.equal(
    (await tick(ops, store)).notify.filter((n) => /no price/.test(n.title))
      .length,
    0,
  );
  await ops.execute("prices.save", {
    creditUsd: 0.01,
    models: { "model-a": { inputPerMTokUsd: 1, outputPerMTokUsd: 2 } },
    expectedHash: (await ops.execute("prices.get", {})).hash,
  });

  // (7) One batch, $9 of turns, an $8 sum cap; each task shows half.
  await bind(ops, store, "c1", "c-batch", {
    batch: { id: "batch-c", tasks: ["c1", "c2"] },
  });
  feed.set("c-batch", [turn("2026-11-13T13:00:00Z", { input: 9e6 })]);
  await read();
  for (const id of ["c1", "c2"]) {
    const r = await receipt(id);
    assert.ok(budgetHeldTaskIds(store).has(id));
    assert.equal(r.totals.usd, 4.5);
    assert.equal(r.shared, true);
    assert.equal(r.cap.batch.usd, 8);
  }

  // (8) Spend unknown: a Crew Mode worker and a failed read.
  await ops.execute("session.bind", {
    taskId: "a5",
    slot: "a5-crew",
    role: "worker",
    attempt: 1,
  });
  store.put("session_bindings", {
    ...store.get("session_bindings", "a5-crew"),
    source: "conductor",
  });
  await bind(ops, store, "b1", "b1-w");
  feed.set("b1-w", [turn("2026-11-13T14:00:00Z", { input: 1e6 })]);
  await read();
  const b1Before = await receipt("b1");
  failing.add("b1-w");
  await read();
  const eight = await tick(ops, store);
  const [a5, b1] = await Promise.all([receipt("a5"), receipt("b1")]);
  assert.deepEqual(
    a5.missing.map((m) => m.reason),
    ["crew-mode"],
  );
  assert.deepEqual(
    b1.missing.map((m) => m.reason),
    ["read-failed"],
  );
  assert.equal(b1.complete, false);
  assert.equal(b1.totals.usd, 1, "keeps the last known spend");
  assert.equal(b1.readAt, b1Before.readAt, "with its time");
  assert.ok(
    !budgetHeldTaskIds(store).has("a5") && !budgetHeldTaskIds(store).has("b1"),
  );
  assert.equal(
    eight.notify.filter((n) => /Spend unknown/.test(n.title)).length,
    2,
  );

  // (9) A new price version recomputes the receipt; the stop and raise keep
  // the version that applied then.
  const doubled = await ops.execute("prices.save", {
    creditUsd: 0.01,
    models: { "model-a": { inputPerMTokUsd: 2, outputPerMTokUsd: 4 } },
    expectedHash: (await ops.execute("prices.get", {})).hash,
  });
  a1 = await receipt("a1");
  assert.equal(a1.totals.usd, 4.6);
  assert.deepEqual(a1.price, {
    version: doubled.version,
    sha256: doubled.sha256,
  });
  assert.deepEqual([a1.stops[0].usd, a1.stops[0].priceVersion], [2.3, 1]);
  assert.equal(a1.raises[0].priceVersion, 1);

  // (10) The page, the CLI and MCP give one object; no prompt text.
  store.db.exec("PRAGMA wal_checkpoint(FULL)");
  const env = { ...process.env };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_/.test(name)) delete env[name];
  const fromCli = JSON.parse(
    execFileSync(
      process.execPath,
      [cli, "budget", "receipt", "a1", "--json", "--workspace", root],
      {
        env,
        encoding: "utf8",
      },
    ),
  );
  const call = groupedCall("plans_view", {
      action: "receipt",
      input: { taskId: "a1" },
    }),
    fromMcp = await ops.execute(call.operation, call.input, undefined, {
      mcp: true,
    });
  assert.deepEqual(fromCli, a1);
  assert.deepEqual(fromMcp, a1);
  const text = JSON.stringify(a1);
  for (const word of ["brief", "prompt", "transcript", "Task a1"])
    assert.ok(!text.includes(word), `no ${word} in the receipt`);
  const data = store.read();
  data.tasks.find((x) => x.id === "a1").integration = {
    at: "2026-11-13T15:00:00Z",
    commit: "1".repeat(40),
  };
  store.write(data);
  const brief = retroBrief(store, store.read(), { id: "r1", triggers: [] });
  const payload = JSON.parse(
    brief.slice(brief.indexOf("```json") + 7, brief.lastIndexOf("```")),
  );
  const retroA1 = payload.receipts.find((r) => r.task === "a1");
  assert.equal(retroA1.usd, 4.6);
  assert.ok(retroA1.byStage.length && retroA1.byModel[0].model === "model-a");

  // (11) Stop pauses a2 like Deferred: its sessions and dependents wait.
  const before = JSON.stringify(
    bindings(store).filter((b) => b.taskId === "a2"),
  );
  await ops.execute("budget.stop", { taskId: "a2" });
  const graph = await ops.execute("graph.view", {});
  assert.equal(graph.tasks.find((x) => x.id === "a2").state, "deferred");
  assert.equal(
    JSON.stringify(bindings(store).filter((b) => b.taskId === "a2")),
    before,
    "sessions untouched",
  );
  const eleven = await tick(ops, store);
  assert.ok(!eleven.dispatch.some((d) => d.task === "a2" || d.task === "d2"));

  // (12) Prices in .avoozl.json are refused by name; a budget opens no gate.
  writeTracked({ ...tracked, prices: { models: {} } });
  const refused = await tick(ops, store);
  assert.equal(refused.policy.status, "invalid");
  assert.match(refused.policy.error, /cannot hold prices/);
  writeTracked(tracked);
  await ops.execute("budget.raise", { taskId: "b1", usd: 100 });
  store.put("session_bindings", {
    ...store.get("session_bindings", "b1-w"),
    status: "closed",
  });
  store.put("task_deliveries", {
    id: "b1",
    taskId: "b1",
    state: "failed",
    attempts: [{ attempt: 1, outcome: "failed" }],
  });
  const twelve = await tick(ops, store);
  assert.ok(
    !twelve.dispatch.some((d) => d.task === "b1"),
    "the content gate still holds b1's brief",
  );
  assert.ok(
    (await ops.execute("conflicts.view", {})).items.some(
      (i) => i.kind === "content-match" && i.taskId === "b1",
    ),
  );
  assert.equal(
    store.read().tasks.find((x) => x.id === "b1").status,
    "planned",
    "no proof is skipped",
  );

  // (13) Warn mode: over budget, never stopped, no stop message.
  await bind(ops, store, "w1", "w1-w");
  feed.set("w1-w", [turn("2026-11-13T16:00:00Z", { input: 1.25e6 })]);
  await read();
  const thirteen = await tick(ops, store);
  assert.ok(!budgetHeldTaskIds(store).has("w1"));
  assert.equal(thirteen.messages.filter((m) => m.slot === "w1-w").length, 0);
  const w1 = (await ops.execute("delivery.view", {})).items.find(
    (i) => i.id === "w1",
  );
  assert.equal(w1.budget.reached, true);
  assert.equal(w1.budget.over.open, true);
  assert.equal(w1.needsYou, null, "warn mode does not move the lane");
  const over = (await ops.execute("conflicts.view", {})).items.find(
    (i) => i.kind === "over-budget",
  );
  assert.equal(over.title, "Over budget: $2.50 of $2.00");
  assert.ok((await ops.execute("flow.view", {})).budget.over.includes("w1"));
  assert.ok((await ops.execute("budget.view", {})).overBudget >= 1);
});
