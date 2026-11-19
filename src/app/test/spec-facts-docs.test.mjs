// docs/specs.md lists every task fact and front-matter key the parser
// accepts, and nothing else, so its tables cannot drift from the code.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { FACT_KEYS, FRONT_KEYS } from "../specs/spec-facts.mjs";
import { PROSE_KEYS } from "../../front-matter.mjs";

const text = fs.readFileSync(
  new URL("../../../docs/specs.md", import.meta.url),
  "utf8",
);

// The first-column keys of each table under `heading`, sorted, up to the
// next heading.
function tables(heading) {
  const start = text.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `docs/specs.md has no "${heading}" section`);
  const rest = text.slice(start + heading.length + 2),
    end = rest.search(/^#{1,6} /m);
  return (end < 0 ? rest : rest.slice(0, end))
    .split(/\n\s*\n/)
    .filter((block) => block.startsWith("| "))
    .map((block) =>
      [...block.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]).sort(),
    );
}

test("docs/specs.md has one row for each task fact the parser accepts", () => {
  const [facts] = tables("### Task facts");
  assert.deepEqual(
    facts,
    [...FACT_KEYS, "built"].map((key) => `$${key}`).sort(),
  );
});

test("docs/specs.md has one row for each front-matter key", () => {
  const [tasks, prose] = tables("### Front matter");
  assert.deepEqual(tasks, [...FRONT_KEYS, "phase-<id>", "batch-<id>"].sort());
  assert.deepEqual(prose, [...PROSE_KEYS].sort());
});
