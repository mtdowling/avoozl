// Budgets and receipts on the page (design §4.17, Requirement 67): the
// $spent / $cap chip, the drawer's Budget fold and the Needs you actions.
// Every number comes from the backend; the page only
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
  price: { updated: string; sha256: string };
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

// The guide for Settings › Budgets and Providers, for the Ask for
// help seed (controls.tsx AskForHelp).
export const COSTS_DOCS =
  "the avoozl-costs skill (skills/avoozl-costs/SKILL.md in the Avoozl app): every field on Budgets and Providers, with its default";

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
// Settings: a budget level's fields.

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
  };
}
