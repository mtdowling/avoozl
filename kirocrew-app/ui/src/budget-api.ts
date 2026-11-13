// Budgets and receipts on the page (design §4.17, Requirement 67): the
// $spent / $cap chip, the drawer's Budget fold, the Needs you actions, and
// Settings › Prices. Every number comes from the backend; the page only
// formats it.
import type { AppApi } from "@kirocrew/app-sdk";
import { COMMAND_PATH } from "./workspace-api.ts";

export type BudgetMode = "stop" | "warn";

export interface BudgetChip {
  taskId: string;
  spent: number;
  tokens: number;
  credits: number;
  unpricedTurns: number;
  cap: {
    usd: number | null;
    tokens: number | null;
    credits: number | null;
    mode: BudgetMode;
    level: string | null;
  };
  ratio: number;
  stopKey?: string | null;
  warning: boolean;
  reached: boolean;
  // open: stopped at the cap; paused: a person pressed Stop.
  state: "open" | "paused" | null;
  over: {
    step: number;
    at: string;
    usd: number;
    cap: number | null;
    open: boolean;
  } | null;
  unknown: string[];
  unpricedModels: string[];
  batch?: string;
}

export interface ReceiptLine {
  stage?: string;
  model?: string;
  attempt?: string;
  input: number;
  output: number;
  credits: number;
  usd: number;
  turns: number;
  priced: boolean;
  shared: boolean;
  unpricedTurns?: number;
}

export interface Receipt {
  taskId: string;
  spec: string | null;
  repository: string | null;
  complete: boolean;
  missing: {
    slot: string | null;
    reason: string;
    since?: string | null;
    lastReadAt?: string | null;
  }[];
  cap: {
    usd: number | null;
    tokens: number | null;
    credits: number | null;
    mode: BudgetMode;
    level: string | null;
    levels: Record<string, string>;
    batch?: { id: string; tasks: string[]; usd: number | null };
  };
  raises: {
    by: string;
    at: string;
    from: Record<string, number | null>;
    to: Record<string, number>;
    priceVersion: number;
  }[];
  price: { version: number; sha256: string };
  stops: {
    at: string;
    key: string;
    usd: number;
    tokens: number;
    credits: number;
    priceVersion: number;
    overrun: number | null;
  }[];
  warning: { at80: boolean; ratio: number; since: string | null };
  over: BudgetChip["over"];
  state: BudgetChip["state"];
  totals: {
    input: number;
    output: number;
    credits: number;
    usd: number;
    unpricedTurns: number;
  };
  overrun: number | null;
  shared: boolean;
  byStage: ReceiptLine[];
  byModel: ReceiptLine[];
  byAttempt: ReceiptLine[];
  readAt: string | null;
}

export const usd = (n: number | null | undefined) =>
  n == null ? "no cap" : `$${n.toFixed(2)}`;

// What each mode does, in one plain line, for Settings and the drawer.
export const MODE_TITLE: Record<BudgetMode, string> = {
  stop: "Stop",
  warn: "Warn",
};
export const MODE_TEXT: Record<BudgetMode, string> = {
  stop: "When a task reaches its cap, no new chat starts for it and its running chats are asked to stop.",
  warn: "When a task reaches its cap, it keeps running and shows Over budget. You decide what to do.",
};

// An inherited choice says where it comes from and what it is, never
// "same as above": "Use the workspace default (Stop)".
export const inheritText = (from: string, value: string) =>
  `Use the ${from} (${value})`;

const count = (n: number) => n.toLocaleString("en-US");

// The guide for Settings › Budgets, Prices and Providers, for the Ask for
// help seed (controls.tsx AskForHelp).
export const COSTS_DOCS =
  "the avoozl-costs skill (skills/avoozl-costs/SKILL.md in the Avoozl app): every field on Budgets, Prices and Providers, with its default";

// Settings as the help seed's key and value lines: nested keys joined with
// dots, blank values said as "not set (default)".
export function helpSettings(
  value: Record<string, unknown>,
  prefix = "",
): { key: string; value: string | number | boolean | null }[] {
  return Object.entries(value).flatMap(([key, v]) => {
    const at = prefix ? `${prefix}.${key}` : key;
    if (v && typeof v === "object" && !Array.isArray(v))
      return helpSettings(v as Record<string, unknown>, at);
    if (v === undefined || v === null || v === "")
      return [{ key: at, value: "not set (default)" }];
    return [
      {
        key: at,
        value: Array.isArray(v)
          ? v.join(", ")
          : (v as string | number | boolean),
      },
    ];
  });
}

const UNKNOWN_TEXT: Record<string, string> = {
  "crew-mode": "a Crew Mode worker",
  remote: "a remote chat",
  "read-failed": "a usage read failed",
  "not-run-by-avoozl": "not run by Avoozl",
  "not-opened-by-tick": "a chat Avoozl did not open",
};
export const unknownText = (reasons: string[]) =>
  reasons.map((r) => UNKNOWN_TEXT[r] ?? r).join(", ");

// The chip: `$1.20 / $5.00`, muted below 80%, amber from 80%, red at the
// cap, and "spend unknown" when some of it cannot be read.
export function chipText(b: BudgetChip): string {
  if (b.cap.usd == null && !b.reached)
    return b.unknown.length ? "Spend unknown" : usd(b.spent);
  const base =
    b.cap.usd == null
      ? `${Math.round(b.ratio * 100)}% of cap`
      : `${usd(b.spent)} / ${usd(b.cap.usd)}`;
  if (b.state === "paused") return `Stopped: ${base}`;
  if (b.reached && b.cap.mode === "warn") return `Over budget: ${base}`;
  if (b.reached) return `Budget reached: ${base}`;
  return b.unknown.length ? `${base}, spend unknown` : base;
}

export type ChipTone = "muted" | "warn" | "over" | "unknown";
export function chipTone(b: BudgetChip): ChipTone {
  if (b.reached) return "over";
  if (b.warning) return "warn";
  if (b.unknown.length) return "unknown";
  return "muted";
}

// The host badge for each tone (Badge.tsx): only warn is yellow.
export const chipVariant: Record<ChipTone, "warning" | "danger" | undefined> = {
  muted: undefined,
  warn: "warning",
  over: "danger",
  unknown: undefined,
};

// Show a chip once there is spend, a cap reached, or something unknown.
export const showChip = (b: BudgetChip | null | undefined): b is BudgetChip =>
  Boolean(
    b &&
      (b.spent > 0 ||
        b.tokens > 0 ||
        b.credits > 0 ||
        b.reached ||
        b.unknown.length),
  );

// Raise budget: a dollar amount above 0.
export function toRaise(text: string): { usd?: number; error?: string } {
  const value = Number(text.trim().replace(/^\$/, ""));
  if (!text.trim() || !Number.isFinite(value) || value <= 0)
    return { error: "Enter a dollar amount above 0." };
  return { usd: Math.round(value * 100) / 100 };
}

// The receipt as a downloadable JSON file (Export JSON).
export function receiptFile(receipt: Receipt): { name: string; text: string } {
  return {
    name: `receipt-${receipt.taskId}.json`,
    text: JSON.stringify(receipt, null, 2) + "\n",
  };
}

// ---------------------------------------------------------------------------
// Settings: a budget level's fields and the price table.

export interface BudgetForm {
  usd: string;
  tokens: string;
  credits: string;
  mode: "" | BudgetMode;
}
export interface BudgetValue {
  usd?: number;
  tokens?: number;
  credits?: number;
  mode?: BudgetMode;
  notify?: boolean;
}

export const toBudgetForm = (
  value: BudgetValue | undefined | null,
): BudgetForm => ({
  usd: value?.usd != null ? String(value.usd) : "",
  tokens: value?.tokens != null ? String(value.tokens) : "",
  credits: value?.credits != null ? String(value.credits) : "",
  mode: value?.mode ?? "",
});

// Blank fields are unset; the next level up applies.
export function fromBudgetForm(form: BudgetForm): {
  budget?: BudgetValue;
  error?: string;
} {
  const out: BudgetValue = {};
  const number = (text: string, label: string, whole = false) => {
    if (!text.trim()) return undefined;
    const n = Number(text.trim().replace(/^\$/, ""));
    if (!Number.isFinite(n) || n <= 0 || (whole && !Number.isInteger(n)))
      throw Error(
        `${label} must be ${whole ? "a whole number" : "a number"} above 0.`,
      );
    return n;
  };
  try {
    const usdCap = number(form.usd, "Dollar cap"),
      tokens = number(form.tokens, "Token cap", true),
      credits = number(form.credits, "Credit cap");
    if (usdCap !== undefined) out.usd = usdCap;
    if (tokens !== undefined) out.tokens = tokens;
    if (credits !== undefined) out.credits = credits;
  } catch (error) {
    return { error: (error as Error).message };
  }
  if (form.mode) out.mode = form.mode;
  return Object.keys(out).length ? { budget: out } : {};
}

export type PriceTable = Record<
  string,
  { inputPerMTokUsd: number; outputPerMTokUsd: number }
>;

// How a model is budgeted: this machine's price, the built-in one, in Kiro
// credits, or not in dollars at all.
export type PricedBy = "override" | "default" | "credits" | "none";

export interface PricesView {
  version: number;
  sha256: string;
  savedAt: string | null;
  hash: string | null;
  creditUsd: number | null;
  // This machine's overrides only.
  models: PriceTable;
  // The built-in table, or null when the override file is broken.
  defaults?: { updated: string; sources: string[]; models: PriceTable } | null;
  // The workspace fallback caps.
  caps?: { tokens: number; credits: number };
  seen: {
    model: string;
    turns: number;
    unpricedTurns: number;
    creditTurns?: number;
    priced?: PricedBy;
  }[];
  error?: string;
}

// The built-in table's form of a model ID; the same rules as the backend's
// priceKey (src/app/default-prices.mjs).
export function priceKey(model: string): string {
  return model
    .toLowerCase()
    .replace(/^.*\//, "")
    .replace(/^(?:[a-z]+\.)+(?=claude-)/, "")
    .replace(/(?:-v\d+(?::\d+)?|-\d{8}|-latest)+$/, "")
    .replace(/(\d)-(\d)(?!\d)/g, "$1.$2");
}

export function builtInPrice(view: PricesView, model: string) {
  const table = view.defaults?.models;
  return table ? (table[model] ?? table[priceKey(model)] ?? null) : null;
}

const per = (n: number) => `$${n}`;

// The line under Settings › Prices' title.
export function pricesUpdatedText(view: PricesView): string {
  return view.defaults
    ? `Prices last updated ${view.defaults.updated}.`
    : "Built-in prices are off until the override list below is fixed.";
}

// One model's row in "Models in use": how it is budgeted, in plain words.
export function howPriced(
  view: PricesView,
  row: { model: string; priced?: PricedBy },
): { kind: PricedBy; text: string } {
  const caps = view.caps ?? { tokens: 2000000, credits: 200 };
  const own = view.models[row.model];
  const builtIn = builtInPrice(view, row.model);
  const kind: PricedBy =
    row.priced ?? (own ? "override" : builtIn ? "default" : "none");
  if (kind === "credits")
    return {
      kind,
      text: `Kiro Crew bills this model in credits, so it is budgeted in credits: ${count(caps.credits)} credits per task.`,
    };
  if (kind === "override" && own)
    return {
      kind,
      text: `${per(own.inputPerMTokUsd)} in, ${per(own.outputPerMTokUsd)} out per million tokens (your price).`,
    };
  if (kind === "default" && builtIn)
    return {
      kind,
      text: `${per(builtIn.inputPerMTokUsd)} in, ${per(builtIn.outputPerMTokUsd)} out per million tokens (built-in price).`,
    };
  return {
    kind: "none",
    text: `No known price, so Avoozl cannot count it in dollars. It counts against the token cap instead: ${count(caps.tokens)} tokens per task.`,
  };
}

// The models Settings › Prices lists: those seen in usage, then those Kiro
// Crew offers, each once.
export function modelsInUse(view: PricesView, offered: string[] = []) {
  const seen = view.seen.filter((s) => s.model !== "unknown");
  const ids = new Set(seen.map((s) => s.model));
  return [
    ...seen,
    ...offered
      .filter((id) => !ids.has(id))
      .sort()
      .map((model) => ({ model, turns: 0, unpricedTurns: 0 })),
  ].map((row) => ({ ...row, ...howPriced(view, row) }));
}

export interface PriceRow {
  model: string;
  input: string;
  output: string;
  // Turns on this model with no price, for the muted note.
  unpricedTurns: number;
  // The built-in price, shown as the field's placeholder.
  defaultInput?: string;
  defaultOutput?: string;
}
export interface PricesForm {
  creditUsd: string;
  rows: PriceRow[];
}

// One row per model Kiro Crew offers and per model seen in usage.
export function toPricesForm(
  view: PricesView,
  offered: string[] = [],
): PricesForm {
  const seen = new Map(view.seen.map((s) => [s.model, s]));
  const ids = [
    ...new Set([
      ...Object.keys(view.models),
      ...offered,
      ...view.seen.map((s) => s.model),
    ]),
  ].filter((id) => id !== "unknown");
  return {
    creditUsd: view.creditUsd != null ? String(view.creditUsd) : "",
    rows: ids.sort().map((model) => {
      const builtIn = builtInPrice(view, model);
      return {
        model,
        input: view.models[model]
          ? String(view.models[model].inputPerMTokUsd)
          : "",
        output: view.models[model]
          ? String(view.models[model].outputPerMTokUsd)
          : "",
        unpricedTurns: seen.get(model)?.unpricedTurns ?? 0,
        ...(builtIn
          ? {
              defaultInput: String(builtIn.inputPerMTokUsd),
              defaultOutput: String(builtIn.outputPerMTokUsd),
            }
          : {}),
      };
    }),
  };
}

// A row with neither price is left out; a row with one is an error.
export function fromPricesForm(form: PricesForm): {
  input?: { creditUsd?: number; models: PricesView["models"] };
  error?: string;
} {
  const price = (text: string) => {
    const n = Number(text.trim().replace(/^\$/, ""));
    return text.trim() && Number.isFinite(n) && n >= 0 ? n : null;
  };
  const models: PricesView["models"] = {};
  for (const row of form.rows) {
    if (!row.input.trim() && !row.output.trim()) continue;
    const input = price(row.input),
      output = price(row.output);
    if (input === null || output === null)
      return {
        error: `Give ${row.model} both prices as dollars of 0 or more.`,
      };
    models[row.model] = { inputPerMTokUsd: input, outputPerMTokUsd: output };
  }
  if (form.creditUsd.trim()) {
    const credit = price(form.creditUsd);
    if (credit === null)
      return { error: "Credit price must be dollars of 0 or more." };
    return { input: { creditUsd: credit, models } };
  }
  return { input: { models } };
}

export function budgetApi(api: AppApi) {
  const run = <T>(
    workspaceId: string,
    operation: string,
    input: Record<string, unknown> = {},
  ) =>
    api
      .post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })
      .then((reply) => reply.result);
  return {
    view: (w: string) =>
      run<{
        tasks: BudgetChip[];
        overBudget: number;
        stopped: number;
        paused: number;
      }>(w, "budget.view"),
    receipt: (w: string, taskId: string) =>
      run<Receipt>(w, "budget.receipt", { taskId }),
    raise: (w: string, taskId: string, usdCap: number) =>
      run(w, "budget.raise", { taskId, usd: usdCap }),
    stop: (w: string, taskId: string) => run(w, "budget.stop", { taskId }),
    acknowledge: (w: string, taskId: string) =>
      run(w, "budget.acknowledge", { taskId }),
    switchToStop: (w: string, taskId: string) =>
      run(w, "budget.switchToStop", { taskId }),
    prices: (w: string) => run<PricesView>(w, "prices.get"),
    savePrices: (
      w: string,
      input: { creditUsd?: number; models: PricesView["models"] },
      expectedHash: string | null,
    ) =>
      run<PricesView>(w, "prices.save", {
        ...input,
        ...(expectedHash ? { expectedHash } : {}),
      }),
  };
}
