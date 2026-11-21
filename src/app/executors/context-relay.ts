// The MCP relay (epic-context EC7): a harness starts this in place of an MCP
// server. It connects to the session's socket, which Avoozl's supervisor
// listens on outside the sandbox, says which alias it wants, and pipes its
// standard input and output to the real server there. It holds no
// environment value and no sign-in of its own.
//   node context-relay.mjs --socket FILE --token TOKEN --alias NAME
import net from "node:net";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    socket: { type: "string" },
    token: { type: "string" },
    alias: { type: "string" },
  },
});
if (!values.socket || !values.token || !values.alias) {
  console.error(
    "Usage: context-relay.mjs --socket FILE --token TOKEN --alias NAME",
  );
  process.exit(2);
}

const socket = net.connect(values.socket);
socket.on("error", (error) => {
  console.error(`The epic context relay could not connect: ${error.message}`);
  process.exit(1);
});
socket.on("connect", () => {
  socket.write(
    JSON.stringify({ token: values.token, alias: values.alias }) + "\n",
  );
  process.stdin.pipe(socket);
  socket.pipe(process.stdout);
});
socket.on("close", () => process.exit(0));
process.stdin.on("end", () => socket.end());
