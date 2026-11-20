// The containment probes (MS8): a stand-in harness with its own sandbox off
// (`danger-full-access`) runs every probe under confineChild, and Avoozl's
// sandbox refuses each. On the macOS and Linux CI legs AVOOZL_REQUIRE_SANDBOX
// is set, so a runner with no usable sandbox fails here instead of skipping.
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { PROBES, RUN_PROBES, probeArgv } from "../../sandbox-probes.mjs";
import { harnessPermission } from "../harness-definitions.mjs";
import {
  catalogWorkspaceRoots,
  confineChild,
  sandboxKind,
  sandboxSecretPaths,
} from "../sandbox.mjs";

const kind = sandboxKind();
const required = Boolean(process.env.AVOOZL_REQUIRE_SANDBOX);
const real = (file) => fs.realpathSync.native(file);
const definition = { name: "stand-in", hash: "b".repeat(64) };
const KEYCHAIN_SERVICE = `avoozl-probe-${process.pid}`;

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] });

// A machine with a secret in each place a probe reaches for.
async function machine(t) {
  const root = real(fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-probes-")));
  const server = net.createServer((socket) => socket.end());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10 });
  });
  const home = path.join(root, "home");
  const configDirectory = path.join(home, ".config", "avoozl");
  const stateDirectory = path.join(home, ".local", "state", "avoozl");
  const workspace = path.join(root, "workspace");
  const checkout = path.join(root, "checkout");
  const worktree = path.join(root, "worktrees", "task");
  const other = path.join(root, "worktrees", "other");
  const tmp = path.join(root, "tmp", "session");
  const otherTemp = path.join(root, "tmp", "other-session");
  for (const dir of [home, checkout, tmp, otherTemp, configDirectory])
    fs.mkdirSync(dir, { recursive: true });
  for (const file of [
    path.join(home, ".ssh", "id_ed25519"),
    path.join(home, ".config", "gh", "hosts.yml"),
    path.join(home, ".aws", "credentials"),
    path.join(home, ".git-credentials"),
    path.join(home, ".kiro", "crew", "gateway.secret"),
    path.join(stateDirectory, "machine", "control.token"),
  ]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "secret\n");
  }
  const database = path.join(workspace, ".avoozl", "local", "workspace.sqlite");
  fs.mkdirSync(path.dirname(database), { recursive: true });
  const db = new DatabaseSync(database);
  db.exec("CREATE TABLE tasks (id TEXT)");
  db.close();
  const catalog = new DatabaseSync(path.join(stateDirectory, "catalog.sqlite"));
  catalog.exec("CREATE TABLE workspaces (id TEXT, root TEXT)");
  catalog.prepare("INSERT INTO workspaces VALUES ('w', ?)").run(workspace);
  catalog.close();
  git(checkout, "init", "-q", "-b", "main");
  git(
    checkout,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "start",
  );
  git(checkout, "worktree", "add", "-q", "-b", "task", worktree);
  git(checkout, "worktree", "add", "-q", "-b", "other", other);
  return {
    root,
    home,
    configDirectory,
    stateDirectory,
    worktree,
    tmp,
    places: {
      node: process.execPath,
      home,
      git_common_dir: path.join(checkout, ".git"),
      other_worktree: other,
      config_directory: configDirectory,
      state_directory: stateDirectory,
      other_temp: otherTemp,
      public_host: "example.com",
      closed_port: server.address().port,
      workspace_database: database,
      keychain_service: KEYCHAIN_SERVICE,
      keep_env: "",
    },
  };
}

// Run the probes in a stand-in harness. With `confined`, under confineChild
// as a read child with its own sandbox off; without, as a plain child.
async function runProbes(m, probes, { confined = true } = {}) {
  const file = path.join(m.tmp, "probes.json");
  fs.writeFileSync(file, JSON.stringify(probes));
  const argv = [
    process.execPath,
    "-e",
    RUN_PROBES,
    "--",
    "--sandbox",
    "danger-full-access",
    file,
  ];
  const env = {
    PATH: process.env.PATH,
    HOME: m.home,
    GH_TOKEN: "made-up",
    MODEL_API_KEY: "made-up",
  };
  const child = confined
    ? confineChild(argv, {
        definition,
        configDirectory: m.configDirectory,
        writeRoots: harnessPermission(
          { permission: { read: "danger-full-access" } },
          { permissionClass: "read", worktree: m.worktree, tmp: m.tmp },
        ).writeRoots,
        secrets: sandboxSecretPaths({
          home: m.home,
          env,
          configDirectory: m.configDirectory,
          stateDirectory: m.stateDirectory,
          workspaceRoots: catalogWorkspaceRoots(
            path.join(m.stateDirectory, "catalog.sqlite"),
          ),
        }),
        readable: [file],
        env,
      })
    : { argv, env };
  return new Promise((resolve, reject) => {
    const proc = spawn(child.argv[0], child.argv.slice(1), {
      env: child.env,
      cwd: m.worktree,
    });
    let out = "",
      err = "";
    proc.stdout.on("data", (chunk) => (out += chunk));
    proc.stderr.on("data", (chunk) => (err += chunk));
    proc.on("error", reject);
    proc.on("exit", (code) => {
      try {
        resolve(JSON.parse(out.trim().split("\n").pop()));
      } catch {
        reject(Error(`The stand-in exited ${code}: ${out}\n${err}`));
      }
    });
  });
}

// The probes that got through: each exited 0.
const through = (results) =>
  Object.entries(results)
    .filter(([, code]) => code === 0)
    .map(([id]) => id);

test("each probe is an argv list of strings and every MS8.1 place is probed", () => {
  for (const probe of PROBES) {
    assert.ok(Array.isArray(probe.argv) && probe.argv.length, probe.id);
    assert.ok(
      probe.argv.every((word) => typeof word === "string"),
      probe.id,
    );
  }
  const ids = new Set(PROBES.map((probe) => probe.id));
  for (const id of [
    "write-home",
    "write-git-common-dir",
    "write-other-worktree",
    "write-config",
    "write-state",
    "write-other-temp",
    "net-public-https",
    "net-loopback-port",
    "net-name-lookup",
    "read-ssh",
    "read-gh",
    "read-aws",
    "read-git-credentials",
    "read-workspace-database",
    "read-state",
    "read-kirocrew-home",
    "read-keychain",
    "read-secret-env",
  ])
    assert.ok(ids.has(id), id);
});

test("a probe planted to succeed is named as getting through", async (t) => {
  const m = await machine(t);
  const planted = probeArgv(m.places).filter(
    (probe) => probe.id === "write-home",
  );
  const results = await runProbes(m, planted, { confined: false });
  assert.deepEqual(through(results), ["write-home"]);
});

test("every probe is refused inside Avoozl's sandbox", {
  skip: !kind && !required && "this machine has no usable sandbox",
}, async (t) => {
  assert.ok(
    kind,
    "AVOOZL_REQUIRE_SANDBOX is set and this runner has no usable sandbox (bwrap on Linux, sandbox-exec on macOS)",
  );
  const m = await machine(t);
  // A real keychain item, so the keychain probe means something.
  if (process.platform === "darwin") {
    spawnSync("/usr/bin/security", [
      "add-generic-password",
      "-U",
      "-a",
      "avoozl",
      "-s",
      KEYCHAIN_SERVICE,
      "-w",
      "secret",
    ]);
    t.after(() =>
      spawnSync("/usr/bin/security", [
        "delete-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
      ]),
    );
  }
  // The same probes unconfined reach what they aim at, so a refusal below
  // is the sandbox's and not a broken probe (network ones may lack a route).
  const open = await runProbes(m, probeArgv(m.places), { confined: false });
  for (const id of [
    "write-home",
    "write-config",
    "read-ssh",
    "read-state",
    "read-workspace-database",
    "net-loopback-port",
  ])
    assert.equal(open[id], 0, `${id} does not work even unconfined`);
  fs.rmSync(path.join(m.home, "avoozl-probe.txt"));
  const results = await runProbes(m, probeArgv(m.places));
  assert.deepEqual(
    through(results),
    [],
    `got through: ${JSON.stringify(results)}`,
  );
  assert.equal(fs.existsSync(path.join(m.home, "avoozl-probe.txt")), false);
});
