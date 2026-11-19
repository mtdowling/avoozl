// What the merge batches spec removed (mb-2.1, MB1.2, MB1.3, MB9): the old
// landing mode and keys are refused, the old commands answer with one line,
// and nothing imports a removed module.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { repositoryConfig } from "../git.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import {
  globalAvoozlConfigPath,
  loadLayeredConfig,
} from "../layered-config.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)),
  repo = path.join(here, "..", "..", ".."),
  CLI = path.join(repo, "cli.mjs");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value) + "\n");
}

test("landing mode train is refused wherever it is set", async () => {
  assert.throws(
    () =>
      normalizeGitHubPolicy({
        repositories: {
          "o/app": { baseBranch: "main", landing: { mode: "train" } },
        },
      }),
    /landing\.mode must be direct, pr or off/,
  );
  const root = temporaryDirectory("avoozl-retired-repo-"),
    git = (...args) => execFileSync("git", args, { cwd: root });
  git("init", "-q", "-b", "main");
  git(
    "-c",
    "user.name=T",
    "-c",
    "user.email=t@example.invalid",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "Start",
  );
  await assert.rejects(
    repositoryConfig({ id: "app", root, landing: "train" }),
    /landing must be direct, pr or off/,
  );
  assert.equal(
    (await repositoryConfig({ id: "app", root, landing: "direct" })).landing,
    "direct",
  );
});

test("the retired keys are refused, naming the file and the key", () => {
  const workspaceRoot = temporaryDirectory("avoozl-retired-ws-"),
    xdg = temporaryDirectory("avoozl-retired-xdg-"),
    env = { XDG_CONFIG_HOME: xdg },
    globalFile = globalAvoozlConfigPath({ env, home: "/unused" }),
    repositoryFile = path.join(workspaceRoot, ".avoozl.json"),
    load = () => loadLayeredConfig({ workspaceRoot, env, home: "/unused" });
  writeJson(globalFile, { version: 1, machine: { alias: "box" } });
  writeJson(repositoryFile, {
    version: 1,
    landing: { unionPaths: ["CHANGELOG.md"] },
  });
  const { config } = load();
  assert.deepEqual(config.landing.unionPaths, ["CHANGELOG.md"]);
  assert.equal(config.machine.alias, "box");
  const refused = (file, value, key) => {
    writeJson(file, value);
    assert.throws(load, (error) => {
      assert.match(error.message, new RegExp(`"${key.replace(".", "\\.")}"`));
      assert.ok(error.message.includes(file), error.message);
      return true;
    });
  };
  for (const [key, machine] of [
    ["machine.platforms", { platforms: { windows: { kind: "vm" } } }],
    ["machine.slots", { slots: { windows: 1 } }],
    ["machine.bogus", { bogus: 1 }],
  ])
    refused(
      globalFile,
      { version: 1, machine: { alias: "box", ...machine } },
      key,
    );
  refused(globalFile, { version: 1, lease: { heartbeatSeconds: 60 } }, "lease");
  writeJson(globalFile, { version: 1 });
  refused(
    repositoryFile,
    { version: 1, landing: { trains: { targets: {} } } },
    "landing.trains",
  );
});

test("each retired command prints one line and changes nothing", () => {
  const home = temporaryDirectory("avoozl-retired-cli-"),
    env = {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: path.join(home, "xdg"),
      XDG_STATE_HOME: path.join(home, "state"),
    };
  for (const key of Object.keys(env))
    if (/^AVOOZL(_|$)/.test(key)) delete env[key];
  for (const args of [
    ["integrator", "status"],
    ["integrator", "run"],
    ["landing", "submit", "t1", "--branch", "avoozl-batch/t1"],
  ]) {
    const result = spawnSync(process.execPath, [CLI, ...args], {
      env,
      cwd: home,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
    assert.equal(result.stdout.trim().split("\n").length, 1);
    assert.match(result.stdout, /merge batches/);
  }
  assert.deepEqual(fs.readdirSync(home), [], "nothing was created");
});

test("no source file imports a removed module", () => {
  const removed = [
    "landing-lease",
    "resource-slots",
    "setup-workflows",
    "train-heads",
    "integrator-[a-z-]+",
    "landing-trains",
  ];
  const pattern = new RegExp(
    `(?:from\\s+|import\\()\\s*["'][^"']*/(?:${removed.join("|")})\\.mjs["']`,
  );
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(mjs|ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  for (const dir of ["src", "scripts", "kirocrew-app/ui/src"])
    walk(path.join(repo, dir));
  assert.ok(files.length > 100);
  for (const file of files)
    if (!file.endsWith("merge-batch-retired.test.mjs"))
      assert.doesNotMatch(fs.readFileSync(file, "utf8"), pattern, file);
});
