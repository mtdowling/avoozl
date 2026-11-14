#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  app = path.join(root, "kirocrew-app"),
  ui = path.join(app, "ui"),
  lib = path.join(app, "bin", "lib"),
  tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");

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
// The side-panel tab is its own bundle (contributes.panelTabs).
await build({
  root: ui,
  configFile: path.join(ui, "vite.config.ts"),
  mode: "panel",
});

// Kiro Crew installs the app by copying kirocrew-app, and refuses entry points
// that resolve outside it, so the CLI and its npm dependencies are copied in.
// preserveModules keeps every source file at its repository-relative path, so
// the files modules read beside themselves (schemas, the skill, examples)
// resolve the same way they do in a checkout.
fs.rmSync(lib, { recursive: true, force: true });
const bundle = await rolldown({
  input: path.join(root, "cli.mjs"),
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
  path.join("src", "app", "runner"),
  // Started as its own process by plugins.mjs, so the bundle never imports it.
  path.join("src", "app", "plugin-child.mjs"),
  "examples",
])
  fs.cpSync(path.join(root, data), path.join(lib, data), { recursive: true });
fs.writeFileSync(
  path.join(lib, "package.json"),
  // flow-retro.mjs reads the version from ../../package.json beside itself.
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
