// Budgets on the page (R67.10, R67.11, design §4.17): the chip's words and
// tone, Raise budget's amount, the settings forms, and where each part is
// wired.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MODE_TEXT,
  MODE_TITLE,
  COSTS_DOCS,
  chipText,
  chipTone,
  fromBudgetForm,
  helpSettings,
  inheritText,
  receiptFile,
  showChip,
  toBudgetForm,
  toRaise,
} from "../src/budget-api.ts";
import { budgetMark } from "../src/flow-api.ts";
import { summarize } from "../src/dashboard-api.ts";

const source = (name) =>
  readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
const chip = (extra = {}) => ({
  taskId: "a1",
  spent: 1.2,
  tokens: 1000,
  credits: 0,
  unpricedTurns: 0,
  cap: { usd: 5, tokens: 2000000, credits: 200, mode: "stop", level: "spec" },
  ratio: 0.24,
  warning: false,
  reached: false,
  state: null,
  over: null,
  unknown: [],
  unpricedModels: [],
  ...extra,
});

test("the chip reads $spent / $cap: muted, amber from 80%, red at the cap", () => {
  assert.equal(chipText(chip()), "$1.20 / $5.00");
  assert.equal(chipTone(chip()), "muted");
  assert.equal(chipTone(chip({ warning: true, ratio: 0.8 })), "warn");
  const reached = chip({
    spent: 5.3,
    ratio: 1.06,
    warning: true,
    reached: true,
    state: "open",
  });
  assert.equal(chipText(reached), "Budget reached: $5.30 / $5.00");
  assert.equal(chipTone(reached), "over");
  const over = chip({
    spent: 5.3,
    ratio: 1.06,
    reached: true,
    cap: { ...chip().cap, mode: "warn" },
  });
  assert.equal(chipText(over), "Over budget: $5.30 / $5.00");
  assert.equal(
    chipText(chip({ state: "paused", reached: true })),
    "Stopped: $1.20 / $5.00",
  );
  assert.equal(
    chipText(chip({ unknown: ["crew-mode"] })),
    "$1.20 / $5.00, spend unknown",
  );
  assert.equal(
    chipText(
      chip({
        cap: { ...chip().cap, usd: null },
        spent: 0,
        tokens: 0,
        unknown: ["remote"],
      }),
    ),
    "Spend unknown",
  );
  assert.equal(
    showChip(chip({ spent: 0, tokens: 0 })),
    false,
    "nothing to show before any usage",
  );
  assert.equal(showChip(null), false);
});

test("Raise budget takes a dollar amount above 0", () => {
  assert.deepEqual(toRaise("$4"), { usd: 4 });
  assert.deepEqual(toRaise("4.505"), { usd: 4.51 });
  for (const bad of ["", "0", "-1", "four"])
    assert.equal(toRaise(bad).error, "Enter a dollar amount above 0.");
});

test("a budget level is blank unless set, and refuses bad numbers by name", () => {
  assert.deepEqual(fromBudgetForm(toBudgetForm(null)), {});
  assert.deepEqual(
    fromBudgetForm({ usd: "6", tokens: "", credits: "", mode: "warn" }),
    { budget: { usd: 6, mode: "warn" } },
  );
  assert.match(
    fromBudgetForm({ usd: "0", tokens: "", credits: "", mode: "" }).error,
    /Dollar cap/,
  );
  assert.match(
    fromBudgetForm({ usd: "", tokens: "1.5", credits: "", mode: "" }).error,
    /whole number/,
  );
  assert.deepEqual(toBudgetForm({ usd: 2, mode: "stop" }), {
    usd: "2",
    tokens: "",
    credits: "",
    mode: "stop",
  });
  assert.match(MODE_TEXT.stop, /no new chat starts/);
  assert.match(MODE_TEXT.warn, /keeps running/);
});

test("inherited choices say where they come from and what they are", () => {
  assert.equal(
    inheritText("workspace default", MODE_TITLE.stop),
    "Use the workspace default (Stop)",
  );
  assert.equal(
    inheritText("repository setting", MODE_TITLE.warn),
    "Use the repository setting (Warn)",
  );
  const page = source("BudgetSettings.tsx");
  assert.doesNotMatch(page, /Same as above/);
  assert.doesNotMatch(MODE_TEXT.stop + MODE_TEXT.warn, /^(Stop|Warn):/);
  // Stop and Warn are the shared radio fold-out, inside titled boxes.
  assert.match(page, /<RadioFold\b/);
  assert.match(page, /<FieldBox title="When a task reaches its cap">/);
  assert.match(page, /<FieldBox title="Dollar cap">/);
  assert.match(page, /inheritText\(fallback\.from, MODE_TITLE\[fallback\.mode\]\)/);
  assert.match(page, /from: "workspace default"/);
  // The fallback caps fold away under Advanced.
  assert.match(page, /<Fold\s+title="Advanced: caps for turns not counted in dollars"/);
});

test("there is no Prices page, price list or price write on the page", () => {
  const settings = source("SettingsView.tsx"),
    budgets = source("BudgetSettings.tsx"),
    api = source("budget-api.ts");
  assert.doesNotMatch(settings, /Prices|prices/);
  assert.doesNotMatch(budgets, /PricesSettings|prices\.(get|save)|Override prices/);
  assert.doesNotMatch(api, /prices\.(get|save)|PricesView|toPricesForm|fromPricesForm|pricesUpdatedText|creditUsd/);
});

test("Ask for help on Budgets and Providers uses the shared link with the page's settings and the guide", () => {
  // The shared part (controls.tsx AskForHelp) seeds the chat through
  // chat.context purpose "help"; these pages pass their settings and docs.
  assert.deepEqual(
    helpSettings({
      budget: { usd: "5", mode: "", notify: false },
      projects: { r1: { budget: { usd: "" } } },
      fallback: ["a", "b"],
    }),
    [
      { key: "budget.usd", value: "5" },
      { key: "budget.mode", value: "not set (default)" },
      { key: "budget.notify", value: false },
      { key: "projects.r1.budget.usd", value: "not set (default)" },
      { key: "fallback", value: "a, b" },
    ],
  );
  assert.match(COSTS_DOCS, /avoozl-costs skill \(skills\/avoozl-costs\/SKILL\.md/);
  const budgets = source("BudgetSettings.tsx"),
    providers = source("RoutingView.tsx");
  assert.match(budgets, /import \{ AskForHelp \} from "\.\/controls\.tsx"/);
  assert.match(providers, /import \{ AskForHelp, [^}]*\} from '\.\/controls\.tsx'/);
  assert.equal(
    (budgets.match(/<AskForHelp workspaceId=\{workspaceId\} help=\{help\} \/>/g) || []).length,
    1,
    "Budgets",
  );
  for (const text of [budgets, providers]) assert.match(text, /docs: COSTS_DOCS/);
  assert.match(budgets, /page: "Settings › Budgets"/);
  assert.match(providers, /page: 'Settings › Routing',\s*section: 'Providers'/);
  assert.match(
    readFileSync(
      new URL("../../skills/avoozl-costs/SKILL.md", import.meta.url),
      "utf8",
    ),
    /^---\nname: avoozl-costs\n/,
  );
});

test("the receipt exports as one JSON file named for its task", () => {
  const file = receiptFile({ taskId: "s1.a1", totals: { usd: 1 } });
  assert.equal(file.name, "receipt-s1.a1.json");
  assert.deepEqual(JSON.parse(file.text), {
    taskId: "s1.a1",
    totals: { usd: 1 },
  });
});

test("Flow marks over-budget and stopped runs", () => {
  const budget = {
    over: ["a", "b"],
    warning: ["c"],
    stopped: ["b"],
    paused: [],
  };
  assert.equal(budgetMark(budget, "a"), "over budget");
  assert.equal(budgetMark(budget, "b"), "stopped at budget");
  assert.equal(budgetMark(budget, "c"), "80% of budget");
  assert.equal(budgetMark(undefined, "a"), null);
});

test("the Dashboard counts open over-budget tasks and In flight carries the chip", () => {
  const session = {
    slot: "s",
    role: "worker",
    attempt: 1,
    title: null,
    status: "working",
    statusAt: null,
    boundAt: null,
    model: null,
    commit: null,
    link: null,
  };
  const item = (id, budget, complete = false) => ({
    id,
    title: id,
    status: "running",
    complete,
    repository: "r1",
    sessions: [session],
    runs: [],
    evidence: [],
    integration: null,
    pullRequests: [],
    deliveries: [],
    worktrees: [],
    budget,
  });
  const summary = summarize({
    graph: {
      revision: 1,
      epics: [],
      statuses: [],
      repositories: [],
      total: 0,
      tasks: [],
      edges: [],
    },
    delivery: [
      item("a", chip({ reached: true })),
      item("b", chip()),
      item("c", chip({ reached: true }), true),
    ],
    conflicts: [],
  });
  assert.equal(summary.overBudget, 1);
  assert.equal(
    summary.inFlight.find((r) => r.taskId === "a").budget.reached,
    true,
  );
});

test("each part is wired where the spec puts it", () => {
  const drawer = source("TaskDrawer.tsx");
  assert.ok(
    drawer.indexOf('id="budget"') > drawer.indexOf('id="timing"'),
    "Budget fold after Timing",
  );
  assert.match(drawer, /<BudgetFold /);
  assert.match(
    source("DeliveryView.tsx"),
    /<SpendChip budget=\{card\.item\?\.budget\} \/>/,
  );
  assert.match(
    source("DashboardView.tsx"),
    /<SpendChip budget=\{row\.budget\} \/>/,
  );
  assert.match(source("DashboardView.tsx"), /over budget<\/Badge>/);
  assert.match(source("ConflictsView.tsx"), /<BudgetActions/);
  const budget = source("Budget.tsx");
  for (const label of [
    "Raise budget",
    "Stop",
    "Acknowledge",
    "Switch to stop",
    "Export JSON",
  ])
    assert.ok(
      budget.includes(`>\n            ${label}\n`) || budget.includes(label),
      label,
    );
  const settings = source("SettingsView.tsx");
  assert.match(settings, /key: 'budgets', label: 'Budgets'/);
  assert.doesNotMatch(settings, /key: 'prices'/);
});
