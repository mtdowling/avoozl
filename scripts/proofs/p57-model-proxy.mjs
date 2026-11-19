// P57 model proxy: Avoozl's egress proxy (src/app/executors/egress-proxy.mjs)
// on 127.0.0.1, run by hand for a sandboxed child whose network is limited
// to one loopback port (sandbox.network ["localhost:PORT"]). It tunnels only
// to the host:443 pairs named on the command line, as a harness's
// `box.hosts` does, and logs each tunnel and refusal as one JSON line.
//
//   node p57-model-proxy.mjs PORT LOGFILE HOST:443...
import {
  jsonLinesLog,
  startEgressProxy,
} from "../../src/app/executors/egress-proxy.mjs";

const [port, logFile, ...hosts] = process.argv.slice(2);
if (!hosts.length) {
  console.error("usage: p57-model-proxy.mjs PORT LOGFILE HOST:443...");
  process.exit(2);
}
await startEgressProxy({
  hosts,
  listen: { port: Number(port) },
  log: jsonLinesLog(logFile),
});
console.log(`listening 127.0.0.1:${port}`);
