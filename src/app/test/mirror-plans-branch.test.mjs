import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { requirePlansBranches } from "../mirror-policy.mjs";
import { Operations } from "../operations.mjs";
import { RepositorySettings } from "../repository-settings.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

// rc-24.1: the `mirror.plansBranch` setting (RC25.1, design D30.1).
const base = { source: "acme/app", mirror: "acme/app-private" };
const section = (mirror) => ({
  mode: "single-repo",
  repositories: { "acme/app-private": { baseBranch: "main", mirror } },
});
const policy = (mirror) => normalizeGitHubPolicy(section(mirror));

test("plansBranch defaults to avoozl-plans and a set name is kept", () => {
  const of = (mirror) => policy(mirror).repositories["acme/app-private"].mirror;
  assert.equal(of(base).plansBranch, "avoozl-plans");
  assert.equal(
    of({ ...base, plansBranch: "private-plans" }).plansBranch,
    "private-plans",
  );
});

test("a name equal to the default branch, or starting with the prefix, is refused", () => {
  const refused = (change, pattern) =>
    assert.throws(() => policy({ ...base, ...change }), pattern);
  refused({ plansBranch: "main" }, /differ from the default branch/);
  refused({ plansBranch: "avoozl/plans" }, /branch prefix avoozl\//);
  refused(
    { plansBranch: "crew/x", branchPrefix: "crew/" },
    /branch prefix crew\//,
  );
  refused({ plansBranch: "a..b" }, /plain branch name/);
  refused({ plansBranch: "plans/" }, /plain branch name/);
  refused({ plansBranch: 7 }, /plain branch name/);
});

test("the branch is created once from an orphan root", async () => {
  const github = new FakeGitHub(),
    created = [];
  const make = github.createOrphanBranch.bind(github);
  github.createOrphanBranch = (...args) => (
    created.push(args[1]),
    make(...args)
  );
  await requirePlansBranches(policy(base), github, { create: true });
  await requirePlansBranches(policy(base), github, { create: true });
  assert.deepEqual(created, ["avoozl-plans"]);
  await assert.rejects(
    github.compareCommits({}, "main", "avoozl-plans"),
    /common ancestor/,
  );
});

test("validation alone creates nothing", async () => {
  const github = new FakeGitHub();
  await requirePlansBranches(policy(base), github);
  assert.equal(github.branches.has("avoozl-plans"), false);
});

test("a branch that shares history, or the default branch itself, is refused", async () => {
  const github = new FakeGitHub();
  github.branches.set("avoozl-plans", "main");
  await assert.rejects(
    requirePlansBranches(policy(base), github, { create: true }),
    /shares history with main/,
  );
  const remote = {
    ...new FakeGitHub(),
    repository: async () => ({ default_branch: "trunk" }),
  };
  await assert.rejects(
    requirePlansBranches(policy({ ...base, plansBranch: "trunk" }), {
      repository: remote.repository,
      branch: async () => ({}),
    }),
    /is the default branch/,
  );
});

test("an unreadable mirror is refused", async () => {
  const broken = {
    repository: async () => {
      throw new Error("404");
    },
  };
  await assert.rejects(
    requirePlansBranches(policy(base), broken),
    /could not be read/,
  );
});

function workspace(t, remote) {
  const { root, store } = fixture(t),
    filename = path.join(root, ".avoozl.json");
  fs.writeFileSync(filename, JSON.stringify({ version: 1 }) + "\n");
  const ops = new Operations(store, {
    github: remote,
    workspaceRoot: root,
    configuration: new RepositorySettings(store, { workspaceRoot: root }),
  });
  return { ops, filename };
}

test("the form and the raw file agree, and each refuses a shared-history branch", async (t) => {
  const github = new FakeGitHub(),
    { ops, filename } = workspace(t, github),
    before = await ops.execute("github.settings.get");
  await ops.execute("github.settings.update", {
    github: section({ ...base, plansBranch: "plans-x" }),
    expectedHash: before.hash,
  });
  assert.ok(github.branches.has("plans-x"));
  const raw = JSON.parse(fs.readFileSync(filename, "utf8"));
  assert.equal(
    raw.github.repositories["acme/app-private"].mirror.plansBranch,
    "plans-x",
  );
  const after = await ops.execute("github.settings.get");
  assert.equal(
    after.effective.repositories["acme/app-private"].mirror.plansBranch,
    "plans-x",
  );

  github.branches.set("shared", "main");
  const file = await ops.execute("configuration.get", { scope: "repository" });
  raw.github.repositories["acme/app-private"].mirror.plansBranch = "shared";
  const text = fs.readFileSync(filename, "utf8");
  await assert.rejects(
    ops.execute("configuration.update", {
      scope: "repository",
      expectedHash: file.hash,
      text: JSON.stringify(raw),
    }),
    /shares history/,
  );
  assert.equal(fs.readFileSync(filename, "utf8"), text);
  const checked = await ops.execute("github.settings.validate", {
    github: section({ ...base, plansBranch: "shared" }),
  });
  assert.equal(checked.valid, false);
  assert.match(checked.error, /shares history/);
});
