import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadLayeredConfig } from "./layered-config.mjs";

export const applicationRoot = fileURLToPath(
  new URL("../../", import.meta.url),
);
// Who operates this workspace. Provenance of the records it mints, not an
// authorization check: approval authority comes from the reviewed hashes.
export function operatorName({ configured, workspaceRoot } = {}) {
  let name = configured;
  if (!name?.trim() && workspaceRoot && fs.existsSync(workspaceRoot))
    try {
      name = execFileSync("git", ["config", "--get", "user.name"], {
        cwd: workspaceRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      });
    } catch {}
  if (!name?.trim())
    try {
      name = os.userInfo().username;
    } catch {}
  return (name || "").trim().slice(0, 200) || "Local operator";
}
export function workspaceConfig(options = {}) {
  const env = options.env || process.env;
  const workspaceRoot = path.resolve(
    // AVOOZL_* is the current form. AICOMMANDER_* and NUPP_WORKSPACE_* stay
    // accepted: they are compatibility interfaces, not names to drop because
    // the product was renamed.
    options.workspace ||
      env.AVOOZL_WORKSPACE ||
      env.AICOMMANDER_WORKSPACE ||
      env.NUPP_WORKSPACE ||
      process.cwd(),
  );
  const loaded = loadLayeredConfig({
      workspaceRoot,
      options,
      env,
      home: options.home,
    }),
    saved = loaded.config,
    filename = loaded.files.repository;
  const relative = (value) => path.resolve(workspaceRoot, value);
  const port = Number(options.port ?? saved.port ?? 9428);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw Error("Choose a port from 0 to 65535.");
  const dbPath = relative(
    saved.dbPath || path.join(".avoozl", "local", "workspace.sqlite"),
  );
  const plansRoot = relative(saved.documents || "plans");
  return {
    workspaceRoot,
    filename,
    legacyFilename: loaded.files.legacy,
    configured: loaded.localConfigured,
    configFiles: loaded.files,
    configSources: loaded.sources,
    configWithoutRepository: loaded.configWithoutRepository,
    name: saved.name || "My workspace",
    operator: operatorName({
      configured: saved.operator,
      workspaceRoot,
    }),
    dbPath,
    plansRoot,
    port,
    safety: saved.safety || null,
    endpoint: saved.url || "http://127.0.0.1:" + port,
  };
}
