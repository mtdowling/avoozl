import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { fail } from "./store.mjs";
const root = path.dirname(fileURLToPath(import.meta.url));
export class RemoteManager {
  constructor(manifestPath) {
    this.manifestPath = manifestPath;
    this.remote = true;
  }
  manifest() {
    return JSON.parse(fs.readFileSync(this.manifestPath, "utf8"));
  }
  async status() {
    try {
      const m = this.manifest(),
        response = await fetch(m.url + "/health", {
          signal: AbortSignal.timeout(2000),
        });
      const state = await response.json();
      if (state.instanceId !== m.instanceId)
        throw Error("Host instance changed.");
      return { ...state, connected: response.ok };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }
  async command(operation, input = {}) {
    const m = this.manifest();
    let response;
    try {
      response = await fetch(m.url + "/rpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + m.secret,
        },
        body: JSON.stringify({ operation, input }),
      });
    } catch {
      fail(
        "Agent host disconnected. Read the durable run state before retrying this command.",
        503,
      );
    }
    const result = await response.json();
    if (!response.ok) fail(result.error, response.status);
    return result.result;
  }
  async providers() {
    try {
      return await this.command("providers");
    } catch (error) {
      return ["codex", "claude", "openhands"].map((id) => ({
        id,
        available: false,
        reason: error.message,
      }));
    }
  }
  async start(input) {
    return this.command("run.start", input);
  }
  async control(action) {
    const m = this.manifest(),
      response = await fetch(m.url + "/control", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + m.secret,
        },
        body: JSON.stringify({ action }),
      });
    const value = await response.json();
    if (!response.ok) fail(value.error, response.status);
    return value;
  }
  async close() {} // Closing the web process must never stop agents or subagents.
}
export async function ensureAgentHost({
  dbPath,
  manifestPath = path.join(
    path.dirname(path.resolve(dbPath)),
    "agent-host.json",
  ),
} = {}) {
  const manager = new RemoteManager(manifestPath),
    status = await manager.status();
  if (status.connected) {
    if (path.resolve(status.dbPath) !== path.resolve(dbPath))
      fail("Agent host belongs to another database.");
    return manager;
  }
  let previous;
  try {
    previous = manager.manifest();
  } catch {}
  if (previous) {
    let alive = false;
    try {
      process.kill(previous.pid, 0);
      alive = true;
    } catch {}
    if (alive)
      fail(
        "The existing agent host is alive but unavailable; do not start a duplicate.",
        503,
      );
  }
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const log = fs.openSync(
    path.join(path.dirname(manifestPath), "agent-host.log"),
    "a",
  );
  const port = previous?.url ? new URL(previous.url).port : 0;
  const child = spawn(
    process.execPath,
    [
      path.join(root, "host-main.mjs"),
      path.resolve(dbPath),
      manifestPath,
      String(port),
    ],
    { cwd: root, detached: true, stdio: ["ignore", log, log] },
  );
  child.unref();
  fs.closeSync(log);
  for (let attempt = 0; attempt < 100; attempt++) {
    await delay(100);
    const state = await manager.status();
    if (state.connected) return manager;
  }
  fail("Agent host did not start. Inspect agent-host.log.", 503);
}
