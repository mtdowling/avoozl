// Task 8.6: plugin loading and trust (design §4.8, Requirement 34). The fake
// probe plugin from the test tree, copied into a temporary folder, declared
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
  netstatListeners,
  pluginHost,
  procAddress,
  readPluginSettings,
  removePlugin,
  validateEntry,
  validateManifest,
  writePluginSettings,
  pluginApprovalNeedsYou,
} from "../plugins.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { readDeliveryPolicy } from "../../tick/tick.ts";
import type { Refusal } from "../../test/refusal.ts";
import { found } from "../../test/view-shapes.ts";

// A plugin call's refusal: why the plugin is unavailable.
type Unavailable = Error & { reason: string };

const FIXTURE = path.join(
  import.meta.dirname,
  "..",
  "..",
  "test",
  "fixtures",
  "plugins",
);

function setup({
  entry = {},
  manifest,
}: {
  entry?: Record<string, unknown>;
  manifest?: Record<string, unknown>;
} = {}) {
  const root = temporaryDirectory("avoozl-plugins-"),
    workspaceRoot = path.join(root, "workspace"),
    folder = path.join(root, "fake-probe"),
    stateFile = path.join(root, "probe-state.json"),
    settingsFile = path.join(root, "config", "plugins.json");
  fs.mkdirSync(workspaceRoot);
  fs.cpSync(path.join(FIXTURE, "fake-probe"), folder, { recursive: true });
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
        id: "fake-probe",
        path: folder,
        contract: 1,
        config: { stateFile },
        ...entry,
      },
    ],
  });
  const options = { workspaceRoot, settingsFile };
  const state: {
    read: () => Record<string, unknown>;
    mode: (mode: string) => void;
  } = {
    read: () => JSON.parse(fs.readFileSync(stateFile, "utf8")),
    mode(mode) {
      const value = state.read();
      value.mode = mode;
      fs.writeFileSync(stateFile, JSON.stringify(value));
    },
  };
  return { root, folder, options, state };
}

const approve = (options: ReturnType<typeof setup>["options"]) => {
  const plugin = found(inspectPlugins(options)[0]);
  assert.ok("hash" in plugin, "the plugin has a hash");
  return found(approvePlugin(options, { id: plugin.id, hash: plugin.hash }));
};

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test("an entry names one of package or path, no reserved id, no credential", () => {
  const entry = { id: "fake-probe", path: "../x", contract: 1 };
  assert.equal(validateEntry(entry), entry);
  const refusedEntries: [Record<string, unknown>, RegExp][] = [
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
  ];
  for (const [change, pattern] of refusedEntries)
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
      id: "fake-probe",
      version: "1.0.0",
      contract: 1,
      kinds: ["rules"],
      capabilities: { rules: [] },
      entry: "index.mjs",
    },
    entry = { id: "fake-probe" };
  assert.equal(validateManifest(manifest, entry), manifest);
  const refusedManifests: [Record<string, unknown>, RegExp][] = [
    [{ id: "other" }, /does not match/],
    [{ kinds: [] }, /kinds/],
    [{ kinds: ["queue"] }, /kinds/],
    [{ capabilities: { rules: ["teleport"] } }, /may list only/],
    [{ kinds: ["route"] }, /kinds/],
    [{ kinds: ["tracker"] }, /kinds/],
    [{ kinds: ["gate"] }, /kinds/],
    [{ capabilities: { tracker: [] } }, /is not a kind/],
    [{ entry: "../outside.mjs" }, /inside the plugin/],
    [{ entry: "/abs.mjs" }, /inside the plugin/],
  ];
  for (const [change, pattern] of refusedManifests)
    assert.throws(
      () => validateManifest({ ...manifest, ...change }, entry),
      pattern,
    );
});

test("a manifest that lists a part other than rules, credentials, checks or context is refused naming it", () => {
  const manifest = {
    id: "fake-probe",
    version: "1.0.0",
    contract: 1,
    provides: ["rules"],
    entry: "index.mjs",
  };
  for (const part of ["pack", "intake", "template", "policy"])
    assert.throws(
      () =>
        validateManifest(
          { ...manifest, provides: ["rules", part] },
          { id: "fake-probe" },
        ),
      (error: Error) => error.message === `${part} is not a plugin part.`,
    );
  assert.ok(
    validateManifest(
      { ...manifest, provides: ["rules", "context"] },
      { id: "fake-probe" },
    ),
  );
});

test("approval is per id, version and content hash, on this machine only", () => {
  const { folder, options } = setup();
  const inspected = found(inspectPlugins(options)[0]);
  assert.equal(inspected.state, "unapproved");
  assert.ok("hash" in inspected && "kinds" in inspected);
  assert.equal(inspected.hash, contentHash(folder));
  // Needs you lists it until it is approved (simplify §D13).
  assert.deepEqual(
    pluginApprovalNeedsYou(options).map((item) => [item.id, item.reason]),
    [["plugin-approval:fake-probe", "plugin-approval"]],
  );
  assert.deepEqual(inspected.kinds, ["rules"]);
  // A stale hash is refused: the person approves what they were shown.
  assert.throws(
    () => approvePlugin(options, { id: "fake-probe", hash: "0".repeat(64) }),
    (error: Refusal) =>
      error.status === 409 && /Review it again/.test(error.message),
  );
  const approved = approve(options);
  assert.equal(approved.state, "approved");
  assert.deepEqual(pluginApprovalNeedsYou(options), []);
  assert.ok("hash" in approved);
  assert.equal(
    readPluginSettings(options.settingsFile).approvals["fake-probe"]?.hash,
    approved.hash,
  );
  assert.ok(!fs.existsSync(path.join(options.workspaceRoot, ".avoozl.json")));

  // Any change to the plugin's files needs approval again.
  fs.appendFileSync(path.join(folder, "index.mjs"), "\n// changed\n");
  assert.equal(inspectPlugins(options)[0]?.state, "changed");
  approve(options);

  // A version change too.
  const file = path.join(folder, "avoozl-plugin.json"),
    manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ ...manifest, version: "1.0.1" }));
  assert.equal(inspectPlugins(options)[0]?.state, "changed");
  approve(options);

  assert.equal(
    found(disablePlugin(options, { id: "fake-probe" })).state,
    "disabled",
  );
  assert.equal(
    found(disablePlugin(options, { id: "fake-probe", disabled: false })).state,
    "approved",
  );
});

test("an unsupported contract, a wrong entry contract, and a duplicate id never load", () => {
  assert.equal(
    inspectPlugins(setup({ manifest: { contract: 2 } }).options)[0]?.state,
    "unsupported",
  );
  assert.match(
    inspectPlugins(setup({ entry: { contract: 2 } }).options)[0]?.reason ?? "",
    /expects contract version 2/,
  );
  const { options, folder } = setup();
  fs.writeFileSync(
    path.join(options.workspaceRoot, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      plugins: [
        {
          id: "fake-probe",
          path: path.relative(options.workspaceRoot, folder),
          contract: 1,
        },
      ],
    }),
  );
  const inspected = inspectPlugins(options);
  assert.equal(inspected.length, 2);
  assert.ok(
    inspected.every(
      (p) => p.state === "invalid" && /more than once/.test(p.reason ?? ""),
    ),
  );
});

test("an approved plugin runs as a child process over stdio and answers checked replies", async () => {
  const { options, state } = setup();
  const host = pluginHost(options);
  let session = host.open();
  assert.deepEqual(await session.use("fake-probe", "rules"), {
    ok: false,
    reason: "Not approved on this machine.",
  });
  await session.close();

  approve(options);
  session = host.open();
  const reply = await session.call("fake-probe", "rules", "ruleSets", {});
  assert.deepEqual(reply, { sets: [] });
  assert.equal(
    await session.use("fake-probe", "credentials").then((s) => s.ok),
    false,
  );
  await session.close();
  assert.deepEqual(state.read().calls, [["ruleSets"]]);
});

test("a local plugin changed after it was inspected is refused before it starts", async () => {
  const { options, folder, state } = setup();
  approve(options);
  const session = pluginHost(options).open();
  fs.appendFileSync(path.join(folder, "avoozl-plugin.json"), "\n");
  const refused = found(await session.use("fake-probe", "rules"));
  assert.equal(refused.ok, false);
  assert.match(refused.reason ?? "", /changed after it was approved/);
  await session.close();
  assert.deepEqual(state.read().calls ?? [], []);
});

const failures: [string, RegExp][] = [
  ["crash", /crashed \(exit 3\)/],
  ["invalid", /ruleSets reply must be/],
  ["listen", /opened a network listener \(listen\)/],
];
for (const [mode, pattern] of failures) {
  test(`a plugin that ${mode === "listen" ? "listens" : mode === "crash" ? "crashes" : "replies with an invalid shape"} is marked unavailable for this tick`, async () => {
    const { options, state } = setup();
    approve(options);
    const session = pluginHost(options).open();
    await session.call("fake-probe", "rules", "ruleSets", {});
    state.mode(mode);
    await assert.rejects(
      session.call("fake-probe", "rules", "ruleSets", {}),
      (error: Unavailable) => pattern.test(error.reason),
    );
    assert.match(session.unavailable("fake-probe") ?? "", pattern);
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
  await session.call("fake-probe", "rules", "ruleSets", {});
  state.mode("hang");
  await assert.rejects(
    session.call("fake-probe", "rules", "ruleSets", {}),
    (error: Unavailable) => /timed out/.test(error.reason),
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

test("netstat rows read as listeners only for the plugin's own pid", () => {
  const text = [
    "",
    "Active Connections",
    "",
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       900",
    "  TCP    127.0.0.1:50123        0.0.0.0:0              ABHÖREN         4242",
    "  TCP    127.0.0.1:50124        127.0.0.1:443          ESTABLISHED     4242",
    "  TCP    [::1]:8080             [::]:0                 LISTENING       4242",
    "  UDP    0.0.0.0:5353           *:*                                    4242",
  ].join("\r\n");
  assert.deepEqual(netstatListeners(text, 4242), [
    "127.0.0.1:50123",
    "[::1]:8080",
  ]);
  assert.deepEqual(netstatListeners(text, 1), []);
});

test("the socket check stops a plugin that listens past the guard", async () => {
  // With the in-process guard off, only the listening-socket check is left.
  const { options, state } = setup();
  approve(options);
  const pids: number[] = [];
  const session = pluginHost({
    ...options,
    guard: false,
    checkListeners: async (pid: number) => {
      pids.push(pid);
      return listeningSockets(pid);
    },
  }).open();
  await session.call("fake-probe", "rules", "ruleSets", {});
  assert.deepEqual(
    await listeningSockets(found(pids[0])),
    [],
    "nothing listens yet",
  );
  state.mode("listen");
  await assert.rejects(
    session.call("fake-probe", "rules", "ruleSets", {}),
    (error: Unavailable) =>
      /opened a network listener \(127\.0\.0\.1:\d+\)/.test(error.reason),
  );
  await session.close();
  assert.equal(
    alive(found(pids[0])),
    false,
    "the listening plugin was stopped",
  );
});

test("Add plugin warns before writing a plugins entry into .avoozl.json; remove keeps nothing", () => {
  const { options } = setup();
  const entry = { id: "fake-two", path: "plugins/two", contract: 1 };
  assert.throws(
    () => addPlugin(options, { scope: "repository", entry }),
    (error: Refusal & { code?: string }) =>
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
    inspectPlugins(options).find((p) => p.id === "fake-two")?.state,
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
  removePlugin(options, { id: "fake-probe" });
  assert.deepEqual(readPluginSettings(options.settingsFile), {
    plugins: [],
    approvals: {},
    disabled: [],
    pins: {},
  });
});

test(".avoozl.json may declare a plugin that names its credential's variable", () => {
  const { options } = setup();
  const write = (plugins: Record<string, unknown>[]) =>
    fs.writeFileSync(
      path.join(options.workspaceRoot, ".avoozl.json"),
      JSON.stringify({ version: 1, delivery: {}, plugins }),
    );
  write([
    {
      id: "example-intake",
      package: "@example/avoozl-intake",
      contract: 1,
      config: {
        tokenEnv: "EXAMPLE_INTAKE_TOKEN",
        allowedActors: ["maintainer"],
      },
    },
  ]);
  assert.equal(readDeliveryPolicy(options.workspaceRoot).status, "loaded");
  write([{ id: "github", path: "x", contract: 1 }]);
  assert.match(
    readDeliveryPolicy(options.workspaceRoot).error ?? "",
    /reserved/,
  );
  write([{ id: "x", path: "x", contract: 1, config: { token: "abc" } }]);
  assert.match(
    readDeliveryPolicy(options.workspaceRoot).error ?? "",
    /secret-like key/,
  );
});
