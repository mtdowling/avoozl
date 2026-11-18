// The integrator role and process (lt-2.3). Real processes, isolated temp
// workspaces; nothing ticks a real workspace.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { integratorPass, integratorStatus } from "../integrator-trains.mjs";
import { landingLease } from "../landing-lease.mjs";
import { startSupervisor } from "../supervisor.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const TRAINS = {
  version: 1,
  landing: {
    trains: {
      ci: { workflow: "ci.yml" },
      targets: { main: { policy: "gated" } },
    },
  },
};

function workspace(t, { config = TRAINS } = {}) {
  const root = temporaryDirectory("avoozl-integrator-");
  fs.writeFileSync(path.join(root, ".avoozl.json"), JSON.stringify(config));
  fs.mkdirSync(path.join(root, ".avoozl", "local"), { recursive: true });
  const store = new Store(
    path.join(root, ".avoozl", "local", "workspace.sqlite"),
  );
  t.after(() => store.close());
  store.put("projects", {
    id: "app",
    root,
    baseBranch: "main",
    landing: "train",
  });
  return { root, store, config };
}

test("one integrator holds a target's lease; another gets busy; status shows the holder", async (t) => {
  const w = workspace(t);
  const config = { ...TRAINS, landing: TRAINS.landing };
  const a = await integratorPass(w.store, { config, sessionId: "a" });
  assert.equal(a.targets[0].state, "holding");
  // A second pass by the same integrator renews, it does not take again.
  const again = await integratorPass(w.store, { config, sessionId: "a" });
  assert.equal(again.targets[0].lease.leaseId, a.targets[0].lease.leaseId);
  const b = await integratorPass(w.store, { config, sessionId: "b" });
  assert.equal(b.targets[0].state, "busy");
  const [status] = integratorStatus(w.store, { config }).targets;
  assert.equal(status.policy, "gated");
  assert.equal(status.lease.state, "active");
  assert.equal(status.lease.holder.pid, process.pid);
  assert.equal(status.lease.sessionId, "a");
});

test("landing: train with no valid settings lands nothing and opens one notice across loops", async (t) => {
  const w = workspace(t);
  const notices = [];
  for (let i = 0; i < 3; i++) {
    const pass = await integratorPass(w.store, { config: {}, sessionId: "a" });
    assert.equal(pass.targets[0].state, "invalid");
    notices.push(...pass.notify);
  }
  assert.equal(notices.length, 1);
  assert.match(notices[0].text, /landing\.trains\.targets\.main\.policy/);
  assert.equal(landingLease(w.store, "app", "main"), null);
});

test("the supervisor starts an integrator for a train workspace and restarts a killed one", async (t) => {
  const w = workspace(t),
    state = temporaryDirectory("avoozl-state-"),
    configDirectory = temporaryDirectory("avoozl-cfg-"),
    xdg = temporaryDirectory("avoozl-xdg-");
  const supervisor = startSupervisor({
    stateDirectory: state,
    configDirectory,
    intervalMs: 100000,
    integratorRetryMs: 50,
    integratorRoots: () => [w.root],
    env: { ...process.env, XDG_CONFIG_HOME: xdg },
  });
  t.after(() => supervisor.close());
  const until = async (fn, what) => {
    for (let i = 0; i < 200; i++) {
      const value = fn();
      if (value) return value;
      supervisor.pass();
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.fail(`timed out waiting for ${what}`);
  };
  const first = await until(() => supervisor.integrators()[0], "an integrator");
  await until(() => landingLease(w.store, "app", "main"), "its lease");
  assert.equal(landingLease(w.store, "app", "main").holder.pid, first.pid);
  process.kill(first.pid, "SIGKILL");
  const second = await until(
    () => supervisor.integrators().find((i) => i.pid !== first.pid),
    "a restarted integrator",
  );
  assert.notEqual(second.pid, first.pid);
});
