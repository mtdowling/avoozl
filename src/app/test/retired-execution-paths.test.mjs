import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { workspaceConfig } from "../config.mjs";
import { kirocrewConfiguration } from "../executors/kirocrew.mjs";
import { groupedCall, GROUPED_TOOLS } from "../mcp-tools.mjs";
import { Operations } from "../operations.mjs";
import { validateSession } from "../session-pins.mjs";
import { Store } from "../store.mjs";
import { fixture, snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// The machine file the tick reads provider settings from.
const XDG = temporaryDirectory("avoozl-retired-xdg-");
process.env.XDG_CONFIG_HOME = XDG;
const MACHINE = path.join(XDG, "avoozl", "config.json");

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "app",
  planId: "p1",
  planHash: "h1",
  ...extra,
});

function workspace(t, tasks, tracked = {}) {
  const root = temporaryDirectory("avoozl-retired-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks, edges: [] });
  store.put("approvals", { id: "approval-1", planId: "p1", hash: "h1" });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    checks: [["git", "status"]],
  });
  const file = path.join(root, ".avoozl.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      delivery: { concurrency: 5, retries: 1, model: "model-d" },
      ...tracked,
    }),
  );
  return {
    root,
    file,
    store,
    ops: new Operations(store, { workspaceRoot: root }),
  };
}

test("the relay tool and relay.forget are gone", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root });
  // plans_relay and its relay.call operation were removed (R56.3).
  assert.equal(Object.hasOwn(GROUPED_TOOLS, "plans_relay"), false);
  assert.equal(groupedCall("plans_relay", { action: "register" }), null);
  await assert.rejects(ops.execute("relay.forget", {}), /Unknown operation/);
});

test("an unknown machine file key is refused, naming it; pins still steer", async (t) => {
  fs.mkdirSync(path.dirname(MACHINE), { recursive: true });
  fs.writeFileSync(
    MACHINE,
    JSON.stringify({ version: 1, oldKey: { enabled: true } }),
  );
  t.after(() => fs.rmSync(MACHINE, { force: true }));
  const { root } = fixture(t);
  assert.throws(
    () => workspaceConfig({ workspace: root }),
    /Unknown setting "oldKey" in global Avoozl configuration/,
  );
  fs.writeFileSync(MACHINE, JSON.stringify({ version: 1 }));
  const env = workspace(t, [
    leaf("a"),
    leaf("b", { session: { agent: "agent-p", model: "model-p" } }),
  ]);
  const result = await env.ops.execute("workspace.tick", { sessions: [] }),
    workers = Object.fromEntries(
      result.dispatch
        .filter((d) => d.role === "worker")
        .map((d) => [d.task, d]),
    );
  assert.deepEqual(Object.keys(workers).sort(), ["a", "b"]);
  assert.ok(result.dispatch.every((d) => d.role !== "router" && !d.crew));
  assert.equal(workers.a.model, "model-d");
  assert.equal(workers.b.model, "model-p");
  assert.equal(kirocrewConfiguration(env.store, workers.b).agent, "agent-p");
});

test("a manifest session pin names an agent, model or harness only", () => {
  assert.deepEqual(validateSession({ model: "m", harness: "kirocrew" }), {
    model: "m",
    harness: "kirocrew",
  });
  assert.throws(
    () => validateSession({ crew: "box" }),
    /session\.crew is not a session setting/,
  );
});
