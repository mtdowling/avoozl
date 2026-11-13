// Task 8.6: plugin loading and trust (design §4.8, Requirement 34). The fake
// route plugin from the test tree, copied into a temporary folder, declared
// in temporary machine settings, and run as its own child process.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  addPlugin,
  approvePlugin,
  contentHash,
  disablePlugin,
  inspectPlugins,
  listeningSockets,
  pluginHost,
  procAddress,
  readPluginSettings,
  removePlugin,
  validateEntry,
  validateManifest,
  writePluginSettings,
} from "../plugins.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import { readDeliveryPolicy } from "../tick.mjs";

const FIXTURE = path.join(import.meta.dirname, "fixtures", "plugins");

function setup({ entry = {}, manifest } = {}) {
  const root = temporaryDirectory("avoozl-plugins-"),
    workspaceRoot = path.join(root, "workspace"),
    folder = path.join(root, "fake-route"),
    stateFile = path.join(root, "route-state.json"),
    settingsFile = path.join(root, "config", "plugins.json");
  fs.mkdirSync(workspaceRoot);
  fs.cpSync(path.join(FIXTURE, "fake-route"), folder, { recursive: true });
  if (manifest)
    fs.writeFileSync(
      path.join(folder, "avoozl-plugin.json"),
      JSON.stringify({
        ...JSON.parse(
          fs.readFileSync(path.join(folder, "avoozl-plugin.json"), "utf8"),
        ),
        ...manifest,
      }),
    );
  fs.writeFileSync(stateFile, "{}\n");
  writePluginSettings(settingsFile, {
    plugins: [
      {
        id: "fake-route",
        path: folder,
        contract: 1,
        config: { stateFile },
        ...entry,
      },
    ],
  });
  const options = { workspaceRoot, settingsFile };
  const state = {
    read: () => JSON.parse(fs.readFileSync(stateFile, "utf8")),
    mode(mode) {
      const value = state.read();
      value.mode = mode;
      fs.writeFileSync(stateFile, JSON.stringify(value));
    },
  };
  return { root, folder, options, state };
}

const approve = (options) => {
  const [plugin] = inspectPlugins(options);
  return approvePlugin(options, { id: plugin.id, hash: plugin.hash });
};

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test("an entry names one of package or path, no reserved id, no credential", () => {
  const entry = { id: "fake-route", path: "../x", contract: 1 };
  assert.equal(validateEntry(entry), entry);
  for (const [change, pattern] of [
    [{ id: "local" }, /reserved/],
    [{ id: "github" }, /reserved/],
    [{ package: "@example/x" }, /exactly one of package, path or git/],
    [{ path: undefined }, /exactly one of package, path or git/],
    [
      { contract: "1" },
      /contract \(the contract version\) must be a whole number/,
    ],
    [{ config: { apiToken: "abc" } }, /looks like a credential/],
    [{ config: { auth: "ghp_" + "a".repeat(36) } }, /looks like a credential/],
    [{ config: { tokenEnv: "not a name" } }, /environment variable/],
    [{ extra: true }, /not a plugin setting/],
  ])
    assert.throws(() => validateEntry({ ...entry, ...change }), pattern);
  assert.ok(
    validateEntry({
      ...entry,
      config: { tokenEnv: "EXAMPLE_TOKEN", url: "https://x" },
    }),
  );
});

test("a manifest names its id, version, contract, kinds, capabilities and entry", () => {
  const manifest = {
      id: "fake-route",
      version: "1.0.0",
      contract: 1,
      kinds: ["route"],
      capabilities: { route: [] },
      entry: "index.mjs",
    },
    entry = { id: "fake-route" };
  assert.equal(validateManifest(manifest, entry), manifest);
  for (const [change, pattern] of [
    [{ id: "other" }, /does not match/],
    [{ kinds: [] }, /kinds/],
    [{ kinds: ["queue"] }, /kinds/],
    [{ capabilities: { tracker: ["teleport"] } }, /may list only/],
    [{ entry: "../outside.mjs" }, /inside the plugin/],
    [{ entry: "/abs.mjs" }, /inside the plugin/],
  ])
    assert.throws(
      () => validateManifest({ ...manifest, ...change }, entry),
      pattern,
    );
});

test("approval is per id, version and content hash, on this machine only", () => {
  const { folder, options } = setup();
  let [plugin] = inspectPlugins(options);
  assert.equal(plugin.state, "unapproved");
  assert.equal(plugin.hash, contentHash(folder));
  assert.deepEqual(plugin.kinds, ["route"]);
  // A stale hash is refused: the person approves what they were shown.
  assert.throws(
    () => approvePlugin(options, { id: "fake-route", hash: "0".repeat(64) }),
    (error) => error.status === 409 && /Review it again/.test(error.message),
  );
  plugin = approve(options);
  assert.equal(plugin.state, "approved");
  assert.equal(
    readPluginSettings(options.settingsFile).approvals["fake-route"].hash,
    plugin.hash,
  );
  assert.ok(!fs.existsSync(path.join(options.workspaceRoot, ".avoozl.json")));

  // Any change to the plugin's files needs approval again.
  fs.appendFileSync(path.join(folder, "index.mjs"), "\n// changed\n");
  [plugin] = inspectPlugins(options);
  assert.equal(plugin.state, "changed");
  approve(options);

  // A version change too.
  const file = path.join(folder, "avoozl-plugin.json"),
    manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ ...manifest, version: "1.0.1" }));
  assert.equal(inspectPlugins(options)[0].state, "changed");
  approve(options);

  assert.equal(disablePlugin(options, { id: "fake-route" }).state, "disabled");
  assert.equal(
    disablePlugin(options, { id: "fake-route", disabled: false }).state,
    "approved",
  );
});

test("an unsupported contract, a wrong entry contract, and a duplicate id never load", () => {
  assert.equal(
    inspectPlugins(setup({ manifest: { contract: 2 } }).options)[0].state,
    "unsupported",
  );
  assert.match(
    inspectPlugins(setup({ entry: { contract: 2 } }).options)[0].reason,
    /expects contract version 2/,
  );
  const { options, folder } = setup();
  fs.writeFileSync(
    path.join(options.workspaceRoot, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      plugins: [
        {
          id: "fake-route",
          path: path.relative(options.workspaceRoot, folder),
          contract: 1,
        },
      ],
    }),
  );
  const found = inspectPlugins(options);
  assert.equal(found.length, 2);
  assert.ok(
    found.every(
      (p) => p.state === "invalid" && /more than once/.test(p.reason),
    ),
  );
});

test("an approved plugin runs as a child process over stdio and answers checked replies", async () => {
  const { options, state } = setup();
  const host = pluginHost(options);
  let session = host.open();
  assert.deepEqual(await session.use("fake-route", "route"), {
    ok: false,
    reason: "Not approved on this machine.",
  });
  await session.close();

  approve(options);
  session = host.open();
  const reply = await session.call("fake-route", "route", "submit", {
    task: { id: "t1" },
    brief: "Do t1.",
  });
  assert.deepEqual(reply, {
    id: "remote-t1",
    link: "https://route.example.test/work/remote-t1",
  });
  assert.equal(
    (await session.call("fake-route", "route", "status", { id: "remote-t1" }))
      .state,
    "queued",
  );
  assert.equal(
    await session.use("fake-route", "tracker").then((s) => s.ok),
    false,
  );
  await session.close();
  assert.deepEqual(state.read().calls, [
    ["submit", "t1"],
    ["status", "remote-t1"],
  ]);
});

for (const [mode, pattern] of [
  ["crash", /crashed \(exit 3\)/],
  ["invalid", /status reply state must be one of/],
  ["listen", /opened a network listener \(listen\)/],
]) {
  test(`a plugin that ${mode === "listen" ? "listens" : mode === "crash" ? "crashes" : "replies with an invalid shape"} is marked unavailable for this tick`, async () => {
    const { options, state } = setup();
    approve(options);
    const session = pluginHost(options).open();
    await session.call("fake-route", "route", "submit", {
      task: { id: "t1" },
      brief: "",
    });
    state.mode(mode);
    await assert.rejects(
      session.call("fake-route", "route", "status", { id: "remote-t1" }),
      (error) => pattern.test(error.reason),
    );
    assert.match(session.unavailable("fake-route"), pattern);
    assert.deepEqual(
      session.report().map((r) => r.state),
      ["unavailable"],
    );
    await session.close();
  });
}

test("a call that does not answer in its time limit stops the plugin", async () => {
  const { options, state } = setup();
  approve(options);
  const session = pluginHost({ ...options, timeoutMs: 3000 }).open();
  await session.call("fake-route", "route", "submit", {
    task: { id: "t1" },
    brief: "",
  });
  state.mode("hang");
  await assert.rejects(
    session.call("fake-route", "route", "status", { id: "remote-t1" }),
    (error) => /timed out/.test(error.reason),
  );
  await session.close();
});

test("a /proc/net/tcp address reads as lsof prints it", () => {
  assert.equal(procAddress("0100007F:B215"), "127.0.0.1:45589");
  assert.equal(procAddress("00000000:0050"), "0.0.0.0:80");
  assert.equal(
    procAddress("00000000000000000000000001000000:1F90"),
    "[::1]:8080",
  );
  assert.equal(
    procAddress("0000000000000000FFFF00000100007F:0016"),
    "[::ffff:7f00:1]:22",
  );
});

test("the socket check stops a plugin that listens past the guard", async () => {
  // With the in-process guard off, only the listening-socket check is left.
  const { options, state } = setup();
  approve(options);
  const pids = [];
  const session = pluginHost({
    ...options,
    guard: false,
    checkListeners: async (pid) => {
      pids.push(pid);
      return listeningSockets(pid);
    },
  }).open();
  await session.call("fake-route", "route", "submit", {
    task: { id: "t1" },
    brief: "",
  });
  assert.deepEqual(await listeningSockets(pids[0]), [], "nothing listens yet");
  state.mode("listen");
  await assert.rejects(
    session.call("fake-route", "route", "status", { id: "remote-t1" }),
    (error) =>
      /opened a network listener \(127\.0\.0\.1:\d+\)/.test(error.reason),
  );
  await session.close();
  assert.equal(alive(pids[0]), false, "the listening plugin was stopped");
});

test("Add plugin warns before writing a plugins entry into .avoozl.json; remove keeps nothing", () => {
  const { options } = setup();
  const entry = { id: "fake-two", path: "plugins/two", contract: 1 };
  assert.throws(
    () => addPlugin(options, { scope: "repository", entry }),
    (error) =>
      error.code === "plugin-public-repository" && error.status === 409,
  );
  assert.throws(
    () =>
      addPlugin(
        options,
        { scope: "repository", entry },
        { visibility: "public" },
      ),
    /This repository is public/,
  );
  addPlugin(options, { scope: "repository", entry, confirmPublic: true });
  const policy = JSON.parse(
    fs.readFileSync(path.join(options.workspaceRoot, ".avoozl.json"), "utf8"),
  );
  assert.deepEqual(policy.plugins, [entry]);
  assert.equal(
    inspectPlugins(options).find((p) => p.id === "fake-two").state,
    "missing",
  );
  assert.throws(
    () => addPlugin(options, { entry: { ...entry } }),
    /already declared/,
  );
  removePlugin(options, { id: "fake-two" });
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(options.workspaceRoot, ".avoozl.json"), "utf8"),
    ).plugins,
    undefined,
  );
  approve(options);
  removePlugin(options, { id: "fake-route" });
  assert.deepEqual(readPluginSettings(options.settingsFile), {
    plugins: [],
    approvals: {},
    disabled: [],
    pins: {},
  });
});

test(".avoozl.json may declare a plugin that names its credential's variable", () => {
  const { options } = setup();
  const write = (plugins) =>
    fs.writeFileSync(
      path.join(options.workspaceRoot, ".avoozl.json"),
      JSON.stringify({ version: 1, delivery: {}, plugins }),
    );
  write([
    {
      id: "example-tracker",
      package: "@example/avoozl-tracker",
      contract: 1,
      config: {
        tokenEnv: "EXAMPLE_TRACKER_TOKEN",
        allowedActors: ["maintainer"],
      },
    },
  ]);
  assert.equal(readDeliveryPolicy(options.workspaceRoot).status, "loaded");
  write([{ id: "github", path: "x", contract: 1 }]);
  assert.match(readDeliveryPolicy(options.workspaceRoot).error, /reserved/);
  write([{ id: "x", path: "x", contract: 1, config: { token: "abc" } }]);
  assert.match(
    readDeliveryPolicy(options.workspaceRoot).error,
    /secret-like key/,
  );
});
