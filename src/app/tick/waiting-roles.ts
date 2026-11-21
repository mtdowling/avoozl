// @ts-nocheck: typing debt
// The roles with a request waiting, kept in one meta entry (needs-kirocrew.mjs,
// needs-harness.mjs): `entries` are {role, id, extra} for each waiting request.
// `since` stays from the first tick that saw the role waiting.
export function recordWaitingRoles(store, metaKey, entries, now) {
  const before = store.getMeta(metaKey);
  const previous = before && typeof before === "object" ? before : {};
  const next = {};
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
