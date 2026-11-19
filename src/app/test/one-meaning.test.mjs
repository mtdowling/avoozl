// One meaning for each word (worker-paths WP8): the page, the CLI help,
// README.md and docs/*.md never name a removed way to run work. Dated
// records under docs/research/ and docs/evidence/ are not
// checked; they record what was true then.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { helpText } from "../cli/cli-help.mjs";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const RETIRED = [
  /crew mode/i,
  /runner mode/i,
  /remote crews?\b/i,
  /conductor/i,
];

// Source text with its comments taken out, so only what the page can show
// is read. shortcut: a `//` inside a string literal ends the line early;
// this reads less, never more.
const withoutComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function pageSources(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir, { recursive: true })) {
    if (!/\.(ts|tsx)$/.test(name)) continue;
    const file = path.join(dir, name);
    out.push([
      path.relative(ROOT, file),
      withoutComments(fs.readFileSync(file, "utf8")),
    ]);
  }
  return out;
}

const docs = () =>
  [
    "README.md",
    ...fs
      .readdirSync(path.join(ROOT, "docs"))
      .filter((name) => name.endsWith(".md"))
      .map((name) => path.join("docs", name)),
  ].map((name) => [name, fs.readFileSync(path.join(ROOT, name), "utf8")]);

// Every place and word a retired name appears in.
function retired(texts) {
  const found = [];
  for (const [name, text] of texts)
    for (const pattern of RETIRED) {
      const match = pattern.exec(text);
      if (match) found.push(`${name}: ${match[0]}`);
    }
  return found;
}

const surfaces = () => [
  ...pageSources(path.join(ROOT, "kirocrew-app", "ui", "src")),
  ["avoozl help all", helpText("all")],
  ...docs(),
];

test("the page, the help and the docs name no retired way to run work", () => {
  assert.deepEqual(retired(surfaces()), []);
});

test("the word test fails on a planted Crew Mode", () => {
  assert.deepEqual(
    retired([...surfaces(), ["planted.md", "Turn on Crew Mode first."]]),
    ["planted.md: Crew Mode"],
  );
});
