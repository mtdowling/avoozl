import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SCOPE_RULE, SCOPE_STATEMENT, TAGLINE } from "../../work-split.ts";

// rc-13.1: keep the README aligned with the shared scope text.
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
const flat = (path: string) => read(path).replace(/\s+/g, " ");

test("the scope describes epic delivery and repeatable workflows", () => {
  assert.match(SCOPE_STATEMENT, /lands epics from specs/);
  assert.match(SCOPE_STATEMENT, /parallel across repositories and machines/);
  assert.match(SCOPE_STATEMENT, /checks the exact commits/);
  assert.match(SCOPE_RULE, /define the workflow once/);
  assert.match(SCOPE_RULE, /acceptance criteria, and approval gates/);
});

test("one pitch: the package, the app, AGENTS.md and help say the tagline", () => {
  assert.equal(JSON.parse(read("../../../package.json")).description, TAGLINE);
  assert.equal(
    JSON.parse(read("../../../hosts/kirocrew/app.json")).description,
    TAGLINE,
  );
  assert.ok(flat("../../../AGENTS.md").includes(TAGLINE));
  assert.match(read("../cli/cli-help.ts"), /from "\.\.\/\.\.\/work-split\.ts"/);
});

test("the README shows the same words", () => {
  const readme = read("../../../README.md").replace(/\s+/g, " ");
  assert.ok(readme.includes(SCOPE_STATEMENT));
  assert.ok(readme.includes(SCOPE_RULE));
});
