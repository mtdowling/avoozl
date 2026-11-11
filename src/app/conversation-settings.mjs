import { resolveTaskId } from "../task-identity.mjs";
import { fail } from "./store.mjs";
import {
  AGENT_ROUTING_DEFAULTS,
  normalizeAgentRouting,
} from "./agent-routing.mjs";

export const CONVERSATION_SETTINGS_DEFAULTS = Object.freeze({
  autoArchiveCompleted: true,
  driverAgentProfile: null,
  driverModel: null,
  routing: AGENT_ROUTING_DEFAULTS,
});

export function conversationSettings(store) {
  return {
    ...CONVERSATION_SETTINGS_DEFAULTS,
    ...(store.getMeta("conversationSettings") || {}),
  };
}

export function normalizeConversationSettings(current, input = {}) {
  if (
    "autoArchiveCompleted" in input &&
    typeof input.autoArchiveCompleted !== "boolean"
  )
    fail("Choose whether completed conversations auto-archive.");
  for (const key of ["driverAgentProfile", "driverModel"])
    if (key in input && input[key] !== null && typeof input[key] !== "string")
      fail("Driver agent and model choices must be text.");
  const settings = {
    autoArchiveCompleted:
      input.autoArchiveCompleted ?? current.autoArchiveCompleted,
    driverAgentProfile:
      "driverAgentProfile" in input
        ? input.driverAgentProfile?.trim() || null
        : current.driverAgentProfile,
    driverModel:
      "driverModel" in input
        ? input.driverModel?.trim() || null
        : current.driverModel,
    routing:
      "routing" in input
        ? normalizeAgentRouting(input.routing)
        : normalizeAgentRouting(current.routing || AGENT_ROUTING_DEFAULTS),
  };
  return settings;
}

export function updateConversationSettings(store, input = {}) {
  const settings = normalizeConversationSettings(
    conversationSettings(store),
    input,
  );
  store.setMeta("conversationSettings", settings);
  store.event(null, "conversations.settings.updated", settings);
  return settings;
}

export function autoArchiveCompletedRun(
  store,
  run,
  at = new Date().toISOString(),
) {
  if (
    !conversationSettings(store).autoArchiveCompleted ||
    run.driver ||
    run.state !== "completed"
  )
    return false;
  const taskId = resolveTaskId(store.read(), run.taskId),
    taskBound = store.read().tasks.some((task) => task.id === taskId);
  if (!run.parentRunId && !taskBound) return false;
  const key = "runArchive:" + run.id;
  if (store.getMeta(key)) return false;
  store.setMeta(key, at);
  store.event(run.id, "run.auto-archived", {
    id: run.id,
    archivedAt: at,
    reason: run.parentRunId ? "completed-child" : "completed-task",
  });
  return true;
}
