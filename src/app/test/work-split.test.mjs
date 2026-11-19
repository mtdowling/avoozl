import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SCOPE_RULE, SCOPE_STATEMENT, TAGLINE } from "../../work-split.mjs";

// rc-13.1: one source string; the README and Set up show the same words.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const flat = (path) => read(path).replace(/\s+/g, " ");

test("the statement takes specs of any size, a light one as one pull request", () => {
  assert.match(SCOPE_STATEMENT, /any size/);
  assert.match(SCOPE_STATEMENT, /one task becomes one pull request/);
  assert.match(SCOPE_STATEMENT, /ordered tasks across repositories/);
  assert.match(SCOPE_RULE, /starts from a spec you approved/);
  assert.doesNotMatch(SCOPE_STATEMENT + SCOPE_RULE, /not an Avoozl job/);
});

test("one pitch: the package, the app, AGENTS.md, the demo and help say the tagline", () => {
  assert.equal(JSON.parse(read("../../../package.json")).description, TAGLINE);
  assert.equal(
    JSON.parse(read("../../../kirocrew-app/app.json")).description,
    TAGLINE,
  );
  assert.ok(flat("../../../AGENTS.md").includes(TAGLINE));
  assert.match(read("../../../kirocrew-app/ui/src/Demo.tsx"), /TAGLINE \+/);
  assert.match(
    read("../cli/cli-help.mjs"),
    /from "\.\.\/\.\.\/work-split\.mjs"/,
  );
});

test("the README shows the same words", () => {
  const readme = read("../../../README.md").replace(/\s+/g, " ");
  assert.ok(readme.includes(SCOPE_STATEMENT));
  assert.ok(readme.includes(SCOPE_RULE));
});

test("Set up imports the string and does not repeat it", () => {
  const source = read("../../../kirocrew-app/ui/src/SetupWizard.tsx");
  assert.match(source, /SCOPE_STATEMENT/);
  assert.match(source, /SCOPE_RULE/);
  assert.ok(!source.includes("any size"));
});
