// The sandbox for unattended process children (R95.6): with a fake home,
// every secret path is unreadable and unwritable from a child, writes stay in
// the write roots, and the network is off or limited to named loopback ports.
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import {
  catalogWorkspaceRoots,
  confineChild,
  sandboxEnv,
  sandboxKind,
  sandboxNetwork,
  sandboxProfile,
  sandboxSecretPaths,
} from "../sandbox.mjs";

const definition = { name: "fake-cli", hash: "a".repeat(64) };
const kind = sandboxKind();
const real = (file) => fs.realpathSync.native(file);

function scratch(t) {
  const root = real(fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-sandbox-")));
  t.after(() =>
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10 }),
  );
  const home = path.join(root, "home");
  const configDirectory = path.join(home, ".config", "avoozl");
  const stateDirectory = path.join(home, ".local", "state", "avoozl");
  const workspace = path.join(root, "workspace");
  const worktree = path.join(root, "worktree");
  const tmp = path.join(root, "tmp");
  for (const dir of [worktree, tmp]) fs.mkdirSync(dir, { recursive: true });
  // One file in each secret place, as a real machine would have it.
  const secrets = {
    gh: path.join(home, ".config", "gh", "hosts.yml"),
    gitCredentials: path.join(home, ".git-credentials"),
    xdgGitCredentials: path.join(home, ".config", "git", "credentials"),
    netrc: path.join(home, ".netrc"),
    ssh: path.join(home, ".ssh", "id_ed25519"),
    aws: path.join(home, ".aws", "credentials"),
    codex: path.join(home, ".codex", "auth.json"),
    kirocrew: path.join(home, ".kiro", "crew", "gateway.secret"),
    config: path.join(configDirectory, "harness-approvals.json"),
    state: path.join(stateDirectory, "supervisor", "supervisor.sqlite"),
    database: path.join(workspace, ".avoozl", "local", "workspace.sqlite"),
  };
  for (const file of Object.values(secrets)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "secret\n");
  }
  fs.rmSync(secrets.database);
  const db = new DatabaseSync(secrets.database);
  db.exec("CREATE TABLE tasks (id TEXT)");
  db.close();
  // The catalog names the workspace, so its database is found from there.
  const catalog = new DatabaseSync(path.join(stateDirectory, "catalog.sqlite"));
  catalog.exec("CREATE TABLE workspaces (id TEXT, root TEXT)");
  catalog.prepare("INSERT INTO workspaces VALUES ('w', ?)").run(workspace);
  catalog.close();
  return {
    root,
    home,
    configDirectory,
    stateDirectory,
    workspace,
    worktree,
    tmp,
    secrets,
    env: { PATH: process.env.PATH, HOME: home },
  };
}

function secretPaths(s) {
  return sandboxSecretPaths({
    home: s.home,
    env: s.env,
    configDirectory: s.configDirectory,
    stateDirectory: s.stateDirectory,
    workspaceRoots: catalogWorkspaceRoots(
      path.join(s.stateDirectory, "catalog.sqlite"),
    ),
  });
}

// The child: try each action and print what happened, as JSON.
const PROBE = `
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const [plan] = process.argv.slice(1);
const { reads, writes, port } = JSON.parse(plan);
const out = { read: {}, write: {}, net: null };
const tryIt = (fn) => { try { fn(); return "ok"; } catch (e) { return e.code || e.message; } };
for (const [name, file] of Object.entries(reads))
  out.read[name] = tryIt(() => fs.readFileSync(file));
for (const [name, file] of Object.entries(writes))
  out.write[name] = tryIt(() => fs.writeFileSync(file, "changed"));
if (!port) console.log(JSON.stringify(out));
else {
  const socket = net.connect(port, "127.0.0.1");
  socket.on("connect", () => { out.net = "ok"; socket.end(); console.log(JSON.stringify(out)); });
  socket.on("error", (e) => { out.net = e.code; console.log(JSON.stringify(out)); });
}
`;

function run(argv, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { env });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      try {
        resolve(JSON.parse(stdout.trim().split("\n").pop()));
      } catch {
        reject(Error(`child exited ${code}: ${stdout}\n${stderr}`));
      }
    });
  });
}

test("the secret paths cover gh, git, keys, Avoozl, Kiro Crew and each workspace database", (t) => {
  const s = scratch(t);
  const paths = secretPaths(s);
  for (const [name, file] of Object.entries(s.secrets))
    assert.ok(
      paths.some((p) => file === p || file.startsWith(p + path.sep)),
      `${name} (${file}) is not covered`,
    );
  // A named Kiro Crew home and gh folder count too.
  const named = sandboxSecretPaths({
    home: s.home,
    env: {
      KIROCREW_HOME: path.join(s.root, "crew2"),
      GH_CONFIG_DIR: path.join(s.root, "gh2"),
    },
  });
  assert.ok(named.includes(path.join(s.root, "crew2")));
  assert.ok(named.includes(path.join(s.root, "gh2")));
});

test("the child environment drops credentials and keeps the speed-bump markers", () => {
  const env = sandboxEnv(
    {
      PATH: "/bin",
      HOME: "/h",
      GH_TOKEN: "t",
      GITHUB_TOKEN: "t",
      OPENAI_API_KEY: "k",
      ANTHROPIC_API_KEY: "k",
      AWS_SESSION_TOKEN: "t",
      AWS_PROFILE: "p",
      SSH_AUTH_SOCK: "/s",
      GIT_ASKPASS: "/a",
      KIROCREW_GATEWAY_SECRET: "s",
      KIROCREW_SPAWNED: "1",
      AVOOZL_CHILD: "process-1",
      AVOOZL_WORKSPACE: "/w",
      GIT_CONFIG_COUNT: "3",
      GIT_CONFIG_KEY_2: "credential.helper",
    },
    { keep: ["ANTHROPIC_API_KEY"] },
  );
  assert.deepEqual(env, {
    PATH: "/bin",
    HOME: "/h",
    ANTHROPIC_API_KEY: "k",
    KIROCREW_SPAWNED: "1",
    AVOOZL_CHILD: "process-1",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "credential.helper",
    GIT_CONFIG_VALUE_0: "",
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
  });
});

test("the network setting is off or named loopback ports only", () => {
  assert.deepEqual(sandboxNetwork(undefined), { mode: "off", ports: [] });
  assert.deepEqual(sandboxNetwork(["localhost:8080"]), {
    mode: "restricted",
    ports: [8080],
  });
  for (const bad of [
    [],
    ["example.com:443"],
    ["*:443"],
    ["localhost:70000"],
    "on",
  ])
    assert.throws(() => sandboxNetwork(bad), /sandbox.network/);
});

test("with no sandbox a child is refused unless the person opted this machine in", (t) => {
  const s = scratch(t);
  const options = {
    definition,
    configDirectory: s.configDirectory,
    writeRoots: [s.worktree],
    secrets: [],
    env: s.env,
    kind: null,
  };
  assert.throws(() => confineChild(["agent"], options), /no sandbox/);
  fs.writeFileSync(
    path.join(s.configDirectory, "harness-unconfined.json"),
    JSON.stringify({ "fake-cli": "b".repeat(64) }),
  );
  assert.throws(() => confineChild(["agent"], options), /no sandbox/);
  fs.writeFileSync(
    path.join(s.configDirectory, "harness-unconfined.json"),
    JSON.stringify({ "fake-cli": definition.hash }),
  );
  const confined = confineChild(["agent", "--x"], options);
  assert.deepEqual(confined.argv, ["agent", "--x"]);
  assert.equal(confined.sandbox, null);
  assert.equal(confined.env.GIT_CONFIG_VALUE_0, "");
});

test("a child with its own sandbox off runs only inside Avoozl's sandbox", (t) => {
  const s = scratch(t);
  const argv = ["agent", "--sandbox", "danger-full-access"];
  const options = {
    definition,
    configDirectory: s.configDirectory,
    writeRoots: [s.worktree],
    secrets: [],
    env: s.env,
  };
  // Refused with no Avoozl sandbox, even with this machine's opt-in.
  fs.writeFileSync(
    path.join(s.configDirectory, "harness-unconfined.json"),
    JSON.stringify({ "fake-cli": definition.hash }),
  );
  assert.throws(
    () => confineChild(argv, { ...options, kind: null }),
    /runs only inside Avoozl's sandbox/,
  );
  // Refused inside the sandbox with no write roots.
  assert.throws(
    () =>
      confineChild(argv, {
        ...options,
        writeRoots: null,
        kind: "sandbox-exec",
      }),
    /needs write roots/,
  );
  // Allowed inside it, with the write roots in the profile.
  const confined = confineChild(argv, { ...options, kind: "sandbox-exec" });
  assert.equal(confined.sandbox, "sandbox-exec");
  assert.deepEqual(confined.argv.slice(0, 2), ["/usr/bin/sandbox-exec", "-p"]);
  assert.match(confined.argv[2], /\(deny file-write\*\)/);
  const root = fs.realpathSync.native(s.worktree).replace(/\\/g, "\\\\");
  assert.ok(confined.argv[2].includes(`(subpath "${root}")`));
  assert.deepEqual(confined.argv.slice(3), argv);
});

test("a write root inside a secret folder is refused", (t) => {
  const s = scratch(t);
  assert.throws(
    () =>
      confineChild(["agent"], {
        definition,
        writeRoots: [path.join(s.home, ".kiro", "crew", "x")],
        secrets: secretPaths(s),
        kind: "sandbox-exec",
      }),
    /inside .*\.kiro/,
  );
});

test("the macOS profile denies secrets after the write roots and keeps the keychain out", () => {
  const profile = sandboxProfile({
    writeRoots: ["/w"],
    secrets: ["/h/.ssh", '/h/odd"name'],
    readable: ["/s/brief.md"],
    network: { mode: "restricted", ports: [8080] },
  });
  const order = [
    "(deny network*)",
    '(allow network-outbound (remote ip "localhost:8080"))',
    "(deny file-write*)",
    '(subpath "/w")',
    '(deny file-read* file-write* (subpath "/h/.ssh") (subpath "/h/odd\\"name"))',
    '(allow file-read* (subpath "/s/brief.md"))',
    "com.apple.SecurityServer",
  ].map((part) => profile.indexOf(part));
  assert.ok(
    order.every((at) => at >= 0),
    profile,
  );
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
});

test("from a sandboxed child every secret path is unreadable and unwritable and the network is off", {
  skip: !kind && "this machine has no usable sandbox",
}, async (t) => {
  const s = scratch(t);
  const server = net.createServer((socket) => socket.end());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const brief = path.join(
    s.stateDirectory,
    "supervisor",
    "children",
    "brief.md",
  );
  fs.mkdirSync(path.dirname(brief), { recursive: true });
  fs.writeFileSync(brief, "the brief");
  const plan = {
    reads: { ...s.secrets, brief, worktreeFile: path.join(s.worktree, "a") },
    writes: {
      ...s.secrets,
      newInSecret: path.join(s.home, ".ssh", "new"),
      worktree: path.join(s.worktree, "a"),
      tmp: path.join(s.tmp, "b"),
      outside: path.join(s.root, "outside"),
    },
    port: server.address().port,
  };
  fs.writeFileSync(path.join(s.worktree, "a"), "mine");
  const confined = confineChild(
    [process.execPath, "-e", PROBE, JSON.stringify(plan)],
    {
      definition,
      configDirectory: s.configDirectory,
      writeRoots: [s.worktree, s.tmp],
      secrets: secretPaths(s),
      readable: [brief],
      env: { ...s.env, GH_TOKEN: "t" },
    },
  );
  assert.equal(confined.sandbox, kind);
  assert.equal(confined.env.GH_TOKEN, undefined);
  const out = await run(confined.argv, confined.env);
  for (const name of Object.keys(s.secrets)) {
    assert.notEqual(out.read[name], "ok", `${name} was readable`);
    assert.notEqual(out.write[name], "ok", `${name} was writable`);
    assert.equal(
      fs.readFileSync(s.secrets[name], "utf8").includes("changed"),
      false,
    );
  }
  assert.notEqual(out.write.newInSecret, "ok");
  assert.equal(fs.existsSync(plan.writes.newInSecret), false);
  assert.equal(out.read.brief, "ok");
  assert.equal(out.read.worktreeFile, "ok");
  assert.equal(out.write.worktree, "ok");
  assert.equal(out.write.tmp, "ok");
  assert.notEqual(out.write.outside, "ok");
  assert.equal(fs.existsSync(plan.writes.outside), false);
  assert.notEqual(out.net, "ok", "the network was reachable");
});

test("on macOS a restricted network reaches only the named loopback port", {
  skip: kind !== "sandbox-exec" && "needs sandbox-exec",
}, async (t) => {
  const s = scratch(t);
  const listen = async () => {
    const server = net.createServer((socket) => socket.end());
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => server.close());
    return server.address().port;
  };
  const named = await listen();
  const other = await listen();
  const probe = async (port) =>
    (
      await run(
        confineChild(
          [
            process.execPath,
            "-e",
            PROBE,
            JSON.stringify({ reads: {}, writes: {}, port }),
          ],
          {
            definition,
            writeRoots: [s.worktree],
            secrets: secretPaths(s),
            network: sandboxNetwork([`localhost:${named}`]),
            env: s.env,
          },
        ).argv,
        s.env,
      )
    ).net;
  assert.equal(await probe(named), "ok");
  assert.notEqual(await probe(other), "ok");
});
