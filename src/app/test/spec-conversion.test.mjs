// The one-time conversion of this repository's specs from
// avoozl/manifest.json to Facts bullets (Requirement 111.10). Before the
// conversion, the old reader parsed each spec; the fixture keeps a digest of
// its proposals (line numbers left out, since Facts bullets add lines) and
// the revision hash. A spec still as it was converted must parse to the same
// proposals now. A spec edited since then is past this check, and is skipped.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  REVISION_FILES,
  lintSpec,
  listSpecFolders,
  readSpecFolder,
} from "../spec-plans.mjs";

const root = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const before = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/spec-conversion.json", import.meta.url),
    "utf8",
  ),
);
const sha = (text) => createHash("sha256").update(text).digest("hex");

test("no spec folder in this repository keeps a manifest", () => {
  for (const name of listSpecFolders(root))
    assert.equal(
      fs.existsSync(
        path.join(root, ".kiro", "specs", name, "avoozl", "manifest.json"),
      ),
      false,
      name,
    );
});

for (const [name, old] of Object.entries(before))
  test(`.kiro/specs/${name} parses as it did before the conversion`, (t) => {
    const spec = readSpecFolder(root, name);
    if (!spec.exists) return t.skip("removed since the conversion");
    const files = sha(
      JSON.stringify(REVISION_FILES.map((file) => spec.files[file] ?? null)),
    );
    if (files !== old.files) return t.skip("edited since the conversion");
    const lint = lintSpec({ spec, plan: { id: name } });
    assert.equal(lint.counts.error, 0);
    const proposals = lint.proposals.map(
      ({ lineStart: _start, lineEnd: _end, ...rest }) => rest,
    );
    assert.equal(proposals.length, old.count);
    assert.equal(sha(JSON.stringify(proposals)), old.proposals);
  });
