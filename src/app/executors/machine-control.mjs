// The machine server's control interface with its MCP rules (MS9, MS10.2):
// each claim's calls go through the Kiro Crew app's workspace rules
// (app-mcp.mjs), moved into the server. A `kirocrew` claim carries the
// gateway's caller block, which is attested as it is today; any other claim
// only names a workspace, and its caller block is dropped.
import path from "node:path";
import { createAppMcp } from "./kirocrew/app-mcp.mjs";
import { workspaceConfig } from "../settings/config.mjs";
import { startControl } from "./control-server.mjs";
import { machineLockPaths, readRecord, writeRecord } from "./machine-lock.mjs";

export async function serveControl({ stateDirectory, env = process.env }) {
  const servers = new Map();
  const serverFor = (claim) => {
    const kirocrew = claim.kind === "kirocrew";
    const workspace =
      typeof claim.workspace === "string" && path.isAbsolute(claim.workspace)
        ? claim.workspace
        : null;
    const sessionKey =
      kirocrew && typeof claim.sessionKey === "string" ? claim.sessionKey : "";
    const key = JSON.stringify([kirocrew, workspace, sessionKey]);
    if (!servers.has(key)) {
      const scoped = { ...env };
      delete scoped.KIROCREW_SESSION_KEY;
      if (sessionKey) scoped.KIROCREW_SESSION_KEY = sessionKey;
      servers.set(
        key,
        createAppMcp({
          fallback: workspace
            ? workspaceConfig({ workspace, env: scoped })
            : null,
          env: scoped,
          // This is the machine server: one runs.
          ensureServer: () => ({ started: false }),
          attested: kirocrew,
        }),
      );
    }
    return servers.get(key);
  };
  const control = await startControl({
    stateDirectory,
    handle: (message, claim) => serverFor(claim).handle(message),
  });
  // The holder adds the address to its record, after it holds the lock.
  const { record } = machineLockPaths(stateDirectory);
  try {
    writeRecord(record, { ...readRecord(record), control: control.address });
  } catch (error) {
    control.close();
    throw error;
  }
  return {
    address: control.address,
    close() {
      control.close();
      for (const server of servers.values()) server.close();
    },
  };
}
