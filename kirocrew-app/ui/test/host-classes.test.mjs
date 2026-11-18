// The page has no stylesheet of its own: a class works only when the Kiro
// Crew host's CSS already defines it. The Plans view once laid out its list
// and detail with `md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]`, which the host
// does not define, so the detail stacked under a long list, out of sight,
// and a click on a plan looked like it did nothing.
//
// The host's stylesheet is the one named in kirocrew-css.json: a release, its
// published package and the SHA-256 of the built file (see kirocrew-css.mjs).
// The check always runs; it is never skipped.
//
// host-classes-known.json lists the classes the stylesheet lacks today, with
// their files. The list only shrinks: a new missing class fails, and so does a
// listed class that is no longer missing. A class that only src/ui/ uses is
// defined there as a rule of its part, not listed here.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { checkDigest, kirocrewStylesheet } from "./kirocrew-css.mjs";

const src = new URL("../src/", import.meta.url);
const files = readdirSync(src, { recursive: true }).filter((name) =>
  name.endsWith(".tsx"),
);
const source = (name) => readFileSync(new URL(name, src), "utf8");

// Static class tokens from className="..." and className={`...`}, without
// the ${...} parts.
export function classTokens(text) {
  const tokens = new Set();
  for (const match of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const value = (match[1] ?? match[2]).replace(/\$\{[^}]*\}/g, " ");
    for (const token of value.split(/\s+/)) if (token) tokens.add(token);
  }
  return tokens;
}

const escape = (token) => token.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);

// Each class the sources use that the stylesheet lacks, with the files that use it.
export function missingClasses(css, sources) {
  const users = new Map();
  for (const [name, text] of Object.entries(sources))
    for (const token of classTokens(text))
      if (!css.includes(`.${escape(token)}`))
        users.set(token, [...(users.get(token) ?? []), name]);
  return [...users]
    .map(([token, names]) => `${token}: ${names.join(", ")}`)
    .sort();
}

test("every class the page uses is defined by the host CSS", async () => {
  const css = await kirocrewStylesheet();
  const sources = Object.fromEntries(
    files.map((name) => [name.split(path.sep).join("/"), source(name)]),
  );
  const known = Object.entries(
    JSON.parse(
      readFileSync(
        new URL("./host-classes-known.json", import.meta.url),
        "utf8",
      ),
    ),
  )
    .map(([token, names]) => `${token}: ${names.join(", ")}`)
    .sort();
  assert.deepEqual(missingClasses(css, sources), known);
});

test("a class the stylesheet lacks is named with the files that use it", () => {
  const css = ".flex{display:flex}.md\\:flex{display:flex}";
  const found = missingClasses(css, {
    "A.tsx": '<div className="flex nope" />',
    "ui/B.tsx": "<div className={`md:flex nope ${x}`} />",
  });
  assert.deepEqual(found, ["nope: A.tsx, ui/B.tsx"]);
});

test("a stylesheet with another digest is refused", () => {
  assert.throws(() => checkDigest(Buffer.from(".flex{}")), /refused/);
});

test("Plans lays out with inline styles, not an arbitrary grid class", () => {
  const plans = source("PlansView.tsx");
  assert.doesNotMatch(plans, /grid-cols-\[/);
});
