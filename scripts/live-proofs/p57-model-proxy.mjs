// P57 model proxy: an HTTPS CONNECT proxy on 127.0.0.1 that tunnels only to
// AWS Bedrock runtime hosts on port 443, so a sandboxed child whose network is
// limited to one loopback port (sandbox.network ["localhost:PORT"]) can reach
// its model and nothing else. Every request is logged as allowed or denied.
//
//   node model-proxy.mjs PORT LOGFILE
import fs from "node:fs";
import http from "node:http";
import net from "node:net";

const [port, logFile] = [Number(process.argv[2] || 18457), process.argv[3]];
const ALLOW = /^bedrock-runtime(-fips)?\.[a-z0-9-]+\.amazonaws\.com:443$/;
const log = (line) =>
  logFile
    ? fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`)
    : console.log(line);

const server = http.createServer((req, res) => {
  log(`deny plain ${req.method} ${req.url}`);
  res.writeHead(403).end("Only CONNECT to Bedrock runtime is allowed.\n");
});
server.on("connect", (req, client, head) => {
  const target = String(req.url);
  if (!ALLOW.test(target)) {
    log(`deny connect ${target}`);
    client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }
  log(`allow connect ${target}`);
  const [host] = target.split(":");
  const upstream = net.connect(443, host, () => {
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
server.listen(port, "127.0.0.1", () => log(`listening 127.0.0.1:${port}`));
