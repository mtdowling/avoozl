// Repository roles (design §4.34, Requirement 105): the mapping both ways,
// refused mixes, migration that writes nothing on read, and one save that
// is the same as two.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  readGitHubPolicy,
  normalizeGitHubPolicy,
} from "../../github/github-policy.mjs";
import { loadLayeredConfig } from "../../settings/layered-config.mjs";
import { Operations } from "../../api/operations.mjs";
import {
  deriveGitHubKeys,
  resolveRoles,
  withoutDerivedKeys,
} from "../repository-roles.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const entry = (role) => ({ baseBranch: "main", ...(role ? { role } : {}) });
const repos = (map) =>
  Object.fromEntries(
    Object.entries(map).map(([id, role]) => [id, entry(role)]),
  );

test("a file with no role reads its roles from the stored mode", () => {
  const entries = repos({
    "a/app": undefined,
    "a/plans": undefined,
    "a/lib": undefined,
  });
  assert.deepEqual(resolveRoles({ repositories: entries }).roles, {
    "a/app": "local",
    "a/plans": "local",
    "a/lib": "local",
  });
  const plans = resolveRoles({
    mode: "plans-repo",
    planningRepository: "A/Plans",
    repositories: entries,
  });
  assert.deepEqual(plans.roles, {
    "a/app": "code",
    "a/plans": "planning",
    "a/lib": "code",
  });
  assert.equal(plans.mode, "plans-repo");
  assert.equal(plans.fromRoles, false);
  const single = resolveRoles({ mode: "single-repo", repositories: entries });
  assert.deepEqual(Object.values(single.roles), ["both", "both", "both"]);
  assert.equal(
    resolveRoles({ mode: "local", repositories: entries }).mode,
    null,
  );
});

test("roles give the mode and the planning repository", () => {
  const plans = resolveRoles({
    repositories: repos({
      "a/app": "code",
      "a/plans": "planning",
      "a/lib": "code",
    }),
  });
  assert.equal(plans.mode, "plans-repo");
  assert.equal(plans.planningRepository, "a/plans");
  assert.equal(
    resolveRoles({ repositories: repos({ "a/app": "both", "a/lib": "both" }) })
      .mode,
    "single-repo",
  );
  assert.equal(
    resolveRoles({
      repositories: repos({ "a/app": "local", "a/lib": "local" }),
    }).mode,
    null,
  );
  // A planning repository with no checkout has no entry: the stored name serves.
  const gone = resolveRoles({
    planningRepository: "a/plans",
    repositories: repos({ "a/app": "code" }),
  });
  assert.equal(gone.mode, "plans-repo");
  assert.equal(gone.planningRepository, "a/plans");
});

const MIXES = [
  [
    "two planning",
    { "a/x": "planning", "a/y": "planning" },
    /Only one repository/,
  ],
  [
    "planning with both",
    { "a/x": "planning", "a/y": "both" },
    /cannot also hold/,
  ],
  ["code with both", { "a/x": "code", "a/y": "both" }, /Make them all code/],
  [
    "code with no planning",
    { "a/x": "code" },
    /Give one repository the planning role/,
  ],
  ["local beside GitHub", { "a/x": "local", "a/y": "both" }, /is local while/],
];
for (const [label, map, message] of MIXES)
  test(`a mix of ${label} is refused with one line`, () => {
    assert.throws(() => resolveRoles({ repositories: repos(map) }), message);
    assert.throws(
      () => normalizeGitHubPolicy({ repositories: repos(map) }),
      message,
    );
  });

test("an unknown role is refused", () => {
  assert.throws(
    () => resolveRoles({ repositories: { "a/x": entry("owner") } }),
    /role must be local, code, planning or both/,
  );
});

test("the policy derives mode and planning repository from roles", () => {
  const github = {
    mode: "single-repo",
    repositories: repos({ "a/app": "code", "a/plans": "planning" }),
  };
  const policy = normalizeGitHubPolicy(github);
  assert.equal(policy.mode, "plans-repo");
  assert.equal(policy.planningRepository, "a/plans");
  assert.deepEqual(Object.keys(withoutDerivedKeys(github)), ["repositories"]);
  const bare = { mode: "plans-repo", planningRepository: "a/plans" };
  assert.deepEqual(withoutDerivedKeys(bare), bare);
});

test("an unchanged file with no roles keeps its keys and behavior", () => {
  const github = {
    mode: "plans-repo",
    planningRepository: "a/plans",
    repositories: repos({ "a/app": undefined }),
  };
  assert.equal(deriveGitHubKeys(github), github);
  const policy = normalizeGitHubPolicy(github);
  assert.equal(policy.mode, "plans-repo");
  assert.equal(policy.planningRepository, "a/plans");
});

function workspace(t, github) {
  const { root, store } = fixture(t),
    filename = path.join(root, ".avoozl.json");
  fs.writeFileSync(
    filename,
    JSON.stringify({ version: 1, github }, null, 2) + "\n",
  );
  return {
    root,
    filename,
    ops: new Operations(store, { workspaceRoot: root }),
  };
}

test("the config loader gives raw readers the derived mode", (t) => {
  const { root } = workspace(t, {
    repositories: repos({ "a/app": "code", "a/plans": "planning" }),
  });
  const github = loadLayeredConfig({ workspaceRoot: root }).config.github;
  assert.equal(github.mode, "plans-repo");
  assert.equal(github.planningRepository, "a/plans");
  assert.equal(readGitHubPolicy(root).mode, "plans-repo");
});

test("reading shows roles and writes nothing; one save equals two", async (t) => {
  const { ops, filename } = workspace(t, {
    mode: "plans-repo",
    planningRepository: "a/plans",
    repositories: repos({ "a/app": undefined, "a/plans": undefined }),
  });
  const text = fs.readFileSync(filename, "utf8"),
    before = await ops.execute("github.settings.get");
  assert.equal(before.github.repositories["a/app"].role, "code");
  assert.equal(before.github.repositories["a/plans"].role, "planning");
  assert.equal(fs.readFileSync(filename, "utf8"), text);
  const first = await ops.execute("github.settings.update", {
    github: before.github,
    expectedHash: before.hash,
  });
  const saved = JSON.parse(fs.readFileSync(filename, "utf8")).github;
  assert.equal(saved.mode, undefined);
  assert.equal(saved.planningRepository, undefined);
  assert.equal(saved.repositories["a/app"].role, "code");
  assert.equal(saved.repositories["a/plans"].role, "planning");
  const again = await ops.execute("github.settings.update", {
    github: first.github,
    expectedHash: first.hash,
  });
  assert.equal(again.hash, first.hash);
});

test("saving roles reads back the derived mode and refuses a mix without writing", async (t) => {
  const { ops, filename } = workspace(t, {
    mode: "single-repo",
    repositories: repos({ "a/app": undefined, "a/lib": undefined }),
  });
  const before = await ops.execute("github.settings.get"),
    next = structuredClone(before.github);
  next.repositories["a/app"].role = "planning";
  next.repositories["a/lib"].role = "code";
  const saved = await ops.execute("github.settings.update", {
    github: next,
    expectedHash: before.hash,
  });
  assert.equal(saved.github.mode, "plans-repo");
  assert.equal(saved.github.planningRepository, "a/app");
  assert.equal(saved.effective.mode, "plans-repo");
  assert.equal(
    JSON.parse(fs.readFileSync(filename, "utf8")).github.mode,
    undefined,
  );
  const text = fs.readFileSync(filename, "utf8");
  next.repositories["a/lib"].role = "both";
  await assert.rejects(
    ops.execute("github.settings.update", {
      github: next,
      expectedHash: saved.hash,
    }),
    /cannot also hold/,
  );
  assert.equal(fs.readFileSync(filename, "utf8"), text);
});
