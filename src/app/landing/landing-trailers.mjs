// What a landing cost, kept on the landing commit itself (design §4.42), so
// Activity and Flow rebuild from git log with no database. Each landed task
// writes one `Avoozl-Task:` trailer (merge-batch.mjs) and, under it, these:
//
//   Avoozl-Started: 2026-11-19T01:02:03.000Z   when its first worker started
//   Avoozl-Tries: 2                             worker attempts
//   Avoozl-Harness: kirocrew                    the worker's executor
//   Avoozl-Model: claude-opus-5.5               the worker's model
//   Avoozl-Cost: 1.20                           credits, all roles
//   Avoozl-Span: ID STAGE START END ROLE ATTEMPT SOURCE
//                                               one Flow span, "-" for none
//
// A landing commit with several tasks repeats the block per task. A pull
// request landing writes the same block into its squash commit message.
import { git } from "../git/git.mjs";
import { listSpans } from "../flow/flow.mjs";
import { listSessionBindings } from "../sessions/session-bindings.mjs";
import { listUsage } from "../flow/flow-usage.mjs";

const NAMES = {
  started: "Avoozl-Started",
  tries: "Avoozl-Tries",
  harness: "Avoozl-Harness",
  model: "Avoozl-Model",
  cost: "Avoozl-Cost",
};
const VALUE = /^[A-Za-z0-9._:+-]{1,80}$/;
const TOKEN = /^[A-Za-z0-9._:@#+/=-]{1,200}$/;
const SPAN_FIELDS = [
  "id",
  "stage",
  "startedAt",
  "endedAt",
  "role",
  "attempt",
  "source",
];
// shortcut: at most 200 spans per task ride on its landing commit; a task
// with more keeps its oldest 200 in git. Raise it if Flow needs them.
const MAX_SPANS = 200;

// One task's metrics from its delivery, its worker sessions and its usage
// rows. Only the values Avoozl knows are kept.
export function landingMetrics(store, delivery) {
  const taskId = delivery.taskId,
    workers = listSessionBindings(store)
      .filter((b) => b.taskId === taskId && (b.role ?? "worker") === "worker")
      .sort((a, b) =>
        String(a.boundAt ?? "").localeCompare(String(b.boundAt ?? "")),
      ),
    last = workers.at(-1),
    credits = listUsage(store)
      .filter((row) => row.task_id === taskId)
      .reduce((sum, row) => sum + (row.credits || 0), 0),
    metrics = {
      started: workers[0]?.boundAt ?? null,
      tries: delivery.attempts?.length || workers.length || null,
      harness: last?.executor ?? (last ? "kirocrew" : null),
      model: last?.model ?? delivery.model ?? null,
      cost: credits ? credits.toFixed(2) : null,
    };
  const kept = Object.fromEntries(
      Object.entries(metrics)
        .filter(([, value]) => value !== null && VALUE.test(String(value)))
        .map(([key, value]) => [key, String(value)]),
    ),
    spans = listSpans(store, { taskId })
      .filter((span) =>
        SPAN_FIELDS.every(
          (field) =>
            span[field] === null ||
            span[field] === undefined ||
            TOKEN.test(String(span[field])),
        ),
      )
      .slice(0, MAX_SPANS);
  return spans.length ? { ...kept, spans } : kept;
}

// The trailer lines for one task's metrics.
export const metricTrailers = (metrics = {}) => [
  ...Object.entries(NAMES)
    .filter(([key]) => metrics[key] !== undefined)
    .map(([key, name]) => `${name}: ${metrics[key]}`),
  ...(metrics.spans || []).map(
    (span) =>
      `Avoozl-Span: ${SPAN_FIELDS.map((field) => span[field] ?? "-").join(" ")}`,
  ),
];

// The commit message of a landing: a title, then each task's trailer block.
export const landingMessage = (title, tasks) =>
  [
    title,
    "",
    ...tasks
      .filter((t) => typeof t !== "string")
      .flatMap((t) => [
        `Avoozl-Task: ${t.task}@${t.definition}`,
        ...metricTrailers(t.metrics),
      ]),
  ]
    .join("\n")
    .trim();

// Every landed task in a commit message: [{task, definition, ...metrics}].
export function parseLanding(message) {
  const tasks = [];
  for (const line of String(message).split("\n")) {
    const task = /^Avoozl-Task:\s*([^@\s]+)@([0-9a-f]{64})\s*$/.exec(line);
    if (task) {
      tasks.push({ task: task[1], definition: task[2] });
      continue;
    }
    const span = /^Avoozl-Span:\s*(.+?)\s*$/.exec(line);
    if (span && tasks.length) {
      const values = span[1].split(/\s+/);
      if (
        values.length === SPAN_FIELDS.length &&
        values.every((v) => TOKEN.test(v))
      ) {
        const entry = Object.fromEntries(
          SPAN_FIELDS.map((field, i) => [
            field,
            values[i] === "-" ? null : values[i],
          ]),
        );
        if (entry.attempt !== null) entry.attempt = Number(entry.attempt);
        (tasks.at(-1).spans ??= []).push(entry);
      }
      continue;
    }
    const field = /^(Avoozl-[A-Za-z]+):\s*(\S+)\s*$/.exec(line),
      key = field
        ? Object.keys(NAMES).find((k) => NAMES[k] === field[1])
        : null;
    if (key && tasks.length && VALUE.test(field[2]))
      tasks.at(-1)[key] = key === "tries" ? Number(field[2]) : field[2];
  }
  return tasks;
}

// Every landing commit on `ref`, oldest first: {commit, at, tasks}.
export async function landingsFromGit(root, ref = "HEAD") {
  let log;
  try {
    log = await git(root, [
      "log",
      "--reverse",
      "--format=%x1e%H%x1f%cI%x1f%B",
      "--grep=^Avoozl-Task: ",
      ref,
    ]);
  } catch {
    return [];
  }
  return log
    .split("\x1e")
    .filter((block) => block.trim())
    .map((block) => {
      const [commit, at, body] = block.split("\x1f");
      return { commit, at, tasks: parseLanding(body) };
    })
    .filter((landing) => landing.tasks.length);
}
