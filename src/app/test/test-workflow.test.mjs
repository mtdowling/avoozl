// Avoozl's own test workflow accepts the validation dispatch (lt-4.5). No YAML
// parser in the repository, so this reads the text it depends on.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const text = fs.readFileSync(
  new URL("../../../.github/workflows/test.yml", import.meta.url),
  "utf8",
);

test("workflow_dispatch takes a platforms input", () => {
  assert.match(
    text,
    /workflow_dispatch:\n    inputs:\n      platforms:\n        description: .*\n        required: false/,
  );
});

test("push stays on main only, so batch and validate refs start no push run", () => {
  assert.match(text, /on:\n  push:\n    branches: \[main\]\n/);
  assert.doesNotMatch(text, /branches:.*(avoozl-batch|avoozl-validate|\*\*)/);
});

test("the required checks keep their names", () => {
  for (const os of ["ubuntu", "macos", "windows"])
    assert.match(text, new RegExp(`name: test \\(${os}-latest\\)`));
  assert.match(text, /\n  plan:\n/);
});

test("each platform name limits its own system's shards", () => {
  assert.match(text, /id: legs/);
  assert.match(text, /if wanted linux-x64; then echo "linux=\$PLAN_LINUX"/);
  assert.match(text, /if wanted macos-arm64; then echo "macos=\$PLAN_MACOS"/);
  assert.match(
    text,
    /if wanted windows-x64; then echo "windows=\$PLAN_WINDOWS"/,
  );
  assert.match(text, /linux: \$\{\{ steps\.legs\.outputs\.linux \}\}/);
  assert.match(text, /macos: \$\{\{ steps\.legs\.outputs\.macos \}\}/);
  assert.match(text, /windows: \$\{\{ steps\.legs\.outputs\.windows \}\}/);
});
