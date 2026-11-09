import { startAgentHost } from "./agent-host.mjs";
const [dbPath, manifestPath, port] = process.argv.slice(2);
const server = startAgentHost({
  dbPath,
  manifestPath,
  port: Number(port || 0),
});
process.on("SIGTERM", () => {
  const active = server.agentHost.store
    .list("runs")
    .some((r) =>
      ["starting", "running", "waiting-input", "waiting-approval"].includes(
        r.state,
      ),
    );
  if (!active) server.close();
  else
    server.agentHost.store.event(null, "host.stop-deferred", {
      message:
        "Active agents remain. Use drain before updating the agent host.",
    });
});
