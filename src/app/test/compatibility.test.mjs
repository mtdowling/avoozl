// No backward compatibility until Avoozl has other users (AGENTS.md): only
// AVOOZL_* variables and the `avoozl` command, the narrow plans_* tools a
// role names, and an unknown top-level settings key is a load error.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { workspaceConfig } from "../settings/config.mjs";
import { initializeWorkspace } from "../workspace/workspace.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  cli = path.join(root, "cli.mjs");

// A child environment with no Avoozl-family variable from this machine.
function cleanEnv(dir, extra = {}) {
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(dir, "config"),
    XDG_STATE_HOME: path.join(dir, "state"),
  };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)(_|$)|^PORT$/.test(name))
      delete env[name];
  return { ...env, ...extra };
}

function setup(name) {
  const dir = temporaryDirectory("avoozl-compat-"),
    workspace = path.join(dir, "workspace");
  initializeWorkspace(workspace, { name });
  return { dir, workspace };
}

test("the stdio MCP server lists no old plan-file tool", () => {
  const { dir, workspace } = setup("Compat MCP");
  const messages = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "compat", version: "1" },
      },
    },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ];
  const output = execFileSync(
    process.execPath,
    [cli, "mcp", "--workspace", workspace],
    {
      cwd: dir,
      encoding: "utf8",
      env: cleanEnv(dir),
      input: messages.map((m) => JSON.stringify(m)).join("\n") + "\n",
    },
  );
  const listed = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .find((message) => message.id === 2);
  const names = new Set(listed.result.tools.map((tool) => tool.name));
  for (const name of [
    "plans_query",
    "plans_get_task",
    "plans_documents",
    "plans_get_document",
  ])
    assert.ok(names.has(name), name);
  for (const name of [
    "plans_status",
    "plans_activity",
    "plans_audit",
    "plans_visualize",
    "plans_present",
    "plans_list_visualizations",
    "plans_activate_visualization",
    "plans_content_allow",
    "plans_flow_run_anyway",
  ])
    assert.ok(!names.has(name), name);
});

test("only AVOOZL_* variables name the workspace and its paths", () => {
  const { dir, workspace } = setup("Compat env");
  assert.equal(
    workspaceConfig({ env: cleanEnv(dir, { AVOOZL_WORKSPACE: workspace }) })
      .workspaceRoot,
    workspace,
  );
  for (const name of ["AICOMMANDER_WORKSPACE", "NUPP_WORKSPACE"])
    assert.notEqual(
      workspaceConfig({ env: cleanEnv(dir, { [name]: workspace }) })
        .workspaceRoot,
      workspace,
      name,
    );
  const db = (env) => workspaceConfig({ workspace, env: cleanEnv(dir, env) });
  assert.equal(
    db({ AVOOZL_DB: "a.sqlite" }).dbPath,
    path.resolve(workspace, "a.sqlite"),
  );
  assert.equal(db({ AICOMMANDER_DB: "b.sqlite" }).dbPath, db({}).dbPath);
});

test("package.json names only the avoozl command", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(pkg.bin), ["avoozl"]);
});

test("an unknown top-level key fails to load, naming the file and key", () => {
  const { workspace } = setup("Compat keys");
  const file = path.join(workspace, ".avoozl.json"),
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ ...value, ahpPort: 9765 }));
  assert.throws(
    () => workspaceConfig({ workspace, env: {} }),
    (error) =>
      error.message.includes('"ahpPort"') && error.message.includes(file),
  );
});
