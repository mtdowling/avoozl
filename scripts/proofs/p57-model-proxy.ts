// P57 model proxy: Avoozl's egress proxy (src/app/executors/egress-proxy.ts)
// on a fixed 127.0.0.1 port, tunneling only to AWS Bedrock runtime hosts on
// port 443 (bedrock-runtime for Claude Code, bedrock-mantle for Codex's
// OpenAI models), so a sandboxed child whose network is limited to one
// loopback port (sandbox.network ["localhost:PORT"]) can reach its model and
// nothing else. Each host is logged as allowed or denied.
//
//   node p57-model-proxy.ts PORT LOGFILE
import fs from "node:fs";
import {
  EGRESS_BIND,
  createEgressProxy,
} from "../../src/app/executors/egress-proxy.ts";

const [port, logFile] = [Number(process.argv[2] || 18457), process.argv[3]];
const log = (line: string) =>
  logFile
    ? fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`)
    : console.log(line);
createEgressProxy({
  hosts: [
    "bedrock-runtime.*.amazonaws.com",
    "bedrock-runtime-fips.*.amazonaws.com",
    "bedrock-mantle.*.api.aws",
  ],
  log,
}).listen(port, EGRESS_BIND, () => log(`listening ${EGRESS_BIND}:${port}`));
