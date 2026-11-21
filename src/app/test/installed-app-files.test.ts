import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { temporaryDirectory } from "./temporary.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  app = path.join(root, "hosts", "kirocrew"),
  agent = (name: string) =>
    JSON.parse(
      fs.readFileSync(path.join(app, "agents", name + ".json"), "utf8"),
    ).prompt;

// Kiro Crew installs the app by copying hosts/kirocrew on its own, so the
// bundle in bin/lib has no checkout around it. `npm test` builds bin/lib.
test("the installed bundle reads the shipped agent prompts and version", async () => {
  const installed = temporaryDirectory();
  for (const part of ["app.json", "agents", "bin"])
    fs.cpSync(path.join(app, part), path.join(installed, part), {
      recursive: true,
    });
  const lib = path.join(installed, "bin", "lib"),
    load = (file: string) =>
      import(pathToFileURL(path.join(lib, "src", "app", file)).href);
  const { rolePrompt, shippedPrompts } = await load("agents/prompts.mjs");
  assert.equal(rolePrompt("reviewer"), agent("avoozl-reviewer"));
  assert.equal(rolePrompt("responder"), agent("avoozl-responder"));
  assert.ok(shippedPrompts()["brief.worker"]);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(lib, "package.json"), "utf8")).version,
    JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
      .version,
  );
});
