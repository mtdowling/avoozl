// A repository's checks run under its isolation setting: the process
// sandbox by default with the network off, a container, or unconfined only
// with this machine's opt-in. Every record names the isolation it ran under.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CHECKS_UNCONFINED,
  checkOptions,
  containerBlindness,
  pickRuntime,
  runtimeProgram,
  isolatedCheck,
  isolationSetting,
  prepareChecks,
} from "../check-isolation.mjs";
import { verdictCause } from "../../delivery/delivery.mjs";
import { commandEvidence } from "../../git/git.mjs";
import { HARNESS_UNCONFINED } from "../../executors/harness-definitions.mjs";
import { sandboxKind } from "../../executors/sandbox.mjs";
import { runEach } from "../../delivery/verify.mjs";
import {
  deliveryWorkspace,
  gitCheckout,
} from "../../test/delivery-fixture.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const node = process.execPath;
const script = (source) => [node, "-e", source];
const run = (repository, dir, argv, env) =>
  commandEvidence(dir, argv, { ...checkOptions(repository, dir), env });

test("the setting validates, with sandbox and network off by default", () => {
  assert.deepEqual(isolationSetting({}), { run: "sandbox", network: "off" });
  assert.deepEqual(
    isolationSetting({
      run: "container",
      image: "alpine:3",
      network: "on",
      readable: ["/opt/sdk"],
      prepare: ["npm", "ci"],
    }),
    {
      run: "container",
      image: "alpine:3",
      network: "on",
      readable: [path.resolve("/opt/sdk")],
      prepare: ["npm", "ci"],
    },
  );
  for (const [bad, message] of [
    [{ run: "vm" }, /sandbox, container or unconfined/],
    [{ run: "container" }, /image is needed/],
    [{ network: "maybe" }, /off or on/],
    [{ readable: ["relative/path"] }, /absolute paths/],
    [{ prepare: [] }, /command arguments/],
    [{ image: "-v /:/host" }, /one container image/],
    [{ shell: true }, /Unknown isolation setting/],
  ])
    assert.throws(() => isolationSetting(bad), message);
});

const sandboxed = sandboxKind() ? false : "this machine has no sandbox";

test("a sandboxed check has no network, writes only its roots, and gets no credentials", {
  skip: sandboxed,
}, async () => {
  const root = temporaryDirectory("avoozl-isolation-"),
    dir = gitCheckout(path.join(root, "app")),
    outside = path.join(root, "outside.txt"),
    repository = { id: "app", checks: {} };
  // Network off: a TCP connection to a public host fails.
  const net = await run(
    repository,
    dir,
    script(
      "const s=require('node:net').connect(443,'1.1.1.1');s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(3));setTimeout(()=>process.exit(4),5000)",
    ),
  );
  assert.equal(net.isolation, "sandbox");
  assert.notEqual(net.exitCode, 0, "no network in a sandboxed check");
  // A write in its folder works; one outside its roots fails.
  const inside = await run(
    repository,
    dir,
    script("require('node:fs').writeFileSync('made.txt','x')"),
  );
  assert.equal(inside.exitCode, 0, inside.stderr);
  const blocked = await run(
    repository,
    dir,
    script(`require('node:fs').writeFileSync(${JSON.stringify(outside)},'x')`),
  );
  assert.notEqual(blocked.exitCode, 0);
  assert.equal(fs.existsSync(outside), false);
  // GH_TOKEN never reaches a check, even listed in checksEnv.
  const saved = process.env.GH_TOKEN;
  process.env.GH_TOKEN = "secret-token";
  try {
    const token = await run(
      { ...repository, checksEnv: ["GH_TOKEN"] },
      dir,
      script("process.stdout.write(String(process.env.GH_TOKEN))"),
      ["GH_TOKEN"],
    );
    assert.equal(token.stdout, "undefined");
  } finally {
    if (saved === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = saved;
  }
});

test("network on lets a sandboxed check reach the network setting it names", {
  skip: sandboxed,
}, () => {
  const dir = temporaryDirectory("avoozl-isolation-on-"),
    on = isolatedCheck(
      { id: "app", isolation: { network: "on" } },
      dir,
      ["true"],
      {},
    ),
    off = isolatedCheck({ id: "app" }, dir, ["true"], {});
  if (sandboxKind() === "sandbox-exec") {
    assert.doesNotMatch(on.argv[2], /deny network/);
    assert.match(off.argv[2], /deny network/);
  } else {
    assert.ok(!on.argv.includes("--unshare-net"));
    assert.ok(off.argv.includes("--unshare-net"));
  }
  on.cleanup();
  off.cleanup();
});

test("unconfined runs only with this machine's opt-in, and says so", async (t) => {
  const config = temporaryDirectory("avoozl-isolation-config-"),
    dir = temporaryDirectory("avoozl-isolation-dir-"),
    repository = { id: "app", isolation: { run: "unconfined" } },
    paths = { configDirectory: config, stateDirectory: path.join(config, "s") };
  const refused = isolatedCheck(repository, dir, ["true"], {}, { paths });
  assert.match(refused.refused, /not allowed unconfined checks/);
  fs.writeFileSync(
    path.join(config, HARNESS_UNCONFINED),
    JSON.stringify({ [CHECKS_UNCONFINED]: true }),
  );
  const allowed = isolatedCheck(repository, dir, ["true"], {}, { paths });
  assert.deepEqual([allowed.argv, allowed.isolation], [["true"], "unconfined"]);
  // A machine with no sandbox runs a sandbox check unconfined, and says so.
  const bare = isolatedCheck({ id: "app" }, dir, ["true"], {}, { kind: null });
  assert.equal(bare.isolation, "unconfined");
  // Every result names it.
  const [result] = await runEach(dir, [{ name: "t", argv: ["true"] }], {
    timeoutFor: () => 10_000,
    repository: { id: "app" },
    run: async (_dir, argv, { isolate }) => ({
      exitCode: 0,
      isolation: isolate(argv, {}).isolation,
    }),
  });
  assert.ok(["sandbox", "unconfined"].includes(result.isolation));
  void t;
});

const runtime = pickRuntime().runtime ?? null;
const image = (() => {
  if (!runtime) return null;
  const listed = spawnSync(
    runtimeProgram(runtime),
    ["image", "ls", "--format", "{{.Repository}}:{{.Tag}}"],
    {
      encoding: "utf8",
    },
  ).stdout;
  return listed.split("\n").find((name) => /^alpine:/.test(name)) ?? null;
})();

test("a container check mounts its folder, has no network and no home", {
  skip: !runtime
    ? "no container runtime (Apple container, podman or docker) works here"
    : !image
      ? "no local alpine image to run without the network"
      : false,
}, async (t) => {
  // A folder under home: a runtime in a VM (Colima, Docker Desktop) shares
  // home with it, and the check mounts only this folder.
  const dir = gitCheckout(
      fs.mkdtempSync(path.join(os.homedir(), ".avoozl-isolation-ctr-")),
    ),
    repository = { id: "app", isolation: { run: "container", image } };
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const seen = await run(repository, dir, [
    "sh",
    "-c",
    "cat README.md; ls /root 2>/dev/null | wc -l; wget -q -T 3 -O- http://1.1.1.1 >/dev/null 2>&1 && echo net || echo nonet",
  ]);
  assert.equal(seen.isolation, "container");
  assert.equal(seen.exitCode, 0, seen.stderr);
  // A runtime in a VM that does not share this folder shows it empty.
  if (!/^app\n/.test(seen.stdout))
    return t.skip("the container runtime does not share this folder");
  assert.match(seen.stdout, /^app\n/);
  assert.match(seen.stdout, /nonet/);
  assert.doesNotMatch(seen.stdout, new RegExp(process.env.HOME ?? "/Users/"));
});

test("prepare runs once per worktree and commit, before the checks", async () => {
  const dir = gitCheckout(temporaryDirectory("avoozl-isolation-prep-")),
    marker = path.join(dir, "prepared.txt"),
    repository = {
      id: "app-prep",
      isolation: {
        run: "unconfined",
        prepare: script(
          `const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(marker)},'x')`,
        ),
      },
    };
  assert.equal((await prepareChecks(repository, dir)).exitCode, 0);
  assert.equal(await prepareChecks(repository, dir), null, "once per commit");
  assert.equal(fs.readFileSync(marker, "utf8"), "x");
  // A failed prepare runs no check.
  const failing = {
      id: "app-fail",
      isolation: { prepare: script("process.exit(2)") },
    },
    results = await runEach(dir, [{ name: "t", argv: ["true"] }], {
      timeoutFor: () => 10_000,
      repository: failing,
    });
  assert.equal(results[0].exitCode, null);
  assert.match(results[0].notRun, /prepare failed/);
});

test("a container check runs only when the container sees its folder", async () => {
  const dir = temporaryDirectory("avoozl-isolation-probe-"),
    repository = {
      id: "app-ctr",
      isolation: { run: "container", image: "img" },
    },
    checks = [
      { name: "test", argv: ["npm", "test"] },
      { name: "lint", argv: ["npm", "run", "lint"] },
    ];
  // A fake runner: the probe's `cat` reads the sentinel when the container
  // shares the folder, and finds nothing when it mounts empty.
  const fake = (shared) => {
    const ran = [];
    const run = async (_dir, argv) => {
      ran.push(argv);
      if (argv[0] !== "sh") return { exitCode: 0, stdout: "", stderr: "" };
      const file = argv.at(-1);
      assert.equal(path.dirname(file), dir);
      return shared
        ? { exitCode: 0, stdout: fs.readFileSync(file, "utf8"), stderr: "" }
        : { exitCode: 1, stdout: "", stderr: "" };
    };
    return { ran, run };
  };
  const options = (run) => ({ timeoutFor: () => 10_000, run, repository });
  const seen = fake(true),
    results = await runEach(dir, checks, options(seen.run));
  assert.deepEqual(
    results.map((r) => r.exitCode),
    [0, 0],
  );
  assert.deepEqual(seen.ran.slice(1), [
    ["npm", "test"],
    ["npm", "run", "lint"],
  ]);
  const blind = fake(false),
    refused = await runEach(dir, checks, options(blind.run));
  assert.equal(blind.ran.length, 1, "only the probe ran");
  const why = `The container cannot see ${dir}; share it with the container VM (for Colima, its mounts setting).`;
  assert.deepEqual(
    refused.map((r) => [r.name, r.exitCode, r.notRun]),
    [
      ["test", null, why],
      ["lint", null, why],
    ],
  );
  // The run's cause names the folder.
  assert.match(
    verdictCause(
      {},
      repository,
      "c1",
      { commit: "c1", checks: refused },
      checks,
    )?.cause ?? "",
    /was not run: The container cannot see/,
  );
  // The sentinel never stays in the worktree.
  assert.deepEqual(fs.readdirSync(dir), []);
  // A sandboxed check needs no probe.
  const sandboxed = fake(false);
  await containerBlindness({ id: "app-sbx" }, dir, { run: sandboxed.run });
  assert.deepEqual(sandboxed.ran, []);
});

test("repository.configure with {id, isolation} changes only how its checks run", async (t) => {
  const { store, ops } = deliveryWorkspace(t, {
    prefix: "avoozl-isolation-configure-",
    repository: { landing: "direct", checks: { test: ["npm", "test"] } },
  });
  const set = await ops.execute("repository.configure", {
    id: "app",
    isolation: { run: "container", image: "node:22", network: "on" },
  });
  assert.deepEqual(set.isolation, {
    run: "container",
    image: "node:22",
    network: "on",
  });
  const stored = store.get("repositories", "app");
  assert.deepEqual(
    [stored.landing, stored.checks],
    ["direct", { test: ["npm", "test"] }],
    "nothing else changes",
  );
  await assert.rejects(
    ops.execute("repository.configure", {
      id: "app",
      isolation: { run: "container" },
    }),
    /image is needed/,
  );
  await assert.rejects(
    ops.execute("repository.configure", { id: "nope", isolation: {} }),
    /Repository not found/,
  );
});
