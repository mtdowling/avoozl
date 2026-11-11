import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");

test("plan review pipelines expose ordered providers, models, and bounded rounds", () => {
  const editor = fs.readFileSync(
    path.join(root, "src/web/Editors.tsx"),
    "utf8",
  );
  const operations = fs.readFileSync(
    path.join(root, "src/app/operations.mjs"),
    "utf8",
  );
  const prompts = fs.readFileSync(
    path.join(root, "src/app/plan-reviews.mjs"),
    "utf8",
  );

  assert.match(editor, /PLAN_REVIEW_PREFERENCES_KEY/);
  assert.match(editor, /Maximum rounds/);
  assert.match(editor, /min=\{1\}/);
  assert.match(editor, /max=\{10\}/);
  assert.match(editor, /Add reviewer/);
  assert.match(editor, /Move reviewer \$\{index \+ 1\} earlier/);
  assert.match(editor, /Model <span>optional<\/span>/);
  assert.match(editor, /maxRounds: reviewMaxRounds/);
  assert.match(editor, /sequence,/);
  assert.match(operations, /Choose 1–10 review rounds/);
  assert.match(
    prompts,
    /Do not nitpick wording, style, optional polish, or repeat an existing point/,
  );
});
