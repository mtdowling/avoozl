// Entrypoint for the agent host facade process.
//
// The facade reads the workspace database directly (SQLite allows concurrent
// readers) and sends every command through the running workspace server, so
// the single persistent agent host keeps sole ownership of each provider
// process. Starting this process never creates a second writer.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../store.mjs";
import { remoteClient } from "../client.mjs";
import { startAhpFacade } from "./facade.mjs";
import { agentProviderId } from "./projection.mjs";

export async function startFacadeForWorkspace({
  dbPath,
  endpoint,
  manifestPath,
  projectionPath,
  host = "127.0.0.1",
  port = 9496,
  tokenFile,
  allowNonLoopback = false,
}) {
  const store = new Store(dbPath);
  if (!store.initialized()) {
    store.close();
    throw Error("Initialize a workspace before starting the facade.");
  }
  const client = remoteClient({ endpoint });
  // Confirm the workspace speaks a compatible client API before advertising
  // anything to an editor.
  const described = await client.describe();
  const tokens = loadTokens(tokenFile);
  const facade = startAhpFacade({
    store,
    client,
    file: projectionPath,
    host,
    port,
    tokens,
    manifestPath,
    allowNonLoopback,
    models: async () => {
      const agents = [];
      for (const provider of ["claude", "codex"]) {
        try {
          const catalog = await client.models(provider);
          agents.push({
            provider: agentProviderId(provider),
            displayName: "AICommander " + provider,
            description:
              "Sessions owned by this workspace's persistent agent host.",
            models: catalog.models.map((model) => ({
              id: model.id,
              provider: agentProviderId(provider),
              name: model.label || model.id,
              ...(model._meta ? { _meta: model._meta } : {}),
            })),
            protectedResources: [],
          });
        } catch (error) {
          // A provider that cannot be reached is advertised with no models
          // rather than with invented ones.
          agents.push({
            provider: agentProviderId(provider),
            displayName: "AICommander " + provider,
            description: "Unavailable: " + error.message,
            models: [],
            protectedResources: [],
          });
        }
      }
      return agents;
    },
  });
  await facade.listening;
  facade.store = store;
  facade.workspace = described;
  return facade;
}

// Tokens live in a 0600 file beside the workspace state. A missing file gets
// one generated token; the facade never accepts an unauthenticated client.
export function loadTokens(tokenFile) {
  if (!tokenFile) return null;
  if (fs.existsSync(tokenFile)) {
    const parsed = JSON.parse(fs.readFileSync(tokenFile, "utf8"));
    if (parsed.version !== 1) throw Error("Unsupported facade token file.");
    return parsed.tokens;
  }
  const tokens = {
    [randomUUID() + randomUUID().replaceAll("-", "")]: {
      name: "editor",
      scope: "full",
    },
    [randomUUID() + randomUUID().replaceAll("-", "")]: {
      name: "observer",
      scope: "read",
    },
  };
  fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
  fs.writeFileSync(
    tokenFile + ".pending",
    JSON.stringify({ version: 1, tokens }, null, 2) + "\n",
    { mode: 0o600 },
  );
  fs.renameSync(tokenFile + ".pending", tokenFile);
  return tokens;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [
    dbPath,
    endpoint,
    manifestPath,
    projectionPath,
    tokenFile,
    port,
    host,
  ] = process.argv.slice(2);
  const facade = await startFacadeForWorkspace({
    dbPath,
    endpoint,
    manifestPath,
    projectionPath,
    tokenFile,
    port: Number(port || 9496),
    host: host || "127.0.0.1",
  });
  console.log("AICommander agent host facade: " + facade.url);
  const stop = async () => {
    await facade.close();
    facade.store.close();
    process.exit(0);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
