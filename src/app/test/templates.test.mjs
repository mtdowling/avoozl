// Workflow templates (design §4.16, Requirement 61.1–61.6): the `template`
// part runs as nothing, its file's keys and inputs are checked by name,
// placeholders are plain text, the starter lints with sample values, phases
// match the starter, pack and flow pass their validators, and an invalid
// template makes its plugin invalid.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { inspectPlugin, validateManifest } from "../plugins.mjs";
import { checkInputs, fill, readTemplates } from "../templates.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const FIXTURE = path.join(
  import.meta.dirname,
  "fixtures",
  "plugins",
  "sdk-templates",
);
const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const save = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");

// A copy of the sample plugin to break one thing in.
function copy() {
  const folder = path.join(temporaryDirectory("avoozl-template-"), "plugin");
  fs.cpSync(FIXTURE, folder, { recursive: true });
  const dir = path.join(folder, "templates", "sdk-rewrite");
  return {
    folder,
    dir,
    edit(fn) {
      const file = path.join(dir, "avoozl-template.json"),
        value = json(file);
      fn(value);
      save(file, value);
    },
    write(file, text) {
      fs.writeFileSync(path.join(dir, file), text);
    },
  };
}

const invalid = (folder, pattern) =>
  assert.throws(() => readTemplates(folder), pattern);

test("the sample template is valid and runs as nothing", () => {
  const manifest = json(path.join(FIXTURE, "avoozl-plugin.json"));
  validateManifest(manifest, { id: manifest.id });
  assert.throws(
    () =>
      validateManifest(
        { ...manifest, entry: "index.mjs" },
        { id: manifest.id },
      ),
    /provides only template, which runs no code; remove entry/,
  );
  const [template] = readTemplates(FIXTURE);
  assert.equal(template.id, "sdk-rewrite");
  assert.deepEqual(
    template.phases.map((p) => p.id),
    ["inventory", "codegen", "runtime", "protocol-tests", "review", "cutover"],
  );
  const manifestText = template.starterFiles["avoozl/manifest.json"],
    review = JSON.parse(fill(manifestText, { sdk: "x", repository: "r" }))
      .tasks["team-review"];
  assert.equal(review.manual, true);
  assert.deepEqual(review.requires, ["protocol-tests-proof"]);
  assert.deepEqual(
    template.proofKinds.map((p) => p.id),
    ["protocol-tests", "cutover-dry-run"],
  );
  assert.deepEqual(template.flow.retro, { everyTasks: 10 });
});

test("an unknown key, input or placeholder makes the template and its plugin invalid", () => {
  let plugin = copy();
  plugin.edit((t) => (t.owner = "someone"));
  invalid(plugin.folder, /key owner is not a template key/);
  const shown = inspectPlugin(
    {
      entry: { id: "sdk-templates", path: plugin.folder, contract: 1 },
      source: "machine",
    },
    { settingsFile: path.join(plugin.folder, "..", "plugins.json") },
    { approvals: {}, disabled: [], pins: {} },
  );
  assert.equal(shown.state, "invalid");
  assert.match(shown.reason, /owner is not a template key/);

  plugin = copy();
  plugin.write("prompt.md", "Rewrite {{sdk}} for {{team}}.\n");
  invalid(
    plugin.folder,
    /prompt\.md uses \{\{team\}\}, which is not an input ID/,
  );

  plugin = copy();
  plugin.edit((t) =>
    t.inputs.push({ id: "sdk", label: "Again", type: "text", required: false }),
  );
  invalid(plugin.folder, /inputs\[3\]\.id sdk is used twice/);

  plugin = copy();
  plugin.edit((t) => (t.inputs[0].type = "number"));
  invalid(
    plugin.folder,
    /inputs\[0\]\.type must be one of text, choice, file, repositories, epic/,
  );

  plugin = copy();
  plugin.edit((t) =>
    t.inputs.push({
      id: "tier",
      label: "Tier",
      type: "choice",
      required: true,
    }),
  );
  invalid(plugin.folder, /inputs\[3\]\.options must list/);
});

test("a starter that does not lint, or phases that do not match it, are refused", () => {
  let plugin = copy();
  const manifest = path.join(plugin.dir, "starter", "avoozl", "manifest.json"),
    value = json(manifest);
  value.tasks["team-review"].checks = ["npm test"];
  save(manifest, value);
  invalid(
    plugin.folder,
    /starter\/avoozl\/manifest\.json line \d+: Manual task "sdk-rewrite\.team-review" has "checks"|has "checks"/,
  );

  plugin = copy();
  plugin.edit((t) => t.phases.reverse());
  invalid(
    plugin.folder,
    /phases must match the starter's phases in order: inventory \(Inventory\)/,
  );
});

test("pack and flow pass their own validators", () => {
  let plugin = copy();
  plugin.edit((t) => (t.flow = { batch: { by: "epic" } }));
  invalid(plugin.folder, /flow\.batch\.by/);

  plugin = copy();
  plugin.edit((t) => (t.flow = { lessons: { share: false } }));
  invalid(plugin.folder, /flow\.lessons is not a template flow default/);

  plugin = copy();
  plugin.edit((t) => (t.pack = { settings: { secrets: {} } }));
  invalid(
    plugin.folder,
    /pack: Pack key settings\.secrets is not a pack setting/,
  );
});

test("inputs: required ones filled, unknown ones refused, a file at most 200 KB, text replaced as is", () => {
  const [template] = readTemplates(FIXTURE);
  assert.throws(() => checkInputs(template, {}), /^Error: sdk is required/);
  assert.throws(
    () => checkInputs(template, { sdk: "a", repository: ["r"], extra: "x" }),
    /extra is not an input of SDK rewrite/,
  );
  assert.throws(
    () =>
      checkInputs(template, {
        sdk: "a",
        repository: ["r"],
        gaps: "x".repeat(200 * 1024 + 1),
      }),
    /gaps is larger than 200 KB/,
  );
  const { text } = checkInputs(template, {
    sdk: "{{repository}} $(whoami) `x`",
    repository: "r",
  });
  assert.equal(
    fill("SDK {{sdk}} in {{repository}}", text),
    "SDK {{repository}} $(whoami) `x` in r",
    "replaced once, as text; nothing is run or filled again",
  );
});
