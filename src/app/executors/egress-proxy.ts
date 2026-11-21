// The egress proxy (MS5.5): an HTTPS CONNECT proxy on 127.0.0.1 that tunnels
// a sandboxed child only to the hosts its harness definition lists in
// `egress`, such as its model's API. The sandbox lets the child reach only
// this port, so the list is the child's whole network. It logs host names,
// never a header or a byte of a tunnel. Each session gets its own, as its
// own detached process (egress-proxy-main.ts), since the child outlives the
// tick that starts it.
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// The one address it binds. No setting changes it.
export const EGRESS_BIND = "127.0.0.1";
const EGRESS_MAIN = fileURLToPath(
  new URL("./egress-proxy-main.ts", import.meta.url),
);
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// Whether `pattern` names `host`: label by label, where `*` stands for one
// whole label.
export function egressAllows(patterns: readonly string[], host: string) {
  const labels = host.toLowerCase().split(".");
  return patterns.some((pattern) => {
    const want = pattern.split(".");
    return (
      want.length === labels.length &&
      want.every(
        (part, index) =>
          part === labels[index] || (part === "*" && LABEL.test(labels[index])),
      )
    );
  });
}

// A definition's `egress`: host names, each label a plain DNS label or `*`,
// with at least two labels and a fixed last two, such as
// bedrock-runtime.*.amazonaws.com. Returns a message, or null.
export function egressProblem(value: unknown): string | null {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 20 ||
    value.some((item) => {
      if (typeof item !== "string" || item.length > 253) return true;
      const labels = item.split(".");
      return (
        labels.length < 2 ||
        labels.slice(-2).includes("*") ||
        labels.some((label) => label !== "*" && !LABEL.test(label))
      );
    })
  )
    return "egress must list host names such as bedrock-runtime.*.amazonaws.com, where * stands for one label and the last two labels are fixed.";
  return null;
}

// The proxy itself, not yet listening. `ports` are the upstream ports a
// CONNECT may name: 443 for a session; a test names its own.
export function createEgressProxy({
  hosts,
  log = () => {},
  ports = [443],
}: {
  hosts: readonly string[];
  log?: (line: string) => void;
  ports?: readonly number[];
}) {
  const server = http.createServer((req, res) => {
    log("deny plain request");
    res.writeHead(403).end("Only CONNECT to the harness's egress hosts.\n");
  });
  server.on("connect", (req, client: net.Socket, head: Buffer) => {
    const match = /^([A-Za-z0-9.-]+):([0-9]{1,5})$/.exec(String(req.url));
    const host = match?.[1].toLowerCase() ?? "";
    const port = Number(match?.[2]);
    if (!match || !ports.includes(port) || !egressAllows(hosts, host)) {
      log(`deny ${host || "malformed"}`);
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    log(`allow ${host}`);
    const upstream = net.connect(port, host, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    const close = () => {
      upstream.destroy();
      client.destroy();
    };
    upstream.on("error", close);
    client.on("error", close);
  });
  return server;
}

// Listen on a free loopback port; resolves to the port.
export function listenLoopback(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, EGRESS_BIND, () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
}

// Start one session's proxy as a detached process that ends when `exitFile`
// appears or it is signaled. Waits for its port: {port, pid}.
export function startEgressProxy({
  hosts,
  folder,
  exitFile,
  env = process.env,
}: {
  hosts: readonly string[];
  folder: string;
  exitFile: string;
  env?: NodeJS.ProcessEnv;
}) {
  const portFile = path.join(folder, "egress-port");
  fs.rmSync(portFile, { force: true });
  const spec = path.join(folder, "egress-spec.json");
  fs.writeFileSync(
    spec,
    JSON.stringify({
      hosts,
      exitFile,
      portFile,
      log: path.join(folder, "egress.log"),
    }),
    { mode: 0o600 },
  );
  const child = spawn(process.execPath, [EGRESS_MAIN, spec], {
    detached: true,
    stdio: "ignore",
    env,
    windowsHide: true,
  });
  child.on("error", () => {});
  child.unref();
  const end = Date.now() + 10_000;
  while (!fs.existsSync(portFile) && Date.now() < end)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  const port = Number(
    fs.existsSync(portFile) ? fs.readFileSync(portFile, "utf8") : 0,
  );
  if (!port) {
    stopEgressProxy(child.pid);
    throw Error("The egress proxy did not start.");
  }
  return { port, pid: child.pid ?? 0 };
}

export function stopEgressProxy(pid: number | undefined) {
  if (!pid) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
}

// What a child gets to use it: the proxy variables, both spellings.
export const egressEnv = (port: number) => {
  const url = `http://${EGRESS_BIND}:${port}`;
  return { HTTPS_PROXY: url, https_proxy: url };
};
