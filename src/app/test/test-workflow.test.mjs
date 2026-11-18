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

test("the job name and matrix are unchanged", () => {
  assert.match(text, /\njobs:\n  test:\n/);
  assert.match(
    text,
    /matrix:\n        os: \[ubuntu-latest, macos-latest, windows-latest\]\n/,
  );
});

test("each platform name maps to its runner, and the legs follow the filter", () => {
  assert.match(text, /ubuntu-latest\) platform=linux-x64 ;;/);
  assert.match(text, /windows-latest\) platform=windows-x64 ;;/);
  assert.match(text, /macos-latest\) platform=macos-arm64 ;;/);
  assert.match(text, /id: leg/);
  // Everything after the filter is gated on it, through select or directly.
  assert.match(
    text,
    /id: select\n        if: steps\.leg\.outputs\.run == 'true'/,
  );
  assert.match(
    text,
    /matrix\.os == 'ubuntu-latest' && steps\.leg\.outputs\.run == 'true'/,
  );
});
