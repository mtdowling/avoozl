// Every screenshot a doc links is one `npm run docs:screenshots` makes: a
// link to the docs-screenshots release names a file the script writes.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  RELEASE_URL,
  screenshotNames,
} from "../../../scripts/docs/screenshots.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

// The README and every page under docs/, outside the records folders.
function docs(dir = path.join(root, "docs")): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
      return ["research", "evidence"].includes(entry.name) ? [] : docs(full);
    return entry.name.endsWith(".md") ? [full] : [];
  });
}

test("every screenshot a doc links is one the script makes", () => {
  const made = new Set(screenshotNames()),
    pattern = new RegExp(
      `${RELEASE_URL.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^)"'\\s]+)`,
      "g",
    ),
    missing: string[] = [];
  let linked = 0;
  for (const file of [path.join(root, "README.md"), ...docs()]) {
    const text = fs.readFileSync(file, "utf8");
    for (const [, name] of text.matchAll(pattern)) {
      linked++;
      if (!made.has(name ?? ""))
        missing.push(`${path.relative(root, file)}: ${name}`);
    }
  }
  assert.deepEqual(missing, []);
  assert.ok(linked > 0, "the docs link at least one screenshot");
});

test("screenshot names are unique and name a size and theme", () => {
  const names = screenshotNames();
  assert.equal(new Set(names).size, names.length);
  for (const name of names)
    assert.match(name, /^[a-z-]+-(desktop|phone)-(light|dark)\.png$/);
});
