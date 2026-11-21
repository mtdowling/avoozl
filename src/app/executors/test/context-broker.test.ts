// The MCP broker and relay (epic-context ec-2.3): one socket per session,
// a token and an alias to get in, the real server started outside any
// sandbox on the first connection, the evidence a call leaves, and the stop.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createBroker,
  type BrokerCall,
  type BrokerViolation,
} from "../context-broker.ts";
import { temporaryDirectory } from "../../test/temporary.ts";

const RELAY = fileURLToPath(new URL("../context-relay.ts", import.meta.url));
const posix = process.platform !== "win32";
const skip = !posix && "the broker uses a Unix socket";

// A server with one tool; it records its pid and environment names.
function fakeServer(folder: string, { listen = false } = {}) {
  const file = path.join(folder, `server-${listen ? "listen" : "plain"}.mjs`);
  fs.writeFileSync(
    file,
    `
import fs from "node:fs";
import net from "node:net";
import readline from "node:readline";
fs.writeFileSync(${JSON.stringify(path.join(folder, "server.json"))}, JSON.stringify({ pid: process.pid, env: Object.keys(process.env), cwd: process.cwd() }));
${listen ? 'net.createServer().listen(0, "127.0.0.1");' : ""}
const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\\n");
for await (const line of readline.createInterface({ input: process.stdin })) {
  const m = JSON.parse(line);
  if (m.method === "tools/call") send({ id: m.id, result: { content: [{ type: "text", text: "answer" }] } });
  else if (m.method === "boom") send({ id: m.id, error: { code: -32000, message: "no" } });
  else send({ id: m.id, result: {} });
}
`,
  );
  return [process.execPath, file];
}

// A relay process, as a harness starts it; resolves with its lines.
function relay(socket: string, token: string, alias: string) {
  const child = spawn(
    process.execPath,
    [RELAY, "--socket", socket, "--token", token, "--alias", alias],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const lines: string[] = [];
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    for (let at; (at = buffer.indexOf("\n")) >= 0; ) {
      lines.push(buffer.slice(0, at));
      buffer = buffer.slice(at + 1);
    }
  });
  const exited = new Promise((resolve) => child.on("exit", resolve));
  const next = async () => {
    for (let i = 0; i < 200 && !lines.length; i++)
      await new Promise((r) => setTimeout(r, 25));
    return lines.shift() ?? "";
  };
  const call = (message: Record<string, unknown>) =>
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
  return { child, call, next, exited };
}

const gone = (pid: number) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
};

test("the socket sits in a private folder and each call leaves a record without its arguments", {
  skip,
}, async (t) => {
  const folder = temporaryDirectory("avoozl-broker-"),
    calls: BrokerCall[] = [],
    broker = createBroker({ onCall: (entry) => calls.push(entry) });
  t.after(() => broker.closeAll());
  const { socket, token } = broker.open({
    session: "process-a",
    servers: {
      research: { command: fakeServer(folder), env: ["MAPPED_NAME"] },
    },
  });
  assert.equal(fs.statSync(path.dirname(socket)).mode & 0o777, 0o700);
  assert.equal(fs.statSync(socket).mode & 0o777, 0o600);
  process.env.MAPPED_NAME = "kept";
  process.env.UNMAPPED_NAME = "dropped";
  t.after(() => {
    delete process.env.MAPPED_NAME;
    delete process.env.UNMAPPED_NAME;
  });
  const r = relay(socket, token, "research");
  r.call({
    id: 1,
    method: "tools/call",
    params: { name: "ask", arguments: { question: "SECRET-ARGUMENT" } },
  });
  assert.match(await r.next(), /"answer"/);
  r.call({ id: 2, method: "boom" });
  await r.next();
  r.call({ id: 3, method: "tools/call", params: { name: "other" } });
  await r.next();
  assert.deepEqual(
    calls.map((c) => [c.alias, c.tool, c.session]),
    [
      ["research", "ask", "process-a"],
      ["research", "other", "process-a"],
    ],
  );
  assert.ok(calls.every((c) => c.bytes > 0 && c.ms >= 0 && c.at));
  assert.doesNotMatch(JSON.stringify(calls), /SECRET-ARGUMENT|answer/);
  // The real server ran in a scratch folder with the mapped name only.
  const server = JSON.parse(
    fs.readFileSync(path.join(folder, "server.json"), "utf8"),
  );
  assert.ok(server.env.includes("MAPPED_NAME"));
  assert.ok(!server.env.includes("UNMAPPED_NAME"));
  assert.notEqual(server.cwd, process.cwd());
  r.child.stdin.end();
  await r.exited;
  // The server stops with its connection.
  for (let i = 0; i < 100 && !gone(server.pid); i++)
    await new Promise((resolve) => setTimeout(resolve, 25));
  assert.ok(gone(server.pid));
});

test("a wrong token, an alias the session was not given and another session's socket are refused", {
  skip,
}, async (t) => {
  const folder = temporaryDirectory("avoozl-broker-"),
    broker = createBroker();
  t.after(() => broker.closeAll());
  const servers = { research: { command: fakeServer(folder), env: [] } };
  const a = broker.open({ session: "process-a", servers }),
    b = broker.open({ session: "process-b", servers });
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.socket, b.socket);
  const refused = async (socket: string, token: string, alias: string) => {
    const r = relay(socket, token, alias);
    r.call({ id: 1, method: "tools/call", params: { name: "ask" } });
    await r.exited;
    assert.equal(r.child.stdout.read(), null);
  };
  await refused(a.socket, "wrong", "research");
  await refused(a.socket, a.token, "docs");
  await refused(a.socket, b.token, "research");
  await refused(b.socket, a.token, "research");
  assert.ok(
    !fs.existsSync(path.join(folder, "server.json")),
    "no server started",
  );
});

test("closing a session stops its servers and removes its socket", {
  skip,
}, async (t) => {
  const folder = temporaryDirectory("avoozl-broker-"),
    broker = createBroker();
  t.after(() => broker.closeAll());
  const { socket, token } = broker.open({
    session: "process-a",
    servers: { research: { command: fakeServer(folder), env: [] } },
  });
  const r = relay(socket, token, "research");
  r.call({ id: 1, method: "tools/call", params: { name: "ask" } });
  await r.next();
  const { pid } = JSON.parse(
    fs.readFileSync(path.join(folder, "server.json"), "utf8"),
  );
  broker.close("process-a");
  await r.exited;
  for (let i = 0; i < 100 && !gone(pid); i++)
    await new Promise((resolve) => setTimeout(resolve, 25));
  assert.ok(gone(pid));
  assert.ok(!fs.existsSync(path.dirname(socket)));
  assert.equal(broker.has("process-a"), false);
  await assert.rejects(
    new Promise((resolve, reject) =>
      net.connect(socket).on("connect", resolve).on("error", reject),
    ),
  );
});

test("a server that opens a listener is stopped and reported", {
  skip: skip || (process.platform === "darwin" && "lsof lists differently"),
}, async (t) => {
  const folder = temporaryDirectory("avoozl-broker-"),
    violations: BrokerViolation[] = [],
    broker = createBroker({
      onViolation: (value) => violations.push(value),
      listenerMs: 100,
    });
  t.after(() => broker.closeAll());
  const { socket, token } = broker.open({
    session: "process-a",
    servers: {
      research: {
        command: fakeServer(folder, { listen: true }),
        env: [],
        plugin: "team-context",
      },
    },
  });
  const r = relay(socket, token, "research");
  r.call({ id: 1, method: "tools/call", params: { name: "ask" } });
  await r.exited;
  assert.equal(violations.length, 1);
  assert.equal(violations[0].plugin, "team-context");
  assert.match(violations[0].reason, /opened a network listener/);
  assert.ok(
    gone(
      JSON.parse(fs.readFileSync(path.join(folder, "server.json"), "utf8")).pid,
    ),
  );
});
