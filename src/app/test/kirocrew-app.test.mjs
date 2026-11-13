import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
  ),
  appRoot = path.join(root, "kirocrew-app"),
  manifest = JSON.parse(
    fs.readFileSync(path.join(appRoot, "app.json"), "utf8"),
  );

test("Kiro Crew app package contains its page, skill, icon, and built UI", () => {
  assert.equal(manifest.name, "avoozl");
  assert.equal(manifest.ui.pages[0].route, "/apps/avoozl");
  assert.deepEqual(manifest.skills, [
    "skills/avoozl",
    "skills/avoozl-plugin",
    "skills/avoozl-rules",
  ]);
  for (const file of [
    manifest.iconPath,
    path.join("ui", manifest.ui.entry),
    "skills/avoozl/SKILL.md",
    "skills/avoozl-plugin/SKILL.md",
    "skills/avoozl-rules/SKILL.md",
  ])
    assert.equal(fs.statSync(path.join(appRoot, file)).isFile(), true, file);
});
