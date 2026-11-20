// plugin-credentials pc-1.1 and pc-1.2: the credentials part, its reply,
// and who signs Avoozl in for each owner. Fake plugins come from the test
// tree; a fake `gh` stands in for the real one; every token is made up.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  PluginProcess,
  addPlugin,
  approvePlugin,
  disablePlugin,
  inspectPlugins,
  pluginHost,
  readPluginSettings,
  removePlugin,
  validateManifest,
  writePluginSettings,
} from "../../plugins/plugins.mjs";
import { checkReply } from "../../plugins/plugin-contract.mjs";
import {
  credentialsProblems,
  machineCredentials,
  pickCredentials,
} from "../github-credentials.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
import {
  MANIFEST,
  call,
  credentialsMachine as machine,
  pluginFolder,
} from "../../test/github-credentials.mjs";

const REPO_ROOT = path.join(import.meta.dirname, "..", "..", "..", "..");

// ---- pc-1.1 the part ---------------------------------------------------

test("D1's manifest validates and inspect carries its hosts and owners", (t) => {
  const m = machine({ plugins: [{}] });
  t.after(() => {});
  assert.doesNotThrow(() => validateManifest(MANIFEST, { id: "acme-github" }));
  const plugin = inspectPlugins(m.options)[0];
  assert.deepEqual(plugin.credentials, {
    hosts: ["github.com"],
    owners: ["acme"],
  });
  assert.equal(plugin.state, "unapproved");
});

test("a bad credentials key is refused, naming it", () => {
  const check = (change, pattern) =>
    assert.throws(
      () => validateManifest({ ...MANIFEST, ...change }, { id: "acme-github" }),
      pattern,
    );
  const part = (credentials) => ({ credentials });
  check({ provides: ["pack"] }, /credentials goes with provides credentials/);
  check(
    part({ entry: "../token.mjs", hosts: ["github.com"] }),
    /credentials\.entry/,
  );
  check(
    part({ entry: "/abs/token.mjs", hosts: ["github.com"] }),
    /credentials\.entry/,
  );
  check(part({ entry: "token.mjs", hosts: [] }), /credentials\.hosts/);
  check(
    part({ entry: "token.mjs", hosts: ["github.com", "github.com"] }),
    /credentials\.hosts/,
  );
  check(
    part({ entry: "token.mjs", hosts: ["GitHub.com"] }),
    /credentials\.hosts/,
  );
  check(
    part({
      entry: "token.mjs",
      hosts: Array.from({ length: 11 }, (_, i) => `h${i}.example.com`),
    }),
    /credentials\.hosts/,
  );
  check(
    part({ entry: "token.mjs", hosts: ["github.com"], owners: [] }),
    /credentials\.owners/,
  );
  check(
    part({
      entry: "token.mjs",
      hosts: ["github.com"],
      owners: ["acme", "ACME"],
    }),
    /credentials\.owners/,
  );
  check(
    part({
      entry: "token.mjs",
      hosts: ["github.com"],
      owners: Array.from({ length: 101 }, (_, i) => `o${i}`),
    }),
    /credentials\.owners/,
  );
  check(
    part({ entry: "token.mjs", hosts: ["github.com"], scope: "x" }),
    /credentials\.scope is not a credentials setting/,
  );
});

test("a credentials plugin in .avoozl.json is invalid, never approved, and Add plugin refuses that scope", () => {
  const root = temporaryDirectory("avoozl-credentials-repo-"),
    workspaceRoot = path.join(root, "workspace"),
    settingsFile = path.join(root, "config", "plugins.json");
  fs.mkdirSync(workspaceRoot);
  pluginFolder(workspaceRoot, "acme-github");
  fs.writeFileSync(
    path.join(workspaceRoot, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      plugins: [{ id: "acme-github", path: "acme-github", contract: 1 }],
    }),
  );
  const options = { workspaceRoot, settingsFile },
    [plugin] = inspectPlugins(options);
  assert.equal(plugin.state, "invalid");
  assert.match(
    plugin.reason,
    /^\.avoozl\.json plugins\.0: plugin acme-github provides credentials/,
  );
  assert.throws(
    () => approvePlugin(options, { id: "acme-github", hash: "x" }),
    /cannot be approved/,
  );
  // `avoozl check` reports it with the file and key.
  assert.deepEqual(
    credentialsProblems(options).map((p) => p.slice(0, 26)),
    [".avoozl.json plugins.0: pl"],
  );
  pluginFolder(workspaceRoot, "acme-two");
  assert.throws(
    () =>
      addPlugin(
        options,
        {
          scope: "repository",
          entry: { id: "acme-two", path: "acme-two", contract: 1 },
        },
        { visibility: "private" },
      ),
    /only this machine's plugins\.json may declare who Avoozl signs in as/,
  );
});

test("the credentials child loads the credentials entry only, and serves nothing else", async (t) => {
  const m = machine({ plugins: [{}] });
  m.approve();
  const plugin = inspectPlugins(m.options)[0],
    child = new PluginProcess(plugin, {
      timeoutMs: 5000,
      deadline: Number.POSITIVE_INFINITY,
      guard: true,
      checkListeners: async () => [],
    });
  t.after(() => child.close());
  const hello = await child.request("hello", {
    entry: path.join(plugin.location, "token.mjs"),
    config: {},
    kind: "credentials",
  });
  assert.deepEqual(hello.kinds, ["credentials"]);
  await assert.rejects(child.request("intake.poll", {}), /has no intake\.poll/);
});

const LATER = (ms) => new Date(Date.now() + ms).toISOString();
const GOOD = {
  token: "ghs_" + "x".repeat(36),
  expiresAt: LATER(3600_000),
  login: "acme-bot[bot]",
  person: "acme-dev",
  granted: { metadata: "read", contents: "write" },
};
const ASKED = { metadata: "read", contents: "write" };

test("credentialsReplies.token checks every field and what was granted", () => {
  const ok = checkReply("credentials", "token", GOOD, ASKED);
  assert.equal(ok.broader, false);
  assert.equal(ok.person, "acme-dev");
  const refused = (change, pattern) =>
    assert.throws(
      () => checkReply("credentials", "token", { ...GOOD, ...change }, ASKED),
      pattern,
    );
  refused({ token: "has space" }, /token reply token/);
  refused({ token: "line\nbreak" }, /token reply token/);
  refused({ token: "a".repeat(8193) }, /token reply token/);
  refused({ expiresAt: LATER(30_000) }, /expiresAt/);
  refused({ expiresAt: LATER(25 * 3600_000) }, /expiresAt/);
  refused({ login: "two words" }, /login/);
  refused({ person: "acme-bot[bot]" }, /person/);
  refused({ extra: 1 }, /extra is not a reply field/);
  refused(
    { granted: { metadata: "read", contents: "read" } },
    /granted contents: read; the job needs contents: write/,
  );
  assert.equal(
    checkReply("credentials", "token", { ...GOOD, granted: "all" }, ASKED)
      .broader,
    true,
  );
  assert.equal(
    checkReply(
      "credentials",
      "token",
      { ...GOOD, granted: { ...ASKED, issues: "write" } },
      ASKED,
    ).broader,
    true,
  );
});

// ---- pc-1.2 the provider per owner ---------------------------------------

test("with no plugin, AVOOZL_GITHUB_TOKEN picks env and none picks gh, run without blocking", async () => {
  const m = machine();
  const env = await call(
    m.credentials({ AVOOZL_GITHUB_TOKEN: "env-token" }),
    "octo/tools",
  );
  assert.equal(env.provider, "env");
  assert.equal(env.login, "env-person");
  assert.equal(env.granted, "all");
  assert.equal(env.expiresAt, null);
  assert.deepEqual(m.ghRuns(), []);
  let ticks = 0;
  const timer = setInterval(() => ticks++, 10),
    gh = await call(m.credentials({ GH_TOKEN: "ignored" }), "octo/tools");
  clearInterval(timer);
  assert.equal(gh.provider, "gh");
  assert.equal(
    gh.token,
    "gh-token-1",
    "GH_TOKEN is gh's to read, not Avoozl's",
  );
  assert.equal(gh.login, "mtdowling");
  assert.deepEqual(m.ghRuns(), ["auth token --hostname github.com"]);
  assert.ok(ticks > 3, "the event loop ran while gh did");
});

test("a missing or signed-out gh refuses with how to sign in", async () => {
  const m = machine({ ghToken: null });
  await assert.rejects(
    call(m.credentials(), "octo/tools"),
    /Run `gh auth login`, or set AVOOZL_GITHUB_TOKEN\./,
  );
});

test("an approved plugin serves only its owners; a never-approved one claims nothing", async () => {
  const m = machine({ plugins: [{}] }),
    before = m.credentials();
  assert.equal((await call(before, "acme/api")).provider, "gh");
  m.approve();
  const credentials = m.credentials(),
    acme = await call(credentials, "acme/api"),
    octo = await call(credentials, "octo/tools");
  assert.equal(acme.provider, "acme-github");
  assert.equal(acme.login, "acme-bot[bot]");
  assert.equal(acme.person, "acme-dev");
  assert.equal(octo.provider, "gh");
  assert.deepEqual(
    m.calls().map((c) => [c.repository, c.purpose]),
    [["acme/api", "check-in"]],
  );
  credentials.close();
});

test("a changed plugin refuses for its owners and gh is never run for them", async () => {
  const m = machine({ plugins: [{}] });
  m.approve();
  const folder = inspectPlugins(m.options)[0].location;
  fs.appendFileSync(path.join(folder, "token.mjs"), "\n// changed\n");
  const credentials = m.credentials();
  await assert.rejects(
    call(credentials, "acme/api"),
    /Approve acme-github again/,
  );
  assert.deepEqual(m.ghRuns(), []);
  assert.equal((await call(credentials, "octo/tools")).provider, "gh");
  assert.deepEqual(m.ghRuns(), ["auth token --hostname github.com"]);
});

test("two plugins claiming one owner refuse until one is picked; disjoint owners never clash", async () => {
  const m = machine({
    plugins: [
      {},
      { id: "acme-github-two" },
      {
        id: "labs",
        manifest: {
          credentials: { ...MANIFEST.credentials, owners: ["acme-labs"] },
        },
      },
    ],
  });
  for (const id of ["acme-github", "acme-github-two", "labs"]) m.approve(id);
  const credentials = m.credentials();
  await assert.rejects(call(credentials, "acme/api"), /both claim acme/);
  assert.equal((await call(credentials, "acme-labs/x")).provider, "labs");
  pickCredentials(m.options, { host: "github.com", id: "acme-github-two" });
  assert.equal(
    (await call(credentials, "acme/api")).provider,
    "acme-github-two",
  );
  removePlugin(m.options, { id: "acme-github-two" });
  assert.equal(
    readPluginSettings(m.settingsFile).credentialsPick?.["github.com"],
    undefined,
  );
  credentials.close();
});

test("removing, disabling or dropping an owner moves the next call to the built-in", async () => {
  const m = machine({ plugins: [{}] });
  m.approve();
  const credentials = m.credentials();
  assert.equal((await call(credentials, "acme/api")).provider, "acme-github");
  disablePlugin(m.options, { id: "acme-github" });
  assert.equal((await call(credentials, "acme/web")).provider, "gh");
  disablePlugin(m.options, { id: "acme-github", disabled: false });
  const folder = inspectPlugins(m.options)[0].location;
  fs.writeFileSync(
    path.join(folder, "avoozl-plugin.json"),
    JSON.stringify({
      ...MANIFEST,
      version: "1.1.0",
      credentials: { ...MANIFEST.credentials, owners: ["other"] },
    }),
  );
  m.approve();
  assert.equal((await call(credentials, "acme/api", "land")).provider, "gh");
  removePlugin(m.options, { id: "acme-github" });
  assert.equal(
    (await call(credentials, "acme/api", "evidence")).provider,
    "gh",
  );
  credentials.close();
});

test("the credentials child lives on across calls, restarts at most once a minute, and stops on a change", async () => {
  const m = machine({ plugins: [{}] });
  m.approve();
  const credentials = m.credentials();
  await call(credentials, "acme/api");
  await call(credentials, "acme/web");
  const pids = new Set(m.calls().map((c) => c.pid));
  assert.equal(pids.size, 1, "one child for both calls");
  credentials.close();

  const crashing = machine({ plugins: [{ config: { mode: "crash" } }] });
  crashing.approve();
  const broken = crashing.credentials();
  await assert.rejects(call(broken, "acme/api"), /acme-github/);
  await assert.rejects(call(broken, "acme/web"), /acme-github/);
  assert.equal(crashing.calls().length, 1, "not started again within a minute");
  broken.close();
});

test("localToken and its GH_TOKEN and GITHUB_TOKEN reads are gone", () => {
  let hits = "";
  try {
    hits = execFileSync("git", ["grep", "-n", "localToken", "--", "src"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
  } catch {
    hits = "";
  }
  assert.equal(hits.replace(/^.*test\.mjs:.*$\n?/gm, ""), "");
  const client = fs.readFileSync(
    path.join(REPO_ROOT, "src", "app", "github", "github.mjs"),
    "utf8",
  );
  assert.doesNotMatch(client, /process\.env\.(GH_TOKEN|GITHUB_TOKEN)/);
});
