// The `Facts:` block layout (Requirement 111 until 2026-11-19): a stored
// record folds into `$key:` bullets with the same revision hash, and a
// folder on disk that still has one is refused.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  currentFiles,
  foldFactsBlocks,
  hasFactsBlocks,
} from "../spec-legacy.mjs";
import { parseSpec, readSpecFolder, specHash } from "../spec-plans.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const prose = {
  "requirements.md": "# Config\n\nRead config.json.\n",
  "design.md": "# Design\n\nA loader.\n",
};
const fence = ["```markdown", "- Facts:", "  - done: Not a block", "```", ""];
const OLD = [
  "---",
  "repo: app",
  "---",
  "# Tasks",
  "",
  "- [ ] 1 Load configuration",
  "  - Facts:",
  "    - kind: package",
  "    - after:",
  "      - 1.1",
  "      - 1.2",
  "  - The loader and its tests.",
  "  - [ ] 1.1 Read the config file",
  "    - Facts:",
  "      - done:",
  "        - A missing file yields defaults.",
  "        - Invalid JSON names the file, and its line.",
  "  - [x] 1.2 Validate config",
  "    - Facts:",
  "      - after: 1.1",
  "      - done: An unknown key is reported",
  "      - Built: abc1234",
  "    - Report each unknown key.",
  "",
  ...fence,
].join("\n");
const FOLDED = [
  "---",
  "repo: app",
  "---",
  "# Tasks",
  "",
  "- [ ] 1 Load configuration",
  "  - $kind: package",
  "  - $after: 1.1, 1.2",
  "  - The loader and its tests.",
  "  - [ ] 1.1 Read the config file",
  "    - $done: A missing file yields defaults.",
  "    - $done: Invalid JSON names the file, and its line.",
  "  - [x] 1.2 Validate config",
  "    - $after: 1.1",
  "    - $done: An unknown key is reported",
  "    - $built: abc1234",
  "    - Report each unknown key.",
  "",
  ...fence,
].join("\n");
// specHash of { ...prose, "tasks.md": OLD } on main before `$` facts.
const MAIN_HASH =
  "533dd04dfc37f9e0d60ab695450c72139ce10b1e7a5dc1858c1066e33e01662a";

test("a Facts: block folds into $ bullets, and a fenced one stays text", () => {
  assert.equal(foldFactsBlocks(OLD), FOLDED);
  assert.equal(hasFactsBlocks(OLD), true);
  assert.equal(hasFactsBlocks(FOLDED), false, "a fenced Facts: is not a block");
  assert.equal(foldFactsBlocks(FOLDED), FOLDED);
  assert.equal(currentFiles({ "tasks.md": OLD })["tasks.md"], FOLDED);
});

test("an old-layout record hashes as its folded text and as it did before", () => {
  const old = { ...prose, "tasks.md": OLD },
    folded = { ...prose, "tasks.md": FOLDED };
  assert.equal(specHash(old), specHash(folded));
  assert.equal(specHash(folded), MAIN_HASH);
  const parsed = parseSpec({ name: "config", exists: true, files: folded });
  assert.deepEqual(
    parsed.diagnostics.map((d) => d.code),
    [],
  );
  assert.deepEqual(
    parsed.proposals.find((p) => p.specKey === "1.1").acceptance,
    [
      "A missing file yields defaults.",
      "Invalid JSON names the file, and its line.",
    ],
  );
});

test("a folder on disk with a Facts: block is refused at tasks.md:1", () => {
  const write = (name, tasks) => {
    const directory = path.join(root, ".kiro", "specs", name);
    fs.mkdirSync(directory, { recursive: true });
    for (const [file, text] of Object.entries({ ...prose, "tasks.md": tasks }))
      fs.writeFileSync(path.join(directory, file), text);
    return parseSpec(readSpecFolder(root, name));
  };
  const root = temporaryDirectory(),
    old = write("old", OLD),
    current = write("current", FOLDED);
  assert.deepEqual(
    old.diagnostics
      .filter((d) => d.code === "facts.block")
      .map((d) => `${d.file}:${d.lineStart}`),
    ["tasks.md:1"],
  );
  assert.match(
    old.diagnostics.find((d) => d.code === "facts.block").message,
    /\$key: value/,
  );
  assert.equal(
    current.diagnostics.some((d) => d.code === "facts.block"),
    false,
    "a fenced Facts: line is not flagged",
  );
});
