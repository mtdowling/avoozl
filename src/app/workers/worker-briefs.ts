// One table from executor and task kind to the brief a worker gets, or to a
// stated reason it does not (worker-paths WP3, design D3). Delivery asks
// it, and picks no steps with a conditional of its own.
//
// Kinds: `single` a task; `round` a landing or feedback message to a
// worker that already ran. A cell holds the builder for its kind, or `declined` (the reason)
// and `fallback` (the kind that runs instead).
import { localSteps, processSteps } from "../delivery/delivery.ts";
import type { CliReport } from "../delivery/delivery.ts";

export const EXECUTORS = Object.freeze(["kirocrew", "process"]);
export const KINDS = Object.freeze(["single", "round"]);

// What a brief's steps are built from.
interface BriefContext {
  task: { id: string; [key: string]: unknown };
  repository?: {
    sandbox?: { allowCommands?: string[][] };
    [key: string]: unknown;
  };
  cliReport?: CliReport | null;
}

// One table cell: the steps builder, the round's closing line, or a
// declined kind with the kind that runs instead.
interface Cell {
  steps?: (context: BriefContext) => string[];
  finish?: string;
  declined?: string;
  fallback?: string;
}

const cell = (fields: Cell): Readonly<Cell> => Object.freeze(fields);

// `ctx` is { task, repository, cliReport }.
const chatSteps = ({ task, repository, cliReport }: BriefContext) =>
  localSteps(task, repository, { cliReport });
const childSteps = ({ task, repository }: BriefContext) =>
  processSteps(task, {
    allowCommands: repository?.sandbox?.allowCommands ?? [],
  });

export const WORKER_BRIEFS: Readonly<
  Record<string, Readonly<Record<string, Readonly<Cell>>>>
> = Object.freeze({
  kirocrew: Object.freeze({
    single: cell({ steps: chatSteps }),
    round: cell({
      finish:
        "Commit, and report done again with the new commit SHA. Do not push, rebase or force push.",
    }),
  }),
  process: Object.freeze({
    single: cell({ steps: childSteps }),
    round: cell({
      finish:
        'Do not commit, push, rebase or force push. When it is fixed, write .avoozl/result.json in this folder ({"state": "done", "text": "<what you changed>"}, or {"state": "blocked", "text": "<why>"}) and exit; Avoozl commits your changes.',
    }),
  }),
});

// The cell an executor and kind get. A declined cell comes back with its
// reason; `kind` is the kind that actually runs, `cell` its builder.
export function briefCell(executor: string, kind: string) {
  const found = WORKER_BRIEFS[executor]?.[kind];
  if (!found) throw Error(`No brief for ${executor} and ${kind}.`);
  if (!found.declined) return { kind, cell: found, declined: null };
  return {
    kind: found.fallback,
    cell: WORKER_BRIEFS[executor][String(found.fallback)],
    declined: found.declined,
    asked: kind,
  };
}
