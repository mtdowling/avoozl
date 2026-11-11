import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

test("configuration files use the syntax-highlighted JSON editor", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const editors = fs.readFileSync(
    path.join(root, "src/web/Editors.tsx"),
    "utf8",
  );

  assert.match(app, /const JsonEditor = lazy/);
  assert.match(app, /<JsonEditor[\s\S]*?filename=\{editing\.filename\}/);
  assert.doesNotMatch(
    app,
    /<textarea[\s\S]*?Avoozl configuration JSON[\s\S]*?<\/textarea>/,
  );
  assert.match(editors, /export function JsonEditor/);
  assert.match(editors, /language="json"/);
  assert.match(editors, /setMonarchTokensProvider\("json"/);
  assert.match(editors, /string\.key\.json/);
});
