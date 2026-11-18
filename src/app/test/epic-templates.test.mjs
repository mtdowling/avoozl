// rc-17.1: the epic templates (rewrite, cross-repository migration, large
// generated change) lint with 0 errors, carry the scope statement of RC13 in
// the README's words, and use generic wording.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { applicationRoot } from "../config.mjs";
import { integrationOf } from "../integration-branch.mjs";
import { lintSpec, readSpecFolder, specFacts } from "../spec-plans.mjs";
import { RULES, scanText } from "../../../scripts/release-scan.mjs";
import { temporaryDirectory } from "./temporary.mjs";
// The statement in use, from its one source; the templates repeat it.
import { SCOPE_STATEMENT as SCOPE } from "../../work-split.mjs";

const TEMPLATES = path.join(applicationRoot, "examples", "epic-templates");
const names = fs.readdirSync(TEMPLATES).sort();

function load(name) {
  const root = temporaryDirectory("avoozl-template-");
  fs.cpSync(
    path.join(TEMPLATES, name),
    path.join(root, ".kiro", "specs", name),
    { recursive: true },
  );
  return readSpecFolder(root, name);
}

test("there are three templates, one per epic type", () => {
  assert.deepEqual(names, ["codegen-change", "migration", "rewrite"]);
});

test("each template lints with 0 errors and carries the scope statement", () => {
  for (const name of names) {
    const spec = load(name),
      result = lintSpec({ spec, plan: { id: name } });
    assert.deepEqual(
      result.diagnostics
        .filter((d) => d.severity === "error")
        .map((d) => d.message),
      [],
      name,
    );
    assert.ok(
      spec.files["requirements.md"].includes(SCOPE),
      `${name} scope statement`,
    );
  }
});

test("the rewrite template names a usable integration branch", () => {
  const manifest = specFacts(load("rewrite").files);
  assert.equal(integrationOf(manifest).branch, "rewrite/my-epic");
});

test("migration: every repository task needs stage one and removal needs every repository", () => {
  const tasks = specFacts(load("migration").files).tasks,
    repos = Object.keys(tasks).filter((id) => id.startsWith("migrate-repo-"));
  assert.ok(repos.length >= 2);
  for (const id of repos)
    assert.ok(tasks[id].requires.includes("migration-tool"), id);
  assert.deepEqual(
    [...tasks["remove-old-path"].requires].sort(),
    [...repos].sort(),
  );
});

test("codegen: each regeneration task names its command and its compare check", () => {
  const tasks = specFacts(load("codegen-change").files).tasks;
  for (const [id, entry] of Object.entries(tasks))
    if (id.startsWith("regenerate-"))
      assert.match(entry.summary, /<generate command>.*<compare command>/, id);
});

test("the wording is generic: the release scan finds nothing in any template file", () => {
  for (const name of names)
    for (const file of ["requirements.md", "design.md", "tasks.md"])
      assert.deepEqual(
        scanText(
          fs.readFileSync(path.join(TEMPLATES, name, file), "utf8"),
          RULES,
        ),
        [],
        `${name}/${file}`,
      );
});
