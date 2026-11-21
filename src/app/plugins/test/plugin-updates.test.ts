// @ts-nocheck: typing debt
// Plugin update checks for packages and folders, and the pure helpers
// (Requirement 34.17). The registry is a stand-in fetch: no network.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { addPlugin, approvePlugin, inspectPlugins } from "../plugins.ts";
import {
  checkPluginUpdates,
  newerTag,
  remoteHost,
  updateNeedsYou,
  updateText,
} from "../plugin-updates.ts";
import { Operations } from "../../api/operations.ts";
import { Store } from "../../store/store.ts";
import { temporaryDirectory } from "../../test/temporary.ts";

const FAKE_RULES = path.join(
  import.meta.dirname,
  "..",
  "..",
  "test",
  "fixtures",
  "plugins",
  "fake-rules",
);

function setup(t) {
  const root = temporaryDirectory("avoozl-plugin-updates-"),
    workspaceRoot = path.join(root, "workspace"),
    settingsFile = path.join(root, "config", "plugins.json");
  fs.mkdirSync(workspaceRoot);
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  return { root, store, options: { workspaceRoot, settingsFile } };
}

const approveAll = (options) => {
  for (const plugin of inspectPlugins(options))
    approvePlugin(options, { id: plugin.id, hash: plugin.hash });
};

// A package installed into the machine plugin folder at `version`.
function installPackage(options, version) {
  const folder = path.join(
    path.dirname(options.settingsFile),
    "plugins",
    "node_modules",
    "fake-rules",
  );
  fs.cpSync(FAKE_RULES, folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, "package.json"),
    JSON.stringify({ name: "fake-rules", version }),
  );
  addPlugin(options, {
    entry: { id: "fake-rules", package: "fake-rules", contract: 1 },
  });
  approveAll(options);
}

const registry = (latest, seen = []) =>
  async function fetchImpl(url, init) {
    seen.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ latest }) };
  };

test("a package check reads only the registry's dist-tags, with no credential", async (t) => {
  const { store, options } = setup(t);
  installPackage(options, "1.0.0");
  const seen = [];
  const env = { npm_config_registry: "https://registry.example.com/" };
  let done = await checkPluginUpdates(store, options, {
    fetchImpl: registry("1.2.0", seen),
    env,
  });
  assert.equal(done["fake-rules"].state, "newer");
  assert.equal(
    seen[0].url,
    "https://registry.example.com/-/package/fake-rules/dist-tags",
  );
  assert.deepEqual(Object.keys(seen[0].init.headers), ["accept"]);
  assert.equal(updateText(done["fake-rules"]), "1.2.0 (was 1.0.0)");
  assert.match(
    updateNeedsYou(store, options)[0].detail,
    /Install fake-rules@1\.2\.0/,
  );
  done = await checkPluginUpdates(store, options, {
    force: true,
    fetchImpl: registry("1.0.0"),
    env,
  });
  assert.equal(done["fake-rules"].state, "current");
  assert.deepEqual(updateNeedsYou(store, options), []);
});

test("a failed or refused registry check shows no Needs you row", async (t) => {
  const { store, options } = setup(t);
  installPackage(options, "1.0.0");
  let done = await checkPluginUpdates(store, options, {
    fetchImpl: async () => {
      throw Error("fetch failed");
    },
    env: {},
  });
  assert.equal(done["fake-rules"].state, "failed");
  const seen = [];
  done = await checkPluginUpdates(store, options, {
    force: true,
    fetchImpl: registry("9.0.0", seen),
    env: { npm_config_registry: "https://me:secret@registry.example.com/" },
  });
  assert.equal(done["fake-rules"].state, "failed");
  assert.match(done["fake-rules"].reason, /carries credentials/);
  assert.deepEqual(seen, []);
  assert.deepEqual(updateNeedsYou(store, options), []);
});

test("a folder check compares the files with the approved hash, offline", async (t) => {
  const { root, store, options } = setup(t);
  const folder = path.join(root, "fake-rules");
  fs.cpSync(FAKE_RULES, folder, { recursive: true });
  addPlugin(options, {
    entry: { id: "fake-rules", path: folder, contract: 1 },
  });
  // Not approved yet: nothing to compare.
  assert.deepEqual(await checkPluginUpdates(store, options), {});
  approveAll(options);
  let done = await checkPluginUpdates(store, options, {
    fetchImpl: () => assert.fail("no network for a folder"),
  });
  assert.equal(done["fake-rules"].state, "current");
  fs.appendFileSync(path.join(folder, "index.mjs"), "\n// changed\n");
  done = await checkPluginUpdates(store, options, { force: true });
  assert.equal(done["fake-rules"].state, "newer");
  assert.equal(updateText(done["fake-rules"]), "files changed on disk");
});

test("newerTag picks the newest release tag with the same prefix", () => {
  const tags = ["v1.0.0", "v1.1.0", "v1.10.0", "v2.0.0-rc.1", "3.0.0", "x"];
  assert.equal(newerTag("v1.0.0", tags), "v1.10.0");
  assert.equal(newerTag("v1.10.0", tags), null);
  assert.equal(newerTag("1.0.0", tags), "3.0.0");
  assert.equal(newerTag("release", tags), null);
});

test("ls-remote to the GitHub git host counts under git", () => {
  assert.equal(remoteHost("https://github.com/a/b.git"), "github.com");
  assert.equal(remoteHost("git@github.com:a/b.git"), "github.com");
  assert.equal(remoteHost("file:///tmp/repo"), null);
  assert.equal(remoteHost("/tmp/repo"), null);
  let counted = 0;
  const ops = Object.create(Operations.prototype);
  ops.githubClient = {
    gitUrl: "https://github.com",
    countGit: () => counted++,
  };
  const count = ops.countPluginGit();
  count("https://github.com/acme/plugin.git");
  count("git@github.com:acme/plugin.git");
  count("https://git.example.com/acme/plugin.git");
  assert.equal(counted, 2);
});
