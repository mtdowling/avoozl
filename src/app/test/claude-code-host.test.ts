// The Claude Code host package (MS11.3): built from prompts/, a plugin with
// the skills and an MCP entry that runs `avoozl mcp`.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { temporaryDirectory } from "./temporary.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  host = path.join(root, "hosts", "claude-code");
const read = (file: string) => fs.readFileSync(file, "utf8");
const frontMatter = (text: string) =>
  Object.fromEntries(
    text
      .split("\n---")[0]
      .split("\n")
      .slice(1)
      .map((line: string) => line.match(/^([a-z]+): (.*)$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((match) => [match[1], match[2]]),
  );

test("installed into a Claude Code config, the plugin has its skills and MCP entry", () => {
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
    "avoozl-investigate",
    "avoozl-retro",
    "avoozl-review",
    "avoozl-spec",
    "avoozl-spec-review",
    "avoozl-triage",
    "avoozl-work",
    "open",
  ]);
  // `/avoozl:open` runs only when the person types it, and only `avoozl link`.
  const open = read(path.join(installed, "skills", "open", "SKILL.md"));
  assert.match(open, /^disable-model-invocation: true$/m);
  assert.match(open, /^allowed-tools: Bash\(avoozl link\)$/m);
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
  assert.equal(fs.existsSync(path.join(installed, "hooks")), false);
});

test("the skill tells the agent how the person approves and answers", () => {
  const skill = read(path.join(host, "skills", "avoozl", "SKILL.md"));
  assert.match(skill, /avoozl plan approve NAME --yes --expect HASH/);
  assert.match(skill, /avoozl link/);
  assert.match(skill, /You never approve a spec/);
});
