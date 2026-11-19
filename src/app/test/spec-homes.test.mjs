import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { Operations } from "../operations.mjs";
import {
  mergeHomes,
  newSpecHome,
  privateDependencies,
  readPrivateSpecs,
} from "../spec-homes.mjs";
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

test("a private remote folder can be stored and approved in its mirror home", async (t) => {
  const { root, store } = fixture(t),
    github = new FakeGitHub();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      github: {
        mode: "single-repo",
        repositories: {
          "acme/app": { baseBranch: "main", mirror },
        },
      },
    }),
  );
  store.put("repositories", { id: "code", root, github: "acme/app" });
  putPrivate(github, "private-one");
  const ops = new Operations(store, {
    github,
    workspaceRoot: root,
    configuration: new RepositorySettings(store, { workspaceRoot: root }),
  });
  const plan = await ops.execute("plan.create", {
    id: "private-one",
    spec: "private-one",
  });
  assert.equal(github.created.length, 0);
  assert.equal(plan.home, "plansBranch");
  assert.equal(plan.ref, "avoozl-plans");
  assert.equal(ops.readSpec("private-one").repository, "acme/app-private");
  const target = ops.approvalPullRequestTarget(plan);
  assert.deepEqual(target.repository, {
    owner: "acme",
    repo: "app-private",
    id: "acme/app-private",
  });
  assert.equal(target.ref, "avoozl-plans");
});

test("an orphan plans checkout is one private home, not a public duplicate", async (t) => {
  const { root, store } = fixture(t),
    github = new FakeGitHub();
  execFileSync("git", ["init", "-q", "-b", "avoozl-plans", root]);
  execFileSync("git", [
    "-C",
    root,
    "remote",
    "add",
    "origin",
    "https://github.com/acme/app-private.git",
  ]);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      github: {
        mode: "single-repo",
        repositories: {
          "acme/app": { baseBranch: "main", mirror },
        },
      },
    }),
  );
  store.put("repositories", { id: "code", root, github: "acme/app" });
  writeSpec(root, "private-one");
  putPrivate(github, "private-one");
  const ops = new Operations(store, {
    github,
    workspaceRoot: root,
    configuration: new RepositorySettings(store, { workspaceRoot: root }),
  });
  await ops.refreshPrivateSpecs();
  const items = ops.specList();
  assert.equal(items.homeErrors, undefined);
  assert.equal(items.items.length, 1);
  assert.equal(items.items[0].home, "plansBranch");
  const plan = await ops.execute("plan.create", { spec: "private-one" });
  assert.equal(plan.home, "plansBranch");
  assert.equal(ops.approvalPullRequestTarget(plan).ref, "avoozl-plans");
});

test("a review branch derived from private plans is never approved into the code branch", async (t) => {
  const { root, store } = fixture(t),
    github = new FakeGitHub(),
    git = (...args) =>
      execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  git("init", "-q", "-b", "avoozl-plans");
  git("remote", "add", "origin", "https://github.com/acme/app-private.git");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      github: {
        mode: "single-repo",
        repositories: {
          "acme/app": { baseBranch: "main", mirror },
        },
      },
    }),
  );
  writeSpec(root, "reviewed-one");
  git("add", ".");
  git(
    "-c",
    "user.name=Example",
    "-c",
    "user.email=example@example.test",
    "commit",
    "-qm",
    "Create generic fixture",
  );
  git("checkout", "-qb", "review/draft");
  store.put("repositories", { id: "code", root, github: "acme/app" });
  const ops = new Operations(store, {
    github,
    workspaceRoot: root,
    configuration: new RepositorySettings(store, { workspaceRoot: root }),
  });
  const plan = await ops.execute("plan.create", { spec: "reviewed-one" });
  assert.equal(plan.home, "plansBranch");
  assert.equal(ops.readSpec("reviewed-one").approvalBlocked, true);
  assert.throws(
    () => ops.approvalPullRequestTarget(plan),
    /configured plans branch/,
  );
  assert.equal(github.created.length, 0);
});

test("a proved public review branch in a mirror keeps the plain approval", async (t) => {
  const { root, store } = fixture(t),
    github = new FakeGitHub(),
    git = (...args) =>
      execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("remote", "add", "origin", "https://github.com/acme/app-private.git");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      github: {
        mode: "single-repo",
        repositories: {
          "acme/app": { baseBranch: "main", mirror },
        },
      },
    }),
  );
  writeSpec(root, "public-one");
  git("add", ".");
  git(
    "-c",
    "user.name=Example",
    "-c",
    "user.email=example@example.test",
    "commit",
    "-qm",
    "Create generic fixture",
  );
  git("checkout", "-qb", "review/public");
  store.put("repositories", { id: "code", root, github: "acme/app" });
  const ops = new Operations(store, {
    github,
    workspaceRoot: root,
    configuration: new RepositorySettings(store, { workspaceRoot: root }),
  });
  const plan = await ops.execute("plan.create", { spec: "public-one" });
  assert.equal(plan.home, "main");
  assert.equal(ops.readSpec("public-one").approvalBlocked, undefined);
  assert.equal(
    ops.specList().items.find((item) => item.name === "public-one").home,
    "main",
  );
  // A main-branch home approves by the local receipt (R86.8, R91.6).
  assert.equal(ops.approvalPullRequestTarget(plan), null);
});

test("a public spec that requires a private task is named, one that does not passes", async () => {
  const github = new FakeGitHub();
  putPrivate(github, "hidden");
  const privateSpecs = await readPrivateSpecs(github, mirror),
    files = specFiles();
  const withEdge = {
    name: "open",
    files: {
      ...files,
      "tasks.md": files["tasks.md"].replace(
        "    - $after: 1.1",
        "    - $after: hidden.1.1",
      ),
    },
  };
  assert.deepEqual(privateDependencies(withEdge, privateSpecs), ["hidden.1.1"]);
  assert.deepEqual(
    privateDependencies({ name: "open", files }, privateSpecs),
    [],
  );
});
