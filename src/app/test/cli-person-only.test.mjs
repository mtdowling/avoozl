// A person-only operation from the CLI is refused inside an agent session
// unless the person types --as-person (R83.1).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { agentSession, cliRefusal } from "../mcp-policy.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));

test("agent sessions are told apart by the variables Kiro Crew sets", () => {
  assert.equal(agentSession({ KIROCREW_SPAWNED: "1" }), true);
  assert.equal(agentSession({ KIRO_SESSION_ID: "abc" }), true);
  // The dashboard terminal: the gateway's environment plus this marker.
  assert.equal(agentSession({ KIROCREW_TERMINAL: "1", PATH: "/bin" }), false);
  assert.equal(agentSession({}), false);
});

test("cliRefusal gates only person-only operations in an agent session", () => {
  const agent = { KIROCREW_SPAWNED: "1" };
  assert.match(cliRefusal("plan.approve", {}, { env: agent }), /--as-person/);
  assert.equal(cliRefusal("plan.approve", {}, { env: {} }), null);
  assert.equal(
    cliRefusal("plan.approve", {}, { env: agent, asPerson: true }),
    null,
  );
  assert.equal(cliRefusal("session.report", {}, { env: agent }), null);
});

test("the CLI refuses plan.delete in an agent session until --as-person", () => {
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
          ...env,
        },
      },
    );
  const refused = run([], { KIRO_SESSION_ID: "s1" });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /agent session/);
  const typed = run(["--as-person"], { KIRO_SESSION_ID: "s1" });
  assert.doesNotMatch(typed.stderr, /agent session/);
  const terminal = run([], {});
  assert.doesNotMatch(terminal.stderr, /agent session/);
});
