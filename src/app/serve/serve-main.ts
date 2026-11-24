// The standalone page's server as a child of the tick (SW9). A tick starts it
// unless `serve.enabled` is false, starts it again when it has exited, and keeps its
// port when `serve.port` fixes one (page-child.mjs). It prints no owner link:
// the owner runs `avoozl link` at this machine's own shell.
import fs from "node:fs";
import { parseArgs } from "node:util";
import path from "node:path";
import { workspaceConfig } from "../settings/config.ts";
import { loadHostConfig } from "../settings/host-config.ts";
import { serveStatus } from "../workspace/machine-status.ts";
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
    stream.write = ((
      chunk: string | Uint8Array,
      encoding?: unknown,
      done?: unknown,
    ) => {
      fs.writeSync(out, typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      if (typeof encoding === "function") encoding();
      else if (typeof done === "function") done();
      return true;
    }) as typeof stream.write;
}
const stateDirectory = path.resolve(values["state-directory"] ?? ""),
  configDirectory = path.resolve(values["config-directory"] ?? "");
// The served workspace is the catalog's default; the page's picker reaches the
// others by id.
const host = loadHostConfig({
  configPath: path.join(configDirectory, "config.json"),
  catalogPath: path.join(stateDirectory, "catalog.sqlite"),
}).config;
const root = host.defaultWorkspace
  ? host.workspaces[host.defaultWorkspace]?.root
  : undefined;
let server;
try {
  server = await startServe({
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
} catch (error) {
  // Why the page is not up (such as "port 4100 is in use"), for `avoozl
  // status`; the next tick tries again.
  const problem = `The standalone page cannot start: ${(error as Error).message}`;
  console.error(problem);
  if (!serveStatus(stateDirectory).running) {
    fs.mkdirSync(stateDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(stateDirectory, "serve.json"),
      JSON.stringify({ pid: process.pid, error: problem }) + "\n",
      { mode: 0o600 },
    );
  }
  process.exit(1);
}
console.log(`Avoozl is at ${server.origin}`);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => server.close(() => process.exit(0)));
