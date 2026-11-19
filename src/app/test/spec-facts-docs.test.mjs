// docs/specs.md lists every task fact and front-matter key the parser
// accepts, and nothing else, so its tables cannot drift from the code.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  FACT_KEYS,
  FRONT_KEYS,
  REMOVED_FACTS,
  REMOVED_FRONT,
} from "../specs/spec-facts.mjs";
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
  assert.deepEqual(facts, FACT_KEYS.map((key) => `$${key}`).sort());
});

test("docs/specs.md names every fact and front-matter key that is gone", () => {
  for (const key of Object.keys(REMOVED_FACTS))
    assert.ok(text.includes(`\`$${key}\``), `$${key} is not named as gone`);
  for (const key of Object.keys(REMOVED_FRONT))
    assert.ok(text.includes(`\`${key}\``), `${key} is not named as gone`);
});

test("docs/specs.md has one row for each front-matter key", () => {
  const [tasks, prose] = tables("### Front matter");
  assert.deepEqual(tasks, [...FRONT_KEYS].sort());
  assert.deepEqual(prose, [...PROSE_KEYS].sort());
});
