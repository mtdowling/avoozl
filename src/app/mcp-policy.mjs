// Which operations MCP may not reach, and why (R56). Each operation entry
// (operation-table.mjs) names its policy; this derives the two maps from the
// table. src/app/test/mcp-tools.test.mjs checks that every routed operation
// has an MCP route.
//
// PERSON_ONLY operations are refused whenever a call comes through MCP, under
// any tool name, old or new: Operations.perform checks this before it runs
// anything. `when` limits the refusal to one input shape. NOT_ON_MCP
// operations have no MCP tool, for a reason other than a person's authority.
import { OPERATIONS } from "./operation-table.mjs";

const withPolicy = (kind) =>
  [...OPERATIONS.values()].filter((entry) => entry.policy.kind === kind);

export const PERSON_ONLY = new Map(
  withPolicy("person").map(({ name, policy }) => [
    name,
    { reason: policy.reason, when: policy.when },
  ]),
);
export const NOT_ON_MCP = new Map(
  withPolicy("notOnMcp").map(({ name, policy }) => [name, policy.reason]),
);

// The refusal for an operation reached through MCP, or null.
export function mcpRefusal(name, input) {
  const rule = PERSON_ONLY.get(name);
  return rule && (!rule.when || rule.when(input)) ? rule.reason : null;
}

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

// The refusal for a CLI call, or null. The command line is a person's tool,
// so a person-only operation runs there, even inside an agent session, and is
// recorded as run there (agentSessionNote). It is refused only in a
// supervisor child (AVOOZL_CHILD, R95.5), where nobody is typing.
export function cliRefusal(name, input, { env = process.env } = {}) {
  const reason = mcpRefusal(name, input);
  if (!reason || !env.AVOOZL_CHILD) return null;
  return (
    reason.replace(/ Do it in the Avoozl app\.$/, "") +
    " This command is running inside an agent the supervisor started" +
    `${env.AVOOZL_CHILD_SESSION ? ` (${env.AVOOZL_CHILD_SESSION})` : ""}.` +
    " Do it in the Avoozl app."
  );
}

// What a person-only CLI call from an agent session leaves in the record, or
// null when it is not one (R83.1).
export function agentSessionNote(name, input, env = process.env) {
  if (!mcpRefusal(name, input) || !agentSession(env)) return null;
  return `Run from a Kiro Crew agent session${env.KIRO_SESSION_ID ? ` (${env.KIRO_SESSION_ID})` : ""}.`;
}
