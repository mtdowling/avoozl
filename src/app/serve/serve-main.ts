// @ts-nocheck: typing debt
// The standalone page's server as a child of the tick (SW9). A tick starts it
// with `serve.enabled`, starts it again when it has exited, and keeps its
// port when `serve.port` fixes one (page-child.mjs). It prints no owner link:
// the owner runs `avoozl link` at this machine's own shell.
import fs from "node:fs";
import { parseArgs } from "node:util";
import path from "node:path";
import { workspaceConfig } from "../settings/config.ts";
import { loadHostConfig } from "../settings/host-config.ts";
import { startServe } from "./serve-server.ts";
import { standaloneUiDirectory } from "./ui-bundle.ts";

const { values } = parseArgs({
  options: {
    "state-directory": { type: "string" },
    "config-directory": { type: "string" },
    port: { type: "string" },
    // Where to write output when started with no stdout (Windows).
    log: { type: "string" },
  },
});
if (values.log) {
  const out = fs.openSync(values.log, "a", 0o600);
  for (const stream of [process.stdout, process.stderr])
    stream.write = (chunk, encoding, done) => {
      fs.writeSync(out, typeof chunk === "string" ? chunk : Buffer.from(chunk));
      if (typeof encoding === "function") encoding();
      else if (typeof done === "function") done();
      return true;
    };
}
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
