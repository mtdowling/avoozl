#!/usr/bin/env node
// @ts-nocheck: typing debt, see the commit message
// Every host package from one source (machine-server MS11, design D9):
// `prompts/<role>.md`, `prompts/skills/<name>.md` and `roles.json`. Each host
// has one adapter that maps the source to that host's files. `--check` builds
// into memory and fails naming each file that differs. Hand-written host files
// (the Kiro Crew manifest, page source and cron) are not generated here.
//
//   npm run build:hosts      write every generated file
//   npm run check:hosts      fail when a generated file differs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

function readSource(root) {
  const prompts = path.join(root, "prompts");
  const roles = JSON.parse(
    fs.readFileSync(path.join(root, "roles.json"), "utf8"),
  );
  const skills = new Map();
  const skillFolder = path.join(prompts, "skills");
  for (const file of fs.existsSync(skillFolder)
    ? fs.readdirSync(skillFolder).sort()
    : []) {
    if (!file.endsWith(".md")) continue;
    const name = file.slice(0, -3),
      text = fs.readFileSync(path.join(skillFolder, file), "utf8");
    if (!text.startsWith(`---\nname: ${name}\n`))
      throw Error(`Skill prompt ${file} must start with name: ${name}.`);
    skills.set(name, text);
  }
  return {
    roles,
    skills,
    prompt: (role) => fs.readFileSync(path.join(prompts, `${role}.md`), "utf8"),
    // Files every front end's package shares (prompts/hosts/).
    host: (file) => fs.readFileSync(path.join(prompts, "hosts", file), "utf8"),
  };
}

// Kiro Crew: one agent file per role in roles.json, with its prompt, and one
// SKILL.md per skill. app.json is hand-written and must name the same files.
function kirocrew(root, source) {
  const host = path.join(root, "hosts", "kirocrew"),
    manifest = JSON.parse(fs.readFileSync(path.join(host, "app.json"), "utf8")),
    files = new Map();
  for (const metadata of source.roles) {
    const role = metadata.name?.replace(/^avoozl-/, "");
    if (!/^[a-z][a-z0-9-]*$/.test(role) || "prompt" in metadata)
      throw Error("roles.json must name each role and hold no prompt.");
    const file = path.join("agents", `${metadata.name}.json`);
    if (files.has(file))
      throw Error(`roles.json names ${metadata.name} twice.`);
    const prompt = source.prompt(role),
      agent = {};
    // Keep the generated field order as well as every metadata value.
    for (const [key, value] of Object.entries(metadata)) {
      agent[key] = value;
      if (key === "description") agent.prompt = prompt;
    }
    agent.prompt ??= prompt;
    files.set(file, JSON.stringify(agent, null, 2) + "\n");
  }
  const registered = new Set(manifest.agents);
  const agents = [...files.keys()].map((file) => file.replaceAll("\\", "/"));
  if (
    registered.size !== agents.length ||
    agents.some((file) => !registered.has(file))
  )
    throw Error("roles.json and app.json must name the same agents.");
  const folder = path.join(host, "agents");
  for (const file of fs.existsSync(folder) ? fs.readdirSync(folder) : [])
    if (file.endsWith(".json") && !files.has(path.join("agents", file)))
      throw Error(`Agent has no entry in roles.json: ${file}.`);
  for (const [name, text] of source.skills) {
    if (!manifest.skills?.includes(`skills/${name}`))
      throw Error(`app.json must list skills/${name}.`);
    files.set(path.join("skills", name, "SKILL.md"), text);
  }
  return { host, files };
}

// The words of each `avoozl` command only a person may run: its help says so.
async function personOnlyCommands() {
  const { COMMANDS } = await import("../../src/app/cli/cli-commands.ts");
  const prefixes = new Set();
  for (const entry of COMMANDS)
    for (const line of entry.help ?? [])
      if (/a person only/.test(line.about ?? "")) {
        const words = [];
        for (const word of line.usage.split(/\s+/)) {
          if (!/^[a-z][a-z-]*(\|[a-z][a-z-]*)*$/.test(word)) break;
          words.push(word);
        }
        // `intake deliver|plan` is two commands.
        const last = words.pop();
        for (const choice of (last ?? "").split("|"))
          prefixes.add(JSON.stringify([...words, choice]));
      }
  return [...prefixes].sort().map((value) => JSON.parse(value));
}

const PORTABLE_SKILLS = [
  "avoozl-answer",
  "avoozl-drive",
  "avoozl-review",
  "avoozl-triage",
];

// Claude Code: a plugin (.claude-plugin/plugin.json) with the front-end skill
// and the portable skills, an MCP entry that runs `avoozl mcp`, and the
// person-only guard as a PreToolUse hook on Bash. Claude Code runs Avoozl's
// roles as process children, not as plugin agents, so it takes no agents.
// Format: https://code.claude.com/docs/en/plugins/components (2026-11).
function claudeCode(root, source, { personOnly, version }) {
  const host = path.join(root, "hosts", "claude-code"),
    files = new Map();
  const json = (value) => JSON.stringify(value, null, 2) + "\n";
  files.set(
    path.join(".claude-plugin", "plugin.json"),
    json({
      name: "avoozl",
      version,
      description:
        "Avoozl from Claude Code: plan specs, read tasks and Needs you, and drive this machine's avoozl tick.",
    }),
  );
  files.set(
    ".mcp.json",
    json({ mcpServers: { avoozl: { command: "avoozl", args: ["mcp"] } } }),
  );
  files.set(
    path.join("hooks", "hooks.json"),
    json({
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: "node",
                args: ["${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs"],
              },
            ],
          },
        ],
      },
    }),
  );
  // hooks/guard.mjs is hand-written and kept: it reads person-only.json.
  files.set(path.join("hooks", "person-only.json"), json(personOnly));
  files.set(
    path.join("skills", "avoozl", "SKILL.md"),
    source.host("front-end.md"),
  );
  for (const name of PORTABLE_SKILLS)
    files.set(path.join("skills", name, "SKILL.md"), source.skills.get(name));
  files.set(
    "README.md",
    `# Avoozl for Claude Code

Generated by \`npm run build:hosts\` from \`prompts/\`; do not edit it here.

Install it with \`claude --plugin-dir hosts/claude-code\`, or add it from a
marketplace that lists it. It needs the \`avoozl\` command on \`PATH\`.

- \`skills/\`: how to work with Avoozl, and the portable answer, drive,
  review and triage skills.
- \`.mcp.json\`: the \`avoozl\` MCP server, \`avoozl mcp\`, which serves this
  chat from the workspace database and never loops.
- \`hooks/\`: a PreToolUse hook that refuses the agent's own shell call to an
  \`avoozl\` command only a person may run (\`hooks/person-only.json\`). It is
  a speed bump, not a wall: code running as you can reach the same command
  another way. The commands themselves, and the MCP tools, are where Avoozl
  enforces what only a person does.
`,
  );
  return { host, files };
}

export const ADAPTERS = { kirocrew, claudeCode };

// Build or check every host. Returns the generated file paths, relative to
// the repository; with `check`, throws naming each file that differs.
export async function buildHosts({
  root = repositoryRoot,
  check = false,
} = {}) {
  const source = readSource(root),
    written = [],
    drift = [];
  const context = {
    personOnly: await personOnlyCommands(),
    version: JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    ).version,
  };
  for (const adapter of Object.values(ADAPTERS)) {
    const { host, files } = adapter(root, source, context);
    for (const [file, text] of files) {
      const target = path.join(host, file),
        current = fs.existsSync(target)
          ? fs.readFileSync(target, "utf8")
          : null;
      written.push(path.relative(root, target).replaceAll("\\", "/"));
      if (current === text) continue;
      if (check) drift.push(path.relative(root, target).replaceAll("\\", "/"));
      else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, text);
      }
    }
  }
  if (drift.length)
    throw Error(
      `Generated host files differ from prompts/ and roles.json: ${drift.join(", ")}. Run npm run build:hosts.`,
    );
  return written;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  try {
    const files = await buildHosts({ check: process.argv.includes("--check") });
    if (!process.argv.includes("--check"))
      console.log(`Wrote ${files.length} host files.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
