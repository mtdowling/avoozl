// What the merge batches spec removed (mb-2.1, MB1.2, MB1.3, MB9): the old
// landing mode and keys still load, the old commands answer with one line,
// and nothing imports a removed module.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { projectConfig } from "../git.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { applyLandingModes, landingSettings } from "../landing-config.mjs";
import {
  globalAvoozlConfigPath,
  loadLayeredConfig,
} from "../layered-config.mjs";
import { isDirectLanding } from "../direct-landing.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)),
  repo = path.join(here, "..", "..", ".."),
  CLI = path.join(repo, "cli.mjs");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value) + "\n");
}

test("landing mode train loads as direct, so the repository lands in merge batches", async () => {
  const config = {
    github: {
      repositories: {
        "o/app": { baseBranch: "main", landing: { mode: "train" } },
      },
    },
  };
  assert.equal(
    normalizeGitHubPolicy(config.github).repositories["o/app"].landing.mode,
    "direct",
  );
  assert.equal(landingSettings(config, "o/app").mode, "direct");
  const rows = new Map([["app", { id: "app", repository: "o/app" }]]),
    store = {
      list: () => [...rows.values()],
      put: (_, row) => rows.set(row.id, row),
    };
  applyLandingModes(store, config);
  assert.equal(rows.get("app").landing, "direct");
  assert.ok(isDirectLanding(rows.get("app")));
  // A project row that still says train loads as direct too.
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
  assert.equal(
    (await projectConfig({ id: "app", root, landing: "train" })).landing,
    "direct",
  );
});

test("the retired keys load and are ignored", () => {
  const workspaceRoot = temporaryDirectory("avoozl-retired-ws-"),
    xdg = temporaryDirectory("avoozl-retired-xdg-"),
    env = { XDG_CONFIG_HOME: xdg },
    globalFile = globalAvoozlConfigPath({ env, home: "/unused" });
  writeJson(globalFile, {
    version: 1,
    machine: {
      alias: "box",
      platforms: { windows: { kind: "vm", wrapper: ["vm-run"] } },
      slots: { windows: 1 },
    },
    lease: { heartbeatSeconds: 60 },
  });
  writeJson(path.join(workspaceRoot, ".avoozl.json"), {
    version: 1,
    landing: {
      unionPaths: ["CHANGELOG.md"],
      trains: { targets: { main: { policy: "gated" } }, branchPrefix: "x/" },
    },
  });
  const { config } = loadLayeredConfig({ workspaceRoot, env, home: "/unused" });
  assert.deepEqual(config.landing.unionPaths, ["CHANGELOG.md"]);
  assert.equal(config.machine.alias, "box");
  // A key the product never had is still refused.
  writeJson(globalFile, { version: 1, machine: { bogus: 1 } });
  assert.throws(
    () => loadLayeredConfig({ workspaceRoot, env, home: "/unused" }),
    /machine\.bogus/,
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
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)(_|$)/.test(key)) delete env[key];
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
