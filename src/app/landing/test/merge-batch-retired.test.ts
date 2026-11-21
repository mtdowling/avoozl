// What the merge batches spec removed (mb-2.1, MB1.2, MB1.3, MB9): the old
// landing mode and keys are refused, the old commands answer with one line,
// and nothing imports a removed module.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { repositoryConfig } from "../../git/git.ts";
import { normalizeGitHubPolicy } from "../../github/github-policy.ts";
import {
  globalAvoozlConfigPath,
  loadLayeredConfig,
} from "../../settings/layered-config.ts";
import { temporaryDirectory } from "../../test/temporary.ts";

const here = path.dirname(fileURLToPath(import.meta.url)),
  repo = path.join(here, "..", "..", "..", "..");

function writeJson(file: string, value: unknown) {
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
    git = (...args: string[]) => execFileSync("git", args, { cwd: root });
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
  assert.deepEqual(config.landing?.unionPaths, ["CHANGELOG.md"]);
  // The machine block as the global file wrote it.
  assert.equal((config.machine as { alias?: string }).alias, "box");
  const refused = (file: string, value: unknown, key: string) => {
    writeJson(file, value);
    assert.throws(load, (error: Error) => {
      assert.match(error.message, new RegExp(`"${key.replace(".", "\\.")}"`));
      assert.ok(error.message.includes(file), error.message);
      return true;
    });
  };
  const cases: [string, Record<string, unknown>][] = [
    ["machine.platforms", { platforms: { windows: { kind: "vm" } } }],
    ["machine.slots", { slots: { windows: 1 } }],
    ["machine.bogus", { bogus: 1 }],
  ];
  for (const [key, machine] of cases)
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
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(mjs|ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  for (const dir of ["src", "scripts", "hosts/kirocrew/ui/src"])
    walk(path.join(repo, dir));
  assert.ok(files.length > 100);
  for (const file of files)
    if (!file.endsWith("merge-batch-retired.test.mjs"))
      assert.doesNotMatch(fs.readFileSync(file, "utf8"), pattern, file);
});
