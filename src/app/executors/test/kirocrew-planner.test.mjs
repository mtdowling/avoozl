import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { lintSpec, readSpecFolder } from "../../specs/spec-plans.mjs";
import { initializeWorkspace } from "../../workspace/workspace.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
import { packagedTools } from "../../test/shim-run.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url)),
  app = path.join(root, "hosts", "kirocrew"),
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
    if (/^AVOOZL_/.test(name)) delete env[name];
  initializeWorkspace(workspace);
  return packagedTools({ dir, workspace, env });
}

test("the planner agent ships, parses, and is listed in the manifest", () => {
  assert.ok(manifest.agents.includes(plannerPath));
  assert.equal(planner.name, "avoozl-planner");
  assert.equal(typeof planner.prompt, "string");
  assert.equal(planner.includeMcpJson, false);
  assert.deepEqual(planner.allowedTools, [], "nothing runs unprompted");
});

test("the planner stores draft revisions and bound answers and otherwise reaches read-only Avoozl tools", () => {
  const builtins = planner.tools.filter((t) => !t.startsWith("@")),
    mcp = planner.tools.filter((t) => t.startsWith("@")),
    // Breakdown mode records its answer for its own issue (github-planner.mjs).
    breakdown = new Set(["plans_classify_issue", "plans_draft_children"]),
    revisions = new Set([
      "plans_create_plan",
      "plans_save_plan",
      "plans_answer_review",
    ]);
  assert.deepEqual(builtins.sort(), [
    "fs_read",
    "fs_write",
    "glob",
    "grep",
    "thinking",
  ]);
  // Kiro Crew (kiro-cli natively, some other backends at its gate) refuses a write
  // no allowedPaths entry covers; a relative entry is anchored at the
  // session's folder, the planning checkout.
  assert.deepEqual(planner.toolsSettings, {
    fs_write: { fallbackAction: "deny", allowedPaths: [".kiro/specs/**"] },
  });
  const served = new Map(servedTools().map((tool) => [tool.name, tool]));
  for (const ref of mcp) {
    assert.ok(ref.startsWith(ownServer), ref + " names one tool of the app");
    const name = ref.slice(ownServer.length),
      tool = served.get(name);
    assert.ok(tool, ref + " is served");
    if (breakdown.has(name) || revisions.has(name)) continue;
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
  assert.equal(result.proposals[1].acceptance.length, 2);
  assert.equal(result.proposals[1].repository, "sample", "a default fills it");
  for (const leaf of result.proposals.filter((t) => t.kind === "leaf")) {
    assert.equal(typeof leaf.repository, "string", leaf.id);
    assert.equal(leaf.checks, undefined, "a task never names checks");
  }
  for (const block of planner.prompt.matchAll(/^```finding\n([\s\S]*?)^```$/gm))
    assert.ok(JSON.parse(block[1]).kind, "finding blocks are JSON");
});
