#!/usr/bin/env node
// Pack, install and run smoke test for the npm package (design §13 gate 11).
// Builds and packs this checkout, installs the tarball into an
// empty project, and runs the installed `avoozl` command. Node does not strip
// types under node_modules, so this fails when `bin` or `postinstall` reaches
// a .ts file.
//   node scripts/check/pack-smoke.ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
  ),
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-pack-")),
  project = path.join(tmp, "project");

function npm(args: string[], cwd: string) {
  const result = spawnSync("npm", args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: { ...process.env, AVOOZL_NO_GLOBAL_LINK: "1" },
  });
  if (result.status !== 0)
    throw Error(
      `npm ${args.join(" ")} failed (${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  return result.stdout;
}

try {
  // Build as `prepack` does, then pack without scripts so stdout is only JSON.
  npm(["run", "build"], root);
  const [packed] = JSON.parse(
    npm(
      ["pack", "--json", "--ignore-scripts", "--pack-destination", tmp],
      root,
    ),
  );
  fs.mkdirSync(project);
  fs.writeFileSync(
    path.join(project, "package.json"),
    JSON.stringify({ name: "pack-smoke", private: true }) + "\n",
  );
  npm(
    ["install", "--no-audit", "--no-fund", path.join(tmp, packed.filename)],
    project,
  );
  const help = npm(["exec", "--no", "--", "avoozl", "--help"], project);
  if (!help.includes("Usage: avoozl"))
    throw Error(`The installed avoozl command printed no usage:\n${help}`);
  console.log(`pack smoke: ${packed.filename} installs and runs.`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
