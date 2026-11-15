import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { Operations } from "../operations.mjs";
import { mergeHomes, newSpecHome, readPrivateSpecs } from "../spec-homes.mjs";
import { readSpecFolder } from "../spec-plans.mjs";
import { RepositorySettings } from "../repository-settings.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { fixture } from "./fixtures.mjs";
import { specFiles, writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

// rc-24.2: spec homes (RC25.2, RC25.8, design D30.2).
const mirror = {
  source: "acme/app",
  mirror: "acme/app-private",
  plansBranch: "avoozl-plans",
};
const tasksOf = (id) =>
  `# Tasks\n\n- [ ] ${id} A task\n  - [ ] ${id}.1 A leaf\n`;
function putPrivate(github, name, overrides = {}) {
  for (const [file, text] of Object.entries({ ...specFiles(), ...overrides }))
    github.files.set(`avoozl-plans:.kiro/specs/${name}/${file}`, text);
}

test("the plans branch is read into the same shape as a folder", async () => {
  const github = new FakeGitHub();
  putPrivate(github, "secret-fix");
  const [spec] = await readPrivateSpecs(github, mirror),
    disk = { ...specFiles() };
  assert.equal(spec.name, "secret-fix");
  assert.equal(spec.exists, true);
  assert.equal(spec.files["tasks.md"], disk["tasks.md"]);
  assert.ok(spec.hash);
  assert.deepEqual(await readPrivateSpecs(new FakeGitHub(), mirror), []);
});

test("both homes read into one list; a shared name is refused naming both", () => {
  const root = temporaryDirectory();
  writeSpec(root, "pay-fix");
  writeSpec(root, "docs");
  const pub = ["pay-fix", "docs"].map((name) => readSpecFolder(root, name)),
    priv = [
      { ...readSpecFolder(root, "docs"), name: "docs" },
      { ...readSpecFolder(root, "docs"), name: "secret" },
    ];
  const merged = mergeHomes(pub, [priv[1]]);
  assert.deepEqual(
    merged.specs.map((entry) => [entry.home, entry.spec.name]),
    [
      ["main", "pay-fix"],
      ["main", "docs"],
      ["plansBranch", "secret"],
    ],
  );
  assert.deepEqual(merged.errors, []);
  const dup = mergeHomes(pub, [priv[0]]);
  assert.equal(dup.errors.length, 1);
  assert.match(dup.errors[0], /docs.*both homes.*main.*plansBranch/);
  assert.deepEqual(
    dup.specs.map((entry) => entry.spec.name),
    ["pay-fix"],
  );
});

test("a task ID in both homes is refused naming both", () => {
  const root = temporaryDirectory();
  writeSpec(root, "pub", { "tasks.md": tasksOf("ab-1") });
  writeSpec(root, "priv", { "tasks.md": tasksOf("ab-1") });
  writeSpec(root, "other", { "tasks.md": tasksOf("cd-2") });
  const read = (name) => readSpecFolder(root, name);
  const clash = mergeHomes([read("pub")], [read("priv")]);
  assert.match(clash.errors[0], /Task ab-1 .*pub on main.*priv on plansBranch/);
  assert.equal(clash.specs.length, 0);
  assert.equal(mergeHomes([read("pub")], [read("other")]).errors.length, 0);
});

test("a new spec starts private when a mirror is set", () => {
  const policy = (extra) =>
    normalizeGitHubPolicy({
      mode: "single-repo",
      repositories: { "acme/app-private": { baseBranch: "main", ...extra } },
    });
  assert.equal(newSpecHome(policy({ mirror })), "plansBranch");
  assert.equal(newSpecHome(policy({})), "main");
});

test("the Specs list carries each home after a tick reads the plans branch", async (t) => {
  const { root, store } = fixture(t),
    github = new FakeGitHub();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      github: {
        mode: "plans-repo",
        planningRepository: "acme/plans",
        repositories: { "acme/app-private": { baseBranch: "main", mirror } },
      },
    }),
  );
  store.setMeta("workspaceRepository", { root });
  writeSpec(root, "public-one");
  putPrivate(github, "private-one");
  const ops = new Operations(store, {
    github,
    workspaceRoot: root,
    configuration: new RepositorySettings(store, { workspaceRoot: root }),
  });
  await ops.refreshPrivateSpecs();
  const homes = ops.specList().items.map((item) => [item.name, item.home]);
  assert.deepEqual(homes.sort(), [
    ["private-one", "plansBranch"],
    ["public-one", "main"],
  ]);
  const rows = (await ops.execute("plan.table")).items;
  assert.deepEqual(
    rows
      .filter((row) => row.spec)
      .map((row) => [row.spec, row.home])
      .sort(),
    [
      ["private-one", "plansBranch"],
      ["public-one", "main"],
    ],
  );
  // A failed read keeps the last list.
  github.contents = () => Promise.reject(new Error("offline"));
  await ops.refreshPrivateSpecs();
  assert.equal(ops.specList().items.length, 2);
});

test("a workspace with no mirror shows no home", async (t) => {
  const { root, store } = fixture(t);
  writeSpec(root, "plain");
  const ops = new Operations(store, { workspaceRoot: root });
  assert.equal("home" in ops.specList().items[0], false);
});
