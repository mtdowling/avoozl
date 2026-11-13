import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { temporaryDirectory } from "./temporary.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  app = path.join(root, "kirocrew-app"),
  agent = (name) =>
    JSON.parse(fs.readFileSync(path.join(app, "agents", name + ".json")))
      .prompt;

// Kiro Crew installs the app by copying kirocrew-app on its own, so the
// bundle in bin/lib has no checkout around it. `npm test` builds bin/lib.
test("the installed bundle reads the shipped agent prompts and version", async () => {
  const installed = temporaryDirectory();
  for (const part of ["app.json", "agents", "bin"])
    fs.cpSync(path.join(app, part), path.join(installed, part), {
      recursive: true,
    });
  const lib = path.join(installed, "bin", "lib"),
    load = (file) => import(pathToFileURL(path.join(lib, "src", "app", file)));
  const { retroPrompt } = await load("flow-retro.mjs"),
    { shippedPrompts } = await load("prompts.mjs");

  assert.equal(retroPrompt(), agent("avoozl-retro"));
  const shipped = shippedPrompts();
  assert.equal(shipped["agent.retro"], agent("avoozl-retro"));
  assert.equal(shipped["agent.planner"], agent("avoozl-planner"));
  assert.ok(shipped["agent.planner"]);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(lib, "package.json"))).version,
    JSON.parse(fs.readFileSync(path.join(root, "package.json"))).version,
  );
});
