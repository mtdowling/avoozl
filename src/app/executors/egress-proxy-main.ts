// One session's egress proxy as its own process (egress-proxy.ts):
//   node egress-proxy-main.ts <spec-file>
// The spec holds {hosts, exitFile, portFile, log} and no secret. It writes
// its port to portFile once it listens, and ends when exitFile appears or
// it is signaled.
import fs from "node:fs";
import { createEgressProxy, listenLoopback } from "./egress-proxy.ts";

const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
fs.rmSync(process.argv[2], { force: true });
const log = (line: string) => {
  try {
    fs.appendFileSync(spec.log, `${new Date().toISOString()} ${line}\n`, {
      mode: 0o600,
    });
  } catch {}
};
const server = createEgressProxy({ hosts: spec.hosts, log });
const port = await listenLoopback(server);
log(`listening ${port}`);
fs.writeFileSync(spec.portFile, String(port), { mode: 0o600 });
const end = () => process.exit(0);
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, end);
setInterval(() => {
  if (fs.existsSync(spec.exitFile)) end();
}, 500);
