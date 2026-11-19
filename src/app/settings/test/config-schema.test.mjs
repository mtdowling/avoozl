// The `$schema` address Avoozl writes: it names the schema file in the public
// repository, files that carry the retired avoozl.dev address load as
// before, and a save moves them to the current one.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  HOST_CONFIG_SCHEMA_URL,
  REPOSITORY_CONFIG_SCHEMA_URL,
  RETIRED_SCHEMA_URLS,
} from "../config-schema.mjs";
import { workspaceConfig } from "../config.mjs";
import {
  hostConfigSchemaPath,
  normalizeHostConfig,
  WorkspaceRegistry,
} from "../host-config.mjs";
import {
  avoozlConfigSchemaPath,
  loadLayeredConfig,
} from "../layered-config.mjs";
import { RepositorySettings } from "../repository-settings.mjs";
import { Store } from "../../store/store.mjs";
import { initializeWorkspace } from "../../workspace/workspace.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const [OLD_REPOSITORY_URL, OLD_HOST_URL] = RETIRED_SCHEMA_URLS;
const SOURCE = "https://raw.githubusercontent.com/mtdowling/avoozl/main/src/";

test("each schema's $id is its own file in the public repository", () => {
  for (const [url, file] of [
    [REPOSITORY_CONFIG_SCHEMA_URL, avoozlConfigSchemaPath],
    [HOST_CONFIG_SCHEMA_URL, hostConfigSchemaPath],
  ]) {
    assert.equal(url, SOURCE + path.basename(file));
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).$id, url);
    assert.equal(
      path.dirname(file),
      path.join(import.meta.dirname, "..", "..", ".."),
    );
  }
  assert.deepEqual(RETIRED_SCHEMA_URLS, [
    "https://avoozl.dev/schema/repository-config-v1.json",
    "https://avoozl.dev/schema/host-config-v1.json",
  ]);
});

test("a workspace file with the retired address loads unchanged and moves on its next save", (t) => {
  const root = temporaryDirectory("avoozl-schema-url-"),
    env = { XDG_CONFIG_HOME: temporaryDirectory("avoozl-schema-xdg-") },
    filename = path.join(root, ".avoozl.json");
  initializeWorkspace(root, { name: "Schema address" });
  const written = JSON.parse(fs.readFileSync(filename, "utf8"));
  assert.equal(written.$schema, REPOSITORY_CONFIG_SCHEMA_URL);

  const old =
    JSON.stringify({ ...written, $schema: OLD_REPOSITORY_URL }, null, 2) + "\n";
  fs.writeFileSync(filename, old);
  const loaded = loadLayeredConfig({ workspaceRoot: root, env }).config;
  assert.equal(loaded.$schema, OLD_REPOSITORY_URL);
  assert.equal(loaded.name, "Schema address");
  assert.equal(workspaceConfig({ workspace: root, env }).configured, true);
  assert.equal(fs.readFileSync(filename, "utf8"), old);

  const store = new Store(workspaceConfig({ workspace: root, env }).dbPath);
  t.after(() => store.close());
  new RepositorySettings(store, {
    workspaceRoot: root,
    env,
  }).updateConversationSettings({ autoArchiveCompleted: false });
  const saved = JSON.parse(fs.readFileSync(filename, "utf8"));
  assert.equal(saved.$schema, REPOSITORY_CONFIG_SCHEMA_URL);
  assert.equal(saved.namespace, written.namespace);
});

test("a host file with the retired address loads and is saved with the current one", (t) => {
  const base = { version: 1, port: 0 };
  assert.equal(normalizeHostConfig(base).$schema, HOST_CONFIG_SCHEMA_URL);
  assert.equal(
    normalizeHostConfig({ ...base, $schema: OLD_HOST_URL }).$schema,
    HOST_CONFIG_SCHEMA_URL,
  );
  // A person's own address is theirs to keep.
  assert.equal(
    normalizeHostConfig({ ...base, $schema: "./host-config.schema.json" })
      .$schema,
    "./host-config.schema.json",
  );

  const directory = temporaryDirectory("avoozl-schema-host-"),
    configPath = path.join(directory, "config.json"),
    workspace = path.join(directory, "workspace");
  fs.writeFileSync(
    configPath,
    JSON.stringify({ ...base, $schema: OLD_HOST_URL }, null, 2) + "\n",
  );
  initializeWorkspace(workspace, { name: "Registered" });
  const registry = new WorkspaceRegistry({
    env: { XDG_CONFIG_HOME: directory, XDG_STATE_HOME: directory },
    configPath,
    catalogPath: path.join(directory, "catalog.sqlite"),
  });
  t.after(() => registry.close());
  registry.add("registered", { root: workspace });
  assert.equal(
    JSON.parse(fs.readFileSync(configPath, "utf8")).$schema,
    HOST_CONFIG_SCHEMA_URL,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(workspace, ".avoozl.json"), "utf8"))
      .$schema,
    REPOSITORY_CONFIG_SCHEMA_URL,
  );
});
