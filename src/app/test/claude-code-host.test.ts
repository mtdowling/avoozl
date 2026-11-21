// @ts-nocheck: typing debt
// The Claude Code host package (MS11.3): built from prompts/, a plugin with
// the skills, an MCP entry that runs `avoozl mcp`, and a guard that refuses
// the agent's own shell call to a person-only `avoozl` command.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { temporaryDirectory } from "./temporary.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  host = path.join(root, "hosts", "claude-code");
const read = (file) => fs.readFileSync(file, "utf8");
const frontMatter = (text) =>
  Object.fromEntries(
    text
      .split("\n---")[0]
      .split("\n")
      .slice(1)
      .map((line) => line.match(/^([a-z]+): (.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );

test("installed into a Claude Code config, the plugin has its skills, MCP entry and guard", () => {
  // A plugin install copies the plugin folder into Claude Code's own
  // config; Claude Code reads it from there with ${CLAUDE_PLUGIN_ROOT}.
  const config = temporaryDirectory("avoozl-claude-config-"),
    installed = path.join(config, "plugins", "avoozl");
  fs.cpSync(host, installed, { recursive: true });
  const manifest = JSON.parse(
    read(path.join(installed, ".claude-plugin", "plugin.json")),
  );
  assert.equal(manifest.name, "avoozl");
  const skills = fs.readdirSync(path.join(installed, "skills")).sort();
  assert.deepEqual(skills, [
    "avoozl",
    "avoozl-answer",
    "avoozl-drive",
    "avoozl-review",
    "avoozl-triage",
  ]);
  for (const name of skills) {
    const meta = frontMatter(
      read(path.join(installed, "skills", name, "SKILL.md")),
    );
    assert.equal(meta.name, name);
    assert.ok(meta.description?.length > 40, name);
  }
  assert.deepEqual(JSON.parse(read(path.join(installed, ".mcp.json"))), {
    mcpServers: { avoozl: { command: "avoozl", args: ["mcp"] } },
  });
  const hooks = JSON.parse(read(path.join(installed, "hooks", "hooks.json")));
  const [entry] = hooks.hooks.PreToolUse;
  assert.equal(entry.matcher, "Bash");
  assert.deepEqual(entry.hooks[0].args, [
    "${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs",
  ]);
  assert.ok(fs.existsSync(path.join(installed, "hooks", "guard.mjs")));
});

function guard(command) {
  return spawnSync(process.execPath, [path.join(host, "hooks", "guard.mjs")], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });
}

test("the guard refuses each person-only avoozl command and allows the others", () => {
  const personOnly = JSON.parse(
    read(path.join(host, "hooks", "person-only.json")),
  );
  for (const words of [
    ["plan", "approve"],
    ["harness", "approve"],
    ["task", "done"],
    ["flow", "resume"],
  ])
    assert.ok(
      personOnly.some((prefix) => prefix.join(" ") === words.join(" ")),
      words.join(" "),
    );
  for (const prefix of personOnly) {
    const refused = guard(`cd /x && avoozl ${prefix.join(" ")} ID --yes`);
    assert.equal(refused.status, 2, prefix.join(" "));
    assert.match(refused.stderr, /for the person, not an agent/);
  }
  assert.equal(guard("node /a/cli.ts plan approve notes").status, 2);
  for (const command of [
    "avoozl status",
    "avoozl next",
    "avoozl show TASK",
    "git status",
    "echo avoozl-plan approve",
  ])
    assert.equal(guard(command).status, 0, command);
});

test("the skill tells the agent how the person approves and answers", () => {
  const skill = read(path.join(host, "skills", "avoozl", "SKILL.md"));
  assert.match(skill, /avoozl plan approve NAME --yes --expect HASH/);
  assert.match(skill, /avoozl link/);
  assert.match(skill, /You never approve a spec/);
  assert.match(read(path.join(host, "README.md")), /speed bump/);
});
