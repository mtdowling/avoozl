// The live proofs run the real Claude Code, not the toolbox's wrapper or shim.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  REAL_CLAUDE_BYTES,
  claudeBinaries,
  realClaude,
} from "../../../scripts/real-claude.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// A sparse file of the given size: it takes no disk.
function file(target, bytes) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "");
  fs.truncateSync(target, bytes);
  return target;
}

function toolbox(home, version, { wrapper = true } = {}) {
  const dir = path.join(home, ".toolbox", "tools", "claude-code", version);
  const real = file(path.join(dir, "claude"), REAL_CLAUDE_BYTES + 1);
  if (wrapper) file(path.join(dir, "bin", "claude"), 16_000_000);
  return { dir, real };
}

test("the wrapper in bin/ resolves to the real binary one level up", () => {
  const home = temporaryDirectory(),
    { dir, real } = toolbox(home, "2.1.327.1766");
  assert.equal(
    realClaude(path.join(dir, "bin", "claude"), home),
    fs.realpathSync(real),
  );
  assert.equal(realClaude(real, home), fs.realpathSync(real));
});

test("the ~/.toolbox/bin shim and a bare name give the newest installed version", () => {
  const home = temporaryDirectory();
  toolbox(home, "2.1.9.1");
  const newest = toolbox(home, "2.1.327.1766").real;
  const shim = file(path.join(home, ".toolbox", "bin", "claude"), 4_000_000);
  assert.equal(realClaude(shim, home), fs.realpathSync(newest));
  assert.equal(realClaude(null, home), fs.realpathSync(newest));
});

test("a small file is never taken for the real binary, and none found is null", () => {
  const home = temporaryDirectory(),
    small = file(path.join(home, "bin", "claude"), 16_000_000);
  assert.equal(realClaude(small, home), null);
  assert.equal(realClaude("/no/such/claude", home), null);
});

test("the export runs the person's shim and the child runs the real binary", () => {
  const home = temporaryDirectory(),
    { real } = toolbox(home, "2.1.327.1766"),
    shim = file(path.join(home, ".toolbox", "bin", "claude"), 4_000_000);
  const found = claudeBinaries({ named: null, onPath: shim, home });
  assert.equal(found.exportWith, shim);
  assert.equal(found.child, fs.realpathSync(real));
  assert.notEqual(found.exportWith, found.child);
  // SWP1_CLAUDE wins for both, and the child is still the real one.
  const wrapper = path.join(path.dirname(real), "bin", "claude");
  assert.deepEqual(claudeBinaries({ named: wrapper, onPath: shim, home }), {
    exportWith: wrapper,
    child: fs.realpathSync(real),
  });
});
