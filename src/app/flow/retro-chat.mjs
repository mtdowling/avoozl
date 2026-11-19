// What the Retros page shows of a retro's chat: the Kiro Crew link, or for a
// `process` session the log tail and attach command (R98.1). Read-only, from
// the retro's own record (`session`, stamped at bind time) and, for a retro
// from before that, the session binding named for it. No call to Kiro Crew.
import { machineAvoozlPaths } from "../settings/host-config.mjs";
import { sessionUrl } from "../tick/notifications.mjs";
import { processSessionDetails } from "../executors/process-view.mjs";

export function withRetroChats(store, retros, paths = machineAvoozlPaths()) {
  const bindings = store.list("session_bindings"),
    found = retros.map((retro) => {
      const binding = bindings
        .filter((b) => b.taskId === retro.id && b.role === "retro")
        .at(-1);
      const slot = retro.session?.slot ?? binding?.slot;
      return { retro, binding, slot };
    }),
    process = processSessionDetails(
      found
        .filter(
          ({ retro, binding }) =>
            (retro.session?.executor ?? binding?.executor) === "process",
        )
        .map(({ slot }) => slot),
      paths,
    );
  return found.map(({ retro, binding, slot }) => {
    if (!slot) return { ...retro, chat: null };
    const executor = retro.session?.executor ?? binding?.executor ?? "kirocrew";
    return {
      ...retro,
      chat: {
        slot,
        executor,
        harness: retro.session?.harness ?? null,
        status: binding?.status ?? null,
        link: executor === "process" ? null : sessionUrl(slot),
        ...(process.has(slot) ? { process: process.get(slot) } : {}),
      },
    };
  });
}
