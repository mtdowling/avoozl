// One dispatcher (worker-paths WP1): the tick is the only code that starts a
// worker, and a person's manual claim the only other way a task gets one. A
// Crew Mode workspace is held until a person lets the tick run it.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { deliveryPolicy } from "../delivery.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const APP = fileURLToPath(new URL("..", import.meta.url));
// The tick's planner (planReadyDispatches) and the worker machine's own tick
// (runnerTick, a pulled task).
const PLANNERS = new Set(["delivery.mjs", "remote-runner.mjs"]);
const REQUEST = /\b(kirocrewRequest|startRequest|enqueueSessionRequests)\(/g;

// The modules whose source asks for a session with role worker: a request
// call whose argument, up to its closing parenthesis, names that role.
function workerDispatchers(files) {
  const found = [];
  for (const [name, text] of files) {
    for (const match of text.matchAll(REQUEST)) {
      let depth = 0,
        end = match.index + match[0].length - 1;
      for (; end < text.length; end++) {
        if (text[end] === "(") depth++;
        else if (text[end] === ")" && --depth === 0) break;
      }
      if (/role:\s*"worker"/.test(text.slice(match.index, end))) {
        found.push(name);
        break;
      }
    }
  }
  return found;
}

const sources = () =>
  [
    ...fs.readdirSync(APP).map((name) => [name, path.join(APP, name)]),
    ...fs
      .readdirSync(path.join(APP, "executors"))
      .map((name) => [`executors/${name}`, path.join(APP, "executors", name)]),
  ]
    .filter(([name]) => name.endsWith(".mjs"))
    .map(([name, file]) => [name, fs.readFileSync(file, "utf8")]);

test("only the tick's planner writes a session request with role worker", () => {
  const found = workerDispatchers(sources());
  assert.deepEqual(
    found.filter((name) => !PLANNERS.has(name)),
    [],
  );
  assert.ok(found.includes("delivery.mjs"), "the check finds the planner");
});

test("the check fails on a planted second dispatcher", () => {
  const planted = [
    ...sources(),
    [
      "second.mjs",
      'export const go = (store, task) =>\n  kirocrewRequest(store, { task, role: "worker", brief: "x" });\n',
    ],
  ];
  assert.deepEqual(
    workerDispatchers(planted).filter((name) => !PLANNERS.has(name)),
    ["second.mjs"],
  );
});

test('"runner": "tick" loads and is ignored; any other value is refused', () => {
  const tick = deliveryPolicy({ delivery: { runner: "tick" } });
  assert.equal(tick.runner, undefined);
  assert.equal(tick.crewModeHeld, undefined);
  assert.equal(
    deliveryPolicy({ delivery: { runner: "crew-mode" } }).crewModeHeld,
    true,
  );
  assert.throws(
    () => deliveryPolicy({ delivery: { runner: "other" } }),
    /delivery\.runner was removed/,
  );
});

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function workspace(t, delivery) {
  const root = temporaryDirectory("avoozl-held-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-q", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, delivery }),
  );
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: ["a", "b"].map((id) => ({
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
    })),
    edges: [],
  });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
  });
  const ops = new Operations(store, { workspaceRoot: root });
  return {
    root,
    ops,
    tick: () => ops.execute("workspace.tick", { sessions: [] }),
    needsYou: async () =>
      (await ops.execute("conflicts.view", {})).items.filter(
        (item) => item.reason === "crew-mode",
      ),
  };
}

test("a crew-mode workspace starts nothing across three ticks and shows one Needs you item", async (t) => {
  const w = workspace(t, { runner: "crew-mode", concurrency: 2 });
  for (let i = 0; i < 3; i++)
    assert.deepEqual(
      (await w.tick()).dispatch.filter((d) => d.role === "worker"),
      [],
    );
  const items = await w.needsYou();
  assert.equal(items.length, 1);
  assert.match(items[0].detail, /starts nothing here/);
  assert.ok(items[0].hash);
});

test("Let the tick run it is a person's; it removes the key and the next tick starts work", async (t) => {
  const w = workspace(t, { runner: "crew-mode", concurrency: 2 });
  const [item] = await w.needsYou();
  for (const context of [
    { mcp: true },
    { caller: { sessionKey: "dashboard:chat" } },
  ])
    await assert.rejects(
      w.ops.execute(
        "delivery.runner.release",
        { expectedHash: item.hash },
        undefined,
        context,
      ),
      (e) => e.status === 403,
    );
  await w.ops.execute("delivery.runner.release", { expectedHash: item.hash });
  const file = JSON.parse(
    fs.readFileSync(path.join(w.root, ".avoozl.json"), "utf8"),
  );
  assert.equal(file.delivery.runner, undefined);
  assert.equal(file.delivery.concurrency, 2, "other keys stay");
  assert.deepEqual(await w.needsYou(), []);
  const started = (await w.tick()).dispatch
    .filter((d) => d.role === "worker")
    .map((d) => d.task);
  assert.deepEqual(started.sort(), ["a", "b"]);
});

test("a stale hash is refused", async (t) => {
  const w = workspace(t, { runner: "crew-mode" });
  await assert.rejects(
    w.ops.execute("delivery.runner.release", { expectedHash: "0".repeat(64) }),
    (e) => e.status === 409,
  );
});
