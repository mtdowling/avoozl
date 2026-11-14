// Every avoozl/manifest.json under .kiro/specs must be a non-empty, parsing
// object, and the repository's own spec must lint with no errors. PR #52
// once committed a 0-byte manifest that blocked approving the spec.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { lintSpec, readSpecFolder } from "../spec-plans.mjs";

const root = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const specs = path.join(root, ".kiro", "specs");
const names = fs.existsSync(specs)
  ? fs
      .readdirSync(specs)
      .filter((name) => fs.statSync(path.join(specs, name)).isDirectory())
  : [];

for (const name of names) {
  const file = path.join(specs, name, "avoozl", "manifest.json");
  if (!fs.existsSync(file)) continue;
  test(`.kiro/specs/${name}/avoozl/manifest.json is not empty and parses`, () => {
    const text = fs.readFileSync(file, "utf8");
    assert.ok(text.trim().length > 0, "the manifest is empty");
    const parsed = JSON.parse(text);
    assert.ok(
      parsed && typeof parsed === "object" && !Array.isArray(parsed),
      "the manifest is not a JSON object",
    );
  });
}

test("the repository's own spec lints with no errors", () => {
  const spec = readSpecFolder(root, "avoozl");
  if (!spec.exists) return;
  const errors = lintSpec({ spec }).diagnostics.filter(
    (item) => item.severity === "error",
  );
  assert.deepEqual(
    errors.map((item) => item.message),
    [],
  );
});
