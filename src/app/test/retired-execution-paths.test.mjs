import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { kirocrewConfiguration } from "../executors/kirocrew.mjs";
import { groupedCall, GROUPED_TOOLS } from "../mcp-tools.mjs";
import { Operations } from "../operations.mjs";
import { validateNeeds, validateSession } from "../placement.mjs";
import { Store } from "../store.mjs";
import { fixture, snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// The machine file the tick used to read crews and the routing prompt from.
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

test("retired relay aliases resolve and refuse without changing state", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root });
  store.setMeta("routing.relay", {
    slot: "old-relay",
    queue: [{ id: "old-request" }],
  });
  const before = store.getMeta("routing.relay");
  for (const action of Object.keys(GROUPED_TOOLS.plans_relay.actions)) {
    const call = groupedCall("plans_relay", { action });
    assert.equal(call.operation, "relay.call");
    await assert.rejects(
      ops.execute(call.operation, call.input),
      /Remote relay was removed/,
    );
  }
  await assert.rejects(
    ops.execute("relay.forget", {}),
    /Remote relay was removed/,
  );
  assert.deepEqual(store.getMeta("routing.relay"), before);
});

test("routing and crew operations answer that placement was retired", async (t) => {
  const env = workspace(t, [], { routing: { remoteRelay: "on" } });
  for (const name of [
    "routing.view",
    "routing.preview",
    "routing.update",
    "routing.retry",
    "routing.turnOff",
    "crews.update",
    "delivery.pickAgain",
  ])
    await assert.rejects(
      env.ops.execute(name, { where: "workspace", routing: {} }),
      (e) => e.status === 410 && /Crew placement was retired/.test(e.message),
      name,
    );
  assert.equal(
    JSON.parse(fs.readFileSync(env.file, "utf8")).routing.remoteRelay,
    "on",
    "refusal never rewrites an existing configuration",
  );
});

test("old machine crews and routing are ignored; pins still steer", async (t) => {
  fs.mkdirSync(path.dirname(MACHINE), { recursive: true });
  // This used to hold every local session (chat limit 0) and turn the
  // routing prompt on; now nothing reads it.
  fs.writeFileSync(
    MACHINE,
    JSON.stringify({
      version: 1,
      crews: { local: { chatLimit: 0 }, box: { gitHosts: ["x.test"] } },
      crewStaleSeconds: 30,
      routing: { enabled: true, prompt: "Send everything to box." },
    }),
  );
  t.after(() => fs.rmSync(MACHINE, { force: true }));
  const env = workspace(t, [
    leaf("a"),
    leaf("b", { session: { agent: "agent-p", model: "model-p" } }),
  ]);
  env.store.setMeta("routing.models", { models: ["model-x"] });
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
  assert.equal(workers.a.placement, undefined);
});

test("a manifest may not name a crew or crew tags", () => {
  assert.deepEqual(validateSession({ model: "m", harness: "kirocrew" }), {
    model: "m",
    harness: "kirocrew",
  });
  assert.throws(
    () => validateSession({ crew: "box" }),
    /session\.crew: crew placement was retired/,
  );
  assert.throws(
    () => validateNeeds(["os:linux"]),
    /needs: crew placement was retired/,
  );
});
