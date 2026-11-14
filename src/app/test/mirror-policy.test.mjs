import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { requireMirrorsPrivate } from "../mirror-policy.mjs";
import { Operations } from "../operations.mjs";
import { RepositorySettings } from "../repository-settings.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

// rc-23.1: the per-repository `mirror` setting (RC24.1, RC24.2).
const policy = (mirror) =>
  normalizeGitHubPolicy({
    mode: "single-repo",
    repositories: {
      "acme/app-private": { baseBranch: "main", ...(mirror ? { mirror } : {}) },
    },
  });
const mirrorOf = (mirror) =>
  policy(mirror).repositories["acme/app-private"].mirror;
const base = { source: "acme/app", mirror: "acme/app-private" };

test("a mirror gets every default", () => {
  assert.deepEqual(mirrorOf(base), {
    source: "acme/app",
    mirror: "acme/app-private",
    forwardTo: "source",
    forward: "nudge",
    branchPrefix: "avoozl/",
    squash: true,
    trustedPersons: [],
    plansBranch: "avoozl-plans",
  });
});

test("a repository without a mirror keeps its old shape", () => {
  assert.equal("mirror" in policy().repositories["acme/app-private"], false);
});

test("set values are kept", () => {
  const value = mirrorOf({
    ...base,
    forwardTo: "fork:dev/app",
    forward: "auto",
    branchPrefix: "crew/",
    squash: false,
    trustedPersons: ["Ana", "ana", "bo"],
  });
  assert.equal(value.forwardTo, "fork:dev/app");
  assert.equal(value.forward, "auto");
  assert.equal(value.branchPrefix, "crew/");
  assert.equal(value.squash, false);
  assert.deepEqual(value.trustedPersons, ["Ana", "bo"]);
});

test("bad values are refused with a plain sentence", () => {
  const refused = (change, pattern) =>
    assert.throws(() => mirrorOf({ ...base, ...change }), pattern);
  refused({ source: undefined }, /mirror\.source/);
  refused({ mirror: "nope" }, /mirror\.mirror/);
  refused({ mirror: "ACME/App" }, /must differ/);
  refused({ forwardTo: "elsewhere" }, /forwardTo/);
  refused({ forwardTo: "fork:bad" }, /forwardTo/);
  refused({ forward: "now" }, /forward must be off, nudge or auto/);
  refused({ branchPrefix: "" }, /branchPrefix/);
  refused({ branchPrefix: "a..b/" }, /branchPrefix/);
  refused({ branchPrefix: "-x/" }, /branchPrefix/);
  refused({ squash: "yes" }, /squash/);
  refused({ trustedPersons: "ana" }, /trustedPersons/);
  refused({ extra: 1 }, /Unknown setting/);
  assert.throws(() => mirrorOf("acme/app"), /JSON object/);
});

test("forward auto needs a trusted person", () => {
  assert.throws(
    () => mirrorOf({ ...base, forward: "auto" }),
    /auto.*trustedPersons/,
  );
  assert.equal(
    mirrorOf({ ...base, forward: "auto", trustedPersons: ["ana"] }).forward,
    "auto",
  );
  assert.equal(mirrorOf({ ...base, forward: "off" }).forward, "off");
});

const github = (remote) => ({
  available: () => true,
  repository: async (repository) => {
    if (remote instanceof Error) throw remote;
    return { full_name: repository.id, ...remote };
  },
});

test("a private mirror passes and a public one is refused", async () => {
  await requireMirrorsPrivate(policy(base), new FakeGitHub());
  await assert.rejects(
    requireMirrorsPrivate(policy(base), github({ private: false })),
    /acme\/app-private is not private/,
  );
});

test("an unreadable mirror counts as not private", async () => {
  await assert.rejects(
    requireMirrorsPrivate(policy(base), github(new Error("404"))),
    /could not be read/,
  );
  await assert.rejects(
    requireMirrorsPrivate(policy(base), github({})),
    /not private/,
  );
  await assert.rejects(
    requireMirrorsPrivate(policy(base), { available: () => false }),
    /could not be read/,
  );
});

test("a policy with no mirror reads nothing", async () => {
  await requireMirrorsPrivate(policy(), github(new Error("never read")));
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
const section = (mirror) => ({
  mode: "single-repo",
  repositories: { "acme/app-private": { baseBranch: "main", mirror } },
});

test("the form saves a private mirror, and the raw file shows the same record", async (t) => {
  const { ops, filename } = workspace(t, new FakeGitHub());
  const before = await ops.execute("github.settings.get");
  await ops.execute("github.settings.update", {
    github: section(base),
    expectedHash: before.hash,
  });
  const raw = JSON.parse(fs.readFileSync(filename, "utf8"));
  assert.deepEqual(raw.github.repositories["acme/app-private"].mirror, base);
  const file = await ops.execute("configuration.get", { scope: "repository" });
  raw.github.repositories["acme/app-private"].mirror.forward = "off";
  await ops.execute("configuration.update", {
    scope: "repository",
    expectedHash: file.hash,
    text: JSON.stringify(raw),
  });
  const after = await ops.execute("github.settings.get");
  assert.equal(
    after.effective.repositories["acme/app-private"].mirror.forward,
    "off",
  );
  assert.equal(
    after.github.repositories["acme/app-private"].mirror.forward,
    "off",
  );
});

test("a public mirror is refused by validate, the form and the raw file", async (t) => {
  const { ops, filename } = workspace(t, github({ private: false })),
    text = fs.readFileSync(filename, "utf8"),
    before = await ops.execute("github.settings.get");
  const checked = await ops.execute("github.settings.validate", {
    github: section(base),
  });
  assert.equal(checked.valid, false);
  assert.match(checked.error, /not private/);
  await assert.rejects(
    ops.execute("github.settings.update", {
      github: section(base),
      expectedHash: before.hash,
    }),
    /not private/,
  );
  const file = await ops.execute("configuration.get", { scope: "repository" });
  await assert.rejects(
    ops.execute("configuration.update", {
      scope: "repository",
      expectedHash: file.hash,
      text: JSON.stringify({ version: 1, github: section(base) }),
    }),
    /not private/,
  );
  assert.equal(fs.readFileSync(filename, "utf8"), text);
});
