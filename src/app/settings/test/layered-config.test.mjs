import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { workspaceConfig } from "../config.mjs";
import {
  avoozlConfigSchemaPath,
  globalAvoozlConfigPath,
  loadLayeredConfig,
} from "../layered-config.mjs";
import { REPOSITORY_CONFIG_SCHEMA_URL } from "../config-schema.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + "\n");
}

test("configuration layers merge deterministically and resolve their own paths", () => {
  const workspaceRoot = temporaryDirectory("avoozl-config-workspace-"),
    xdg = temporaryDirectory("avoozl-config-xdg-"),
    env = {
      XDG_CONFIG_HOME: xdg,
      AVOOZL_HOST: "environment.example",
    },
    globalFile = globalAvoozlConfigPath({ env, home: "/unused" }),
    repositoryFile = path.join(workspaceRoot, ".avoozl.json");
  writeJson(globalFile, {
    version: 1,
    name: "Global",
    dbPath: "state/global.sqlite",
    packs: { global: true, winner: "global" },
  });
  writeJson(repositoryFile, {
    version: 1,
    name: "Repository",
    documents: "repository-plans",
    packs: { repository: true, winner: "repository" },
  });

  const loaded = loadLayeredConfig({
    workspaceRoot,
    env,
    options: {
      host: "command.example",
      port: 9555,
      documents: "command-plans",
    },
  });

  assert.equal(loaded.config.name, "Repository");
  assert.equal(loaded.config.host, "command.example");
  assert.equal(loaded.config.port, 9555);
  assert.equal(
    loaded.config.dbPath,
    path.join(xdg, "avoozl", "state", "global.sqlite"),
  );
  assert.equal(
    loaded.config.documents,
    path.join(workspaceRoot, "command-plans"),
  );
  assert.deepEqual(loaded.config.packs, {
    global: true,
    repository: true,
    winner: "repository",
  });
  assert.deepEqual(loaded.configWithoutRepository.packs, {
    global: true,
    winner: "global",
  });
  assert.deepEqual(
    loaded.sources.map(({ label }) => label),
    [
      "global Avoozl configuration",
      "repository Avoozl configuration",
      "environment configuration",
      "command-line configuration",
    ],
  );
  assert.equal(loaded.localConfigured, true);
});

test("repository configuration paths are owned by its repository root", () => {
  const workspaceRoot = temporaryDirectory("avoozl-config-owner-"),
    repositoryFile = path.join(workspaceRoot, ".avoozl.json");
  writeJson(repositoryFile, {
    version: 1,
    dbPath: ".avoozl/local/workspace.sqlite",
    repositories: {
      code: {
        root: "code",
        worktreeRoot: ".avoozl/local/worktrees",
      },
    },
  });
  const { config } = loadLayeredConfig({
    workspaceRoot,
    env: { XDG_CONFIG_HOME: temporaryDirectory("avoozl-empty-xdg-") },
  });
  assert.equal(
    config.dbPath,
    path.join(workspaceRoot, ".avoozl", "local", "workspace.sqlite"),
  );
  assert.equal(config.repositories.code.root, path.join(workspaceRoot, "code"));
  assert.equal(
    config.repositories.code.worktreeRoot,
    path.join(workspaceRoot, ".avoozl", "local", "worktrees"),
  );
});

test("workspace.json is not read", () => {
  const workspaceRoot = temporaryDirectory("avoozl-config-legacy-");
  writeJson(path.join(workspaceRoot, "workspace.json"), {
    version: 1,
    name: "Legacy workspace",
  });
  const config = workspaceConfig({
    workspace: workspaceRoot,
    env: { XDG_CONFIG_HOME: temporaryDirectory("avoozl-empty-xdg-") },
  });
  assert.equal(config.configured, false);
  assert.equal(config.name, "My workspace");
});

test(".avoozl/config.json is ignored", () => {
  const workspaceRoot = temporaryDirectory("avoozl-config-repository-legacy-"),
    legacyRepository = path.join(workspaceRoot, ".avoozl", "config.json"),
    repository = path.join(workspaceRoot, ".avoozl.json"),
    env = { XDG_CONFIG_HOME: temporaryDirectory("avoozl-empty-xdg-") };
  writeJson(legacyRepository, {
    version: 1,
    name: "Legacy repository",
    dbPath: "local/workspace.sqlite",
    documents: "../plans",
  });
  let loaded = loadLayeredConfig({ workspaceRoot, env });
  assert.equal(loaded.config.name, undefined);
  assert.equal(loaded.config.dbPath, undefined);
  assert.equal(Object.hasOwn(loaded.files, "legacyRepository"), false);
  assert.deepEqual(loaded.sources, []);

  writeJson(repository, {
    version: 1,
    name: "Root repository",
    documents: "designs",
  });
  loaded = loadLayeredConfig({ workspaceRoot, env });
  assert.equal(loaded.config.name, "Root repository");
  assert.equal(loaded.config.documents, path.join(workspaceRoot, "designs"));
  assert.equal(loaded.config.dbPath, undefined);
});

test("root repository configuration rejects absolute portable paths", () => {
  const workspaceRoot = temporaryDirectory("avoozl-config-absolute-");
  writeJson(path.join(workspaceRoot, ".avoozl.json"), {
    version: 1,
    repositories: { code: { root: "/machine-specific/checkout" } },
  });
  assert.throws(
    () =>
      loadLayeredConfig({
        workspaceRoot,
        env: { XDG_CONFIG_HOME: temporaryDirectory("avoozl-empty-xdg-") },
      }),
    /absolute path repositories\.code\.root/,
  );
});

test("secret-like keys are rejected recursively", () => {
  const workspaceRoot = temporaryDirectory("avoozl-config-secrets-"),
    repositoryFile = path.join(workspaceRoot, ".avoozl.json");
  writeJson(repositoryFile, {
    version: 1,
    packs: {
      github: {
        apiKey: "must-not-be-here",
      },
    },
  });
  assert.throws(
    () =>
      loadLayeredConfig({
        workspaceRoot,
        env: {
          XDG_CONFIG_HOME: temporaryDirectory("avoozl-empty-xdg-"),
        },
      }),
    /secret-like key packs\.github\.apiKey/,
  );
});

test("the shipped JSON Schema describes versioned non-secret config", () => {
  const schema = JSON.parse(fs.readFileSync(avoozlConfigSchemaPath, "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.$id, REPOSITORY_CONFIG_SCHEMA_URL);
  assert.deepEqual(schema.required, ["version"]);
  assert.equal(schema.properties.version.const, 1);
  assert.deepEqual(schema.$defs.agentInstructionRule.required, [
    "id",
    "title",
    "appliesTo",
    "instruction",
  ]);
  assert.equal(schema.$defs.agentInstructionRule.additionalProperties, false);
  // Settings nothing reads are not described (simplification audit D1-D6).
  for (const key of ["review", "safety", "repository", "planning"])
    assert.equal(Object.hasOwn(schema.properties, key), false, key);
  assert(schema.$defs.safePropertyName);
  assert(schema.$defs.safeValue);
});

test("a file that sets a removed or unknown key fails to load, naming both", () => {
  for (const key of [
    "review",
    "safety",
    "repository",
    "planning",
    "models",
    "harnesses",
    "ahp",
    "ahpPort",
    "canvasOrigins",
    "agentManifest",
  ]) {
    const workspaceRoot = temporaryDirectory("avoozl-config-dead-keys-"),
      file = path.join(workspaceRoot, ".avoozl.json");
    writeJson(file, { version: 1, [key]: {} });
    assert.throws(
      () =>
        loadLayeredConfig({
          workspaceRoot,
          env: { XDG_CONFIG_HOME: temporaryDirectory("avoozl-empty-xdg-") },
        }),
      (error) =>
        error.message.includes(`"${key}"`) && error.message.includes(file),
      key,
    );
  }
});

// Each nested older spelling, and a nested key the product never had. The
// error names the key's whole path and the file.
test("a file that sets a removed or unknown nested key fails to load, naming its path", () => {
  const repo = (entry) => ({
    github: { repositories: { "o/app": { baseBranch: "main", ...entry } } },
  });
  for (const [key, value] of [
    ["delivery.ship", { delivery: { ship: "manual" } }],
    ["delivery.concurrency", { delivery: { concurrency: 2 } }],
    ["delivery.agent", { delivery: { agent: "a" } }],
    ["delivery.model", { delivery: { model: "m" } }],
    [
      "delivery.repositories.app.ship",
      { delivery: { repositories: { app: { ship: "manual" } } } },
    ],
    [
      "delivery.repositories.app.concurrency",
      { delivery: { repositories: { app: { concurrency: 1 } } } },
    ],
    [
      "delivery.investigate.agent",
      { delivery: { investigate: { agent: "a" } } },
    ],
    ["flow.retro.model", { flow: { retro: { model: "m" } } }],
    ["landing.conflictRounds", { landing: { conflictRounds: 1 } }],
    ["landing.trains", { landing: { trains: {} } }],
    ["github.repositories.o/app.merge", repo({ merge: { method: "merge" } })],
    [
      "github.repositories.o/app.pullRequestReviews",
      repo({ pullRequestReviews: { approvals: 1 } }),
    ],
    ["github.repositories.o/app.coder", repo({ coder: "issue-radar" })],
    [
      "github.repositories.o/app.landing.bogus",
      repo({ landing: { bogus: 1 } }),
    ],
  ]) {
    const workspaceRoot = temporaryDirectory("avoozl-config-nested-keys-"),
      file = path.join(workspaceRoot, ".avoozl.json");
    writeJson(file, { version: 1, ...value });
    assert.throws(
      () =>
        loadLayeredConfig({
          workspaceRoot,
          env: { XDG_CONFIG_HOME: temporaryDirectory("avoozl-empty-xdg-") },
        }),
      (error) =>
        error.message.includes(`"${key}"`) && error.message.includes(file),
      key,
    );
  }
});
