// @ts-nocheck: typing debt
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadLayeredConfig } from "./layered-config.ts";

export const applicationRoot = fileURLToPath(
  new URL("../../../", import.meta.url),
);
// git's user.name per workspace root, read once per process. The app backend
// resolves a workspace's config on every request, and each `git config` is a
// blocking child process (about 50 ms on macOS), so Home's first load of ~17
// reads spent seconds here with the backend's event loop stopped.
// shortcut: a changed user.name shows after a restart, as the open
// Operations' operator already did.
const gitUserNames = new Map();
function gitUserName(workspaceRoot) {
  if (gitUserNames.has(workspaceRoot)) return gitUserNames.get(workspaceRoot);
  let name = "";
  try {
    name = execFileSync("git", ["config", "--get", "user.name"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
  } catch {}
  gitUserNames.set(workspaceRoot, name);
  return name;
}

// Who operates this workspace. Provenance of the records it mints, not an
// authorization check: approval authority comes from the reviewed hashes.
export function operatorName({ configured, workspaceRoot } = {}) {
  let name = configured;
  if (!name?.trim() && workspaceRoot && fs.existsSync(workspaceRoot))
    name = gitUserName(path.resolve(workspaceRoot));
  if (!name?.trim())
    try {
      name = os.userInfo().username;
    } catch {}
  return (name || "").trim().slice(0, 200) || "Local operator";
}
// The root a command names with --workspace or AVOOZL_WORKSPACE, else here.
const rootOf = (options, env) =>
  path.resolve(options.workspace || env.AVOOZL_WORKSPACE || process.cwd());

export interface WorkspaceConfig {
  workspaceRoot: string;
  filename: string;
  legacyFilename?: string;
  configured: boolean;
  configFiles: { global: string; repository: string; [key: string]: unknown };
  configSources: unknown;
  configWithoutRepository: unknown;
  name: string;
  operator: string;
  dbPath: string;
  plansRoot: string;
  port: number;
  endpoint: string;
}

export function workspaceConfig(options = {}): WorkspaceConfig {
  const env = options.env || process.env;
  const workspaceRoot = rootOf(options, env);
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
    endpoint: "http://127.0.0.1:" + port,
  };
}

// workspaceConfig, or, when the workspace's configuration does not load, its
// root and the refusal as `configError`. The app backend and MCP server
// start with it and refuse that workspace's operations with the same
// message, so one bad key does not take the page down.
export function readWorkspaceConfig(
  options = {},
): WorkspaceConfig | { workspaceRoot: string; configError: string } {
  try {
    return workspaceConfig(options);
  } catch (error) {
    return {
      workspaceRoot: rootOf(options, options.env || process.env),
      configError: error.message,
    };
  }
}
