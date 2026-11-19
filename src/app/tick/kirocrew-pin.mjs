// A task pinned to the `kirocrew` executor, on a machine with no Kiro Crew
// (standalone-web SW10.4). Nothing there takes a Kiro Crew chat request, and
// Avoozl never falls back to another executor by itself, so the task waits and
// one Needs you item names the pin. The item is read from the stored requests,
// so the tick makes no second one.
import { KIROCREW_HARNESS } from "../settings/chat-models.mjs";

export function kirocrewPinNeedsYou(store) {
  const rows = [],
    seen = new Set(),
    tasks = new Map(store.read().tasks.map((task) => [task.id, task]));
  for (const row of store.list("session_requests")) {
    if (
      row.kind !== "start" ||
      row.executor !== KIROCREW_HARNESS ||
      row.state !== "pending"
    )
      continue;
    const taskId = row.request?.task,
      task = tasks.get(taskId);
    if (!task || task.session?.harness !== KIROCREW_HARNESS || seen.has(taskId))
      continue;
    seen.add(taskId);
    rows.push({
      id: `kirocrew-pin:${taskId}`,
      kind: "needs-human",
      reason: "needs-kirocrew",
      taskId,
      authority: "avoozl",
      title: `Task ${taskId} is pinned to Kiro Crew, which is not running here`,
      detail:
        "The task's session pin names the kirocrew executor, which needs Kiro Crew. Avoozl does not start it another way by itself. Pick a harness for the task in its session pin, or open Avoozl in Kiro Crew.",
      link: null,
      openedAt: row.request?.requestedAt ?? null,
    });
  }
  return rows;
}
