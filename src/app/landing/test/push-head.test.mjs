// Pushing a landing's exact commit (push-head.mjs): relationships, forks,
// the content scan and no push credentials for agents. Every repository here
// is a local scratch repository: an upstream, two forks and a checkout.
// Nothing reaches GitHub.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git, withoutPushCredentials } from "../../git/git.mjs";
import { bindContentRules } from "../../content/content-rules.mjs";
import { fixture } from "../../test/fixtures.mjs";

import {
  landingRights,
  pushHead,
  qualifiedRef,
  sourceRegistry,
  verifyRelationship,
} from "../push-head.mjs";

const checkpointBranch = (spec, task) => `avoozl/${spec}/task/${task}`;

// Made-up names only.
const MACHINE = { hostname: "made-up-host", username: "madeupuser" };
const SPEC = "5f1c0e7a9b2d4c68";

async function scratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-heads-"));
  t.after(() =>
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    }),
  );
  const at = (name) => path.join(root, name);
  const identity = async (dir) => {
    await git(dir, ["config", "user.name", "Fixture"]);
    await git(dir, ["config", "user.email", "fixture@example.invalid"]);
  };
  // The upstream with one commit on main.
  const seed = at("seed");
  fs.mkdirSync(seed);
  await git(seed, ["init", "-q", "-b", "main"]);
  await identity(seed);
  fs.writeFileSync(path.join(seed, "app.txt"), "one\n");
  await git(seed, ["add", "."]);
  await git(seed, ["commit", "-q", "-m", "Start"]);
  await git(root, ["clone", "-q", "--bare", seed, at("upstream.git")]);
  // Two forks, each a copy of upstream, and the driver's checkout.
  await git(root, [
    "clone",
    "-q",
    "--bare",
    at("upstream.git"),
    at("alice.git"),
  ]);
  await git(root, ["clone", "-q", "--bare", at("upstream.git"), at("bob.git")]);
  await git(root, ["clone", "-q", at("upstream.git"), at("driver")]);
  const driver = at("driver");
  await identity(driver);
  const base = await git(driver, ["rev-parse", "HEAD"]);
  const registry = sourceRegistry({
    "acme/app": { url: at("upstream.git") },
    "alice/app": { url: at("alice.git"), parent: "acme/app" },
    "bob/app": { url: at("bob.git"), parent: "acme/app" },
  });
  // A contributor's own clone of a fork, to push work there as a person.
  const contributor = async (name, fork) => {
    const dir = at(name);
    await git(root, ["clone", "-q", at(fork), dir]);
    await identity(dir);
    return dir;
  };
  const commit = async (dir, file, text, message = `Change ${file}`) => {
    fs.writeFileSync(path.join(dir, file), text);
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-q", "-m", message]);
    return git(dir, ["rev-parse", "HEAD"]);
  };
  const config = at("machine.json");
  return { root, at, driver, base, registry, contributor, commit, config };
}

const target = { repository: "acme/app", base: "main" };
const ref = (repository, branch, commit) =>
  qualifiedRef({ source: { repository, branch, commit }, target });

test("relationships: same repository, registered fork, GitHub fork, else refused", async () => {
  const registry = sourceRegistry({
      "acme/app": { url: "/u" },
      "alice/app": { url: "/a", parent: "acme/app" },
      "carol/app": { url: "/c" },
      "dave/app": { url: "/d" },
    }),
    sha = "c".repeat(40),
    github = {
      repository: async (name) =>
        name === "carol/app"
          ? { fork: true, parent: { full_name: "acme/app" } }
          : { fork: false },
    };
  assert.equal(
    await verifyRelationship(github, ref("acme/app", "x", sha), registry),
    "same",
  );
  assert.equal(
    await verifyRelationship(github, ref("alice/app", "x", sha), registry),
    "fork",
  );
  assert.equal(
    await verifyRelationship(github, ref("carol/app", "x", sha), registry),
    "fork",
  );
  await assert.rejects(
    verifyRelationship(github, ref("dave/app", "x", sha), registry),
    /not acme\/app or a fork/,
  );
});

test("a fork contributor checkpoints with no upstream copy and no upstream write", async (t) => {
  const s = await scratch(t);
  await git(s.driver, ["checkout", "-q", "-b", "task-one", s.base]);
  const work = await s.commit(s.driver, "one.txt", "work\n"),
    branch = checkpointBranch(SPEC, "t1");
  const pushed = await pushHead(
    s.driver,
    { repository: "alice/app", branch, commit: work },
    s.registry,
    { since: s.base, machine: MACHINE, configFile: s.config },
  );
  assert.equal(pushed.pushed, true);
  assert.match(
    await git(s.root, ["ls-remote", "--heads", s.at("alice.git"), branch]),
    new RegExp(work),
  );
  // Nothing was copied upstream.
  assert.equal(
    await git(s.root, [
      "ls-remote",
      "--heads",
      s.at("upstream.git"),
      "avoozl/*",
    ]),
    "",
  );
  // A retry pushes nothing; a rewrite is refused by git, never forced.
  const again = await pushHead(
    s.driver,
    { repository: "alice/app", branch, commit: work },
    s.registry,
    { since: s.base, machine: MACHINE, configFile: s.config },
  );
  assert.equal(again.pushed, false);
  await git(s.driver, ["checkout", "-q", "-b", "other", s.base]);
  const other = await s.commit(s.driver, "x.txt", "x\n");
  await assert.rejects(
    pushHead(
      s.driver,
      { repository: "alice/app", branch, commit: other },
      s.registry,
      { since: s.base, machine: MACHINE, configFile: s.config },
    ),
    /Nothing was forced/,
  );
  // Source push rights and target merge rights are separate.
  const github = {
    permission: async (repository) => ({
      permission: repository === "alice/app" ? "admin" : "read",
    }),
  };
  assert.deepEqual(
    await landingRights(github, ref("alice/app", branch, work), "alice"),
    { checkpoint: true, land: "observe" },
  );
  assert.deepEqual(
    await landingRights(
      { permission: async () => ({ permission: "maintain" }) },
      ref("alice/app", branch, work),
      "maintainer",
    ),
    { checkpoint: true, land: "merge" },
  );
});

test("the content scan refuses a checkpoint before it is pushed", async (t) => {
  const s = await scratch(t);
  await git(s.driver, ["checkout", "-q", "-b", "task-one", s.base]);
  const leaky = await s.commit(
      s.driver,
      "one.txt",
      "fine\n",
      `Ran on ${MACHINE.hostname}`,
    ),
    branch = checkpointBranch(SPEC, "t1");
  await assert.rejects(
    pushHead(
      s.driver,
      { repository: "alice/app", branch, commit: leaky },
      s.registry,
      { since: s.base, machine: MACHINE, configFile: s.config },
    ),
    /content scan refused this push, nothing was pushed: rule machine-name/,
  );
  // A made-up username in a ref name is refused too.
  await assert.rejects(
    pushHead(
      s.driver,
      {
        repository: "alice/app",
        branch: `${MACHINE.username}/work`,
        commit: s.base,
      },
      s.registry,
      { since: s.base, machine: MACHINE, configFile: s.config },
    ),
    /content scan refused/,
  );
  assert.equal(
    await git(s.root, ["ls-remote", "--heads", s.at("alice.git"), "avoozl/*"]),
    "",
  );
});

test("agents never receive push credentials", () => {
  const env = withoutPushCredentials({
    PATH: "/bin",
    HOME: "/tmp/home",
    GH_TOKEN: "x",
    GITHUB_TOKEN: "x",
    AVOOZL_GITHUB_TOKEN: "x",
    GIT_ASKPASS: "x",
    SSH_AUTH_SOCK: "x",
    GIT_SSH_COMMAND: "x",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "credential.helper",
    GIT_CONFIG_VALUE_0: "x",
  });
  assert.deepEqual(Object.keys(env).sort(), [
    "GIT_TERMINAL_PROMPT",
    "HOME",
    "PATH",
  ]);
});

test("a push names no private plan term from the workspace's content rules", async (t) => {
  const s = await scratch(t),
    { store } = fixture(t),
    ws = s.at("ws");
  fs.mkdirSync(path.join(ws, ".avoozl", "local", "content-rules"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(ws, ".avoozl.json"),
    JSON.stringify({
      contentRules: { sets: [{ id: "private-plan", boundaries: ["diff"] }] },
    }),
  );
  fs.writeFileSync(
    path.join(ws, ".avoozl", "local", "content-rules", "private-plan.txt"),
    "plan: made-up-private-plan\n",
  );
  bindContentRules(store, {
    workspaceRoot: ws,
    configFile: s.config,
    machine: MACHINE,
  });
  await git(s.driver, ["checkout", "-q", "-b", "task-one", s.base]);
  const named = await s.commit(
      s.driver,
      "one.txt",
      "fine\n",
      "Work for made-up-private-plan",
    ),
    options = { since: s.base, machine: MACHINE, configFile: s.config, store };
  await assert.rejects(
    pushHead(
      s.driver,
      {
        repository: "alice/app",
        branch: checkpointBranch(SPEC, "t1"),
        commit: named,
      },
      s.registry,
      options,
    ),
    /Content rules refused this, nothing was written: private-plan rule plan/,
  );
  await assert.rejects(
    pushHead(
      s.driver,
      {
        repository: "alice/app",
        branch: "made-up-private-plan/work",
        commit: s.base,
      },
      s.registry,
      options,
    ),
    /Content rules refused/,
  );
  assert.equal(
    await git(s.root, [
      "ls-remote",
      "--heads",
      s.at("alice.git"),
      "*made-up*",
      "avoozl/*",
    ]),
    "",
  );
  // A clean push still goes.
  await git(s.driver, ["checkout", "-q", "-b", "task-two", s.base]);
  const clean = await s.commit(s.driver, "two.txt", "fine\n", "Work");
  assert.equal(
    (
      await pushHead(
        s.driver,
        {
          repository: "alice/app",
          branch: checkpointBranch(SPEC, "t2"),
          commit: clean,
        },
        s.registry,
        options,
      )
    ).pushed,
    true,
  );
});
