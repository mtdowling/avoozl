// A contained session's egress proxy (vm-harness D3, VM3.6, VM3.9). The
// agent CLI on the host reaches the network only through it. It is a
// CONNECT proxy: it tunnels TLS to the `host:port` pairs its harness's
// `box.hosts` lists and refuses every plain request and every other host.
// It never decrypts and never reads past the CONNECT request, so it never
// sees a credential (VM3.2), and it logs no header.
//
// On macOS it listens on 127.0.0.1 and a random port, which only its own
// session's sandbox profile names. On Linux it listens on a Unix socket in a
// 0700 folder, mode 0600, bound only into its own session's namespace,
// where box-forward.mjs carries the CLI's loopback port to it.
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const LOOPBACK = "127.0.0.1";

// Start one proxy. `hosts` are `host:port` pairs; `listen` is {path} for a
// Unix socket, else {port} or a random loopback port; `log(entry)` gets one entry per
// tunnel or refusal: {at, host, port, up, down} or {at, refused, ...}.
// `dial(host, port)` opens the upstream (a test's fake). Resolves to
// {port?, path?, close()}.
export async function startEgressProxy({
  hosts,
  listen = {},
  log = () => {},
  dial = (host, port) => net.connect(port, host),
}) {
  const allowed = new Set(hosts.map((pair) => pair.toLowerCase()));
  const stamp = () => new Date().toISOString();
  const server = http.createServer((req, res) => {
    // A plain request: only its method is logged, never its URL or headers.
    log({ at: stamp(), refused: "plain request", method: req.method });
    res.writeHead(403, { connection: "close" }).end();
  });
  server.on("connect", (req, client, head) => {
    const target = String(req.url ?? "").toLowerCase(),
      match = /^([a-z0-9.-]{1,253}):([0-9]{1,5})$/.exec(target);
    if (!match || !allowed.has(target)) {
      log({
        at: stamp(),
        refused: "host",
        host: match?.[1] ?? null,
        port: match ? Number(match[2]) : null,
      });
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const [, host, portText] = match,
      port = Number(portText),
      entry = { at: stamp(), host, port, up: 0, down: 0 };
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      upstream.destroy();
      client.destroy();
      log(error ? { ...entry, error: error.code ?? "error" } : entry);
    };
    const upstream = dial(host, port);
    upstream.once("connect", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) {
        entry.up += head.length;
        upstream.write(head);
      }
      upstream.on("data", (chunk) => {
        entry.down += chunk.length;
      });
      client.on("data", (chunk) => {
        entry.up += chunk.length;
      });
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on("error", finish);
    client.on("error", finish);
    upstream.on("close", () => finish());
    client.on("close", () => finish());
  });
  if (listen.path) {
    const folder = path.dirname(listen.path);
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    fs.chmodSync(folder, 0o700);
    fs.rmSync(listen.path, { force: true });
  }
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    if (listen.path) server.listen(listen.path, resolve);
    else server.listen(listen.port ?? 0, LOOPBACK, resolve);
  });
  if (listen.path) fs.chmodSync(listen.path, 0o600);
  const address = server.address();
  return {
    ...(listen.path ? { path: listen.path } : { port: address.port }),
    address,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}

// A JSON-lines log file for a session's evidence, mode 0600.
export function jsonLinesLog(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  return (entry) =>
    fs.appendFileSync(file, JSON.stringify(entry) + "\n", { mode: 0o600 });
}

// The entries of a JSON-lines log, or [].
export function readJsonLines(file) {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
