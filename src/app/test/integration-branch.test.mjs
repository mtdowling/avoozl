// rc-16.1: the integration branch in the manifest and its checks (RC16.1,
// design D21), with a fake GitHub. Nothing here reaches the network, and the
// fake has no method that creates a branch.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  branchNameProblem,
  checkIntegrationBranch,
  integrationOf,
  requireIntegrationBranch,
} from "../integration-branch.mjs";
import { Operations } from "../operations.mjs";
import { lintSpec, readSpecFolder } from "../spec-plans.mjs";
import { fixture } from "./fixtures.mjs";
import { specFiles, writeSpec } from "./spec-fixture.mjs";

const REPO = "example/code";

// `branches` maps a name to `{ protected }`; a name not in it answers 404.
function fake({ branches = {}, def = "main", fail = null } = {}) {
  const calls = [];
  return {
    calls,
    available: () => true,
    repository: () =>
      fail
        ? Promise.reject(Error(fail))
        : Promise.resolve({ default_branch: def }),
    branch: (_repository, name) => {
      calls.push(name);
      return name in branches
        ? Promise.resolve({ name, ...branches[name] })
        : Promise.reject(Object.assign(Error("Not Found"), { status: 404 }));
    },
  };
}
const settings = (extra = {}) => ({ baseBranch: "main", ...extra });
const check = (github, branch, entry = settings()) =>
  checkIntegrationBranch(github, REPO, branch, entry);

test("an existing protected branch that differs from the default is ready", async () => {
  const github = fake({ branches: { "rewrite/x": { protected: true } } });
  const result = await check(github, "rewrite/x");
  assert.equal(result.ready, true);
  assert.deepEqual(result.missing, []);
  assert.equal(result.defaultBranch, "main");
  assert.equal(requireIntegrationBranch(result), result);
});

test("each failure names its reason: missing, unprotected, default", async () => {
  const cases = [
    [fake(), "rewrite/x", ["exists", "protected"], /does not exist/],
    [
      fake({ branches: { "rewrite/x": { protected: false } } }),
      "rewrite/x",
      ["protected"],
      /not protected/,
    ],
    [fake(), "main", ["not-default", "exists", "protected"], /default branch/],
    [
      fake({ def: "trunk" }),
      "trunk",
      ["not-default", "exists", "protected"],
      /default branch/,
    ],
  ];
  for (const [github, branch, missing, text] of cases) {
    const result = await check(github, branch);
    assert.deepEqual(result.missing, missing, branch);
    assert.equal(result.ready, false);
    assert.throws(
      () => requireIntegrationBranch(result),
      (error) => error.status === 409 && text.test(error.message),
    );
  }
});

test("the policy's base branch counts as the default even when GitHub's default differs", async () => {
  const github = fake({
    def: "trunk",
    branches: { release: { protected: true } },
  });
  const result = await check(
    github,
    "release",
    settings({ baseBranch: "release" }),
  );
  assert.deepEqual(result.missing, ["not-default", "exists", "protected"]);
  // The default branch is not even read as a branch.
  assert.deepEqual(github.calls, []);
});

test("a bad name is refused before GitHub is read", async () => {
  const github = fake();
  for (const name of [
    "",
    "a b",
    "a..b",
    "/a",
    "a/",
    "x.lock",
    "refs/heads/x",
    "-x",
    "a//b",
    undefined,
  ]) {
    const result = await check(github, name);
    assert.deepEqual(
      result.missing,
      ["name", "not-default", "exists", "protected"],
      String(name),
    );
    assert.notEqual(branchNameProblem(name), null, String(name));
  }
  assert.deepEqual(github.calls, []);
  for (const name of ["rewrite/x", "v2-rewrite", "a.b_c/d"])
    assert.equal(branchNameProblem(name), null, name);
});

test("a GitHub read that fails is reported and guesses nothing", async () => {
  const result = await check(fake({ fail: "boom" }), "rewrite/x");
  assert.equal(result.ready, false);
  assert.match(result.error, /boom/);
  assert.deepEqual(result.missing, ["not-default", "exists", "protected"]);
});

test("a non-404 branch read error is not read as a missing branch", async () => {
  const github = fake();
  github.branch = () =>
    Promise.reject(Object.assign(Error("rate limit"), { status: 403 }));
  const result = await check(github, "rewrite/x");
  assert.match(result.error, /rate limit/);
  assert.doesNotMatch(
    result.items.find((i) => i.id === "exists").detail,
    /does not exist/,
  );
});

test("the manifest fields: absent changes nothing, present is checked", () => {
  assert.equal(integrationOf({ tasks: {} }), null);
  assert.equal(integrationOf(null), null);
  assert.deepEqual(integrationOf({ integrationBranch: "rewrite/x" }), {
    branch: "rewrite/x",
    sync: "weekly",
  });
  assert.deepEqual(
    integrationOf({ integrationBranch: "rewrite/x", integrationSync: "off" }),
    { branch: "rewrite/x", sync: "off" },
  );
  for (const bad of [
    { integrationBranch: "" },
    { integrationBranch: 3 },
    { integrationBranch: "a b" },
    { integrationBranch: "x", integrationSync: "monthly" },
    { integrationSync: "weekly" },
  ])
    assert.throws(() => integrationOf(bad), Error, JSON.stringify(bad));
});

function lintWith(t, extra) {
  const { root } = fixture(t),
    manifest = JSON.parse(specFiles()["avoozl/manifest.json"]);
  writeSpec(root, "config", {
    "avoozl/manifest.json": JSON.stringify({ ...manifest, ...extra }),
  });
  return lintSpec({
    spec: readSpecFolder(root, "config"),
    plan: { id: "config" },
  });
}

test("spec lint: an old manifest stays valid, a bad field is one error", (t) => {
  assert.deepEqual(lintWith(t, {}).diagnostics, []);
  assert.deepEqual(
    lintWith(t, { integrationBranch: "rewrite/x", integrationSync: "daily" })
      .diagnostics,
    [],
  );
  for (const extra of [
    { integrationBranch: "main branch" },
    { integrationBranch: "rewrite/x", integrationSync: "never" },
    { integrationSync: "off" },
  ]) {
    const found = lintWith(t, extra).diagnostics.filter(
      (d) => d.code === "manifest.schema",
    );
    assert.equal(found.length, 1, JSON.stringify(extra));
    assert.match(found[0].message, /integration/i);
  }
});

function operations(t, github) {
  const { root, store } = fixture(t);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_0123456789abcdef",
      github: {
        mode: "single-repo",
        repositories: { [REPO]: { baseBranch: "main", coder: "issue-radar" } },
      },
    }),
  );
  return new Operations(store, { github, workspaceRoot: root });
}

test("radar.integrationbranch returns the check, refuses a branch that is not ready, and writes nothing", async (t) => {
  const github = fake({ branches: { "rewrite/x": { protected: true } } }),
    ops = operations(t, github),
    before = ops.read().revision;
  const result = await ops.execute("radar.integrationbranch", {
    repository: REPO,
    branch: "rewrite/x",
  });
  assert.equal(result.ready, true);
  await assert.rejects(
    ops.execute("radar.integrationbranch", {
      repository: REPO,
      branch: "main",
    }),
    (error) => error.status === 409 && /default branch/.test(error.message),
  );
  await assert.rejects(
    ops.execute("radar.integrationbranch", {
      repository: "other/repo",
      branch: "x",
    }),
    /not registered|Unknown|repository/i,
  );
  await assert.rejects(
    ops.execute("radar.integrationbranch", {}),
    (error) => error.status === 400,
  );
  assert.equal(ops.read().revision, before);
});
