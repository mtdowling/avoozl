// The CLI runs every operation for whoever types it: a person, an agent
// session or a supervisor child. A delete needs --yes, and Activity names
// the call as cli.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { agentSession } from "../../mcp/mcp-policy.ts";
import { initializeWorkspace } from "../../workspace/workspace.ts";
import { temporaryDirectory } from "../../test/temporary.ts";

const cli = fileURLToPath(new URL("../../../../cli.ts", import.meta.url));

test("agent sessions are told apart by the variables Kiro Crew sets", () => {
  assert.equal(agentSession({ KIROCREW_SPAWNED: "1" }), true);
  assert.equal(agentSession({ KIRO_SESSION_ID: "abc" }), true);
  // The dashboard terminal: the gateway's environment plus this marker.
  assert.equal(agentSession({ KIROCREW_TERMINAL: "1", PATH: "/bin" }), false);
  assert.equal(agentSession({}), false);
});

test("an agent session and a supervisor child run approvals and confirmed deletes", () => {
  const workspace = temporaryDirectory("avoozl-agent-cli-");
  initializeWorkspace(workspace, { name: "t" });
  const run = (args: string[], env: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, [cli, ...args, "--workspace", workspace], {
      encoding: "utf8",
      env: {
        ...process.env,
        KIROCREW_SPAWNED: "",
        KIRO_SESSION_ID: "",
        AVOOZL_CHILD: "",
        ...env,
      },
    });
  // The plan does not exist, so each run that gets past every gate fails on
  // that.
  for (const env of [{}, { KIRO_SESSION_ID: "s1" }, { AVOOZL_CHILD: "1" }]) {
    const approve = run(
      ["plan.approve", "--json", JSON.stringify({ id: "nope" })],
      env,
    );
    assert.notEqual(approve.status, 0);
    assert.match(approve.stderr, /Plan not found/, JSON.stringify(env));
    assert.doesNotMatch(approve.stderr, /Only a person|supervisor started/);
  }
  // A delete without --yes is refused before it runs; with it, it runs.
  const refused = run(["report", "delete", "r1"], { KIRO_SESSION_ID: "s1" });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /Pass confirm: true \(MCP\) or --yes \(CLI\)/);
  const confirmed = run(["report", "delete", "r1", "--yes"]);
  assert.notEqual(confirmed.status, 0);
  assert.doesNotMatch(confirmed.stderr, /Pass confirm/);
  // Autopilot answers at the command line.
  const status = run(["autopilot", "status"]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).on, false);
  const wrong = run(["autopilot", "maybe"]);
  assert.match(wrong.stderr, /Choose autopilot status, on, off/);
});
