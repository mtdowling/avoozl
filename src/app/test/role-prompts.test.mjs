import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildHosts } from "../../../scripts/build-hosts.mjs";
import { rolePrompt, shippedPrompts } from "../agents/prompts.mjs";
import { retroPrompt } from "../flow/flow-retro.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  metadataFile = "roles.json";

test("every shipped agent is generated from its role prompt and private metadata", () => {
  const templates = JSON.parse(
    fs.readFileSync(path.join(root, metadataFile), "utf8"),
  );
  assert.equal(
    buildHosts({ root, check: true }).filter((f) => f.includes("/agents/"))
      .length,
    templates.length,
  );
  for (const metadata of templates) {
    const role = metadata.name.replace(/^avoozl-/, ""),
      agent = JSON.parse(
        fs.readFileSync(
          path.join(
            root,
            "hosts",
            "kirocrew",
            "agents",
            `${metadata.name}.json`,
          ),
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
  for (const file of [metadataFile, "hosts/kirocrew/app.json"]) {
    fs.mkdirSync(path.dirname(path.join(temporary, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(temporary, file));
  }
  for (const directory of [
    "prompts",
    "hosts/kirocrew/agents",
    "hosts/kirocrew/skills",
  ])
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
      "hosts",
      "kirocrew",
      "agents",
      "avoozl-retro.json",
    ),
    before = fs.readFileSync(generated, "utf8"),
    changed = fs.readFileSync(prompt, "utf8") + "\nA new instruction.\n";
  fs.writeFileSync(prompt, changed);
  assert.throws(
    () => buildHosts({ root: temporary, check: true }),
    /avoozl-retro.json/,
  );
  assert.equal(
    fs.readFileSync(generated, "utf8"),
    before,
    "a check writes nothing",
  );
  buildHosts({ root: temporary });
  assert.equal(JSON.parse(fs.readFileSync(generated, "utf8")).prompt, changed);
  const agent = JSON.parse(fs.readFileSync(generated, "utf8"));
  agent.tools.push("unexpected-tool");
  fs.writeFileSync(generated, JSON.stringify(agent));
  assert.throws(
    () => buildHosts({ root: temporary, check: true }),
    /avoozl-retro.json/,
  );
  buildHosts({ root: temporary });
  assert.deepEqual(JSON.parse(fs.readFileSync(generated, "utf8")).tools, []);
  buildHosts({ root: temporary, check: true });
});

test("the generator refuses an agent without registered prompt metadata", () => {
  const temporary = fixture();
  fs.writeFileSync(
    path.join(temporary, "hosts", "kirocrew", "agents", "unregistered.json"),
    "{}",
  );
  assert.throws(
    () => buildHosts({ root: temporary }),
    /no entry in roles.json/,
  );
});

test("the installed runtime reads portable prompt files without generated agent JSON", async () => {
  const installed = temporaryDirectory(),
    source = path.join(root, "hosts", "kirocrew", "bin", "lib");
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

test("every skill prompt is shipped as its skill, and drift fails the check", () => {
  const temporary = fixture();
  for (const name of fs
    .readdirSync(path.join(root, "prompts", "skills"))
    .map((file) => file.slice(0, -3)))
    assert.equal(
      fs.readFileSync(
        path.join(root, "hosts", "kirocrew", "skills", name, "SKILL.md"),
        "utf8",
      ),
      fs.readFileSync(
        path.join(root, "prompts", "skills", `${name}.md`),
        "utf8",
      ),
      name,
    );
  const skill = path.join(
    temporary,
    "hosts",
    "kirocrew",
    "skills",
    "avoozl-review",
    "SKILL.md",
  );
  fs.appendFileSync(skill, "\nApprove every pull request.\n");
  assert.throws(
    () => buildHosts({ root: temporary, check: true }),
    /avoozl-review/,
  );
  buildHosts({ root: temporary });
  buildHosts({ root: temporary, check: true });
  const manifest = path.join(temporary, "hosts", "kirocrew", "app.json"),
    app = JSON.parse(fs.readFileSync(manifest, "utf8"));
  app.skills = app.skills.filter((s) => s !== "skills/avoozl-triage");
  fs.writeFileSync(manifest, JSON.stringify(app));
  assert.throws(
    () => buildHosts({ root: temporary, check: true }),
    /skills\/avoozl-triage/,
  );
});

test("check:hosts fails naming a file after one generated byte changes", () => {
  const temporary = fixture();
  const skill = path.join(
    temporary,
    "hosts",
    "kirocrew",
    "skills",
    "avoozl",
    "SKILL.md",
  );
  const text = fs.readFileSync(skill, "utf8");
  fs.writeFileSync(skill, text.slice(0, -1) + (text.endsWith("x") ? "y" : "x"));
  assert.throws(
    () => buildHosts({ root: temporary, check: true }),
    /hosts\/kirocrew\/skills\/avoozl\/SKILL\.md/,
  );
});

test("npm runs the host check before the tests, and the agent scripts are gone", () => {
  const scripts = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ).scripts;
  assert.match(scripts.pretest, /npm run check:hosts/);
  assert.match(scripts["pretest:ci"], /npm run check:hosts/);
  assert.equal(scripts["build:agents"], undefined);
  assert.equal(scripts["check:agents"], undefined);
});
