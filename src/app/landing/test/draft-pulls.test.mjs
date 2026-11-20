// Every pull request Avoozl opens says whether it is a draft (R119.1):
// each `createPullRequest(` call in the application source sends `draft`,
// `true` or from landing.pr, never GitHub's default.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = new URL("../../..", import.meta.url).pathname;
// shortcut: the mirror and the old approval pull requests are being
// removed (spec/drop-mirror, spec/approval-cutdown); drop these entries
// when they land.
const REMOVED = ["app/mirror/", "app/specs/spec-approval.mjs"];

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === "test" || entry.name === "node_modules"
        ? []
        : sources(path);
    return entry.name.endsWith(".mjs") ? [path] : [];
  });
}

// The text of the call's arguments: from the open paren to its match.
function argumentsAt(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")" && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

test("every createPullRequest call site says whether it opens a draft", () => {
  const calls = [];
  for (const file of sources(SRC)) {
    const name = relative(SRC, file);
    if (REMOVED.some((prefix) => name.startsWith(prefix))) continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/\.createPullRequest\(/g))
      calls.push({
        name,
        args: argumentsAt(text, match.index + match[0].length - 1),
      });
  }
  assert.ok(calls.length >= 2, "the landing and planning pull requests");
  for (const { name, args } of calls)
    assert.match(
      args,
      /\bdraft: (true|pr === "draft")/,
      `${name} leaves draft to GitHub's default`,
    );
  // Nothing turns a released pull request back into a draft (R119.4).
  for (const file of sources(SRC))
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /convertPullRequestToDraft/,
      relative(SRC, file),
    );
});
