// A person-only operation runs from the CLI, inside an agent session too,
// and says so in the record; only a supervisor child is refused (R83.1,
// R95.5).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  agentSession,
  agentSessionNote,
  cliRefusal,
} from "../../mcp/mcp-policy.mjs";
import { initializeWorkspace } from "../../workspace/workspace.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const cli = fileURLToPath(new URL("../../../../cli.mjs", import.meta.url));

test("agent sessions are told apart by the variables Kiro Crew sets", () => {
  assert.equal(agentSession({ KIROCREW_SPAWNED: "1" }), true);
  assert.equal(agentSession({ KIRO_SESSION_ID: "abc" }), true);
  // The dashboard terminal: the gateway's environment plus this marker.
  assert.equal(agentSession({ KIROCREW_TERMINAL: "1", PATH: "/bin" }), false);
  assert.equal(agentSession({}), false);
});

test("an agent session runs a person-only operation and is noted", () => {
  const agent = { KIROCREW_SPAWNED: "1", KIRO_SESSION_ID: "s1" };
  assert.equal(cliRefusal("plan.approve", {}, { env: agent }), null);
  assert.equal(
    agentSessionNote("plan.approve", {}, agent),
    "Run from a Kiro Crew agent session (s1).",
  );
  // Nothing to note outside an agent session or for an ordinary operation.
  assert.equal(agentSessionNote("plan.approve", {}, {}), null);
  assert.equal(agentSessionNote("session.report", {}, agent), null);
});

test("a supervisor child is refused (R95.5)", () => {
  const child = { AVOOZL_CHILD: "1", AVOOZL_CHILD_SESSION: "process-1" };
  const refused = cliRefusal("plan.approve", {}, { env: child });
  assert.match(refused, /supervisor started \(process-1\)/);
  assert.equal(cliRefusal("session.report", {}, { env: child }), null);
});

test("the CLI runs plan.delete in an agent session and refuses it in a child", () => {
  const workspace = temporaryDirectory("avoozl-person-only-");
  initializeWorkspace(workspace, { name: "t" });
  const run = (extra, env) =>
    spawnSync(
      process.execPath,
      [
        cli,
        "plan.delete",
        "--json",
        JSON.stringify({ planId: "nope" }),
        "--workspace",
        workspace,
        ...extra,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          KIROCREW_SPAWNED: "",
          KIRO_SESSION_ID: "",
          AVOOZL_CHILD: "",
          ...env,
        },
      },
    );
  // The plan does not exist, so each run that gets past the gate fails on that.
  const agent = run([], { KIRO_SESSION_ID: "s1" });
  assert.match(agent.stderr, /Run from a Kiro Crew agent session \(s1\)/);
  assert.doesNotMatch(agent.stderr, /refuse|Only a person/i);
  const terminal = run([], {});
  assert.doesNotMatch(terminal.stderr, /agent session/);
  const child = run([], { AVOOZL_CHILD: "1" });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /supervisor started/);
});

// P57 run 3: inside the sandbox the machine config cannot be read, and the
// CLI stopped on that before it reached the person-only refusal.
test("a child whose sandbox hides the machine config still gets the refusal", {
  skip: process.platform === "win32" || process.getuid?.() === 0,
}, () => {
  const home = temporaryDirectory("avoozl-child-config-");
  const configDir = path.join(home, "avoozl");
  fs.mkdirSync(configDir, { recursive: true });
  const config = path.join(configDir, "config.json");
  fs.writeFileSync(config, JSON.stringify({ version: 1 }));
  fs.chmodSync(config, 0o000);
  try {
    const run = (env) =>
      spawnSync(
        process.execPath,
        [cli, "verify", "allow", "t1", "--reason", "x"],
        {
          encoding: "utf8",
          env: { PATH: process.env.PATH, XDG_CONFIG_HOME: home, ...env },
        },
      );
    const child = run({
      AVOOZL_CHILD: "1",
      AVOOZL_CHILD_SESSION: "process-1",
    });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /supervisor started \(process-1\)/);
    // Outside a child an unreadable config still fails loudly.
    assert.match(run({}).stderr, /Could not parse global Avoozl configuration/);
  } finally {
    fs.chmodSync(config, 0o600);
  }
});
