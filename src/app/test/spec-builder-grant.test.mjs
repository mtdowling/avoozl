// The app's Spec Builder grant (permissions.api) is a path prefix, so it
// also reaches Spec Builder's approve, handoff, execute, task, stop and
// delete routes. Avoozl only creates specs: this fails if any source file
// names another Spec Builder route or builds one from the create path.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const CREATE = "/api/apps/spec-builder/specs";
const SKIP = new Set(["node_modules", "dist", "test", "lib", ".git", "docs"]);

function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : sources(full);
    return /\.(?:m?js|tsx?|py|json|sh)$/.test(entry.name) &&
      !/\.test\./.test(entry.name)
      ? [full]
      : [];
  });
}

test("the manifest grants Spec Builder's specs path and nothing wider", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "kirocrew-app", "app.json"), "utf8"),
  );
  const grants = manifest.permissions.api.filter((entry) =>
    entry.includes("spec-builder"),
  );
  assert.deepEqual(grants, [CREATE]);
});

test("no source file calls a Spec Builder route other than create", () => {
  const files = [
    path.join(root, "cli.mjs"),
    ...sources(path.join(root, "src")),
    ...sources(path.join(root, "kirocrew-app")),
  ];
  const found = [];
  for (const file of files) {
    if (file.endsWith(path.join("kirocrew-app", "app.json"))) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/\/api\/apps\/spec-builder[^\s'"`),]*/g))
      if (match[0] !== CREATE)
        found.push(`${path.relative(root, file)}: ${match[0]}`);
    // The create path is never extended into a child route or sent with
    // any method but POST.
    for (const match of text.matchAll(
      /\$\{SPEC_BUILDER_SPECS\}|SPEC_BUILDER_SPECS\s*\+|\b(?:del|get|put|patch|request|raw)\(\s*SPEC_BUILDER_SPECS/g,
    ))
      found.push(`${path.relative(root, file)}: ${match[0]}`);
  }
  assert.deepEqual(found, []);
  // The one caller exists, so this test is not passing on an empty tree.
  assert.ok(
    fs
      .readFileSync(
        path.join(root, "kirocrew-app", "ui", "src", "spec-builder-api.ts"),
        "utf8",
      )
      .includes(`api.post<SpecBuilderCreated>(SPEC_BUILDER_SPECS, body)`),
  );
});
