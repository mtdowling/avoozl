// A repository's checks run under its isolation setting: the process
// sandbox by default with the network off, or unconfined only with this
// machine's opt-in. Every record names the isolation it ran under.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  CHECKS_UNCONFINED,
  checkOptions,
  isolatedCheck,
  isolationSetting,
  prepareChecks,
} from "../check-isolation.ts";
import { commandEvidence } from "../../git/git.ts";
import { HARNESS_UNCONFINED } from "../../executors/harness-definitions.ts";
import { sandboxKind } from "../../executors/sandbox.ts";
import { runEach } from "../../delivery/verify.ts";
import { deliveryWorkspace, gitCheckout } from "../../test/delivery-fixture.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { commandRecord } from "../../test/command-record.ts";
import { storedRow } from "../../test/view-shapes.ts";

type Repository = Parameters<typeof checkOptions>[0];

const node = process.execPath;
const script = (source: string) => [node, "-e", source];
const run = (
  repository: Repository,
  dir: string,
  argv: string[],
  env?: string[],
) => commandEvidence(dir, argv, { ...checkOptions(repository, dir), env });

test("the setting validates, with sandbox and network off by default", () => {
  assert.deepEqual(isolationSetting({}), { run: "sandbox", network: "off" });
  assert.deepEqual(
    isolationSetting({
      network: "on",
      readable: ["/opt/sdk"],
      prepare: ["npm", "ci"],
    }),
    {
      run: "sandbox",
      network: "on",
      readable: [path.resolve("/opt/sdk")],
      prepare: ["npm", "ci"],
    },
  );
  const refused: [Record<string, unknown>, RegExp][] = [
    [{ run: "vm" }, /sandbox or unconfined/],
    [{ run: "container" }, /sandbox or unconfined/],
    [{ network: "maybe" }, /off or on/],
    [{ readable: ["relative/path"] }, /absolute paths/],
    [{ prepare: [] }, /command arguments/],
    [{ image: "node:22" }, /Unknown isolation setting/],
    [{ shell: true }, /Unknown isolation setting/],
  ];
  for (const [bad, message] of refused)
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
  // Both run in the sandbox, which leaves a temp folder to clean up.
  assert.ok(
    on.argv && on.cleanup && off.argv && off.cleanup,
    "both are sandboxed",
  );
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
    paths = {
      configDirectory: config,
      configPath: path.join(config, "config.json"),
      stateDirectory: path.join(config, "s"),
      catalogPath: path.join(config, "s", "catalog.sqlite"),
    };
  const refused = isolatedCheck(repository, dir, ["true"], {}, { paths });
  assert.match(refused.refused ?? "", /not allowed unconfined checks/);
  fs.writeFileSync(
    path.join(config, HARNESS_UNCONFINED),
    JSON.stringify({ [CHECKS_UNCONFINED]: true }),
  );
  const allowed = isolatedCheck(repository, dir, ["true"], {}, { paths });
  assert.ok("argv" in allowed, allowed.refused);
  assert.deepEqual([allowed.argv, allowed.isolation], [["true"], "unconfined"]);
  // A machine with no sandbox runs a sandbox check unconfined, and says so.
  const bare = isolatedCheck({ id: "app" }, dir, ["true"], {}, { kind: null });
  assert.ok("isolation" in bare, bare.refused);
  assert.equal(bare.isolation, "unconfined");
  // Every result names it.
  const [result] = await runEach(dir, [{ name: "t", argv: ["true"] }], {
    timeoutFor: () => 10_000,
    repository: { id: "app" },
    run: async (_dir, argv, options) => {
      const isolated = options?.isolate?.(argv, {});
      return commandRecord(argv, {
        isolation:
          isolated && "isolation" in isolated ? isolated.isolation : undefined,
      });
    },
  });
  assert.ok(["sandbox", "unconfined"].includes(String(result.isolation)));
  void t;
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
  assert.equal((await prepareChecks(repository, dir))?.exitCode, 0);
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
  assert.match(results[0].notRun ?? "", /prepare failed/);
});

test("repository.configure with {id, isolation} changes only how its checks run", async (t) => {
  const { store, ops } = deliveryWorkspace(t, {
    prefix: "avoozl-isolation-configure-",
    repository: { landing: "direct", checks: { test: ["npm", "test"] } },
  });
  const set = await ops.execute<{ isolation: unknown }>(
    "repository.configure",
    {
      id: "app",
      isolation: { network: "on" },
    },
  );
  assert.deepEqual(set.isolation, { run: "sandbox", network: "on" });
  const stored = storedRow(store, "repositories", "app");
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
    /sandbox or unconfined/,
  );
  await assert.rejects(
    ops.execute("repository.configure", { id: "nope", isolation: {} }),
    /Repository not found/,
  );
});

test("repository.configure with {id, labels, claims} sets the spec issue filters and stale hours, and null clears them", async (t) => {
  const { store, ops } = deliveryWorkspace(t, {
    prefix: "avoozl-labels-configure-",
    repository: { landing: "direct", checks: { test: ["npm", "test"] } },
  });
  await ops.execute("repository.configure", {
    id: "app",
    labels: { require: ["avoozl"], exclude: ["wip"] },
    claims: { staleHours: 6 },
  });
  const stored = storedRow(store, "repositories", "app");
  assert.deepEqual(
    [stored.labels, stored.claims, stored.landing],
    [{ require: ["avoozl"], exclude: ["wip"] }, { staleHours: 6 }, "direct"],
  );
  await assert.rejects(
    ops.execute("repository.configure", {
      id: "app",
      claims: { staleHours: 0 },
    }),
    /claims.staleHours must be a number 1–720/,
  );
  await ops.execute("repository.configure", {
    id: "app",
    labels: null,
    claims: null,
  });
  const cleared = storedRow(store, "repositories", "app");
  assert.deepEqual([cleared.labels, cleared.claims], [null, null]);
});
