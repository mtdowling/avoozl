import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildAgents } from "../executors/kirocrew/build-agents.mjs";
import { rolePrompt, shippedPrompts } from "../agents/prompts.mjs";
import { retroPrompt } from "../flow/flow-retro.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  metadataFile = path.join(
    "src",
    "app",
    "executors",
    "kirocrew",
    "agent-metadata.json",
  );

test("every shipped agent is generated from its role prompt and private metadata", () => {
  const templates = JSON.parse(
    fs.readFileSync(path.join(root, metadataFile), "utf8"),
  );
  assert.equal(buildAgents({ root, check: true }).length, templates.length);
  for (const metadata of templates) {
    const role = metadata.name.replace(/^avoozl-/, ""),
      agent = JSON.parse(
        fs.readFileSync(
          path.join(root, "kirocrew-app", "agents", `${metadata.name}.json`),
          "utf8",
        ),
      );
    assert.equal(agent.prompt, rolePrompt(role), role);
    delete agent.prompt;
    assert.deepEqual(
      agent,
      metadata,
      `${role} keeps tools, permissions and hooks`,
    );
  }
  assert.equal(shippedPrompts()["brief.worker"], rolePrompt("worker"));
  assert.equal(shippedPrompts()["brief.review"], rolePrompt("review"));
  assert.equal(retroPrompt(), rolePrompt("retro"));
  assert.throws(() => rolePrompt("../planner"), /role prompt name/);
});

function fixture() {
  const temporary = temporaryDirectory();
  for (const file of [metadataFile, "kirocrew-app/app.json"]) {
    fs.mkdirSync(path.dirname(path.join(temporary, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(temporary, file));
  }
  for (const directory of ["prompts", "kirocrew-app/agents"])
    fs.cpSync(path.join(root, directory), path.join(temporary, directory), {
      recursive: true,
    });
  return temporary;
}

test("the drift check refuses changed prompts and generated agents before repairing them", () => {
  const temporary = fixture(),
    prompt = path.join(temporary, "prompts", "retro.md"),
    generated = path.join(
      temporary,
      "kirocrew-app",
      "agents",
      "avoozl-retro.json",
    ),
    before = fs.readFileSync(generated, "utf8"),
    changed = fs.readFileSync(prompt, "utf8") + "\nA new instruction.\n";
  fs.writeFileSync(prompt, changed);
  assert.throws(
    () => buildAgents({ root: temporary, check: true }),
    /avoozl-retro.json/,
  );
  assert.equal(
    fs.readFileSync(generated, "utf8"),
    before,
    "a check writes nothing",
  );
  buildAgents({ root: temporary });
  assert.equal(JSON.parse(fs.readFileSync(generated, "utf8")).prompt, changed);
  const agent = JSON.parse(fs.readFileSync(generated, "utf8"));
  agent.tools.push("unexpected-tool");
  fs.writeFileSync(generated, JSON.stringify(agent));
  assert.throws(
    () => buildAgents({ root: temporary, check: true }),
    /avoozl-retro.json/,
  );
  buildAgents({ root: temporary });
  assert.deepEqual(JSON.parse(fs.readFileSync(generated, "utf8")).tools, []);
  buildAgents({ root: temporary, check: true });
});

test("the generator refuses an agent without registered prompt metadata", () => {
  const temporary = fixture();
  fs.writeFileSync(
    path.join(temporary, "kirocrew-app", "agents", "unregistered.json"),
    "{}",
  );
  assert.throws(() => buildAgents({ root: temporary }), /no prompt metadata/);
});

test("the installed runtime reads portable prompt files without generated agent JSON", async () => {
  const installed = temporaryDirectory(),
    source = path.join(root, "kirocrew-app", "bin", "lib");
  fs.cpSync(source, installed, { recursive: true });
  // No app.json or agents/ is copied: prompts are runtime data in the bundle.
  const load = (file) =>
      import(pathToFileURL(path.join(installed, "src", "app", file))),
    prompts = await load("agents/prompts.mjs"),
    retro = await load("flow/flow-retro.mjs");
  assert.equal(prompts.rolePrompt("planner"), rolePrompt("planner"));
  assert.equal(prompts.shippedPrompts()["brief.worker"], rolePrompt("worker"));
  assert.equal(prompts.shippedPrompts()["agent.retro"], rolePrompt("retro"));
  assert.equal(retro.retroPrompt(), rolePrompt("retro"));
});
