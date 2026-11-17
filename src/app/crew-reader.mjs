// Reads the connected crews and each one's headroom through the gateway
// (F80, F82, MC-12) and records the crew snapshot. Kiro Crew serves both
// routes to the owner's own session only (its owner check refuses a request
// carrying an app claim, whatever `permissions.api` grants), so with an app
// token the first read is refused and the refusal is recorded as the reason
// no remote crew shows. Nothing here calls the hub's remote-dispatch path.
import { isCrewId, LOCAL, recordCrewSnapshot } from "./crews.mjs";

const REFUSAL = "crews.read";

// What the last read answered: {ok, status, code?, readAt}, or null.
export const crewRead = (store) => store.getMeta(REFUSAL);

const json = async (response) => response.json().catch(() => ({}));

// `client` is gatewayClient(); null without one (the CLI, tests). Never
// throws: a failed read keeps the last snapshot and records why.
export async function readCrews(store, client) {
  if (!client) return null;
  const note = (status, code) => {
    const value = {
      ok: status === 200,
      status,
      ...(code ? { code } : {}),
      readAt: new Date().toISOString(),
    };
    store.setMeta(REFUSAL, value);
    return value;
  };
  let list;
  try {
    list = await client.call("/api/instances", { method: "GET" });
  } catch {
    return note(0, "unreachable");
  }
  const body = await json(list);
  if (!list.ok)
    return note(list.status, String(body.code || body.error || "refused"));
  const rows = (Array.isArray(body.instances) ? body.instances : []).filter(
      (row) => isCrewId(row?.id) && row.id !== LOCAL,
    ),
    headroom = {};
  await Promise.all(
    rows.map(async (row) => {
      try {
        const answer = await client.call(
          `/api/instances/${encodeURIComponent(row.id)}/proxy/api/chat/headroom`,
          { method: "GET" },
        );
        if (answer.ok) headroom[row.id] = await json(answer);
      } catch {}
    }),
  );
  recordCrewSnapshot(store, {
    instances: rows.map((row) => ({
      id: row.id,
      name: row.name,
      reachable: row.status?.state === "connected",
    })),
    headroom,
  });
  return note(200);
}
