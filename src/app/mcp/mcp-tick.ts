// The one-shot tick tool (machine-server MS10.3): `plans_maintain` `tick`
// through any `avoozl mcp` runs the same pass as `avoozl tick` for the
// caller's workspace and returns its result. The Kiro Crew cron's call
// (`cron: true`) runs the whole machine's pass first and returns the chat
// intents (MS12.1). Neither leaves anything running but the children the
// pass started.
import type { McpMessage } from "../../mcp.ts";
import { complete } from "./mcp.ts";

// null, or {cron} for a plans_maintain tick call.
export function tickCall(message: McpMessage | null | undefined) {
  if (message?.method !== "tools/call") return null;
  const { name, arguments: args } = (message.params || {}) as {
    name?: unknown;
    arguments?: { action?: unknown; input?: { cron?: unknown } };
  };
  if (name !== "plans_maintain" || args?.action !== "tick") return null;
  return { cron: args.input?.cron === true };
}

// A tool reply whose one text block is `value` as JSON.
export const toolReply = (message: McpMessage, value: unknown) => ({
  jsonrpc: "2.0",
  id: message.id,
  result: complete(message, {
    content: [{ type: "text", text: JSON.stringify(value) }],
  }),
});

// The pass's results as a tool reply: an error when a workspace's tick failed.
export const passReply = (
  message: McpMessage,
  results: Record<string, unknown>[],
) => {
  const reply = toolReply(message, results);
  if (results.some((result) => result.error))
    Object.assign(reply.result, { isError: true });
  return reply;
};
