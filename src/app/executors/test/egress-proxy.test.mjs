// A contained session's egress proxy (vm-harness vm-2.4, D3): CONNECT to its
// harness's hosts only, no plain request, no header in its log, loopback or
// a 0600 Unix socket only.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { startEgressProxy } from "../egress-proxy.mjs";
import { confineChild, sandboxKind } from "../sandbox.mjs";

const FORWARD = fileURLToPath(new URL("../box-forward.mjs", import.meta.url));

// An upstream that echoes, standing in for a model host.
async function echoServer(t) {
  const server = net.createServer((socket) => socket.pipe(socket));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  return server.address().port;
}

// Send `request` to the proxy and read until the socket ends or `until`
// shows in the reply.
function talk(connect, request, { until, then } = {}) {
  return new Promise((resolve, reject) => {
    const socket = connect();
    let reply = "";
    socket.on("data", (chunk) => {
      reply += chunk;
      if (until && reply.includes(until)) {
        if (then) {
          const text = then;
          then = null;
          socket.write(text);
          until = text;
          return;
        }
        socket.end();
      }
    });
    socket.on("end", () => resolve(reply));
    socket.on("close", () => resolve(reply));
    socket.on("error", reject);
    socket.write(request);
  });
}

async function proxy(t, options = {}) {
  const entries = [];
  const echo = await echoServer(t);
  const started = await startEgressProxy({
    hosts: ["api.example.com:443"],
    log: (entry) => entries.push(entry),
    dial: (_host, _port) => net.connect(echo, "127.0.0.1"),
    ...options,
  });
  t.after(() => started.close());
  return { started, entries };
}

test("CONNECT to a listed host tunnels; any other host or port is refused", async (t) => {
  const { started, entries } = await proxy(t);
  assert.equal(started.address.address, "127.0.0.1");
  const connect = () => net.connect(started.port, "127.0.0.1");
  const tunneled = await talk(
    connect,
    "CONNECT api.example.com:443 HTTP/1.1\r\nHost: api.example.com:443\r\nProxy-Authorization: Basic c2VjcmV0\r\n\r\n",
    { until: "\r\n\r\n", then: "hello-through" },
  );
  assert.match(tunneled, /^HTTP\/1\.1 200 Connection Established/);
  assert.match(tunneled, /hello-through$/);
  for (const target of [
    "evil.example.com:443",
    "api.example.com:80",
    "1.1.1.1:443",
  ]) {
    const refused = await talk(
      connect,
      `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`,
    );
    assert.match(refused, /^HTTP\/1\.1 403/, target);
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  const tunnel = entries.find((entry) => !entry.refused);
  assert.equal(tunnel.host, "api.example.com");
  assert.equal(tunnel.port, 443);
  assert.ok(
    tunnel.up >= "hello-through".length &&
      tunnel.down >= "hello-through".length,
  );
  assert.match(tunnel.at, /^\d{4}-/);
  assert.deepEqual(
    entries
      .filter((entry) => entry.refused)
      .map((entry) => [entry.host, entry.port]),
    [
      ["evil.example.com", 443],
      ["api.example.com", 80],
      ["1.1.1.1", 443],
    ],
  );
  // No header value, and so no credential, reaches the log.
  assert.doesNotMatch(JSON.stringify(entries), /c2VjcmV0|Basic|Authorization/i);
});

test("a plain request is refused, and only its method is logged", async (t) => {
  const { started, entries } = await proxy(t);
  const reply = await talk(
    () => net.connect(started.port, "127.0.0.1"),
    "GET http://api.example.com/?token=abc HTTP/1.1\r\nHost: api.example.com\r\nAuthorization: Bearer abc\r\n\r\n",
  );
  assert.match(reply, /^HTTP\/1\.1 403/);
  assert.deepEqual(
    entries.map(({ refused, method }) => ({ refused, method })),
    [{ refused: "plain request", method: "GET" }],
  );
  assert.doesNotMatch(JSON.stringify(entries), /abc/);
});

test("on Linux the proxy listens on a 0600 socket, and the forwarder carries the CLI's loopback port to it", async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-egress-")),
    socket = path.join(folder, "box", "proxy.sock");
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const { started } = await proxy(t, { listen: { path: socket } });
  assert.equal(started.path, socket);
  assert.equal(fs.statSync(socket).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(socket)).mode & 0o777, 0o700);
  // The forwarder runs a child that speaks CONNECT to its loopback port.
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = [
    process.execPath,
    "-e",
    `const net=require("net");const s=net.connect(${port},"127.0.0.1");let r="";s.on("data",d=>{r+=d;if(r.includes("\\r\\n\\r\\n")&&!r.includes("ping")){s.write("ping")}else if(r.endsWith("ping")){console.log(r.split("\\r\\n")[0]);s.end()}});s.write("CONNECT api.example.com:443 HTTP/1.1\\r\\n\\r\\n");`,
  ];
  const run = await new Promise((resolve) => {
    const out = { stdout: "", stderr: "" };
    const forwarder = spawn(
      process.execPath,
      [FORWARD, String(port), socket, "--", ...child],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    forwarder.stdout.on("data", (d) => (out.stdout += d));
    forwarder.stderr.on("data", (d) => (out.stderr += d));
    forwarder.on("exit", (status) => resolve({ ...out, status }));
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /HTTP\/1\.1 200 Connection Established/);
});

const macos =
  process.platform === "darwin" && sandboxKind()
    ? false
    : "needs macOS with sandbox-exec usable here (not nested in another sandbox)";

test("on macOS a child of another session cannot reach this session's proxy port", {
  skip: macos,
}, async (t) => {
  const { started } = await proxy(t);
  const probe = [
    process.execPath,
    "-e",
    `const s=require("net").connect(${started.port},"127.0.0.1");s.on("connect",()=>{console.log("reached");process.exit(0)});s.on("error",()=>{console.log("blocked");process.exit(0)})`,
  ];
  const run = (ports) => {
    const confined = confineChild(probe, {
      definition: { name: "cli" },
      writeRoots: [os.tmpdir()],
      secrets: [],
      network: { mode: "restricted", ports },
      kind: "sandbox-exec",
    });
    return spawnSync(confined.argv[0], confined.argv.slice(1), {
      encoding: "utf8",
      env: confined.env,
    }).stdout.trim();
  };
  assert.equal(run([started.port + 1]), "blocked");
  assert.equal(run([started.port]), "reached");
});
