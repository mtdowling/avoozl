// specs.path, the one required file, and other Markdown files as spec text.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  lintSpec,
  listSpecFolders,
  readSpecFolder,
  revisionFiles,
  specCategory,
} from "../spec-plans.mjs";
import { specsPath, specsPathProblem } from "../specs-path.mjs";
import { loadLayeredConfig } from "../../settings/layered-config.mjs";
import { Operations } from "../../api/operations.mjs";
import { leafBrief } from "../../delivery/delivery.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { writeSpec } from "../../test/spec-fixture.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const setPath = (root, value) =>
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, specs: { path: value } }),
  );
const codes = (spec) =>
  lintSpec({ spec, plan: { id: spec.name } }).diagnostics.map(
    (d) => `${d.code} ${d.file}`,
  );

test("specs.path moves where spec folders are read", () => {
  const root = temporaryDirectory();
  setPath(root, "docs/specs");
  // A folder at the default path is not read once the setting names another.
  writeSpec(root, "old");
  const moved = writeSpec(root, "config");
  fs.mkdirSync(path.join(root, "docs/specs"), { recursive: true });
  fs.renameSync(moved, path.join(root, "docs/specs/config"));
  assert.equal(specsPath(root), "docs/specs");
  assert.deepEqual(listSpecFolders(root), ["config"]);
  const spec = readSpecFolder(root, "config");
  assert.equal(spec.exists, true);
  assert.equal(spec.folder, "docs/specs/config/");
  assert.deepEqual(codes(spec), []);
  assert.equal(readSpecFolder(root, "old").exists, false);
  // Unset is the default.
  assert.equal(specsPath(temporaryDirectory()), ".kiro/specs");
});

test("specs.path must stay inside the repository", () => {
  for (const bad of ["/abs", "../up", "a/../b", "./x", "a/.", "", "a//b", 3])
    assert.ok(specsPathProblem(bad), `${bad} is refused`);
  for (const good of [".kiro/specs", "specs", "docs/specs/", "a/.b"])
    assert.equal(specsPathProblem(good), null, `${good} is allowed`);
  const root = temporaryDirectory();
  setPath(root, "../elsewhere");
  assert.throws(() => specsPath(root), /\.\./);
  assert.throws(
    () => loadLayeredConfig({ workspaceRoot: root }),
    /specs\.path may not name/,
  );
  // A symlink out of the checkout is refused, even below a folder that does
  // not exist yet.
  const outside = temporaryDirectory();
  fs.symlinkSync(outside, path.join(root, "link"));
  for (const value of ["link", "link/specs"]) {
    setPath(root, value);
    assert.throws(() => specsPath(root), /leads outside the repository/);
  }
  setPath(root, "not-yet/specs");
  assert.equal(specsPath(root), "not-yet/specs");
});

test("a spec with only tasks.md lints clean", () => {
  const root = temporaryDirectory();
  writeSpec(root, "lean", { "requirements.md": null, "design.md": null });
  const spec = readSpecFolder(root, "lean");
  assert.deepEqual(Object.keys(spec.files), ["tasks.md"]);
  const result = lintSpec({ spec, plan: { id: "lean" } });
  assert.equal(result.canApprove, true);
  assert.equal(result.type, "feature");
  assert.ok(result.taskCount > 0);
});

test("every other Markdown file in the folder is spec text", () => {
  const root = temporaryDirectory(),
    directory = writeSpec(root, "config"),
    before = readSpecFolder(root, "config");
  fs.writeFileSync(path.join(directory, "notes.md"), "# Notes\n\nKeep it.\n");
  const added = readSpecFolder(root, "config");
  assert.equal(added.files["notes.md"], "# Notes\n\nKeep it.\n");
  assert.notEqual(added.hash, before.hash);
  assert.deepEqual(revisionFiles(added.files), [
    "requirements.md",
    "design.md",
    "tasks.md",
    "notes.md",
  ]);
  fs.writeFileSync(path.join(directory, "notes.md"), "# Notes\n\nChanged.\n");
  assert.notEqual(readSpecFolder(root, "config").hash, added.hash);
  // Not spec text: other files, nested files, and symlinks.
  fs.writeFileSync(path.join(directory, "notes.md"), "# Notes\n\nKeep it.\n");
  fs.writeFileSync(path.join(directory, "data.json"), "{}\n");
  fs.writeFileSync(path.join(directory, "avoozl", "extra.md"), "x\n");
  const elsewhere = path.join(temporaryDirectory(), "secret.md");
  fs.writeFileSync(elsewhere, "secret\n");
  fs.symlinkSync(elsewhere, path.join(directory, "linked.md"));
  const read = readSpecFolder(root, "config");
  assert.equal(read.hash, added.hash);
  assert.equal(read.files["linked.md"], undefined);
});

test("Kiro's three-file layout reads and hashes as before", () => {
  const root = temporaryDirectory();
  writeSpec(root, "config");
  writeSpec(root, "fix", {
    "requirements.md": null,
    "bugfix.md":
      "---\ncategory: Runtime\n---\n# Fix the crash\n\n### Unchanged Behavior (Regression Prevention)\n\n3.1 WHEN a file is valid THEN the system SHALL CONTINUE TO load it\n",
  });
  // The hashes the reader gave before only tasks.md was required.
  assert.equal(
    readSpecFolder(root, "config").hash,
    "c0c8aed5725ea1e555fb0270dd6b90be9a189fcd6592a62b965376559a11dd0c",
  );
  const fix = readSpecFolder(root, "fix"),
    result = lintSpec({ spec: fix, plan: { id: "fix" } });
  assert.equal(
    fix.hash,
    "79819b668091cb2c5e965caa3705400a038b8f5bb00f18fb4f5db6918cadad8e",
  );
  assert.equal(result.type, "bugfix");
  assert.equal(specCategory(fix.files), "Runtime");
  assert.ok(
    result.proposals
      .find((p) => p.id === "fix.1.1")
      .acceptance.includes(
        "WHEN a file is valid THEN the system SHALL CONTINUE TO load it",
      ),
  );
});

test("a worker's brief names every spec file as context", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root }),
    directory = writeSpec(root, "config");
  fs.writeFileSync(path.join(directory, "notes.md"), "# Notes\n");
  await ops.execute("plan.create", { spec: "config" });
  const preview = await ops.execute("plan.preview", { id: "config" });
  await ops.execute("plan.approve", {
    id: "config",
    expectedHash: preview.reviewedHash,
    expectedRevision: preview.expectedRevision,
  });
  const data = store.read(),
    task = data.tasks.find((entry) => entry.id === "config.1.1"),
    brief = leafBrief(store, data, {
      task,
      repository: { id: "app", root },
      attempt: 1,
      delivery: null,
    });
  assert.match(
    brief,
    /Spec text: read requirements\.md, design\.md, tasks\.md, notes\.md in \.kiro\/specs\/config\/ for context\./,
  );
});
