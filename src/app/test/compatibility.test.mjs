// Compatibility surfaces kept through the rename (R24.5, AGENTS.md): the
// `plans_*` MCP names, the AVOOZL_*, AICOMMANDER_* and NUPP_WORKSPACE_*
// variables, and the `aicommander` command. Each is exercised the way a
// caller uses it: a child process with only that name set.
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

// Every `plans_*` tool the stdio server listed at the Phase 0 baseline
// (0747a53). Names may be added; none may disappear.
const BASELINE_TOOLS = `plans_activate_visualization plans_activity
plans_andon_note plans_andon_propose_remediation plans_andon_raise
plans_andon_review plans_andon_status plans_answer_request plans_approve_plan
plans_archive_run plans_archive_task plans_audit plans_capture
plans_checkpoint_publish plans_checkpoints plans_control_batch
plans_create_plan plans_dispose_fact plans_documents plans_duplicates
plans_examples plans_extract plans_extraction plans_get_document
plans_get_plan plans_get_run plans_get_task plans_handoff plans_integrate
plans_accept_task plans_interrupt_run plans_jobs plans_list_runs
plans_list_visualizations plans_merge_receipt plans_merge_tasks
plans_metrics plans_models plans_present plans_primary_state
plans_prompt_search plans_prompt_search_result plans_propose_work
plans_query plans_ready_queue plans_resume_run plans_review_queue
plans_run_context plans_save_plan plans_seed_example plans_send_message
plans_set_run_approvals plans_start_batch plans_start_run plans_status
plans_submit_extraction plans_submit_review plans_target_status
plans_targets plans_triage_design plans_unarchive_run plans_update_task
plans_usage plans_validate_run plans_visualize plans_workspace`.split(/\s+/);

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

test("the stdio MCP server still lists every baseline plans_* tool", () => {
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
    BASELINE_TOOLS.filter((name) => !names.has(name)),
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
