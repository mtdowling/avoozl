// The standalone page's server as a supervised child (SW9). The supervisor
// starts it with `serve.enabled`, restarts it when it exits, and keeps its
// port when `serve.port` fixes one. It prints no owner link: the owner runs
// `avoozl serve link` at this machine's own shell.
import { parseArgs } from "node:util";
import path from "node:path";
import { workspaceConfig } from "./config.mjs";
import { loadHostConfig } from "./host-config.mjs";
import { startServe } from "./serve-server.mjs";
import { standaloneUiDirectory } from "./ui-bundle.mjs";

const { values } = parseArgs({
  options: {
    "state-directory": { type: "string" },
    "config-directory": { type: "string" },
    port: { type: "string" },
  },
});
const stateDirectory = path.resolve(values["state-directory"]),
  configDirectory = path.resolve(values["config-directory"]);
// The served workspace is the catalog's default; the page's picker reaches the
// others by id.
const host = loadHostConfig({
  configPath: path.join(configDirectory, "config.json"),
  catalogPath: path.join(stateDirectory, "catalog.sqlite"),
}).config;
const root = host.workspaces[host.defaultWorkspace]?.root;
const server = await startServe({
  config: workspaceConfig(root ? { workspace: root } : {}),
  port: Number(values.port ?? 0),
  uiDir: standaloneUiDirectory(),
  stateDirectory,
  link: false,
  registryOptions: {
    configPath: path.join(configDirectory, "config.json"),
    catalogPath: path.join(stateDirectory, "catalog.sqlite"),
  },
});
console.log(`Avoozl is at ${server.origin}`);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => server.close(() => process.exit(0)));
