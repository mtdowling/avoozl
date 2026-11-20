#!/usr/bin/env node
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

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

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

export const ADAPTERS = { kirocrew };

// Build or check every host. Returns the generated file paths, relative to
// the repository; with `check`, throws naming each file that differs.
export function buildHosts({ root = repositoryRoot, check = false } = {}) {
  const source = readSource(root),
    written = [],
    drift = [];
  for (const adapter of Object.values(ADAPTERS)) {
    const { host, files } = adapter(root, source);
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
    const files = buildHosts({ check: process.argv.includes("--check") });
    if (!process.argv.includes("--check"))
      console.log(`Wrote ${files.length} host files.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
