import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { startAgentHost } from "../agent-host.mjs";
import { RemoteManager } from "../remote-manager.mjs";
import { fixture } from "./fixtures.mjs";

test("drain closes pickup first and reports the work still running", async (t) => {
  const { store, root } = fixture(t),
    manifestPath = path.join(root, "agent-host.json");
  store.put("projects", {
    id: "fixture",
    root,
    baseBranch: "main",
    worktreeRoot: path.join(root, "worktrees"),
    checks: [],
  });
  const host = startAgentHost({
    dbPath: store.filename,
    manifestPath,
    factories: {
      openhands: ({ emit }) => ({
        async start() {
          emit("session", { providerSessionId: "active-conversation" });
          emit("state", { state: "running" });
        },
        async close() {},
      }),
    },
  });
  await once(host, "listening");
  const remote = new RemoteManager(manifestPath);
  t.after(async () => {
    if (!host.listening) return;
    host.agentHost.manager.receive("run-active", "turn.completed", {
      state: "completed",
    });
    await remote.control("stop").catch(() => {});
    if (host.listening) await new Promise((resolve) => host.close(resolve));
  });

  await remote.command("run.start", {
    id: "run-active",
    projectId: "fixture",
    provider: "openhands",
    mode: "ask",
    prompt: "Inspect the project.",
  });
  const drained = await remote.control("drain");
  assert.equal(drained.draining, true);
  assert.deepEqual(drained.pausedBatchIds, []);
  assert.equal(drained.protectedOperations, 0);
  assert.deepEqual(
    drained.activeRuns.map(({ id, state }) => ({ id, state })),
    [{ id: "run-active", state: "running" }],
  );
  await assert.rejects(
    remote.command("run.start", {
      id: "run-after-drain",
      projectId: "fixture",
      provider: "openhands",
      mode: "ask",
      prompt: "This must not start.",
    }),
    /draining/,
  );
  const health = await remote.status();
  assert.equal(health.draining, true);
  assert.equal(health.active, 1);
  assert.equal(health.activeRuns[0].id, "run-active");
});
