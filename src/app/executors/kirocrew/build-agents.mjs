#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

// Keep permissions, tools, hooks and other provider metadata separate from the
// standing instructions shared by every executor.
export function buildAgents({ root = repositoryRoot, check = false } = {}) {
  const prompts = path.join(root, "prompts"),
    directory = path.join(root, "kirocrew-app", "agents"),
    manifest = JSON.parse(
      fs.readFileSync(path.join(root, "kirocrew-app", "app.json"), "utf8"),
    ),
    templates = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          "src",
          "app",
          "executors",
          "kirocrew",
          "agent-metadata.json",
        ),
        "utf8",
      ),
    ),
    expected = new Map();
  for (const metadata of templates) {
    const role = metadata.name?.replace(/^avoozl-/, "");
    if (!/^[a-z][a-z0-9-]*$/.test(role) || "prompt" in metadata)
      throw Error("Agent metadata must name a role and contain no prompt.");
    const file = `${metadata.name}.json`;
    if (expected.has(file)) throw Error(`Duplicate agent metadata: ${file}.`);
    const prompt = fs.readFileSync(path.join(prompts, `${role}.md`), "utf8"),
      agent = {};
    // Retain the familiar generated field order as well as every metadata value.
    for (const [key, value] of Object.entries(metadata)) {
      agent[key] = value;
      if (key === "description") agent.prompt = prompt;
    }
    agent.prompt ??= prompt;
    expected.set(file, JSON.stringify(agent, null, 2) + "\n");
  }
  const registered = new Set(manifest.agents);
  if (
    registered.size !== expected.size ||
    [...expected.keys()].some((file) => !registered.has(`agents/${file}`))
  )
    throw Error("Agent metadata and app.json must name the same agents.");
  for (const file of fs.readdirSync(directory))
    if (file.endsWith(".json") && !expected.has(file))
      throw Error(`Agent has no prompt metadata: ${file}.`);
  const drift = [];
  for (const [file, text] of expected) {
    const target = path.join(directory, file),
      current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
    if (current === text) continue;
    if (check) drift.push(file);
    else fs.writeFileSync(target, text);
  }
  if (drift.length)
    throw Error(
      `Generated agents differ from role prompts or metadata: ${drift.join(", ")}. Run npm run build:agents.`,
    );
  return [...expected.keys()];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  buildAgents({ check: process.argv.includes("--check") });
