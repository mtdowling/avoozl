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
  containerRuntime,
  isolatedCheck,
  isolationSetting,
  prepareChecks,
} from "../check-isolation.mjs";
import { commandEvidence } from "../git.mjs";
import { HARNESS_UNCONFINED } from "../harness-definitions.mjs";
import { sandboxKind } from "../sandbox.mjs";
import { runEach } from "../verify.mjs";
import { deliveryWorkspace, gitCheckout } from "./delivery-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const node = process.execPath;
const script = (source) => [node, "-e", source];
const run = (project, dir, argv, env) =>
  commandEvidence(dir, argv, { ...checkOptions(project, dir), env });

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
    project = { id: "app", checks: {} };
  // Network off: a TCP connection to a public host fails.
  const net = await run(
    project,
    dir,
    script(
      "const s=require('node:net').connect(443,'1.1.1.1');s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(3));setTimeout(()=>process.exit(4),5000)",
    ),
  );
  assert.equal(net.isolation, "sandbox");
  assert.notEqual(net.exitCode, 0, "no network in a sandboxed check");
  // A write in its folder works; one outside its roots fails.
  const inside = await run(
    project,
    dir,
    script("require('node:fs').writeFileSync('made.txt','x')"),
  );
  assert.equal(inside.exitCode, 0, inside.stderr);
  const blocked = await run(
    project,
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
      { ...project, checksEnv: ["GH_TOKEN"] },
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
    project = { id: "app", isolation: { run: "unconfined" } },
    paths = { configDirectory: config, stateDirectory: path.join(config, "s") };
  const refused = isolatedCheck(project, dir, ["true"], {}, { paths });
  assert.match(refused.refused, /not allowed unconfined checks/);
  fs.writeFileSync(
    path.join(config, HARNESS_UNCONFINED),
    JSON.stringify({ [CHECKS_UNCONFINED]: true }),
  );
  const allowed = isolatedCheck(project, dir, ["true"], {}, { paths });
  assert.deepEqual([allowed.argv, allowed.isolation], [["true"], "unconfined"]);
  // A machine with no sandbox runs a sandbox check unconfined, and says so.
  const bare = isolatedCheck({ id: "app" }, dir, ["true"], {}, { kind: null });
  assert.equal(bare.isolation, "unconfined");
  // Every result names it.
  const [result] = await runEach(dir, [{ name: "t", argv: ["true"] }], {
    timeoutFor: () => 10_000,
    project: { id: "app" },
    run: async (_dir, argv, { isolate }) => ({
      exitCode: 0,
      isolation: isolate(argv, {}).isolation,
    }),
  });
  assert.ok(["sandbox", "unconfined"].includes(result.isolation));
  void t;
});

const runtime = containerRuntime();
const image = (() => {
  if (!runtime) return null;
  const listed = spawnSync(
    runtime,
    ["image", "ls", "--format", "{{.Repository}}:{{.Tag}}"],
    {
      encoding: "utf8",
    },
  ).stdout;
  return listed.split("\n").find((name) => /^alpine:/.test(name)) ?? null;
})();

test("a container check mounts its folder, has no network and no home", {
  skip: !runtime
    ? "no container runtime (docker or podman) is installed"
    : !image
      ? "no local alpine image to run without the network"
      : false,
}, async (t) => {
  // A folder under home: a runtime in a VM (Colima, Docker Desktop) shares
  // home with it, and the check mounts only this folder.
  const dir = gitCheckout(
      fs.mkdtempSync(path.join(os.homedir(), ".avoozl-isolation-ctr-")),
    ),
    project = { id: "app", isolation: { run: "container", image } };
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const seen = await run(project, dir, [
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
    project = {
      id: "app-prep",
      isolation: {
        run: "unconfined",
        prepare: script(
          `const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(marker)},'x')`,
        ),
      },
    };
  assert.equal((await prepareChecks(project, dir)).exitCode, 0);
  assert.equal(await prepareChecks(project, dir), null, "once per commit");
  assert.equal(fs.readFileSync(marker, "utf8"), "x");
  // A failed prepare runs no check.
  const failing = {
      id: "app-fail",
      isolation: { prepare: script("process.exit(2)") },
    },
    results = await runEach(dir, [{ name: "t", argv: ["true"] }], {
      timeoutFor: () => 10_000,
      project: failing,
    });
  assert.equal(results[0].exitCode, null);
  assert.match(results[0].notRun, /prepare failed/);
});

test("project.configure with {id, isolation} changes only how its checks run", async (t) => {
  const { store, ops } = deliveryWorkspace(t, {
    prefix: "avoozl-isolation-configure-",
    project: { landing: "direct", checks: { test: ["npm", "test"] } },
  });
  const set = await ops.execute("project.configure", {
    id: "app",
    isolation: { run: "container", image: "node:22", network: "on" },
  });
  assert.deepEqual(set.isolation, {
    run: "container",
    image: "node:22",
    network: "on",
  });
  const stored = store.get("projects", "app");
  assert.deepEqual(
    [stored.landing, stored.checks],
    ["direct", { test: ["npm", "test"] }],
    "nothing else changes",
  );
  await assert.rejects(
    ops.execute("project.configure", {
      id: "app",
      isolation: { run: "container" },
    }),
    /image is needed/,
  );
  await assert.rejects(
    ops.execute("project.configure", { id: "nope", isolation: {} }),
    /Project not found/,
  );
});
