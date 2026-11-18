// Compatibility surfaces kept through the rename (AGENTS.md): the AVOOZL_*,
// AICOMMANDER_* and NUPP_WORKSPACE_* variables, and the `aicommander`
// command. Each is exercised the way a caller uses it: a child process with
// only that name set.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { workspaceConfig } from "../config.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  cli = path.join(root, "cli.mjs");

// The `plans_*` tools from the Phase 0 baseline (0747a53) that stay. The
// deprecated one-tool-per-operation names were removed on 2026-11-18 (R56.3).
const KEPT_TOOLS = `plans_activate_visualization plans_activity
plans_approve_plan plans_audit plans_documents plans_get_document
plans_get_task plans_list_visualizations plans_present plans_query
plans_status plans_visualize plans_workspace`.split(/\s+/);
const REMOVED_TOOLS = `plans_update_task plans_bind_session plans_tick
plans_send_message plans_andon_raise plans_relay`.split(/\s+/);

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

function run(dir, args, extra) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: cleanEnv(dir, extra),
  });
}

test("the stdio MCP server lists the kept plans_* tools and no removed one", () => {
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
  assert.deepEqual(
    KEPT_TOOLS.filter((name) => !names.has(name)),
    [],
  );
  assert.deepEqual(
    REMOVED_TOOLS.filter((name) => names.has(name)),
    [],
  );
});

test("each workspace variable family selects the workspace", () => {
  const { dir, workspace } = setup("Compat env");
  const flagged = run(dir, ["query", "--workspace", workspace]);
  for (const name of [
    "AVOOZL_WORKSPACE",
    "AICOMMANDER_WORKSPACE",
    "NUPP_WORKSPACE",
  ]) {
    // The current directory has no workspace, so only the variable can
    // name one; a fall back to a server would fail with no server running.
    assert.equal(run(dir, ["query"], { [name]: workspace }), flagged, name);
    const env = cleanEnv(dir, { [name]: workspace });
    assert.equal(workspaceConfig({ env }).workspaceRoot, workspace, name);
  }
});

test("each family's database, documents and URL variables still apply", () => {
  const { dir, workspace } = setup("Compat paths");
  const cases = [
    ["AVOOZL_DB", "dbPath", "a.sqlite"],
    ["AICOMMANDER_DB", "dbPath", "b.sqlite"],
    ["NUPP_WORKSPACE_DB", "dbPath", "c.sqlite"],
    ["AVOOZL_DOCUMENTS", "plansRoot", "docs-a"],
    ["AICOMMANDER_DOCUMENTS", "plansRoot", "docs-b"],
    ["NUPP_WORKSPACE_DOCS", "plansRoot", "docs-c"],
  ];
  for (const [name, key, value] of cases) {
    const env = cleanEnv(dir, { [name]: value });
    assert.equal(
      workspaceConfig({ workspace, env })[key],
      path.resolve(workspace, value),
      name,
    );
  }
  for (const name of ["AVOOZL_URL", "AICOMMANDER_URL", "NUPP_WORKSPACE_URL"]) {
    const env = cleanEnv(dir, { [name]: "http://127.0.0.1:1234" });
    assert.equal(
      workspaceConfig({ workspace, env }).endpoint,
      "http://127.0.0.1:1234",
      name,
    );
  }
});

test("the aicommander command runs the same CLI", (t) => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  assert.equal(pkg.bin.aicommander, pkg.bin.avoozl);
  const { dir, workspace } = setup("Compat command");
  // npm installs a bin as a link named for the command; run it that way.
  const link = path.join(dir, "aicommander");
  try {
    fs.symlinkSync(path.join(root, pkg.bin.aicommander), link);
  } catch (error) {
    // Windows without symlink rights: the bin mapping above still holds.
    if (error.code === "EPERM") return t.skip("no symlink permission");
    throw error;
  }
  const output = execFileSync(
    process.execPath,
    [link, "query", "--workspace", workspace],
    { cwd: dir, encoding: "utf8", env: cleanEnv(dir) },
  );
  assert.equal(output, run(dir, ["query", "--workspace", workspace]));
  assert.match(
    execFileSync(process.execPath, [link, "help"], {
      cwd: dir,
      encoding: "utf8",
      env: cleanEnv(dir),
    }),
    /Avoozl/,
  );
});
