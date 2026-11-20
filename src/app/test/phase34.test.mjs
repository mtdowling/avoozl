// Phase 34 parts the P45 proof does not reach (tasks 34.4–34.6): the
// manifest's ship fields. Every value is fake.
import assert from "node:assert/strict";
import test from "node:test";
import { validateProposal } from "../specs/plans.mjs";

const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "app",
  ...extra,
});

test("a bugfix spec's type reaches each leaf", async () => {
  const { parseSpec } = await import("../specs/spec-plans.mjs");
  const { legacySpecFiles, withFacts } = await import("./spec-fixture.mjs");
  const files = legacySpecFiles(),
    manifest = JSON.parse(files["avoozl/manifest.json"]);
  const bugfix = withFacts({
    ...files,
    "avoozl/manifest.json": JSON.stringify(manifest),
    "bugfix.md": "# Bug\n\nThe loader drops empty lines.\n",
  });
  delete bugfix["requirements.md"];
  const parsed = parseSpec({ name: "fix-loader", exists: true, files: bugfix });
  const leaves = parsed.proposals.filter((p) => p.kind === "leaf");
  assert.equal(leaves.length, 2, JSON.stringify(parsed.diagnostics));
  for (const p of leaves) assert.equal(p.specType, "bugfix");
});
