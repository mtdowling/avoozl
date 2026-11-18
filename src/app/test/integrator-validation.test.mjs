// Platforms a train needs, cheap and full validation, and resource slots
// (lt-4.1 to lt-4.3). Fake wrappers and fake commands; nothing live.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  neededPlatforms,
  recordPlatformResult,
  runCheap,
  runFull,
  runPlatforms,
} from "../integrator-validation.mjs";
import { trainSettings } from "../landing-config.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const node = (code, ...rest) => [process.execPath, "-e", code, ...rest];
const full = (...platforms) =>
  Object.fromEntries(platforms.map((p) => [p, { command: node("0") }]));
const settings = (
  extra = {},
  platforms = ["macos-arm64", "linux-x64", "windows-x64"],
) =>
  trainSettings(
    {
      landing: {
        trains: {
          ci: { workflow: "ci.yml" },
          validation: { full: full(...platforms) },
          ...extra,
          targets: { main: { policy: "gated" } },
        },
      },
    },
    "main",
  );

test("platforms.rules map globs to platforms; an unmatched path needs every platform", async () => {
  const s = settings({
    platforms: {
      rules: { "src/win/**": ["windows-x64"], "docs/**": ["linux-x64"] },
    },
  });
  assert.deepEqual(await neededPlatforms(s, { files: ["src/win/a.c"] }), [
    "windows-x64",
  ]);
  assert.deepEqual(
    await neededPlatforms(s, { files: ["src/win/a.c", "docs/x.md"] }),
    ["linux-x64", "windows-x64"],
  );
  assert.deepEqual(await neededPlatforms(s, { files: ["src/core/a.c"] }), [
    "macos-arm64",
    "linux-x64",
    "windows-x64",
  ]);
});

test("with neither rules nor classifier every platform is needed", async () => {
  assert.equal((await neededPlatforms(settings(), { files: ["a"] })).length, 3);
});

test("a classifier gets the changed paths on stdin and its JSON decides", async () => {
  const dir = temporaryDirectory("avoozl-classify-"),
    script = path.join(dir, "classify.mjs");
  fs.writeFileSync(
    script,
    `let t=""; process.stdin.on("data",d=>t+=d).on("end",()=>{
      const files=t.split("\\n").filter(Boolean);
      console.log(JSON.stringify(files.some(f=>f.startsWith("win/"))?["windows-x64","bogus"]:["linux-x64"]));
    });`,
  );
  const s = settings({ platforms: { classifier: [process.execPath, script] } });
  assert.deepEqual(await neededPlatforms(s, { dir, files: ["win/a.c", "x"] }), [
    "windows-x64",
  ]);
  assert.deepEqual(await neededPlatforms(s, { dir, files: ["x"] }), [
    "linux-x64",
  ]);
});

test("a classifier that exits nonzero or prints bad JSON fails with the reason", async () => {
  const dir = temporaryDirectory("avoozl-classify-");
  const bad = async (code) =>
    neededPlatforms(settings({ platforms: { classifier: node(code) } }), {
      dir,
      files: ["a"],
    });
  await assert.rejects(
    bad("console.error('boom'); process.exit(3)"),
    /classifier exited 3: boom/,
  );
  await assert.rejects(
    bad("console.log('not json')"),
    /did not print a JSON list/,
  );
  await assert.rejects(
    bad("console.log('{\"a\":1}')"),
    /did not print a JSON list/,
  );
});

test("cheap checks run in order and stop at the first failure; a timeout says so", async () => {
  const dir = temporaryDirectory("avoozl-cheap-"),
    marker = path.join(dir, "second");
  const failed = await runCheap(dir, [
    node("process.exit(2)"),
    node(`require('fs').writeFileSync(${JSON.stringify(marker)},'x')`),
  ]);
  assert.equal(failed.ok, false);
  assert.equal(failed.checks.length, 1);
  assert.equal(failed.checks[0].exitCode, 2);
  assert.equal(fs.existsSync(marker), false, "the second check never ran");
  const timed = await runCheap(dir, [node("setTimeout(()=>{},5000)")], {
    timeoutFor: () => 1000,
  });
  assert.equal(timed.ok, false);
  assert.equal(timed.checks[0].notRun, "timed out after 1 s");
  assert.equal((await runCheap(dir, [node("0"), node("0")])).ok, true);
});

function wrapper(dir) {
  const script = path.join(dir, "wrap.mjs"),
    log = path.join(dir, "wrapper.log");
  fs.writeFileSync(
    script,
    `import fs from "node:fs"; import {spawnSync} from "node:child_process";
     const argv = process.argv.slice(3);
     fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({argv, cwd: process.cwd()}) + "\\n");
     process.exit(spawnSync(argv[0], argv.slice(1), {stdio: "inherit"}).status ?? 1);`,
  );
  return { script, log };
}

test("a wrapper receives the command and runs in the landing worktree; suites appear per platform", async () => {
  const dir = fs.realpathSync(temporaryDirectory("avoozl-full-")),
    { script, log } = wrapper(dir),
    suites = JSON.stringify({
      suites: [
        { name: "doctest", status: "passed", seconds: 1.5 },
        { name: "net", status: "failed" },
      ],
    }),
    command = node(
      `require('fs').writeFileSync('out/suites.json', ${JSON.stringify(suites)}); process.exit(1)`,
    );
  fs.mkdirSync(path.join(dir, "out"));
  const result = await runFull(
    dir,
    "windows-x64",
    { command, results: "out/suites.json" },
    { kind: "vm", wrapper: [process.execPath, script, "--"] },
  );
  const [call] = fs
    .readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.deepEqual(call.argv, command);
  assert.equal(fs.realpathSync(call.cwd), dir);
  assert.equal(result.ok, false);
  assert.deepEqual(result.suites, [
    { name: "doctest", status: "passed", seconds: 1.5 },
    { name: "net", status: "failed" },
  ]);
  assert.equal(result.resultsProblem, undefined);
});

test("a missing or malformed results file means whole-command reruns, recorded once on the train", async (t) => {
  const store = new Store(
    path.join(temporaryDirectory("avoozl-train-store-"), "w.sqlite"),
  );
  t.after(() => store.close());
  store.put("landing_trains", { id: "train-1", checks: {}, notes: [] });
  const dir = temporaryDirectory("avoozl-full-");
  fs.mkdirSync(path.join(dir, "out"));
  const spec = (body) => ({
    command: node(
      `require('fs').writeFileSync('out/s.json', ${JSON.stringify(body)})`,
    ),
    results: "out/s.json",
  });
  const missing = await runFull(
    dir,
    "linux-x64",
    { command: node("0"), results: "out/s.json" },
    null,
  );
  assert.equal(missing.ok, true);
  assert.equal(missing.suites, null);
  assert.match(missing.resultsProblem, /was not written/);
  const malformed = await runFull(dir, "linux-x64", spec("{oops"), null);
  assert.match(malformed.resultsProblem, /not valid JSON/);
  const shape = await runFull(
    dir,
    "linux-x64",
    spec('{"suites":[{"name":1}]}'),
    null,
  );
  assert.match(shape.resultsProblem, /no suites with a name and status/);
  recordPlatformResult(store, "train-1", missing);
  recordPlatformResult(store, "train-1", missing);
  const train = store.get("landing_trains", "train-1");
  assert.equal(train.notes.length, 1);
  assert.equal(train.checks["linux-x64"].suites, null);
});

test("platforms run in parallel up to the limit", async () => {
  const dir = temporaryDirectory("avoozl-par-"),
    log = path.join(dir, "log"),
    s = settings({}, ["a", "b", "c"]);
  for (const p of ["a", "b", "c"])
    s.validation.full[p] = {
      command: node(
        `const fs=require('fs');fs.appendFileSync(${JSON.stringify(log)},'start\\n');setTimeout(()=>{fs.appendFileSync(${JSON.stringify(log)},'end\\n')},150)`,
      ),
    };
  await runPlatforms(dir, ["a", "b", "c"], s, {}, { limit: 1 });
  const lines = fs.readFileSync(log, "utf8").trim().split("\n");
  assert.deepEqual(lines, ["start", "end", "start", "end", "start", "end"]);
  fs.rmSync(log);
  const results = await runPlatforms(dir, ["a", "b", "c"], s, {}, { limit: 3 });
  assert.equal(results.length, 3);
  assert.deepEqual(
    fs.readFileSync(log, "utf8").trim().split("\n").slice(0, 3),
    ["start", "start", "start"],
  );
});
