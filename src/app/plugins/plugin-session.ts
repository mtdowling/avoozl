// One tick's use of plugins (design §4.8 Failure isolation). `connect(id,
// kind)` opens a plugin and returns `{call(method, params)}` or `{reason}`
// when it cannot be used; this wrapper checks every reply against the
// contract and turns any failure into one reason for that plugin. The first
// failure marks the plugin unavailable for the rest of the tick, so its
// rule sets show the reason and everything else keeps
// moving. The next tick tries again.
import { checkReply } from "./plugin-contract.ts";
import type { Store } from "../store/store.ts";

// One call to an opened plugin.
type Call = (method: string, params: unknown) => Promise<unknown>;
// An opened plugin: its call, manifest and config, or why it cannot be used.
interface Connection {
  reason?: string;
  call?: Call;
  manifest?: { capabilities?: Record<string, unknown[]> };
  config?: unknown;
}
type Connect = (id: string, kind: string) => Promise<Connection> | Connection;

class PluginUnavailable extends Error {
  pluginId: string;
  reason: string;
  constructor(id: string, reason: string) {
    super(`Plugin ${id} is unavailable: ${reason}`);
    this.pluginId = id;
    this.reason = reason;
  }
}

export function pluginSession(
  connect: Connect,
  { close = async () => {} }: { close?: () => Promise<void> } = {},
) {
  const opened = new Map<string, Connection>(),
    unavailable = new Map<string, string>(),
    used = new Set<string>();
  const session = {
    // {ok: true} or {ok: false, reason} for this tick.
    async use(id: string, kind: string) {
      used.add(id);
      if (unavailable.has(id))
        return { ok: false, reason: unavailable.get(id) };
      const key = `${id}\0${kind}`;
      if (!opened.has(key)) {
        let connection: Connection;
        try {
          connection = await connect(id, kind);
        } catch (error) {
          connection = { reason: (error as Error).message };
        }
        opened.set(key, connection);
      }
      const connection = opened.get(key) as Connection;
      if (connection.reason) {
        unavailable.set(id, connection.reason);
        return { ok: false, reason: connection.reason };
      }
      return { ok: true };
    },
    // A checked reply, or PluginUnavailable.
    async call(id: string, kind: string, method: string, params: unknown) {
      const status = await session.use(id, kind);
      if (!status.ok) throw new PluginUnavailable(id, String(status.reason));
      const connection = opened.get(`${id}\0${kind}`) as Connection;
      try {
        return checkReply(
          kind,
          method,
          await (connection.call as Call)(`${kind}.${method}`, params),
        );
      } catch (error) {
        const reason =
          (error as { reason?: string }).reason || (error as Error).message;
        unavailable.set(id, reason);
        throw new PluginUnavailable(id, reason);
      }
    },
    unavailable: (id: string) => unavailable.get(id) ?? null,
    // The opened plugin's manifest and entry config, for capabilities. Null before `use` succeeded.
    describe(id: string, kind: string) {
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

export function pluginHealth(store: Store) {
  try {
    return new Map(
      store
        .list<{ id: string; [key: string]: unknown }>("plugin_health")
        .map((row) => [row.id, row]),
    );
  } catch {
    return new Map();
  }
}
