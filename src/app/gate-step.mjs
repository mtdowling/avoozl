// The tracker gate step (design D28.4, RC23.6 to RC23.8): once per tick, before
// release, read each open gate through its `gate` plugin's one read-only
// `status` call. The step stores the state, screened evidence and link, sets
// the next check with a growing gap, and on `done` records the verdict that
// releases the gate's dependents on this same pass. It never writes to the
// outside tracker, never clears or removes a gate, and never reverses a done.
import { isGate } from "../work-model.mjs";
import { check } from "./content-rules.mjs";

export const GATE_RECORDS = "gate_records";
// Minutes between reads: the first read, then these gaps; the last repeats.
export const BACKOFF_MINUTES = Object.freeze([1, 2, 5, 15, 30]);
export const GATE_TIMEOUT_MS = 30_000;
export const WITHHELD = "withheld by content rules";

const DONE = new Set(["done", "order"]);

// Evidence and link are plugin text, so the repository's content rules see
// them before they are stored or shown. A hit, or a rule set that cannot run,
// keeps the text out (D28.9).
function screened(store, taskId, evidence, link) {
  let result;
  try {
    result = check(store, {
      boundary: "github",
      target: `gate:${taskId}`,
      text: [evidence, link].filter(Boolean).join("\n"),
    });
  } catch {
    result = { findings: [], unavailable: [{ reason: "check failed" }] };
  }
  return result.findings.length || result.unavailable.length
    ? { evidence: WITHHELD, link: null }
    : { evidence, link };
}

// One status read; a throw, a timeout, an unavailable plugin or a reply
// outside the contract is `unknown` with a short reason (RC23.7).
async function read(session, task, timeoutMs) {
  const { plugin, item, done } = task.gate;
  let timer;
  try {
    const reply = await Promise.race([
      session.call(plugin, "gate", "status", { ref: { item, done } }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error(`timed out after ${timeoutMs} ms.`)),
          timeoutMs,
        );
      }),
    ]);
    return reply;
  } catch (error) {
    return {
      state: "unknown",
      evidence: String(error.reason || error.message).slice(0, 500),
      link: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export const gateRecord = (store, taskId) => store.get(GATE_RECORDS, taskId);

// Gates still to read: approved, in the plan, not done and not cleared.
function openGates(data) {
  return data.tasks.filter(
    (task) =>
      isGate(task) &&
      task.gate?.plugin &&
      task.planId &&
      !task.source?.removed &&
      !task.planArchived &&
      !task.supersededBy,
  );
}

export async function gateStep(
  store,
  session,
  { now = () => new Date(), timeoutMs = GATE_TIMEOUT_MS } = {},
) {
  const read0 = store.read(),
    notify = [];
  for (const task of openGates(read0)) {
    const stored = gateRecord(store, task.id),
      verdict = task.gateVerdict?.state,
      cleared = verdict === "order";
    // A cleared gate is a person's order (RC23.10); the plugin is not read.
    if (cleared) continue;
    const finished = verdict === "done";
    // A recorded done is read at most once more, for one note if it differs.
    if (finished && stored?.rechecked) continue;
    if (
      !finished &&
      stored?.nextCheck &&
      stored.nextCheck > now().toISOString()
    )
      continue;
    const reply = await read(session, task, timeoutMs),
      seen = screened(store, task.id, reply.evidence, reply.link),
      at = now().toISOString();
    if (finished) {
      store.put(GATE_RECORDS, { ...stored, rechecked: true, checkedAt: at });
      if (reply.state !== "done")
        store.event(null, "gate.differs", {
          taskId: task.id,
          state: reply.state,
          evidence: seen.evidence,
        });
      continue;
    }
    const same = stored?.state === reply.state,
      reads = same ? (stored.sameReads ?? 0) + 1 : 0,
      gap = BACKOFF_MINUTES[Math.min(reads, BACKOFF_MINUTES.length - 1)];
    store.put(GATE_RECORDS, {
      id: task.id,
      taskId: task.id,
      plugin: task.gate.plugin,
      item: task.gate.item,
      state: reply.state,
      evidence: seen.evidence,
      link: seen.link,
      checkedAt: at,
      nextCheck: new Date(Date.parse(at) + gap * 60_000).toISOString(),
      sameReads: reads,
      unknownRun: reply.state === "unknown" ? (stored?.unknownRun ?? 0) + 1 : 0,
      ...(reply.state === "done" ? { doneAt: at } : {}),
    });
    if (reply.state === "done") {
      // The verdict the release step reads; set once (RC23.7). A crash
      // between the two writes is repaired by the next read.
      store.mutate(`gate ${task.id} done`, (data) => {
        const row = data.tasks.find((t) => t.id === task.id);
        if (row && !DONE.has(row.gateVerdict?.state))
          row.gateVerdict = { state: "done", at };
      });
      store.event(null, "gate.done", { taskId: task.id });
    }
  }
  return { notify };
}
