// The egress proxy (MS5.5): loopback only, CONNECT only to the listed
// hosts, host names only in its log; and a child of a definition with
// `egress` and `credentialExport` gets the proxy and the exported keys.
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import {
  EGRESS_BIND,
  createEgressProxy,
  egressAllows,
  egressProblem,
  listenLoopback,
  startEgressProxy,
} from "../egress-proxy.ts";
import { harnessNetwork } from "../harness-network.ts";
import { scratchRoot } from "./process-machine.mjs";

// Send one CONNECT through the proxy; resolve to everything read back.
function connect(port: number, target: string, extra = "") {
  return new Promise<string>((resolve) => {
    const socket = net.connect(port, EGRESS_BIND, () =>
      socket.write(
        `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${extra}\r\n`,
      ),
    );
    let text = "";
    socket.on("data", (chunk) => {
      text += chunk;
      if (text.includes("hello from upstream") || text.includes("403"))
        socket.end();
    });
    socket.on("close", () => resolve(text));
    socket.on("error", () => resolve(text));
  });
}

async function setup(t: test.TestContext) {
  const upstream = net.createServer((socket) =>
    socket.end("hello from upstream"),
  );
  const upstreamPort = await listenLoopback(upstream as never);
  const lines: string[] = [];
  const proxy = createEgressProxy({
    hosts: ["localhost"],
    ports: [upstreamPort],
    log: (line) => lines.push(line),
  });
  const port = await listenLoopback(proxy);
  t.after(() => {
    proxy.close();
    upstream.close();
  });
  return { port, upstreamPort, lines, proxy };
}

test("an allowed host tunnels through", async (t) => {
  const { port, upstreamPort, lines } = await setup(t);
  const text = await connect(port, `localhost:${upstreamPort}`);
  assert.match(text, /200 Connection Established/);
  assert.match(text, /hello from upstream/);
  assert.deepEqual(lines, ["allow localhost"]);
});

test("any other host or port is refused, and the log holds host names only", async (t) => {
  const { port, upstreamPort, lines } = await setup(t);
  assert.match(
    await connect(
      port,
      "example.com:443",
      "Proxy-Authorization: secret-value\r\n",
    ),
    /403/,
  );
  assert.match(await connect(port, `localhost:${upstreamPort + 1}`), /403/);
  assert.deepEqual(lines, ["deny example.com", "deny localhost"]);
  assert.doesNotMatch(lines.join("\n"), /secret-value|Proxy-Authorization/);
});

test("the proxy binds the loopback address only", async (t) => {
  const { proxy } = await setup(t);
  const address = proxy.address();
  assert.equal(typeof address === "object" && address?.address, "127.0.0.1");
  assert.equal(EGRESS_BIND, "127.0.0.1");
});

test("egress patterns match one label per * and nothing more", () => {
  const hosts = ["bedrock-runtime.*.amazonaws.com"];
  assert.ok(egressAllows(hosts, "bedrock-runtime.us-west-2.amazonaws.com"));
  assert.ok(egressAllows(hosts, "Bedrock-Runtime.US-WEST-2.amazonaws.com"));
  for (const host of [
    "bedrock-runtime.a.b.amazonaws.com",
    "bedrock-runtime.amazonaws.com",
    "bedrock-runtime.us-west-2.amazonaws.com.evil.example",
    "evil.us-west-2.amazonaws.com",
  ])
    assert.equal(egressAllows(hosts, host), false, host);
  assert.equal(egressProblem(hosts), null);
  for (const bad of [["*"], ["*.com"], ["bedrock.*"], ["a.*.*"], [], "x.com"])
    assert.ok(egressProblem(bad), JSON.stringify(bad));
});

test("a session's proxy runs on its own on loopback and ends with the run", async (t) => {
  const { root } = scratchRoot(t, "avoozl-egress-");
  const exitFile = path.join(root, "exit.json");
  const proxy = startEgressProxy({
    hosts: ["bedrock-runtime.*.amazonaws.com"],
    folder: root,
    exitFile,
  });
  assert.ok(proxy.port > 0);
  assert.match(await connect(proxy.port, "example.com:443"), /403/);
  fs.writeFileSync(exitFile, "{}");
  const end = Date.now() + 10_000;
  let alive = true;
  while (alive && Date.now() < end) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      process.kill(proxy.pid, 0);
    } catch {
      alive = false;
    }
  }
  assert.equal(alive, false);
  assert.equal(
    fs
      .readFileSync(path.join(root, "egress.log"), "utf8")
      .includes("deny example.com"),
    true,
  );
});

test("a definition's child gets the proxy, its port, and the exported keys", (t) => {
  const { root, defer } = scratchRoot(t, "avoozl-egress-");
  const exporter = path.join(root, "export.mjs");
  fs.writeFileSync(
    exporter,
    `console.log(JSON.stringify({ Version: 1, AccessKeyId: "AKIDTEST", SecretAccessKey: "s3cr3t", SessionToken: "tok" }))`,
  );
  const exitFile = path.join(root, "exit.json");
  defer(() => reach.proxy && process.kill(reach.proxy.pid));
  const reach = harnessNetwork(
    {
      name: "fake-cli",
      egress: ["bedrock-runtime.*.amazonaws.com"],
      credentialExport: [process.execPath, exporter],
      setEnv: { SSL_CERT_FILE: "/etc/ssl/cert.pem" },
    },
    { env: process.env, machineEnv: {}, folder: root, exitFile },
  );
  assert.ok(reach.proxy);
  assert.deepEqual(reach.ports, [`localhost:${reach.proxy.port}`]);
  assert.equal(reach.env.HTTPS_PROXY, `http://127.0.0.1:${reach.proxy.port}`);
  assert.equal(reach.env.AWS_ACCESS_KEY_ID, "AKIDTEST");
  assert.equal(reach.env.AWS_SECRET_ACCESS_KEY, "s3cr3t");
  assert.equal(reach.env.AWS_SESSION_TOKEN, "tok");
  assert.equal(reach.env.SSL_CERT_FILE, "/etc/ssl/cert.pem");
  assert.deepEqual(reach.keep, [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
  ]);
});

test("a failed credential export names its exit and never its output", (t) => {
  const { root } = scratchRoot(t, "avoozl-egress-");
  const exporter = path.join(root, "export.mjs");
  fs.writeFileSync(exporter, `console.log("leaked-value"); process.exit(2)`);
  assert.throws(
    () =>
      harnessNetwork(
        { name: "fake-cli", credentialExport: [process.execPath, exporter] },
        {
          env: process.env,
          machineEnv: {},
          folder: root,
          exitFile: path.join(root, "exit.json"),
        },
      ),
    (error: Error) =>
      /exited 2/.test(error.message) && !error.message.includes("leaked-value"),
  );
});
