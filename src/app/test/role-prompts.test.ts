import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildHosts,
  CLAUDE_CODE_OWN_SKILLS,
  CLAUDE_CODE_SKIPS,
} from "../../../scripts/bundle/build-hosts.ts";
import { rolePrompt, shippedPrompts } from "../agents/prompts.ts";
import { temporaryDirectory } from "./temporary.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  metadataFile = "roles.json";

test("every shipped agent is generated from its role prompt and private metadata", async () => {
  const templates = JSON.parse(
    fs.readFileSync(path.join(root, metadataFile), "utf8"),
  );
  assert.equal(
    (await buildHosts({ root, check: true })).filter((f) =>
      f.includes("/agents/"),
    ).length,
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
  assert.throws(() => rolePrompt("../planner"), /role prompt name/);
});

function fixture() {
  const temporary = temporaryDirectory();
  for (const file of [
    metadataFile,
    "hosts/kirocrew/app.json",
    "package.json",
  ]) {
    fs.mkdirSync(path.dirname(path.join(temporary, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(temporary, file));
  }
  for (const directory of [
    "prompts",
    "hosts/kirocrew/agents",
    "hosts/kirocrew/skills",
    "hosts/claude-code",
  ])
    fs.cpSync(path.join(root, directory), path.join(temporary, directory), {
      recursive: true,
    });
  return temporary;
}

test("the drift check refuses changed prompts and generated agents before repairing them", async () => {
  const temporary = fixture(),
    prompt = path.join(temporary, "prompts", "responder.md"),
    generated = path.join(
      temporary,
      "hosts",
      "kirocrew",
      "agents",
      "avoozl-responder.json",
    ),
    before = fs.readFileSync(generated, "utf8"),
    changed = fs.readFileSync(prompt, "utf8") + "\nA new instruction.\n";
  fs.writeFileSync(prompt, changed);
  await assert.rejects(
    () => buildHosts({ root: temporary, check: true }),
    /avoozl-responder.json/,
  );
  assert.equal(
    fs.readFileSync(generated, "utf8"),
    before,
    "a check writes nothing",
  );
  await buildHosts({ root: temporary });
  assert.equal(JSON.parse(fs.readFileSync(generated, "utf8")).prompt, changed);
  const agent = JSON.parse(fs.readFileSync(generated, "utf8"));
  agent.tools.push("unexpected-tool");
  fs.writeFileSync(generated, JSON.stringify(agent));
  await assert.rejects(
    () => buildHosts({ root: temporary, check: true }),
    /avoozl-responder.json/,
  );
  await buildHosts({ root: temporary });
  assert.deepEqual(
    JSON.parse(fs.readFileSync(generated, "utf8")).tools,
    JSON.parse(before).tools,
  );
  await buildHosts({ root: temporary, check: true });
});

test("the generator refuses an agent without registered prompt metadata", async () => {
  const temporary = fixture();
  fs.writeFileSync(
    path.join(temporary, "hosts", "kirocrew", "agents", "unregistered.json"),
    "{}",
  );
  await assert.rejects(
    () => buildHosts({ root: temporary }),
    /no entry in roles.json/,
  );
});

test("the installed runtime reads portable prompt files without generated agent JSON", async () => {
  const installed = temporaryDirectory(),
    source = path.join(root, "hosts", "kirocrew", "bin", "lib");
  fs.cpSync(source, installed, { recursive: true });
  // No app.json or agents/ is copied: prompts are runtime data in the bundle.
  const load = (file: string) =>
      import(pathToFileURL(path.join(installed, "src", "app", file)).href),
    prompts = await load("agents/prompts.mjs");
  assert.equal(prompts.rolePrompt("responder"), rolePrompt("responder"));
  assert.equal(prompts.shippedPrompts()["brief.worker"], rolePrompt("worker"));
});

test("every skill prompt is shipped as its skill, and drift fails the check", async () => {
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
  await assert.rejects(
    () => buildHosts({ root: temporary, check: true }),
    /avoozl-review/,
  );
  await buildHosts({ root: temporary });
  await buildHosts({ root: temporary, check: true });
  const manifest = path.join(temporary, "hosts", "kirocrew", "app.json"),
    app = JSON.parse(fs.readFileSync(manifest, "utf8"));
  app.skills = app.skills.filter((s: string) => s !== "skills/avoozl-triage");
  fs.writeFileSync(manifest, JSON.stringify(app));
  await assert.rejects(
    () => buildHosts({ root: temporary, check: true }),
    /skills\/avoozl-triage/,
  );
});

test("the Claude Code plugin ships every skill prompt but its named skips", async () => {
  const skills = (folder: string) =>
      fs.readdirSync(folder).map((file) => file.replace(/\.md$/, "")),
    plugin = path.join(root, "hosts", "claude-code", "skills"),
    shared = skills(path.join(root, "prompts", "skills")).filter(
      (name) => !(name in CLAUDE_CODE_SKIPS),
    );
  assert.deepEqual(
    skills(plugin).sort(),
    [...shared, ...Object.keys(CLAUDE_CODE_OWN_SKILLS)].sort(),
  );
  for (const name of [
    "avoozl-spec",
    "avoozl-spec-review",
    "avoozl-work",
    "avoozl-retro",
  ])
    assert.ok(shared.includes(name), name);
  for (const name of shared)
    assert.equal(
      fs.readFileSync(path.join(plugin, name, "SKILL.md"), "utf8"),
      fs.readFileSync(
        path.join(root, "prompts", "skills", `${name}.md`),
        "utf8",
      ),
      name,
    );
  const temporary = fixture(),
    copy = path.join(
      temporary,
      "hosts",
      "claude-code",
      "skills",
      "avoozl-retro",
      "SKILL.md",
    );
  fs.appendFileSync(copy, "\nChange every setting.\n");
  await assert.rejects(
    () => buildHosts({ root: temporary, check: true }),
    /claude-code\/skills\/avoozl-retro/,
  );
  await buildHosts({ root: temporary });
  fs.mkdirSync(path.join(temporary, "hosts", "claude-code", "skills", "stray"));
  await assert.rejects(
    () => buildHosts({ root: temporary, check: true }),
    /no source: skills\/stray/,
  );
});

test("check:hosts fails naming a file after one generated byte changes", async () => {
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
  await assert.rejects(
    () => buildHosts({ root: temporary, check: true }),
    /hosts\/kirocrew\/skills\/avoozl\/SKILL\.md/,
  );
});

test("npm runs the host check before the tests, and the agent scripts are gone", async () => {
  const scripts = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ).scripts;
  assert.match(scripts.pretest, /npm run check:hosts/);
  assert.match(scripts["pretest:ci"], /npm run check:hosts/);
  assert.equal(scripts["build:agents"], undefined);
  assert.equal(scripts["check:agents"], undefined);
});
