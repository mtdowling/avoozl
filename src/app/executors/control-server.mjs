// The machine server's control interface (machine-server MS9, design D8 and
// D10): its one listener, for `avoozl mcp` on this machine only. On macOS and
// Linux it is a Unix socket, mode 0600 in a 0700 folder, which has no network
// address. On Windows it is 127.0.0.1 on a port the system picks; nothing names
// another address. Every connection first sends the token from control.token
// (32 random bytes, new at each start, mode 0600), compared in constant time;
// a missing or wrong token, or no token file, closes it with nothing run.
// Then one JSON object per line: MCP `tools/list` and `tools/call` (with the
// handshake and the read-only view resources), each run as an agent through the MCP path, which refuses
// person-only work. An HTTP request is not a JSON object, so it closes at its
// first line. The token is never logged.
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const MAX_LINE = 4 * 1024 * 1024;
// sun_path is 104 bytes on macOS and 108 on Linux, with the final NUL.
const MAX_SOCKET_PATH = 100;
// The MCP handshake, the tools, and the read-only view resources the Kiro
// Crew page reads (ui:// HTML). Nothing else.
export const CONTROL_METHODS = new Set([
  "initialize",
  "ping",
  "tools/list",
  "tools/call",
  "resources/list",
  "resources/templates/list",
  "resources/read",
]);

export function controlPaths(stateDirectory) {
  const machine = path.join(path.resolve(stateDirectory), "machine");
  return {
    folder: machine,
    token: path.join(machine, "control.token"),
    socket: path.join(machine, "control.sock"),
  };
}

// The short folder a socket uses when the state path is too long, which the
// sandbox hides from children like the state folder.
export function shortSocketFolder() {
  const uid = typeof process.getuid === "function" ? process.getuid() : "user";
  return path.join(os.tmpdir(), `avoozl-control-${uid}`);
}

function socketPath(stateDirectory) {
  const { socket } = controlPaths(stateDirectory);
  if (socket.length <= MAX_SOCKET_PATH) return socket;
  // One file per state folder, so two machine servers never share one.
  const name = crypto
    .createHash("sha256")
    .update(path.resolve(stateDirectory))
    .digest("hex")
    .slice(0, 16);
  return path.join(shortSocketFolder(), `${name}.sock`);
}

function privateFolder(folder) {
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") fs.chmodSync(folder, 0o700);
}

// Compare a sent token with the one on disk, in constant time. No file, or
// any difference, is a refusal.
function tokenMatches(file, sent) {
  let expected;
  try {
    expected = Buffer.from(fs.readFileSync(file, "utf8").trim());
  } catch {
    return false;
  }
  const given = Buffer.from(typeof sent === "string" ? sent : "");
  if (!expected.length || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(given, expected);
}

const rpcError = (id, code, message) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

// Start the listener. `handle(message, claim)` answers one MCP message for
// the claim the hello sent. Call only while holding the machine lock, which
// is what lets this remove a stale socket file. Returns { address, close }.
export async function startControl({ stateDirectory, handle }) {
  const paths = controlPaths(stateDirectory);
  privateFolder(paths.folder);
  const token = crypto.randomBytes(32).toString("hex");
  fs.rmSync(paths.token, { force: true });
  fs.writeFileSync(paths.token, token + "\n", { mode: 0o600 });
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    serveConnection(socket, { tokenFile: paths.token, handle });
  });
  let address;
  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      // Loopback only, hardcoded: no option or variable names another host.
      server.listen({ host: "127.0.0.1", port: 0 }, resolve);
    });
    address = { host: "127.0.0.1", port: server.address().port };
  } else {
    const file = socketPath(stateDirectory);
    privateFolder(path.dirname(file));
    fs.rmSync(file, { force: true });
    const mask = process.umask(0o077);
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(file, resolve);
      });
    } finally {
      process.umask(mask);
    }
    fs.chmodSync(file, 0o600);
    address = { socket: file };
  }
  return {
    address,
    close() {
      for (const socket of sockets) socket.destroy();
      server.close();
      if (address.socket) fs.rmSync(address.socket, { force: true });
    },
  };
}

function serveConnection(socket, { tokenFile, handle }) {
  let buffered = "",
    claim = null,
    queue = Promise.resolve();
  const send = (value) => {
    if (!socket.destroyed) socket.write(JSON.stringify(value) + "\n");
  };
  const take = (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return socket.destroy();
    }
    if (!message || typeof message !== "object" || Array.isArray(message))
      return socket.destroy();
    if (!claim) {
      if (!tokenMatches(tokenFile, message.hello?.token))
        return socket.destroy();
      claim = message.hello.claim ?? {};
      return send({ hello: "ok" });
    }
    // Notifications get no reply.
    if (!Object.hasOwn(message, "id")) return;
    if (!CONTROL_METHODS.has(message.method))
      return send(rpcError(message.id, -32601, "Method not found"));
    queue = queue.then(async () => {
      try {
        const reply = await handle(message, claim);
        if (reply) send(reply);
      } catch (error) {
        send(rpcError(message.id, -32603, error.message));
      }
    });
  };
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffered += chunk;
    if (buffered.length > MAX_LINE) return socket.destroy();
    let end;
    while ((end = buffered.indexOf("\n")) >= 0) {
      const line = buffered.slice(0, end).trim();
      buffered = buffered.slice(end + 1);
      if (line) take(line);
      if (socket.destroyed) return;
    }
  });
  socket.on("error", () => {});
}

// Connect as a client: send the hello and return { call, close }. `call`
// sends one message and resolves with its reply. Refused when the token is
// wrong or the server closes.
export function connectControl(address, { token, claim = {} }) {
  return new Promise((resolve, reject) => {
    const socket = address.socket
      ? net.connect(address.socket)
      : net.connect(address.port, "127.0.0.1");
    let buffered = "",
      hello = false;
    const waiting = new Map();
    const fail = (error) => {
      for (const done of waiting.values()) done.reject(error);
      waiting.clear();
      if (!hello) reject(error);
    };
    socket.setEncoding("utf8");
    socket.on("error", fail);
    socket.on("close", () =>
      fail(Error("The machine server closed the connection.")),
    );
    socket.on("data", (chunk) => {
      buffered += chunk;
      let end;
      while ((end = buffered.indexOf("\n")) >= 0) {
        const value = JSON.parse(buffered.slice(0, end));
        buffered = buffered.slice(end + 1);
        if (!hello) {
          hello = true;
          resolve({
            call(message) {
              return new Promise((ok, no) => {
                waiting.set(message.id, { resolve: ok, reject: no });
                socket.write(JSON.stringify(message) + "\n");
              });
            },
            send(message) {
              socket.write(JSON.stringify(message) + "\n");
            },
            close() {
              socket.end();
            },
          });
        } else {
          const done = waiting.get(value.id);
          waiting.delete(value.id);
          done?.resolve(value);
        }
      }
    });
    socket.on("connect", () =>
      socket.write(JSON.stringify({ hello: { token, claim } }) + "\n"),
    );
  });
}
