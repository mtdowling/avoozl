// The roles with a request waiting, kept in one meta entry (needs-kirocrew.mjs,
// needs-harness.mjs): `entries` are {role, id, extra} for each waiting request.
// `since` stays from the first tick that saw the role waiting.
import type { Store } from "../store/store.ts";

export type Waiting = {
  role: string;
  since: string;
  requests: string[];
  [key: string]: unknown;
};

export function recordWaitingRoles(
  store: Store,
  metaKey: string,
  entries: { role: string; id: string; extra?: Record<string, unknown> }[],
  now: number | string | Date,
) {
  const before = store.getMeta<Record<string, Waiting>>(metaKey);
  const previous = before && typeof before === "object" ? before : {};
  const next: Record<string, Waiting> = {};
  for (const { role, id, extra = {} } of entries) {
    next[role] ??= {
      role,
      ...extra,
      since: previous[role]?.since ?? new Date(now).toISOString(),
      requests: [],
    };
    next[role].requests.push(id);
  }
  if (JSON.stringify(next) !== JSON.stringify(previous))
    store.setMeta(metaKey, next);
  return next;
}
