// avoozl/manifest.json from tasks.md alone (spec-manifest.mjs).
import assert from "node:assert/strict";
import test from "node:test";
import { draftManifest } from "../spec-manifest.mjs";

const tasks = (text) =>
  JSON.parse(draftManifest("demo", text, { repositories: ["app", "web"] }))
    .tasks;

test("groups become packages, bullets become acceptance, and markers fill their fields", () => {
  const result = tasks(
    [
      "- [ ] 1. Group",
      "  - [ ] 1.1 Change the API",
      "    - _Repository: app_",
      "    - The endpoint returns 404 for a missing item.",
      "    - *Checks: `npm test`; `npm run lint`*",
      "  - [ ] 1.2 Check the release notes",
      "    - _Repository: web_",
      "    - _Manual_",
      "    - _Checks: `npm test`_",
      "    - _Requires: 1.1_",
      "    - The notes name the new error.",
      "- [ ] 2. Two repositories, none named",
      "```",
      "- [ ] 3. Inside a fence",
      "```",
    ].join("\n"),
  );
  assert.deepEqual(Object.keys(result).sort(), ["1", "1.1", "1.2", "2"]);
  assert.deepEqual(result["1"], {
    kind: "package",
    summary: "Group",
    requires: ["1.1", "1.2"],
  });
  assert.deepEqual(result["1.1"].checks, ["npm test", "npm run lint"]);
  assert.equal(result["1.1"].repository, "app");
  assert.deepEqual(result["1.1"].acceptance, [
    "The endpoint returns 404 for a missing item.",
  ]);
  // Requirement 61.9: a manual leaf completes by a person and has no checks.
  assert.equal(result["1.2"].manual, true);
  assert.equal(result["1.2"].completion, "person");
  assert.equal(result["1.2"].checks, undefined);
  assert.deepEqual(result["1.2"].requires, ["1.1"]);
  // With two repositories and none named, lint asks; the title is the
  // fallback acceptance.
  assert.equal(result["2"].repository, undefined);
  assert.deepEqual(result["2"].acceptance, ["Two repositories, none named"]);
  assert.equal(result["3"], undefined);
});
