// One session's MCP broker as its own process (epic-context D6):
//   node context-broker-main.mjs <spec-file>
// The tick that starts a `process` child exits long before the child does,
// so the broker the child's relay connects to cannot live in the tick. The
// tick starts this, detached, with its own environment (which holds the
// values a server's `env` names; the child never gets them). It serves the
// spec's session until the run's exit file appears or it is signaled.
// The spec file holds no environment value: {session, servers, socket,
// token, exitFile, calls, plugins}.
import fs from "node:fs";
import { createBroker } from "./context-broker.mjs";
import { markPluginBroken } from "../plugins/plugin-checks.mjs";

const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
fs.rmSync(process.argv[2], { force: true });
const broker = createBroker({
  onCall: (entry) => {
    try {
      fs.appendFileSync(spec.calls, JSON.stringify(entry) + "\n", {
        mode: 0o600,
      });
    } catch {}
  },
  onViolation: ({ plugin, reason }) => {
    if (plugin)
      markPluginBroken({ settingsFile: spec.plugins }, plugin, reason);
  },
});
broker.open({
  session: spec.session,
  servers: spec.servers,
  socket: spec.socket,
  token: spec.token,
});
const end = () => {
  broker.closeAll();
  process.exit(0);
};
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, end);
setInterval(() => {
  if (fs.existsSync(spec.exitFile)) end();
}, 500);
