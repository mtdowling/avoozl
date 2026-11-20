// The machine server's control interface (MS9): a private listener, a token
// first, one JSON object per line, MCP calls run as an agent, and nothing a
// sandboxed child can reach.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  connectControl,
  controlPaths,
  shortSocketFolder,
  startControl,
} from "../control-server.mjs";
import { serveControl } from "../machine-control.mjs";
import { machineLockPaths, readRecord, takeLock } from "../machine-lock.mjs";
import { confineChild, sandboxKind, sandboxSecretPaths } from "../sandbox.mjs";
import { initializeWorkspace } from "../../workspace/workspace.mjs";

const real = (file) => fs.realpathSync.native(file);
const posix = process.platform !== "win32";

function scratch(t, name = "avoozl-control-") {
  const root = real(fs.mkdtempSync(path.join(os.tmpdir(), name)));
  t.after(() =>
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10 }),
  );
  return root;
}

async function started(t, root, handle = async () => null) {
  const stateDirectory = path.join(root, "state");
  const control = await startControl({ stateDirectory, handle });
  t.after(() => control.close());
  const token = fs
    .readFileSync(controlPaths(stateDirectory).token, "utf8")
    .trim();
  return { stateDirectory, control, token };
}

// Open a raw connection, send these lines, and resolve with what came back
// before the server closed it (or after a short wait).
function raw(address, lines) {
  return new Promise((resolve) => {
    const socket = address.socket
      ? net.connect(address.socket)
      : net.connect(address.port, "127.0.0.1");
    let out = "",
      closed = false;
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => (out += chunk));
    socket.on("close", () => {
      closed = true;
      resolve({ out, closed });
    });
    socket.on("error", () => {});
    socket.on("connect", () => {
      for (const line of lines) socket.write(line + "\n");
      setTimeout(() => {
        if (!closed) {
          socket.destroy();
          resolve({ out, closed: false });
        }
      }, 500);
    });
  });
}

const ping = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

test("the listener is a 0600 socket in a 0700 folder, or 127.0.0.1 on Windows", async (t) => {
  const root = scratch(t);
  const { control, stateDirectory } = await started(t, root);
  if (posix) {
    const near = controlPaths(stateDirectory).socket;
    assert.equal(
      control.address.socket,
      near.length <= 100
        ? near
        : control.address.socket.startsWith(shortSocketFolder() + path.sep)
          ? control.address.socket
          : near,
    );
    assert.equal(fs.statSync(control.address.socket).mode & 0o777, 0o600);
    assert.equal(
      fs.statSync(path.dirname(control.address.socket)).mode & 0o777,
      0o700,
    );
  } else {
    assert.equal(control.address.host, "127.0.0.1");
    assert.ok(control.address.port > 0);
  }
  if (posix)
    assert.equal(
      fs.statSync(controlPaths(stateDirectory).token).mode & 0o777,
      0o600,
    );
  // No option, setting or variable names another address.
  const source = fs.readFileSync(
    new URL("../control-server.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /process\.env|0\.0\.0\.0|\[::\]/);
  for (const [, value] of source.matchAll(/host:\s*([^,}]+)/g))
    assert.equal(value.trim(), '"127.0.0.1"');
});

test("a wrong or missing token, a missing hello and an HTTP line close the connection with nothing run", async (t) => {
  const root = scratch(t);
  let ran = 0;
  const { control, token } = await started(t, root, async (message) => {
    ran += 1;
    return { jsonrpc: "2.0", id: message.id, result: {} };
  });
  for (const lines of [
    [
      JSON.stringify({ hello: { token: "0".repeat(64) } }),
      JSON.stringify(ping),
    ],
    [JSON.stringify({ hello: {} }), JSON.stringify(ping)],
    [JSON.stringify(ping)],
    ["POST / HTTP/1.1", "Host: 127.0.0.1", ""],
    ["[1, 2]"],
  ]) {
    const result = await raw(control.address, lines);
    assert.equal(result.closed, true, lines[0]);
    assert.equal(result.out, "", lines[0]);
  }
  assert.equal(ran, 0);
  // The right token is answered.
  const client = await connectControl(control.address, { token });
  t.after(() => client.close());
  const reply = await client.call(ping);
  assert.deepEqual(reply.result, {});
  assert.equal(ran, 1);
  // Only the handshake and the tool calls are served.
  const other = await client.call({
    jsonrpc: "2.0",
    id: 2,
    method: "prompts/list",
  });
  assert.equal(other.error.code, -32601);
});

test("with no token file every call is refused", async (t) => {
  const root = scratch(t);
  const { control, token, stateDirectory } = await started(t, root);
  fs.rmSync(controlPaths(stateDirectory).token);
  await assert.rejects(connectControl(control.address, { token }));
});

test("a person-only operation is refused through it, and a call is answered", async (t) => {
  const root = scratch(t);
  const workspace = path.join(root, "ws");
  initializeWorkspace(workspace, { name: "ws" });
  const stateDirectory = path.join(root, "state");
  const lock = takeLock(machineLockPaths(stateDirectory), { pid: process.pid });
  t.after(() => lock.close());
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(root, "config"),
  };
  for (const key of Object.keys(env)) if (/^AVOOZL_/.test(key)) delete env[key];
  const served = await serveControl({ stateDirectory, env });
  t.after(() => served.close());
  assert.deepEqual(
    readRecord(machineLockPaths(stateDirectory).record).control,
    served.address,
  );
  const token = fs
    .readFileSync(controlPaths(stateDirectory).token, "utf8")
    .trim();
  const client = await connectControl(served.address, {
    token,
    claim: { workspace },
  });
  t.after(() => client.close());
  const list = await client.call(ping);
  assert.ok(list.result.tools.some((tool) => tool.name === "plans_task"));
  const approve = await client.call({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "plans_approve_plan", arguments: { input: { id: "x" } } },
  });
  assert.equal(approve.result.isError, true);
  assert.match(approve.result.content[0].text, /^Only a person/);
});

test("a long state path puts the socket in the short private folder", {
  skip: !posix && "Windows listens on 127.0.0.1",
}, async (t) => {
  const root = scratch(t);
  const deep = path.join(root, "x".repeat(60), "y".repeat(60), "state");
  const { control } = await started(t, deep);
  assert.equal(path.dirname(control.address.socket), shortSocketFolder());
  assert.equal(fs.statSync(shortSocketFolder()).mode & 0o777, 0o700);
  assert.equal(fs.statSync(control.address.socket).mode & 0o777, 0o600);
  // A second machine on another long path gets a socket of its own.
  const other = await started(t, path.join(deep, "..", "other"));
  assert.notEqual(other.control.address.socket, control.address.socket);
  assert.ok(fs.existsSync(control.address.socket));
});

test("the token is in no record or status", async (t) => {
  const root = scratch(t);
  const stateDirectory = path.join(root, "state");
  const lock = takeLock(machineLockPaths(stateDirectory), { pid: process.pid });
  t.after(() => lock.close());
  const served = await serveControl({ stateDirectory, env: process.env });
  t.after(() => served.close());
  const token = fs
    .readFileSync(controlPaths(stateDirectory).token, "utf8")
    .trim();
  const { machineStatus } = await import("../../workspace/machine-status.mjs");
  const seen =
    fs.readFileSync(machineLockPaths(stateDirectory).record, "utf8") +
    JSON.stringify(machineStatus({ stateDirectory, configDirectory: root }));
  assert.equal(seen.includes(token), false);
});

test("a confined child can neither connect to the socket nor read the token", {
  skip:
    !sandboxKind() &&
    !process.env.AVOOZL_REQUIRE_SANDBOX &&
    "this machine has no usable sandbox",
}, async (t) => {
  assert.ok(
    sandboxKind(),
    "AVOOZL_REQUIRE_SANDBOX is set and there is no sandbox",
  );
  const root = scratch(t);
  const home = path.join(root, "home");
  const configDirectory = path.join(home, ".config", "avoozl");
  fs.mkdirSync(configDirectory, { recursive: true });
  const { control, stateDirectory } = await started(
    t,
    path.join(home, ".local"),
  );
  const worktree = path.join(root, "worktree");
  fs.mkdirSync(worktree);
  const probe = `
const fs = require("node:fs"), net = require("node:net");
const [socket, token] = process.argv.slice(1);
let read = "refused";
try { fs.readFileSync(token); read = "ok"; } catch {}
const s = net.connect(socket);
s.on("connect", () => { console.log(JSON.stringify({ read, connect: "ok" })); s.end(); });
s.on("error", (e) => console.log(JSON.stringify({ read, connect: e.code })));
`;
  const confined = confineChild(
    [
      process.execPath,
      "-e",
      probe,
      control.address.socket,
      controlPaths(stateDirectory).token,
    ],
    {
      definition: { name: "stand-in", hash: "c".repeat(64) },
      configDirectory,
      writeRoots: [worktree],
      secrets: sandboxSecretPaths({
        home,
        env: { HOME: home },
        configDirectory,
        stateDirectory,
      }),
      env: { PATH: process.env.PATH, HOME: home },
    },
  );
  const out = await new Promise((resolve) => {
    const child = spawn(confined.argv[0], confined.argv.slice(1), {
      env: confined.env,
      cwd: worktree,
    });
    let text = "";
    child.stdout.on("data", (chunk) => (text += chunk));
    child.on("exit", () => resolve(JSON.parse(text.trim() || "{}")));
  });
  assert.notEqual(out.read, "ok");
  assert.notEqual(out.connect, "ok");
});
