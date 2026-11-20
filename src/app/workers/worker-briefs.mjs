// One table from executor and task kind to the brief a worker gets, or to a
// stated reason it does not (worker-paths WP3, design D3). Delivery asks
// it, and picks no steps with a conditional of its own.
//
// Kinds: `single` a task; `round` a landing or feedback message to a
// worker that already ran. A cell holds the builder for its kind, or `declined` (the reason)
// and `fallback` (the kind that runs instead).
import { localSteps, processSteps } from "../delivery/delivery.mjs";

export const EXECUTORS = Object.freeze(["kirocrew", "process"]);
export const KINDS = Object.freeze(["single", "round"]);

const cell = (fields) => Object.freeze(fields);

// `ctx` is { task, repository, cliReport }.
const chatSteps = ({ task, repository, cliReport }) =>
  localSteps(task, repository, { cliReport });
const childSteps = ({ task, repository }) =>
  processSteps(task, {
    allowCommands: repository?.sandbox?.allowCommands ?? [],
  });

export const WORKER_BRIEFS = Object.freeze({
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
export function briefCell(executor, kind) {
  const found = WORKER_BRIEFS[executor]?.[kind];
  if (!found) throw Error(`No brief for ${executor} and ${kind}.`);
  if (!found.declined) return { kind, cell: found, declined: null };
  return {
    kind: found.fallback,
    cell: WORKER_BRIEFS[executor][found.fallback],
    declined: found.declined,
    asked: kind,
  };
}
