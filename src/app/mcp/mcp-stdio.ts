// @ts-nocheck: typing debt
// `avoozl mcp`: a stdio MCP server, one per chat, served in this process from
// the workspace databases (machine-server MS10). It never loops and starts
// nothing of its own; its one-shot tick tool runs one pass (mcp-tick.mjs).
// With `--kirocrew` it is the Kiro Crew app's server, which picks a workspace
// per caller from the gateway's caller block (app-mcp.mjs); otherwise it
// serves the workspace its MCP entry names, and a caller block, which could
// come from any client, is not read.
import readline from "node:readline";
import { createAppMcp } from "../executors/kirocrew/app-mcp.ts";
import { machineAvoozlPaths } from "../settings/host-config.ts";
import { runPass } from "../tick/tick-pass.ts";
import { handleMcp } from "./mcp.ts";
import { passReply, tickCall } from "./mcp-tick.ts";

// One JSON-RPC message per line of `input`: `answer` returns the reply, or
// null for none. A line that does not parse, or an answer that throws, gets
// an error reply.
async function eachMessage(
  answer,
  { input = process.stdin, output = process.stdout } = {},
) {
  const send = (body) => output.write(JSON.stringify(body) + "\n");
  const lines = readline.createInterface({ input });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
      continue;
    }
    let reply;
    try {
      reply = await answer(message);
    } catch (error) {
      reply = {
        jsonrpc: "2.0",
        id: message?.id ?? null,
        error: { code: -32603, message: error.message },
      };
    }
    if (reply !== null && reply !== undefined) send(reply);
  }
}

// The Kiro Crew app's server: `fallback` is the launch workspace's config.
export async function serveKirocrew({ fallback, env, ...io }) {
  const server = createAppMcp({ fallback, env });
  try {
    await eachMessage((message) => server.handle(message), io);
  } finally {
    server.close();
  }
}

// One workspace's server, on its Operations.
export async function serveWorkspace({ ops, workspaceRoot, ...io }) {
  await eachMessage(async (message) => {
    if (message && !Object.hasOwn(message, "id")) return null;
    if (tickCall(message)) {
      const machine = machineAvoozlPaths();
      return passReply(
        message,
        await runPass({
          stateDirectory: machine.stateDirectory,
          configDirectory: machine.configDirectory,
          roots: [workspaceRoot],
        }),
      );
    }
    return (await handleMcp(message, ops)).body;
  }, io);
}
