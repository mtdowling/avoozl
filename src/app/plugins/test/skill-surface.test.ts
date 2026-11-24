// Every skill reaches Avoozl only through the CLI and MCP tools: each `avoozl ...` command a skill names is a usage line of
// `avoozl help`, and each `plans_*` tool it names is a tool the MCP server
// lists.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { COMMANDS } from "../../cli/cli-commands.ts";
import { NARROW_TOOLS } from "../../mcp/mcp.ts";
import { GROUPED_TOOLS } from "../../mcp/mcp-tools.ts";

const folder = new URL("../../../../prompts/skills/", import.meta.url);
const skills = fs
  .readdirSync(folder)
  .filter((file) => file.endsWith(".md"))
  .map((file) => [file, fs.readFileSync(new URL(file, folder), "utf8")]);

// The literal words a usage line starts with: `runner report TASK_ID ...`
// is `runner report`.
const words = (usage: string) =>
  usage
    .split(" ")
    .filter((_word, i, all) =>
      all.slice(0, i + 1).every((w) => /^[a-z][a-z-]*$/.test(w)),
    )
    .join(" ");
// `help` is the CLI's own, not a table entry.
const usages = new Set([
  "help",
  ...COMMANDS.flatMap((entry) => entry.help.map((line) => words(line.usage))),
]);
const tools = new Set([
  ...Object.keys(NARROW_TOOLS),
  ...Object.keys(GROUPED_TOOLS),
]);

test("every avoozl command and plans_ tool a skill names exists", () => {
  const missing = [];
  for (const [file, text] of skills) {
    for (const match of text.matchAll(/`avoozl((?: [a-z][a-z-]*)+)/g)) {
      const named = match[1].trim().split(" ");
      // The longest literal prefix that is a usage line.
      const found = named.some((_, i) =>
        usages.has(named.slice(0, named.length - i).join(" ")),
      );
      if (!found) missing.push(`${file}: avoozl ${match[1].trim()}`);
    }
    for (const match of text.matchAll(/\bplans_[a-z_]+\b/g))
      if (!tools.has(match[0])) missing.push(`${file}: ${match[0]}`);
  }
  assert.deepEqual(missing, []);
});

test("the runner skills name the claim, report, land, lint and graph calls", () => {
  const text = (name: string) =>
    String(skills.find(([file]) => file === `${name}.md`)?.[1]);
  for (const call of [
    "avoozl next --claim",
    "avoozl runner report TASK done",
    "avoozl land TASK",
    "plans_next",
    "plans_report",
    "plans_land",
  ])
    assert.ok(text("avoozl-work").includes(call), call);
  for (const call of [
    "avoozl spec lint SPEC",
    "avoozl graph SPEC --write",
    "spec/<name>",
    "(**PARALLEL**)",
    "(**MANUAL**)",
    "repo:",
  ])
    assert.ok(text("avoozl-spec").includes(call), call);
  assert.match(text("avoozl-spec-review"), /git ls-remote --heads origin/);
  assert.match(text("avoozl-spec-review"), /Never\s+edit/);
});

test("the spec skills and host prompt follow specs.layout and read both layouts", () => {
  const text = (name: string) =>
      String(skills.find(([file]) => file === `${name}.md`)?.[1]),
    host = fs.readFileSync(
      new URL("../../../../prompts/hosts/front-end.md", import.meta.url),
      "utf8",
    );
  for (const words of [
    "specs.layout",
    "`single`",
    "`kiro`",
    "## Tasks",
    "tasks.md",
    "requirements.md",
    "design.md",
    "keep the layout it has",
  ])
    assert.ok(text("avoozl-spec").includes(words), words);
  for (const source of [text("avoozl-spec-review"), host])
    for (const words of ["tasks.md", "## Tasks"])
      assert.ok(source.includes(words), words);
  assert.match(host, /specs\.layout/);
});
