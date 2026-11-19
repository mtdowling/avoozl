// The docs are read as Markdown on github.com: every page is in the index,
// every relative link resolves, and no site-only syntax is left.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const docs = path.join(root, "docs");
const pages = fs.readdirSync(docs).filter((name) => name.endsWith(".md"));
const read = (file) =>
  fs.readFileSync(file, "utf8").replace(/^```[\s\S]*?^```/gm, "");

test("the docs index lists every page", () => {
  const index = read(path.join(docs, "README.md"));
  for (const name of pages.filter((n) => n !== "README.md"))
    assert.match(
      index,
      new RegExp(`\\]\\(${name.replace(".", "\\.")}\\)`),
      name,
    );
});

test("relative links in the docs and README resolve on github.com", () => {
  const files = [
    path.join(root, "README.md"),
    ...pages.map((n) => path.join(docs, n)),
  ];
  for (const file of files) {
    const text = read(file);
    assert.doesNotMatch(text, /^:::/m, `${file}: VitePress container`);
    assert.doesNotMatch(text, /^---\n/, `${file}: front matter`);
    assert.doesNotMatch(text, /mtdowling\.com\/avoozl/, file);
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const link = target.split("#")[0];
      assert.ok(!link.startsWith("/"), `${file}: ${target}`);
      assert.ok(
        fs.existsSync(path.resolve(path.dirname(file), link)),
        `${file}: ${target}`,
      );
    }
  }
});
