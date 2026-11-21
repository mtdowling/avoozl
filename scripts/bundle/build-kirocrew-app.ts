#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";
import { build } from "vite";
import { buildHosts } from "./build-hosts.ts";
import { writeUiStamp } from "../../src/app/serve/ui-bundle.ts";
import { buildStandalone } from "./build-standalone.ts";

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
  ),
  app = path.join(root, "hosts", "kirocrew"),
  ui = path.join(app, "ui"),
  lib = path.join(app, "bin", "lib"),
  tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");

await buildHosts({ root });

execFileSync(
  process.execPath,
  [tsc, "--project", path.join(ui, "tsconfig.json")],
  {
    cwd: root,
    stdio: "inherit",
  },
);
await build({
  root: ui,
  configFile: path.join(ui, "vite.config.ts"),
});
// The installed backend refuses a page built from other source (ui-bundle.ts).
writeUiStamp(ui);
// The standalone page (SW2). A failure is reported and fails the build at the
// end, after everything else is built.
let standaloneError: Error | null = null;
try {
  await buildStandalone({ ui });
} catch (error) {
  standaloneError = error as Error;
}

// Kiro Crew installs the app by copying kirocrew-app, and refuses entry points
// that resolve outside it, so the CLI and its npm dependencies are copied in.
// preserveModules keeps every source file at its repository-relative path, so
// the files modules read beside themselves (schemas, the skill, examples)
// resolve the same way they do in a checkout.
fs.rmSync(lib, { recursive: true, force: true });
const bundle = await rolldown({
  // The CLI, and the programs a tick starts by path.
  input: [
    "cli.ts",
    "src/app/executors/supervisor-child.ts",
    "src/app/executors/context-broker-main.ts",
    "src/app/executors/context-relay.ts",
    "src/app/serve/serve-main.ts",
    // Started as its own process by plugins.ts, so nothing imports it.
    "src/app/plugins/plugin-child.ts",
  ].map((file) => path.join(root, file)),
  platform: "node",
  // Keep linked dependencies (a task worktree's node_modules link) at their
  // in-tree path, so no machine path reaches the package.
  resolve: { symlinks: false },
  logLevel: "warn",
});
await bundle.write({
  dir: lib,
  format: "esm",
  preserveModules: true,
  preserveModulesRoot: root,
  // Name dependencies by package path, outside any node_modules directory.
  entryFileNames: ({ name }) =>
    name.replace(/^(?:.*\/)?node_modules\//, "vendor/") + ".mjs",
  chunkFileNames: "[name].mjs",
});
await bundle.close();
for (const data of [
  ...fs
    .readdirSync(path.join(root, "src"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join("src", name)),
  path.join("src", "app", "skills"),
  "examples",
  "prompts",
])
  fs.cpSync(path.join(root, data), path.join(lib, data), { recursive: true });
fs.writeFileSync(
  path.join(lib, "package.json"),
  // The bundle's version, read from package.json beside it.
  JSON.stringify(
    {
      type: "module",
      private: true,
      version: JSON.parse(
        fs.readFileSync(path.join(root, "package.json"), "utf8"),
      ).version,
    },
    null,
    2,
  ) + "\n",
);
if (standaloneError) {
  console.error(
    `The standalone page did not build: ${standaloneError.message}`,
  );
  process.exitCode = 1;
}
