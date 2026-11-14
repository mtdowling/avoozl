import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CREW_PROMPT } from "../radar-crew-prompt.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  spec = (file) =>
    fs.readFileSync(path.join(root, ".kiro/specs/radar-coder", file), "utf8");

// The first fenced block after a heading or a line that starts `after`.
function fencedAfter(text, after) {
  const start = text.indexOf(after);
  assert.ok(start >= 0, `${after} is in the spec`);
  const match = /```[a-z]*\n[ ]*([^\n]*?)[ ]*\n[ ]*```/.exec(text.slice(start));
  assert.ok(match, `a one-line block follows ${after}`);
  return match[1];
}

test("the constant is design D5.4 verbatim", () => {
  assert.equal(
    CREW_PROMPT,
    fencedAfter(spec("design.md"), "### D5.4 The Additional prompt"),
  );
});

test("the constant is requirement RC3.7 verbatim", () => {
  assert.equal(
    CREW_PROMPT,
    fencedAfter(
      spec("requirements.md"),
      "7. The crew **Additional prompt** SHALL be this one line",
    ),
  );
});

test("the constant is one line and names the command and the tool", () => {
  assert.equal(CREW_PROMPT, CREW_PROMPT.trim());
  assert.doesNotMatch(CREW_PROMPT, /[\r\n]/);
  assert.match(CREW_PROMPT, /`avoozl verify-issue OWNER\/REPO#N`/);
  assert.match(CREW_PROMPT, /plans_verify_issue/);
});

// The one place the line lives. Settings, the team pack and Set up import it,
// so a copy elsewhere in the shipped source would drift.
test("no other shipped source holds a copy of the line", () => {
  const copies = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "bin") continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (
        /\.(mjs|js|jsx|ts|tsx|json|md)$/.test(entry.name) &&
        !/(^|[\\/])test[\\/]|\.test\./.test(file) &&
        fs.readFileSync(file, "utf8").includes("build only if it exits 0")
      )
        copies.push(path.relative(root, file));
    }
  };
  for (const dir of ["src", "kirocrew-app", "docs"].map((d) =>
    path.join(root, d),
  ))
    if (fs.existsSync(dir)) walk(dir);
  assert.deepEqual(
    copies.filter(
      (file) =>
        !file.endsWith("radar-crew-prompt.mjs") &&
        !file.startsWith("docs/research") &&
        !file.startsWith("docs/evidence"),
    ),
    [],
  );
});
