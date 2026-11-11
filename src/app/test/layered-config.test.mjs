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
import { temporaryDirectory } from "./temporary.mjs";

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + "\n");
}

test("configuration layers merge deterministically and resolve their own paths", () => {
  const workspaceRoot = temporaryDirectory("avoozl-config-workspace-"),
    xdg = temporaryDirectory("avoozl-config-xdg-"),
    env = {
      XDG_CONFIG_HOME: xdg,
      AVOOZL_DB: "environment/state.sqlite",
      AVOOZL_HOST: "environment.example",
    },
    globalFile = globalAvoozlConfigPath({ env, home: "/unused" }),
    legacyFile = path.join(workspaceRoot, "workspace.json"),
    repositoryFile = path.join(workspaceRoot, ".avoozl.json");
  writeJson(globalFile, {
    version: 1,
    name: "Global",
    agentManifest: "state/global-agent.json",
    behavior: { global: true, winner: "global" },
  });
  writeJson(legacyFile, {
    version: 1,
    name: "Legacy",
    documents: "legacy-plans",
    ahpProjection: "legacy/ahp.sqlite",
    behavior: { legacy: true, winner: "legacy" },
  });
  writeJson(repositoryFile, {
    version: 1,
    name: "Repository",
    documents: "repository-plans",
    behavior: { repository: true, winner: "repository" },
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
    path.join(workspaceRoot, "environment", "state.sqlite"),
  );
  assert.equal(
    loaded.config.documents,
    path.join(workspaceRoot, "command-plans"),
  );
  assert.equal(
    loaded.config.agentManifest,
    path.join(xdg, "avoozl", "state", "global-agent.json"),
  );
  assert.equal(
    loaded.config.ahp.projection,
    path.join(workspaceRoot, "legacy", "ahp.sqlite"),
  );
  assert.deepEqual(loaded.config.behavior, {
    global: true,
    legacy: true,
    repository: true,
    winner: "repository",
  });
  assert.deepEqual(loaded.configWithoutRepository.behavior, {
    global: true,
    legacy: true,
    winner: "legacy",
  });
  assert.deepEqual(
    loaded.sources.map(({ label }) => label),
    [
      "global Avoozl configuration",
      "legacy workspace configuration",
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
    projects: {
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
  assert.equal(config.projects.code.root, path.join(workspaceRoot, "code"));
  assert.equal(
    config.projects.code.worktreeRoot,
    path.join(workspaceRoot, ".avoozl", "local", "worktrees"),
  );
});

test("workspaceConfig preserves legacy workspace.json compatibility", () => {
  const workspaceRoot = temporaryDirectory("avoozl-config-legacy-");
  writeJson(path.join(workspaceRoot, "workspace.json"), {
    version: 1,
    name: "Legacy workspace",
    dbPath: "state/legacy.sqlite",
    documents: "designs",
    ahpPort: 9765,
    ahpTokens: "state/ahp-tokens.json",
  });
  const config = workspaceConfig({
    workspace: workspaceRoot,
    env: { XDG_CONFIG_HOME: temporaryDirectory("avoozl-empty-xdg-") },
  });
  assert.equal(config.configured, true);
  assert.equal(config.name, "Legacy workspace");
  assert.equal(config.dbPath, path.join(workspaceRoot, "state/legacy.sqlite"));
  assert.equal(config.plansRoot, path.join(workspaceRoot, "designs"));
  assert.equal(config.ahp.port, 9765);
  assert.equal(
    config.ahp.tokens,
    path.join(workspaceRoot, "state/ahp-tokens.json"),
  );
});

test("legacy .avoozl/config.json remains readable and root config wins", () => {
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
  assert.equal(loaded.config.name, "Legacy repository");
  assert.equal(
    loaded.config.dbPath,
    path.join(workspaceRoot, ".avoozl", "local", "workspace.sqlite"),
  );
  assert.equal(loaded.files.legacyRepository, legacyRepository);

  writeJson(repository, {
    version: 1,
    name: "Root repository",
    documents: "designs",
  });
  loaded = loadLayeredConfig({ workspaceRoot, env });
  assert.equal(loaded.config.name, "Root repository");
  assert.equal(loaded.config.documents, path.join(workspaceRoot, "designs"));
  assert.equal(
    loaded.config.dbPath,
    path.join(workspaceRoot, ".avoozl", "local", "workspace.sqlite"),
  );
});

test("root repository configuration rejects absolute portable paths", () => {
  const workspaceRoot = temporaryDirectory("avoozl-config-absolute-");
  writeJson(path.join(workspaceRoot, ".avoozl.json"), {
    version: 1,
    projects: { code: { root: "/machine-specific/checkout" } },
  });
  assert.throws(
    () =>
      loadLayeredConfig({
        workspaceRoot,
        env: { XDG_CONFIG_HOME: temporaryDirectory("avoozl-empty-xdg-") },
      }),
    /absolute path projects\.code\.root/,
  );
});

test("secret-like keys are rejected recursively", () => {
  const workspaceRoot = temporaryDirectory("avoozl-config-secrets-"),
    repositoryFile = path.join(workspaceRoot, ".avoozl.json");
  writeJson(repositoryFile, {
    version: 1,
    integrations: {
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
    /secret-like key integrations\.github\.apiKey/,
  );
});

test("the shipped JSON Schema describes versioned non-secret config", () => {
  const schema = JSON.parse(fs.readFileSync(avoozlConfigSchemaPath, "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(
    schema.$id,
    "https://avoozl.dev/schema/repository-config-v1.json",
  );
  assert.deepEqual(schema.required, ["version"]);
  assert.equal(schema.properties.version.const, 1);
  assert.deepEqual(schema.$defs.agentInstructionRule.required, [
    "id",
    "title",
    "appliesTo",
    "instruction",
  ]);
  assert.equal(schema.$defs.agentInstructionRule.additionalProperties, false);
  assert(schema.$defs.safePropertyName);
  assert(schema.$defs.safeValue);
});
