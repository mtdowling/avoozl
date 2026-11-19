// MB1.5: the words "train" and "integrator" do not appear on the page, in
// the CLI help, in README.md or in docs/*.md. Dated records under
// docs/research and docs/evidence are not checked.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { HELP_GROUPS, helpText } from "../../cli/cli-help.mjs";

const repo = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const WORDS = /\b(trains?|integrators?)\b/i;

// Lines of `text` that hold a retired word, with their numbers.
export const retiredWords = (text) =>
  text
    .split("\n")
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => WORDS.test(line));

const files = (dir, pattern) =>
  fs
    .readdirSync(path.join(repo, dir), { recursive: true })
    .filter((name) => pattern.test(name) && !name.includes("node_modules"))
    .map((name) => path.join(dir, name));

test("the page, the help, the README and the docs do not say train or integrator", () => {
  const checked = [
    ...files("kirocrew-app/ui/src", /\.(ts|tsx)$/),
    ...files("docs", /^[^/\\]+\.md$/),
    "README.md",
    "kirocrew-app/README.md",
  ];
  assert.ok(checked.length > 20);
  for (const file of checked)
    assert.deepEqual(
      retiredWords(fs.readFileSync(path.join(repo, file), "utf8")),
      [],
      file,
    );
  assert.ok(HELP_GROUPS.length > 3);
  assert.deepEqual(retiredWords(helpText("all")), [], "avoozl help all");
});

test("the check finds a planted word", () => {
  assert.equal(retiredWords("fine\nLanded in a Train.\nok").length, 1);
  assert.equal(retiredWords("an integrator runs").length, 1);
  assert.equal(retiredWords("a constraint, retrained").length, 0);
});
