// Research prototype only. See ../README.md for known gaps and limits.
import { importApp, importSdk, appRequire } from "./app-source.mjs";
// Isolated real production host. Never point this probe at the production DB.
import path from "node:path";
import os from "node:os";
const { startAgentHost } = await importApp("agent-host.mjs");
const { CodexAdapter } = await importApp("providers/codex.mjs");
const { ClaudeAdapter } = await importApp("providers/claude.mjs");
const { query } = await importSdk();
const root = process.argv[2];
if (!(root && path.basename(root).startsWith("aicommander-vscode-probe-")))
  throw Error("Disposable probe directory required");
const server = startAgentHost({
  dbPath: path.join(root, "workspace.sqlite"),
  manifestPath: path.join(root, "host.json"),
  factories: {
    codex: (options) =>
      new CodexAdapter({
        ...options,
        command: process.env.CODEX_COMMAND || "codex",
      }),
    claude: (options) =>
      new ClaudeAdapter({
        ...options,
        query: (args) =>
          query({
            ...args,
            options: { ...args.options, maxBudgetUsd: 0.5, maxTurns: 12 },
          }),
      }),
  },
});
// Diagnostic IPC only: test SDK capabilities that our production API has not exposed.
process.on("message", async (message) => {
  try {
    const { manager, store } = server.agentHost;
    let result;
    if (message.action === "set-model") {
      const adapter = manager.live.get(message.id);
      if (!adapter) throw Error("No live adapter");
      if (adapter instanceof ClaudeAdapter) {
        await adapter.query.setModel(message.model);
        result = { applies: "next-turn", api: "Claude SDK setModel" };
      } else {
        result = await adapter.rpc("thread/settings/update", {
          threadId: adapter.threadId,
          model: message.model,
        });
        adapter.model = message.model;
      }
      const run = store.get("runs", message.id);
      run.model = message.model;
      run.requestedModel = message.model;
      store.put("runs", run);
    } else if (message.action === "inspect") {
      result = {
        live: [...manager.live].map(([id, adapter]) => ({
          id,
          pid: adapter.proc?.pid,
          threadId: adapter.threadId,
          sessionId: adapter.sessionId,
        })),
        runs: store.list("runs"),
      };
    } else if (message.action === "close") {
      await manager.close();
      server.close();
      result = { closed: true };
    } else throw Error("Unknown diagnostic action");
    process.send?.({ id: message.requestId, result });
  } catch (error) {
    process.send?.({ id: message.requestId, error: error.message });
  }
});
server.on("listening", () => process.send?.({ ready: true }));
process.on("SIGTERM", async () => {
  await server.agentHost.manager.close();
  server.close(() => process.exit(0));
});
