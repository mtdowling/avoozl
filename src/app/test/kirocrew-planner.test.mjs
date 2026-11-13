import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { lintSpec, readSpecFolder } from "../spec-plans.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  app = path.join(root, "kirocrew-app"),
  manifest = JSON.parse(fs.readFileSync(path.join(app, "app.json"), "utf8")),
  plannerPath = "agents/avoozl-planner.json",
  planner = JSON.parse(fs.readFileSync(path.join(app, plannerPath), "utf8")),
  skill = fs.readFileSync(path.join(app, "skills/avoozl/SKILL.md"), "utf8"),
  // Kiro Crew registers an app's own MCP server as `<app>:<server>`.
  ownServer = "@avoozl:avoozl/";

function servedTools() {
  const dir = temporaryDirectory(),
    workspace = path.join(dir, "workspace"),
    env = { ...process.env, XDG_CONFIG_HOME: path.join(dir, "config") };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_|^NUPP_WORKSPACE$/.test(name))
      delete env[name];
  initializeWorkspace(workspace);
  const output = execFileSync(
    "python3",
    [path.join(app, "bin", "avoozl_mcp.py"), "--workspace", workspace],
    {
      cwd: dir,
      encoding: "utf8",
      env,
      input:
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n",
    },
  );
  return JSON.parse(output.trim()).result.tools;
}

test("the planner agent ships, parses, and is listed in the manifest", () => {
  assert.ok(manifest.agents.includes(plannerPath));
  assert.equal(planner.name, "avoozl-planner");
  assert.equal(typeof planner.prompt, "string");
  assert.equal(planner.includeMcpJson, false);
  assert.deepEqual(planner.allowedTools, [], "nothing runs unprompted");
});

test("the planner writes files only and reaches read-only Avoozl tools", () => {
  const builtins = planner.tools.filter((t) => !t.startsWith("@")),
    mcp = planner.tools.filter((t) => t.startsWith("@")),
    // Breakdown mode records its answer for its own issue (github-planner.mjs).
    breakdown = new Set(["plans_classify_issue", "plans_draft_children"]);
  assert.deepEqual(builtins.sort(), [
    "fs_read",
    "fs_write",
    "glob",
    "grep",
    "thinking",
  ]);
  const served = new Map(servedTools().map((tool) => [tool.name, tool]));
  for (const ref of mcp) {
    assert.ok(ref.startsWith(ownServer), ref + " names one tool of the app");
    const name = ref.slice(ownServer.length),
      tool = served.get(name);
    assert.ok(tool, ref + " is served");
    if (breakdown.has(name)) continue;
    assert.equal(tool.annotations?.readOnlyHint, true, ref + " is read-only");
  }
});

test("the planner writes a spec folder, not fenced plan files", () => {
  for (const text of [planner.prompt, skill]) {
    assert.match(text, /\.kiro\/specs\/<name>\//);
    assert.match(text, /avoozl\/manifest\.json/);
    assert.match(text, /avoozl\/critique\.md/);
    assert.doesNotMatch(text, /plans\/<plan-id>|```task/);
  }
});

// A planner session has no skill tool, so the formats it follows must be in
// its own prompt, and no brief may send it to the skill.
test("the planner's prompt carries its own rules", () => {
  assert.doesNotMatch(planner.prompt, /avoozl skill/);
  assert.doesNotMatch(skill, /Follow the avoozl skill/);
  const front = skill.match(/^---\nname: (.+)\ndescription: (.+)\n---\n/);
  assert.ok(front, "frontmatter");
  assert.equal(front[1], "avoozl");
});

test("the planner prompt's example spec folder passes the spec reader", () => {
  const root = temporaryDirectory(),
    folder = path.join(root, ".kiro", "specs", "config"),
    written = [];
  for (const [, file, text] of planner.prompt.matchAll(
    /^````\w+ (\S+)\n([\s\S]*?)^````$/gm,
  )) {
    fs.mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
    fs.writeFileSync(path.join(folder, file), text);
    written.push(file);
  }
  assert.deepEqual(written.sort(), [
    "avoozl/manifest.json",
    "design.md",
    "requirements.md",
    "tasks.md",
  ]);
  const result = lintSpec({
    spec: readSpecFolder(root, "config"),
    plan: { id: "config" },
  });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.proposals.map((t) => t.id),
    ["config.1", "config.1.1", "config.1.2"],
  );
  for (const leaf of result.proposals.filter((t) => t.kind === "leaf")) {
    assert.equal(typeof leaf.repository, "string", leaf.id);
    assert.ok(leaf.checks.length, leaf.id);
    assert.equal(leaf.completion, "integrated", leaf.id);
  }
  for (const block of planner.prompt.matchAll(/^```finding\n([\s\S]*?)^```$/gm))
    assert.ok(JSON.parse(block[1]).kind, "finding blocks are JSON");
});
