// A minimal stdio MCP server with one tool, `ask`, that answers from a fixed
// list. Replace it with your own server; Avoozl runs it outside the
// worker's sandbox and gives the worker only its tool replies.
import readline from "node:readline";

const ANSWERS = {
  default: "The design archive has no entry for that question.",
};

const send = (message) =>
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");

for await (const line of readline.createInterface({ input: process.stdin })) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    continue;
  }
  const { id, method, params } = message;
  if (method === "initialize")
    send({
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "research", version: "1.0.0" },
      },
    });
  else if (method === "tools/list")
    send({
      id,
      result: {
        tools: [
          {
            name: "ask",
            description: "Ask the design archive a question.",
            inputSchema: {
              type: "object",
              properties: { question: { type: "string" } },
              required: ["question"],
            },
          },
        ],
      },
    });
  else if (method === "tools/call")
    send({
      id,
      result: { content: [{ type: "text", text: ANSWERS.default }] },
    });
  else if (id !== undefined)
    send({ id, error: { code: -32601, message: "Method not found" } });
}
