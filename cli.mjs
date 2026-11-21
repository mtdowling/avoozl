#!/usr/bin/env node
// The `avoozl` command (package.json `bin`). Node does not strip types from
// files under node_modules, so an installed package runs the built CLI
// (`npm run build:kirocrew-app` writes it; `prepack` runs the build). A
// checkout, or a checkout linked globally, runs cli.ts from source.
import { fileURLToPath } from "node:url";

const installed = fileURLToPath(import.meta.url)
  .split(/[\\/]/)
  .includes("node_modules");
await import(installed ? "./hosts/kirocrew/bin/lib/cli.mjs" : "./cli.ts");
