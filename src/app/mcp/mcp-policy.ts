// Which operations MCP does not reach, and why (R56). Each operation entry
// (operation-table.mjs) names its policy; this derives the map from the
// table. src/app/mcp/test/mcp-tools.test.ts checks that every routed
// operation has an MCP route. NOT_ON_MCP operations have no MCP tool, for
// the written reason.
import { OPERATIONS } from "../api/operation-table.ts";

export const NOT_ON_MCP = new Map<string, string>(
  [...OPERATIONS.values()]
    .filter((entry) => entry.policy.kind === "notOnMcp")
    .map(({ name, policy }) => [name, policy.reason]),
);

// Kiro Crew marks every agent session's process tree: the runtime sets
// KIROCREW_SPAWNED=1 on everything it starts, and KIRO_SESSION_ID names the
// session in a shell the agent runs. The dashboard terminal copies the
// gateway's own environment plus KIROCREW_TERMINAL=1, so a person's terminal
// has neither (checked in Kiro Crew 0.12.2.4). Avoozl does not trust
// KIROCREW_TERMINAL, because an agent could set it too.
// shortcut: a speed bump, not a wall. Code running as the same user can
// unset these or read the gateway secret from another process; upgrade when
// Kiro Crew passes the secret by file descriptor (R83.2).
export function agentSession(env = process.env) {
  return env.KIROCREW_SPAWNED === "1" || Boolean(env.KIRO_SESSION_ID);
}
