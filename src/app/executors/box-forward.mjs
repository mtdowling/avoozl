// The forwarder inside a contained session's bubblewrap namespace on Linux
// (vm-harness D3). The namespace has no network but its own loopback, so the
// CLI's HTTPS_PROXY port is served here and each connection is carried to
// the session's egress proxy socket, the one socket bound in. Then it runs
// the CLI and exits with its code.
//
//   node box-forward.mjs PORT SOCKET -- PROGRAM ARG...
//
// It imports nothing outside Node, so the sandbox needs to open only this
// file.
import net from "node:net";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export function forward(port, socket) {
  const server = net.createServer((client) => {
    const upstream = net.connect(socket);
    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on("error", close);
    upstream.on("error", close);
    client.pipe(upstream);
    upstream.pipe(client);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function main(argv) {
  const at = argv.indexOf("--"),
    [port, socket] = argv.slice(0, at);
  if (at !== 2 || !/^[0-9]{1,5}$/.test(port) || !socket || !argv[at + 1]) {
    process.stderr.write(
      "usage: box-forward.mjs PORT SOCKET -- PROGRAM ARG...\n",
    );
    process.exit(2);
  }
  const server = await forward(Number(port), socket);
  const child = spawn(argv[at + 1], argv.slice(at + 2), { stdio: "inherit" });
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"])
    process.on(signal, () => child.kill(signal));
  child.on("error", (error) => {
    process.stderr.write(`box-forward: ${error.message}\n`);
    process.exit(127);
  });
  child.on("exit", (code, signal) => {
    server.close();
    process.exit(code ?? (signal ? 128 : 1));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2));
