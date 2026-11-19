#!/usr/bin/env node
// Writes scripts/test/test-map.json: for each source file, the node test files that
// run at least one of its functions. Each test file runs alone under V8
// coverage, and the node processes it starts count too. scripts/test/select-tests.mjs
// reads the map. Regenerate it after adding tests or call paths:
//   npm run test:map
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
  ),
  prefix = pathToFileURL(root).href + "/",
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-map-")),
  tests = execFileSync(
    "git",
    ["ls-files", "src/*.test.mjs", "src/app/*test/*.test.mjs"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .sort(),
  tracked = (re) =>
    execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter((f) => re.test(f));

const runOne = (test, i) =>
  new Promise((resolve) => {
    const dir = path.join(tmp, String(i)),
      child = spawn(
        process.execPath,
        ["--test", "--test-timeout=60000", test],
        {
          cwd: root,
          env: { ...process.env, NODE_V8_COVERAGE: dir },
          stdio: "ignore",
        },
      );
    child.on("close", () => resolve({ test, dir }));
  });

const results = [];
let next = 0;
await Promise.all(
  Array.from(
    { length: Math.max(os.availableParallelism() - 1, 4) },
    async () => {
      while (next < tests.length) {
        const i = next++;
        results.push(await runOne(tests[i], i));
      }
    },
  ),
);

const exercised = new Map(); // file -> Set(test)
for (const { test, dir } of results) {
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    } catch {
      continue;
    }
    for (const entry of data.result ?? []) {
      if (!entry.url.startsWith(prefix) || entry.url.includes("/node_modules/"))
        continue;
      const file = entry.url.slice(prefix.length);
      // The first entry is the module itself; later entries are its functions.
      if (!entry.functions.some((f, i) => i > 0 && f.ranges[0].count > 0))
        continue;
      if (!exercised.has(file)) exercised.set(file, new Set());
      exercised.get(file).add(test);
    }
  }
}
const files = {};
for (const f of tracked(/^(src\/.*\.mjs|cli\.mjs)$/).filter(
  (f) => !/\.test\.mjs$/.test(f) && !/^src\/app\/(.+\/)?test\//.test(f),
))
  files[f] = [...(exercised.get(f) ?? [])].sort();
// osNeutral is a reviewed list kept by hand (scripts/test/test-plan.mjs); a new
// map keeps it as it is.
const mapFile = path.join(root, "scripts/test/test-map.json"),
  { osNeutral } = JSON.parse(fs.readFileSync(mapFile, "utf8"));
fs.writeFileSync(mapFile, JSON.stringify({ files, osNeutral }, null, 1) + "\n");
fs.rmSync(tmp, { recursive: true, force: true });
console.log(
  `Mapped ${Object.keys(files).length} source files over ${tests.length} test files.`,
);
