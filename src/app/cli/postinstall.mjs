#!/usr/bin/env node
// npm's `postinstall`. Node does not strip types from files under
// node_modules, so an installed package must not load link-global.ts; it has
// nothing to link anyway (link-global.ts skipReason). A checkout links the
// global command.
import { fileURLToPath } from "node:url";

if (
  fileURLToPath(import.meta.url)
    .split(/[\\/]/)
    .includes("node_modules")
)
  console.log(
    "Not linking the global avoozl command: this is an installed package.",
  );
else (await import("./link-global.ts")).main();
