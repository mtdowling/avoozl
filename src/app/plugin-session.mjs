// One tick's use of plugins (design §4.8 Failure isolation). `connect(id,
// kind)` opens a plugin and returns `{call(method, params)}` or `{reason}`
// when it cannot be used; this wrapper checks every reply against the
// contract and turns any failure into one reason for that plugin. The first
// failure marks the plugin unavailable for the rest of the tick, so its
// tasks park as "needs you" and every other task keeps moving. The next
// tick tries again.
import { checkReply } from "./plugin-contract.mjs";

export class PluginUnavailable extends Error {
  constructor(id, reason) {
    super(`Plugin ${id} is unavailable: ${reason}`);
    this.pluginId = id;
    this.reason = reason;
  }
}

export function pluginSession(connect, { close = async () => {} } = {}) {
  const opened = new Map(),
    unavailable = new Map(),
    used = new Set();
  const session = {
    // {ok: true} or {ok: false, reason} for this tick.
    async use(id, kind) {
      used.add(id);
      if (unavailable.has(id))
        return { ok: false, reason: unavailable.get(id) };
      const key = `${id}\0${kind}`;
      if (!opened.has(key)) {
        let connection;
        try {
          connection = await connect(id, kind);
        } catch (error) {
          connection = { reason: error.message };
        }
        opened.set(key, connection);
      }
      const connection = opened.get(key);
      if (connection.reason) {
        unavailable.set(id, connection.reason);
        return { ok: false, reason: connection.reason };
      }
      return { ok: true };
    },
    // A checked reply, or PluginUnavailable.
    async call(id, kind, method, params) {
      const status = await session.use(id, kind);
      if (!status.ok) throw new PluginUnavailable(id, status.reason);
      const connection = opened.get(`${id}\0${kind}`);
      try {
        return checkReply(
          kind,
          method,
          await connection.call(`${kind}.${method}`, params),
        );
      } catch (error) {
        const reason = error.reason || error.message;
        unavailable.set(id, reason);
        throw new PluginUnavailable(id, reason);
      }
    },
    unavailable: (id) => unavailable.get(id) ?? null,
    // Mark a plugin unavailable for a reason found outside one reply, such
    // as a tracker that did not store its marker.
    fail(id, reason) {
      used.add(id);
      unavailable.set(id, reason);
    },
    // The opened plugin's manifest and entry config, for capabilities and
    // allowedActors. Null before `use` succeeded.
    describe(id, kind) {
      const connection = opened.get(`${id}\0${kind}`);
      return connection && !connection.reason
        ? {
            capabilities: connection.manifest?.capabilities?.[kind] ?? [],
            config: connection.config ?? {},
          }
        : null;
    },
    // Every plugin this tick touched: {id, state: ok|unavailable, reason}.
    report: () =>
      [...used]
        .sort()
        .map((id) =>
          unavailable.has(id)
            ? { id, state: "unavailable", reason: unavailable.get(id) }
            : { id, state: "ok", reason: null },
        ),
    close,
  };
  return session;
}

// The tick's health receipt per plugin, for Settings and every view that
// shows a parked task. Written only when the state or reason changed.
export function recordHealth(store, report, at = new Date().toISOString()) {
  for (const row of report) {
    const stored = store.get("plugin_health", row.id);
    if (stored && stored.state === row.state && stored.reason === row.reason)
      continue;
    store.transaction(() => store.put("plugin_health", { ...row, since: at }));
  }
}

export function pluginHealth(store) {
  try {
    return new Map(store.list("plugin_health").map((row) => [row.id, row]));
  } catch {
    return new Map();
  }
}
