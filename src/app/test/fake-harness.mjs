// A fake MCP server for the remote coder tests: one JSON message per line on
// stdin and stdout. It logs each call to $FAKE_HARNESS_LOG and takes its
// answers from $FAKE_HARNESS_STATE (a JSON file the test edits between ticks):
//   { "auth": "ok" | "expired", "statuses": { "<id>": { "state": "...", "url": "..." } } }
import fs from "node:fs";
import readline from "node:readline";

const log = (entry) =>
  fs.appendFileSync(process.env.FAKE_HARNESS_LOG, JSON.stringify(entry) + "\n");
const state = () =>
  JSON.parse(fs.readFileSync(process.env.FAKE_HARNESS_STATE, "utf8"));
const reply = (id, result) =>
  console.log(JSON.stringify({ jsonrpc: "2.0", id, result }));
const refuse = (id, message) =>
  console.log(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } }),
  );
log({ started: process.pid });
let counter = 0;
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize")
    return reply(message.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "fake", version: "0" },
    });
  if (message.method !== "tools/call") return;
  const { name, arguments: args } = message.params;
  log({ tool: name, args });
  if (state().auth === "expired")
    return refuse(message.id, "Your sign-in has expired");
  if (name === "create-code-task") {
    counter += 1;
    return reply(message.id, {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            id: `h-${process.pid}-${counter}`,
            url: `https://harness.example/h-${counter}`,
          }),
        },
      ],
    });
  }
  if (name === "get-task-statuses") {
    const known = state().statuses ?? {};
    return reply(message.id, {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            (args.ids || []).map((id) => ({
              id,
              ...(known[id] ?? { state: "running" }),
            })),
          ),
        },
      ],
    });
  }
  refuse(message.id, "unknown tool");
});
process.stdin.on("end", () => process.exit(0));
