// The repository's own spec must lint with no errors. PR #52 once committed
// a 0-byte manifest that blocked approving the spec; facts now live in
// tasks.md (spec-conversion.test.mjs checks no manifest is left).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { lintSpec, readSpecFolder } from "../specs/spec-plans.mjs";

const root = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const specs = path.join(root, ".kiro", "specs");
const names = fs.existsSync(specs)
  ? fs
      .readdirSync(specs)
      .filter((name) => fs.statSync(path.join(specs, name)).isDirectory())
  : [];

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
