// `avoozl harness approve NAME` and `harness list`: a person approves one
// harness file by the hash of its bytes now; an agent cannot.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { temporaryDirectory } from "./temporary.mjs";
import { harnessDefinitionHash } from "../harness-definitions.mjs";
import { OPERATIONS } from "../operation-table.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

function setup(t) {
  const { root, store } = fixture(t),
    configDirectory = path.join(root, "machine-config");
  fs.mkdirSync(path.join(configDirectory, "harnesses"), { recursive: true });
  const file = path.join(configDirectory, "harnesses", "example-cli.json"),
    write = (text) => fs.writeFileSync(file, text);
  write('{"name": "example-cli"}\n');
  return {
    file,
    write,
    configDirectory,
    ops: new Operations(store, { workspaceRoot: root, configDirectory }),
  };
}

const states = async (ops) =>
  Object.fromEntries(
    (await ops.execute("harness.list")).map((d) => [
      d.name,
      d.approved ? "approved" : d.changed ? "changed" : "not approved",
    ]),
  );

test("approve records the file's hash, and list tells approved, not approved and changed", async (t) => {
  const { ops, file, write } = setup(t);
  assert.deepEqual(await states(ops), { "example-cli": "not approved" });
  const done = await ops.execute("harness.approve", { name: "example-cli" });
  assert.equal(done.name, "example-cli");
  assert.equal(done.path, file);
  assert.equal(done.hash, harnessDefinitionHash(fs.readFileSync(file)));
  assert.deepEqual(await states(ops), { "example-cli": "approved" });
  write('{"name": "example-cli", "changed": true}\n');
  assert.deepEqual(await states(ops), { "example-cli": "changed" });
  await ops.execute("harness.approve", { name: "example-cli" });
  assert.deepEqual(await states(ops), { "example-cli": "approved" });
});

test("approve refuses a missing file and a bad name", async (t) => {
  const { ops } = setup(t);
  await assert.rejects(
    ops.execute("harness.approve", { name: "nothing" }),
    /No harness definition/,
  );
  await assert.rejects(
    ops.execute("harness.approve", { name: "../x" }),
    /not valid/,
  );
});

test("an agent, over MCP or from a session, cannot approve, and the policy keeps it off agent roles", async (t) => {
  const { ops, configDirectory } = setup(t);
  for (const context of [{ mcp: true }, { caller: { role: "worker" } }])
    await assert.rejects(
      ops.execute(
        "harness.approve",
        { name: "example-cli" },
        undefined,
        context,
      ),
      (error) => error.status === 403,
    );
  assert.equal(
    fs.existsSync(path.join(configDirectory, "harness-approvals.json")),
    false,
  );
  const policy = OPERATIONS.get("harness.approve").policy;
  assert.equal(policy.kind, "person");
});

test("the CLI lists and approves with no workspace, and refuses inside a supervisor child", () => {
  const machine = temporaryDirectory("avoozl-harness-cli-"),
    env = {
      ...process.env,
      HOME: path.join(machine, "home"),
      XDG_CONFIG_HOME: path.join(machine, "config"),
      XDG_STATE_HOME: path.join(machine, "state"),
    },
    cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url)),
    run = (args, extra = {}) =>
      execFileSync(process.execPath, [cli, ...args], {
        env: { ...env, ...extra },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    folder = path.join(env.XDG_CONFIG_HOME, "avoozl", "harnesses"),
    file = path.join(folder, "example-cli.json");
  for (const key of Object.keys(env))
    if (/^AVOOZL(_|$)/.test(key)) delete env[key];
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(file, '{"name": "example-cli"}\n');
  assert.equal(run(["harness", "list"]).trim(), "example-cli  not approved");
  assert.throws(
    () => run(["harness", "approve", "example-cli"], { AVOOZL_CHILD: "1" }),
    /Only a person/,
  );
  const hash = harnessDefinitionHash(fs.readFileSync(file)),
    shown = run(["harness", "approve", "example-cli"]);
  assert.ok(shown.includes("example-cli") && shown.includes(file));
  assert.ok(shown.includes(hash));
  assert.equal(run(["harness", "list"]).trim(), "example-cli  approved");
  fs.writeFileSync(file, '{"name": "example-cli", "x": 1}\n');
  assert.equal(
    run(["harness", "list"]).trim(),
    "example-cli  changed since approval",
  );
});

test("the page server lets only the owner approve a harness", async () => {
  const { principalAllows } = await import("../command-dispatch.mjs");
  assert.equal(
    principalAllows({ kind: "owner-session" }, "harness.approve"),
    true,
  );
  for (const kind of ["app-token", "agent-tool", "none"])
    assert.equal(principalAllows({ kind }, "harness.approve"), false, kind);
});
