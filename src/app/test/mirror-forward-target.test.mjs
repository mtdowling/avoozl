import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { forwardTargetOf } from "../mirror-policy.mjs";
import { lintSpec, readSpecFolder } from "../spec-plans.mjs";
import { fixture } from "./fixtures.mjs";
import { specFiles, writeSpec } from "./spec-fixture.mjs";

// rc-25.1: forward target and per-epic override (RC26.1, RC26.2, D31.1).
const mirrorOf = (extra) =>
  normalizeGitHubPolicy({
    mode: "single-repo",
    repositories: {
      "acme/app-private": {
        baseBranch: "main",
        mirror: { source: "acme/app", mirror: "acme/app-private", ...extra },
      },
    },
  }).repositories["acme/app-private"].mirror;

test("the default target is each, from the default", () => {
  const found = forwardTargetOf(mirrorOf({}));
  assert.equal(found.forwardTarget, "each");
  assert.equal(found.publicBranch, undefined);
  assert.deepEqual(found.from, {
    forwardTarget: "default",
    publicBranch: "default",
  });
  assert.equal(found.label, "Use the default (each)");
});

test("the repository setting beats the default", () => {
  const found = forwardTargetOf(
    mirrorOf({ forwardTarget: "branch", publicBranch: "rewrite" }),
  );
  assert.equal(found.forwardTarget, "branch");
  assert.equal(found.publicBranch, "rewrite");
  assert.equal(found.from.forwardTarget, "repository");
  assert.equal(found.label, "Use the repository setting (branch rewrite)");
});

test("the epic beats the repository, key by key", () => {
  const mirror = mirrorOf({ forwardTarget: "branch", publicBranch: "rewrite" });
  const both = forwardTargetOf(mirror, {
    forwardTarget: "batch",
    publicBranch: "next",
  });
  assert.equal(both.forwardTarget, "batch");
  assert.equal(both.publicBranch, "next");
  assert.deepEqual(both.from, { forwardTarget: "epic", publicBranch: "epic" });
  const one = forwardTargetOf(mirror, { forwardTarget: "each" });
  assert.equal(one.forwardTarget, "each");
  assert.equal(one.publicBranch, "rewrite");
  assert.equal(one.from.publicBranch, "repository");
});

test("an unknown or unusable value is refused", () => {
  assert.throws(() => mirrorOf({ forwardTarget: "all" }), /forwardTarget/);
  assert.throws(() => mirrorOf({ forwardTarget: "branch" }), /publicBranch/);
  assert.throws(() => mirrorOf({ publicBranch: "a..b" }), /publicBranch/);
  assert.throws(() => mirrorOf({ publicBranch: "refs/x" }), /publicBranch/);
  assert.throws(
    () => forwardTargetOf(mirrorOf({}), { forwardTarget: "all" }),
    /forwardTarget/,
  );
  assert.throws(
    () => forwardTargetOf(mirrorOf({}), { forwardTarget: "branch" }),
    /publicBranch/,
  );
  assert.throws(
    () => forwardTargetOf(mirrorOf({}), { publicBranch: "x y" }),
    /publicBranch/,
  );
});

test("a repository with no mirror still reads the epic's own values", () => {
  const found = forwardTargetOf(null, { forwardTarget: "each" });
  assert.equal(found.forwardTarget, "each");
  assert.equal(found.from.forwardTarget, "epic");
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
  }).diagnostics.filter((d) => d.code === "manifest.schema");
}

test("the manifest lint accepts good epic values and refuses bad ones", (t) => {
  assert.deepEqual(lintWith(t, {}), []);
  assert.deepEqual(
    lintWith(t, { forwardTarget: "branch", publicBranch: "rewrite/x" }),
    [],
  );
  assert.deepEqual(lintWith(t, { forwardTarget: "batch" }), []);
  for (const extra of [{ forwardTarget: "all" }, { publicBranch: "a b" }]) {
    const found = lintWith(t, extra);
    assert.equal(found.length, 1, JSON.stringify(extra));
    assert.match(found[0].message, /forwardTarget|publicBranch/);
  }
});
