// The waiting label for tracker gates (RC23.4, RC23.5, design D28.5). Once a
// tick Avoozl puts `radar.trackerLabel` on a gate's issue while the gate is
// not done or cleared, and on each dependent whose unmet blockers are all
// gates. It takes the label off when that stops being true. The label
// triggers nothing. Which issues carry it is kept in the `gateLabels` meta
// entry, so a quiet tick makes no GitHub call.
import { RADAR_DEFAULTS } from "./github-policy.mjs";
import { allowedToClear, putStranger, recordClear } from "./gate-clear.mjs";
import { completionReached, isGate, supersedingTask } from "../work-model.mjs";

const META = "gateLabels";
const lower = (value) => String(value ?? "").toLocaleLowerCase();

const live = (task) =>
  task.planId &&
  !task.source?.removed &&
  !task.planArchived &&
  !task.supersededBy;

// Task ID -> true for every task that should carry the label now.
export function waitingTasks(data) {
  const byId = new Map(data.tasks.map((task) => [task.id, task])),
    complete = new Set(
      data.statuses.filter((s) => s.complete).map((s) => s.id),
    ),
    met = (task, edge) =>
      completionReached(task, edge?.condition, (status) =>
        complete.has(status),
      ),
    open = (task) => isGate(task) && task.gate?.plugin && !met(task);
  const waiting = new Set();
  for (const task of data.tasks) {
    if (!live(task)) continue;
    if (open(task)) {
      waiting.add(task.id);
      continue;
    }
    if (isGate(task)) continue;
    const unmet = data.edges
      .filter(
        (edge) =>
          edge.to === task.id && ["requires", "sequence"].includes(edge.kind),
      )
      .map((edge) => [supersedingTask(byId, edge.from), edge])
      .filter(([from, edge]) => from && !met(from, edge));
    if (unmet.length && unmet.every(([from]) => isGate(from)))
      waiting.add(task.id);
  }
  return waiting;
}

// Whether the issue no longer carries the label Avoozl put on it.
async function removed(github, task, label) {
  const issue = await github.issue(task.github.repository, task.github.number);
  if (issue?.state === "closed") return false;
  return !(issue?.labels || []).some(
    (item) => lower(item.name ?? item) === lower(label),
  );
}

// The login that took the label off: the newest `unlabeled` event for it.
async function remover(github, repository, number, label) {
  const events = await github.issueEvents(repository, number);
  return (
    (Array.isArray(events) ? events : [])
      .filter(
        (event) =>
          event.event === "unlabeled" &&
          lower(event.label?.name) === lower(label),
      )
      .at(-1)?.actor?.login ?? null
  );
}

// The tick step. A repository that cannot be written is tried again next
// tick; the meta entry only records what GitHub accepted.
export async function gateLabelStep(store, github, policy) {
  const errors = [];
  if (!github) return { errors };
  const data = store.read(),
    waiting = waitingTasks(data),
    applied = { ...(store.getMeta(META) ?? {}) },
    before = JSON.stringify(applied);
  for (const task of data.tasks) {
    const repository = task.github?.repository,
      number = task.github?.number;
    if (!repository || !number) continue;
    const label =
        policy?.repositories?.[repository]?.radar?.trackerLabel ??
        RADAR_DEFAULTS.trackerLabel,
      want = waiting.has(task.id),
      have = applied[task.id];
    try {
      // The label gone from a waiting gate's issue is the clear order
      // (RC23.9): an allowed actor clears the gate; anyone else gets the
      // label put back and one row.
      if (want && isGate(task) && have && (await removed(github, task, have))) {
        const by = await remover(github, repository, number, have),
          verdict = await allowedToClear(github, policy, repository, by);
        if (verdict.allowed) {
          recordClear(store, task.id, {
            actor: by,
            how: "label",
            reason: "Waiting label removed on the gate's issue.",
          });
          delete applied[task.id];
          continue;
        }
        putStranger(store, task.id, {
          actor: by ?? "someone Avoozl could not identify",
          at: new Date().toISOString(),
        });
        await github.addLabels(repository, number, [have]);
        continue;
      }
      if (want && lower(have) !== lower(label)) {
        await github.addLabels(repository, number, [label]);
        applied[task.id] = label;
      } else if (!want && have) {
        await github.removeLabel(repository, number, have);
        delete applied[task.id];
      }
    } catch (error) {
      // A label already gone is the state wanted.
      if (error.status === 404 && !want) delete applied[task.id];
      else errors.push(`${repository} #${number}: ${error.message}`);
    }
  }
  if (JSON.stringify(applied) !== before) store.setMeta(META, applied);
  return { errors };
}
