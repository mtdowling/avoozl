#!/usr/bin/env node
// Writes scripts/test-times.json: how long each test file takes alone, in
// milliseconds, with Chrome skipped as on the macOS and Windows shards.
// scripts/test-plan.mjs uses it to give each CI shard about the same work.
// Files not listed count as the median. Regenerate it now and then:
//   npm run test:times
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { allTestFiles } from "./test-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { node, ui } = allTestFiles();
const files = [...node, ...ui];

const time = (file) =>
  new Promise((resolve) => {
    const start = Date.now();
    spawn(process.execPath, ["--test", "--test-timeout=60000", file], {
      cwd: root,
      env: { ...process.env, AVOOZL_CHROME: "skip" },
      stdio: "ignore",
    }).on("close", () => resolve(Date.now() - start));
  });

const times = {};
let next = 0;
// Eight at a time, like a CI runner, so waits for the disk show up.
await Promise.all(
  Array.from({ length: Math.min(8, os.availableParallelism()) }, async () => {
    while (next < files.length) {
      const f = files[next++];
      times[f] = await time(f);
    }
  }),
);
const sorted = Object.fromEntries(Object.entries(times).sort());
fs.writeFileSync(
  path.join(root, "scripts/test-times.json"),
  JSON.stringify({ times: sorted }, null, 2) + "\n",
);
console.log(`Timed ${files.length} test files.`);
