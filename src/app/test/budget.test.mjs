// Task 27.1-27.3: the built-in price table, budget levels and modes, spend, the stop
// and the warn-mode over-budget item (design §4.17, Requirement 67).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_CAPS,
  budgetHeldTaskIds,
  budgetInput,
  budgetStep,
  priceTurn,
  readPrices,
  resolveCap,
  validateManifestBudget,
  validateTrackedBudgets,
} from "../budget.mjs";
import { ingestUsage } from "../flow-usage.mjs";
import { DEFAULT_PRICES, defaultPrice, priceKey } from "../default-prices.mjs";
import { Operations } from "../operations.mjs";
import { parseSpec } from "../spec-plans.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-budget-xdg-");

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

function setup(t, tasks, tracked = {}) {
  const root = temporaryDirectory("avoozl-budget-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks, edges: [] });
  store.put("projects", { id: "r1" });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, ...tracked }),
  );
  const machine = path.join(root, "machine.json");
  const ops = new Operations(store, { workspaceRoot: root });
  return { root, store, ops, machine, tracked: { version: 1, ...tracked } };
}

let slotCount = 0;
function bind(store, taskId, extra = {}) {
  const slot = extra.slot || `s${++slotCount}`;
  store.put("session_bindings", {
    id: slot,
    slot,
    taskId,
    role: "worker",
    attempt: 1,
    source: "tick",
    status: "working",
    boundAt: "2026-11-13T00:00:00Z",
    ...extra,
  });
  return store.get("session_bindings", slot);
}
const turn = (ts, model, input, output, credits = 0) => ({
  ts,
  model,
  input,
  output,
  credits,
});

test("the price table is the built-in list only: no saves, no versions, an old key ignored", async (t) => {
  const { store, ops } = setup(t, [leaf("a1")]);
  const table = readPrices();
  assert.equal(table.version, 0);
  assert.deepEqual(table.models, {});
  assert.equal(table.defaults, DEFAULT_PRICES);
  assert.match(table.sha256, /^[0-9a-f]{64}$/);
  // The operations are gone, for a person too.
  for (const name of ["prices.get", "prices.save"])
    await assert.rejects(ops.execute(name, {}), /Unknown operation|unknown/i);
  // An old saved key in the machine file changes nothing and is no error.
  const file = path.join(process.env.XDG_CONFIG_HOME, "avoozl", "config.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      prices: {
        version: 3,
        creditUsd: 1,
        models: { m: { inputPerMTokUsd: 9, outputPerMTokUsd: 9 } },
      },
    }),
  );
  assert.deepEqual(readPrices(store, { machineFile: file }), table);
  assert.equal(
    priceTurn({ model: "m", credits: 0, input: 1e6, output: 0 }, table),
    null,
    "an old override prices nothing",
  );
});

test("an old prices key is ignored in .avoozl.json and a manifest; budget keys still validate", () => {
  assert.doesNotThrow(() => validateTrackedBudgets({ prices: {} }));
  assert.doesNotThrow(() =>
    validateTrackedBudgets({ projects: { r1: { prices: {} } } }),
  );
  assert.doesNotThrow(() => validateManifestBudget({ tasks: {}, prices: {} }));
  assert.throws(
    () => validateTrackedBudgets({ prices: {}, budget: { usd: 0 } }),
    /above 0/,
  );
  assert.throws(() => budgetInput({ usd: 0 }), /above 0/);
  assert.throws(() => budgetInput({ mode: "soft" }), /"stop" or "warn"/);
  assert.throws(
    () => budgetInput({ dollars: 3 }),
    /budget.dollars is not a budget setting/,
  );
  assert.throws(
    () => budgetInput({ notify: true }),
    /notify is not/,
    "notify is a workspace key",
  );
  assert.doesNotThrow(() =>
    budgetInput({ notify: true }, "budget", { workspace: true }),
  );
});

test("a spec manifest's top-level budget reaches each leaf; an old prices key there is ignored", () => {
  const files = {
    "requirements.md": "# R\n",
    "design.md": "# D\n",
    "tasks.md": "- [ ] 1 One\n- [ ] 2 Two\n",
    "avoozl/manifest.json": JSON.stringify({
      budget: { usd: 6, mode: "warn" },
      tasks: {
        1: { acceptance: ["x"], budget: { usd: 2 } },
        2: { acceptance: ["y"] },
      },
    }),
  };
  const parsed = parseSpec({ name: "s1", exists: true, files });
  assert.deepEqual(
    parsed.diagnostics.filter((d) => d.severity !== "warning"),
    [],
  );
  assert.deepEqual(
    parsed.proposals.map((p) => [
      p.specKey,
      p.budget?.usd ?? null,
      p.specBudget?.usd,
    ]),
    [
      ["1", 2, 6],
      ["2", null, 6],
    ],
  );
  const bad = parseSpec({
    name: "s1",
    exists: true,
    files: {
      ...files,
      "avoozl/manifest.json": JSON.stringify({
        prices: {},
        tasks: { 1: { acceptance: ["x"] }, 2: { acceptance: ["y"] } },
      }),
    },
  });
  assert.deepEqual(
    bad.diagnostics.filter((d) => d.severity !== "warning"),
    [],
  );
});

test("each key comes from the most specific level, with modes and the fallbacks", (t) => {
  const { store, tracked } = setup(
    t,
    [
      leaf("a1", { budget: { usd: 2 } }),
      leaf("a2", { specBudget: { usd: 6, mode: "warn" } }),
      leaf("a3"),
      leaf("b1", { repository: "r2" }),
    ],
    {
      budget: { usd: 10, tokens: 1000 },
      projects: { r2: { budget: { usd: 4, credits: 50 } } },
    },
  );
  const cap = (id) =>
    resolveCap(
      store,
      store.read().tasks.find((x) => x.id === id),
      tracked,
    );
  assert.deepEqual(
    [
      cap("a1").usd,
      cap("a1").level,
      cap("a1").mode,
      cap("a1").tokens,
      cap("a1").levels.tokens,
    ],
    [2, "task", "stop", 1000, "workspace"],
  );
  assert.deepEqual(
    [cap("a2").usd, cap("a2").level, cap("a2").mode],
    [6, "spec", "warn"],
  );
  assert.deepEqual(
    [cap("a3").usd, cap("a3").level, cap("a3").credits],
    [10, "workspace", DEFAULT_CAPS.credits],
  );
  assert.deepEqual(
    [cap("b1").usd, cap("b1").level, cap("b1").credits],
    [4, "repository", 50],
  );
  const none = resolveCap(store, leaf("x"), {});
  assert.deepEqual(
    [none.usd, none.tokens, none.credits, none.mode],
    [null, 2_000_000, 200, "stop"],
  );
});

test("an Intake grant only sets a cap nobody set, and its cap is always stop", (t) => {
  const { store } = setup(t, [
    leaf("g1", { intakeBudget: { usd: 3 } }),
    leaf("g2", { intakeBudget: { usd: 300 }, budget: { usd: 5 } }),
  ]);
  const warn = { budget: { mode: "warn" } };
  const task = (id) => store.read().tasks.find((x) => x.id === id);
  const g1 = resolveCap(store, task("g1"), warn);
  assert.deepEqual(
    [g1.usd, g1.level, g1.mode],
    [3, "grant", "stop"],
    "grant caps are forced to stop",
  );
  const g2 = resolveCap(store, task("g2"), warn);
  assert.deepEqual(
    [g2.usd, g2.level, g2.mode],
    [5, "task", "warn"],
    "a grant never raises a person's cap",
  );
});

test("a turn billed in credits is unpriced; a token turn is priced by the built-in list", () => {
  const table = readPrices();
  assert.equal(priceTurn({ credits: 10, input: 0, output: 0 }, table), null);
  // claude-haiku-4.5: $1 in, $5 out per million tokens.
  assert.equal(
    priceTurn(
      { model: "claude-haiku-4.5", credits: 0, input: 1e6, output: 5e5 },
      table,
    ),
    3.5,
  );
  assert.equal(
    priceTurn({ model: "z", credits: 0, input: 1e6, output: 0 }, table),
    null,
  );
});

test("warn mode never stops or messages; it opens again each further half of the cap", async (t) => {
  const { store, ops, tracked } = setup(
    t,
    [leaf("w1", { budget: { usd: 2, mode: "warn" } })],
    {
      budget: { notify: true },
    },
  );
  const binding = bind(store, "w1");
  const feed = (ts, millions) =>
    ingestUsage(store, binding, [
      turn(ts, "claude-haiku-4.5", millions * 1e6, 0),
    ]);
  const step = () => budgetStep(store, store.read(), { script: true, tracked });
  feed("2026-11-13T00:01:00Z", 1.7);
  let out = step();
  assert.deepEqual(out.messages, []);
  assert.equal(out.statuses.get("w1").warning, true, "80% warning");
  assert.equal(out.statuses.get("w1").reached, false);
  feed("2026-11-13T00:02:00Z", 0.5);
  out = step();
  assert.deepEqual(out.messages, [], "soft mode never sends the stop message");
  assert.equal(budgetHeldTaskIds(store).size, 0, "nothing is held");
  assert.equal(
    out.notify.filter((n) => /Over budget/.test(n.title)).length,
    1,
    "notify when turned on",
  );
  let items = (await ops.execute("conflicts.view", {})).items.filter(
    (i) => i.kind === "over-budget",
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Over budget: $2.20 of $2.00");
  assert.equal(step().notify.length, 0, "one notice per step, not per tick");
  await ops.execute("budget.acknowledge", { taskId: "w1" });
  items = (await ops.execute("conflicts.view", {})).items.filter(
    (i) => i.kind === "over-budget",
  );
  assert.equal(items.length, 0, "acknowledged");
  feed("2026-11-13T00:03:00Z", 0.5);
  step();
  assert.equal(
    (await ops.execute("conflicts.view", {})).items.filter(
      (i) => i.kind === "over-budget",
    ).length,
    0,
    "still inside the same half step ($2.70 < $3.00)",
  );
  feed("2026-11-13T00:04:00Z", 0.4);
  step();
  items = (await ops.execute("conflicts.view", {})).items.filter(
    (i) => i.kind === "over-budget",
  );
  assert.equal(items.length, 1, "past 150% it opens again");
  const delivery = await ops.execute("delivery.view", {});
  const chip = delivery.items.find((i) => i.id === "w1")?.budget;
  assert.ok(chip?.reached && chip.over.open);
  assert.equal((await ops.execute("budget.view", {})).overBudget, 1);
  // Switch to stop: the next check stops it, and its session gets the stop.
  await ops.execute("budget.switchToStop", { taskId: "w1" });
  assert.ok(budgetHeldTaskIds(store).has("w1"));
  out = step();
  assert.equal(out.messages.length, 1);
  assert.match(out.messages[0].text, /Budget reached/);
});

test("unknown spend warns once and never stops", async (t) => {
  const { store, tracked } = setup(t, [leaf("u1", { budget: { usd: 1 } })]);
  bind(store, "u1", { source: "conductor", slot: "crew-1" });
  bind(store, "u1", { slot: "remote-1", crew: "far", attempt: 2 });
  const first = budgetStep(store, store.read(), { script: true, tracked });
  assert.deepEqual(
    first.statuses
      .get("u1")
      .missing.map((m) => m.reason)
      .sort(),
    ["crew-mode", "remote"],
  );
  assert.equal(
    first.notify.filter((n) => /Spend unknown/.test(n.title)).length,
    1,
  );
  assert.equal(
    budgetStep(store, store.read(), { script: true, tracked }).notify.length,
    0,
  );
  assert.equal(budgetHeldTaskIds(store).size, 0);
});

test("a person only: agents, MCP and app tokens cannot raise or stop", async (t) => {
  const { ops } = setup(t, [leaf("a1")]);
  for (const name of [
    "budget.raise",
    "budget.stop",
    "budget.acknowledge",
    "budget.switchToStop",
  ])
    for (const context of [
      { mcp: true },
      { caller: { sessionKey: "dashboard:x" } },
    ])
      await assert.rejects(
        ops.execute(name, { taskId: "a1", usd: 5 }, undefined, context),
        (e) => e.status === 403,
      );
});

test("built-in prices apply with no setup", () => {
  const table = { models: {}, defaults: DEFAULT_PRICES };
  // 1M in at $3 and 1M out at $15.
  assert.equal(
    priceTurn(
      { model: "claude-sonnet-4.5", credits: 0, input: 1e6, output: 1e6 },
      table,
    ),
    18,
  );
  assert.equal(
    priceTurn(
      {
        model: "anthropic.claude-sonnet-4-5-20250929-v1:0",
        credits: 0,
        input: 1e6,
        output: 0,
      },
      table,
    ),
    3,
    "provider prefixes, dates and dashed versions find the same price",
  );
  assert.equal(
    priceTurn(
      { model: "no-such-model", credits: 0, input: 1e6, output: 0 },
      table,
    ),
    null,
  );
  assert.match(DEFAULT_PRICES.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(DEFAULT_PRICES.sources.every((url) => url.startsWith("https://")));
});

test("a turn billed in credits counts against the credit cap", () => {
  const table = { models: {}, defaults: DEFAULT_PRICES };
  const credited = {
    model: "claude-sonnet-4.5",
    credits: 3,
    input: 1e6,
    output: 0,
  };
  assert.equal(priceTurn(credited, table), null);
  assert.equal(priceKey("claude-opus-4-1-20250805"), "claude-opus-4.1");
  assert.equal(defaultPrice("CLAUDE-HAIKU-4.5")?.outputPerMTokUsd, 5);
});
