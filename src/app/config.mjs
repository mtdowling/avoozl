import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const applicationRoot = fileURLToPath(
  new URL("../../", import.meta.url),
);
export function workspaceConfig(options = {}) {
  const workspaceRoot = path.resolve(
    options.workspace || process.env.AICOMMANDER_WORKSPACE || process.cwd(),
  );
  const filename = path.join(workspaceRoot, "workspace.json");
  let saved = {};
  if (fs.existsSync(filename)) {
    saved = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (saved.version !== 1)
      throw Error("Unsupported workspace configuration version.");
  }
  const relative = (value) => path.resolve(workspaceRoot, value);
  const port = Number(options.port ?? saved.port ?? 9428);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw Error("Choose a port from 0 to 65535.");
  const dbPath = relative(
    options.db ||
      process.env.AICOMMANDER_DB ||
      process.env.NUPP_WORKSPACE_DB ||
      saved.dbPath ||
      "state/workspace.sqlite",
  );
  const plansRoot = relative(
    options.documents || options["plans-root"] || saved.documents || "plans",
  );
  return {
    workspaceRoot,
    filename,
    configured: fs.existsSync(filename),
    name: saved.name || "My workspace",
    dbPath,
    plansRoot,
    port,
    host: options.host || saved.host || "127.0.0.1",
    agentManifest: relative(
      options["agent-manifest"] ||
        saved.agentManifest ||
        path.join(path.dirname(dbPath), "agent-host.json"),
    ),
    endpoint:
      options.url ||
      process.env.AICOMMANDER_URL ||
      process.env.NUPP_WORKSPACE_URL ||
      saved.url ||
      "http://127.0.0.1:" + port,
    // Editor client surface. The agent host facade is opt-in, binds loopback,
    // and keeps its derived projection and client tokens beside the database.
    ahp: {
      port: Number(options["ahp-port"] ?? saved.ahpPort ?? 9496),
      host: options["ahp-host"] || saved.ahpHost || "127.0.0.1",
      projection: relative(
        options["ahp-projection"] ||
          saved.ahpProjection ||
          path.join(path.dirname(dbPath), "ahp.sqlite"),
      ),
      tokens: relative(
        options["ahp-tokens"] ||
          saved.ahpTokens ||
          path.join(path.dirname(dbPath), "ahp-tokens.json"),
      ),
      manifest: relative(
        options["ahp-manifest"] ||
          saved.ahpManifest ||
          path.join(path.dirname(dbPath), "ahp-facade.json"),
      ),
    },
  };
}
