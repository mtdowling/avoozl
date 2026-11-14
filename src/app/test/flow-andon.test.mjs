// Task 24.1: pull the Andon cord (design §4.11, Requirement 64). A person
// or an agent session stops new dispatch in a scope with a reason; only a
// person resumes it, and nothing else closes it.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { linePausedTaskIds, openStops } from "../flow.mjs";
import { blockedNaming, watchLine } from "../flow-line.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

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
  repository: "r1",
  ...extra,
});

function setup(t) {
  const root = temporaryDirectory("avoozl-andon-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: [
      leaf("a1", { planId: "s1" }),
      leaf("a2", { planId: "s1" }),
      leaf("a3"),
      leaf("b1", { repository: "r2" }),
    ],
    edges: [{ from: "a1", to: "a2", kind: "requires" }],
  });
  store.put("projects", { id: "r1" });
  store.put("projects", { id: "r2" });
  store.put("plans", { id: "s1", title: "Spec one" });
  fs.mkdirSync(path.join(root, ".avoozl", "local", "content-rules"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, ".avoozl", "local", "content-rules", "names.txt"),
    "codename: \\bsecretword\\b\n",
  );
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, contentRules: { sets: [{ id: "names" }] } }),
  );
  const ops = new Operations(store, { workspaceRoot: root });
  return { root, store, ops };
}

const paused = (store) => [...linePausedTaskIds(store)].sort();

test("a person pulls the cord for each scope, and dispatch pauses there", async (t) => {
  const { store, ops } = setup(t);
  const { stop } = await ops.execute("flow.stop", {
    scope: "task",
    taskId: "a1",
    reason: "bad base",
  });
  assert.equal(stop.manual, true);
  assert.equal(stop.reason, "bad base");
  assert.deepEqual(stop.by, { kind: "person", name: "dashboard" });
  assert.equal(stop.scope, "task");
  assert.ok(stop.openedAt);
  assert.deepEqual(paused(store), ["a1", "a2"]);
  await ops.execute("flow.resume", { stopId: stop.id });

  await ops.execute("flow.stop", {
    scope: "repo",
    repository: "r2",
    reason: "x",
  });
  assert.deepEqual(paused(store), ["b1"]);
  await ops.execute("flow.stop", { scope: "spec", spec: "s1", reason: "y" });
  assert.deepEqual(paused(store), ["a1", "a2", "b1"]);
  await ops.execute("flow.stop", { scope: "all", reason: "z" });
  assert.deepEqual(
    paused(store),
    ["a1", "a2", "a3", "b1", "sample-task"].filter((id) =>
      store.read().tasks.some((t) => t.id === id),
    ),
  );
  const view = await ops.execute("flow.view", {});
  const pulled = view.line.filter((s) => s.manual);
  assert.equal(pulled.length, 3);
  assert.ok(pulled.every((s) => s.reason && s.by && s.openedAt && s.scope));
});

test("a bad pull is refused by name and records nothing", async (t) => {
  const { store, ops } = setup(t);
  for (const [input, pattern] of [
    [{ scope: "all" }, /reason/i],
    [{ scope: "all", reason: "   " }, /reason/i],
    [{ scope: "all", reason: "two\nlines" }, /one line/i],
    [{ scope: "all", reason: "x".repeat(201) }, /200/],
    [{ scope: "galaxy", reason: "x" }, /scope/i],
    [{ scope: "repo", repository: "r9", reason: "x" }, /r9/],
    [{ scope: "spec", spec: "s9", reason: "x" }, /s9/],
    [{ scope: "task", taskId: "t9", reason: "x" }, /t9/],
    [{ scope: "all", reason: "secretword here" }, /names/],
  ])
    await assert.rejects(ops.execute("flow.stop", input), (error) => {
      assert.match(error.message, pattern, JSON.stringify(input));
      assert.doesNotMatch(error.message, /secretword/);
      return true;
    });
  assert.equal(openStops(store).length, 0);
});

test("an agent session may pull but only a person resumes", async (t) => {
  const { store, ops } = setup(t);
  const mcp = { caller: { sessionKey: "chat-7" }, mcp: true };
  const { stop } = await ops.execute(
    "flow.stop",
    { scope: "repo", repository: "r2", reason: "broken base" },
    undefined,
    mcp,
  );
  assert.deepEqual(stop.by, { kind: "agent", name: "session:chat-7" });
  assert.equal(
    store
      .list("app_notifications")
      .filter((n) => /Line stopped/.test(n.payload.title)).length,
    1,
  );
  await assert.rejects(
    ops.execute("flow.resume", { stopId: stop.id }, undefined, mcp),
    (error) => error.status === 403,
  );
  await assert.rejects(
    ops.execute("flow.resume", { stopId: stop.id }, undefined, { mcp: true }),
    (error) => error.status === 403,
  );
  await assert.rejects(
    ops.execute("flow.runAnyway", { stopId: stop.id, confirm: true }),
    /Resume/,
  );
  const { stop: resumed } = await ops.execute(
    "flow.resume",
    { stopId: stop.id },
    undefined,
    { local: true },
  );
  assert.ok(resumed.closedAt);
  assert.equal(resumed.resumedBy.by, "cli");
  assert.ok(resumed.timeToFixMs >= 0);
  assert.deepEqual(paused(store), []);
  await assert.rejects(
    ops.execute("flow.resume", { stopId: stop.id }),
    /already/,
  );
});

test("a pulled stop never resumes by itself, and Resume leaves automatic stops alone", async (t) => {
  const { store, ops } = setup(t);
  const { stop } = await ops.execute("flow.stop", {
    scope: "repo",
    repository: "r1",
    reason: "looking at it",
  });
  store.put("flow_stops", {
    id: "stop-auto",
    projectId: "r1",
    check: "npm test",
    culprit: "a1",
    scope: "dependents",
    openedAt: "2026-11-12T00:00:00Z",
    closedAt: null,
    fixTaskId: "a1.fix-1",
  });
  await watchLine(store, {});
  blockedNaming(store, {});
  assert.ok(openStops(store).some((s) => s.id === stop.id));
  await assert.rejects(
    ops.execute("flow.resume", { stopId: "stop-auto" }),
    /automatic/i,
  );
  assert.equal(store.get("flow_stops", "stop-auto").closedAt, null);
});

test("Flow and the retro see each pull", async (t) => {
  const { store, ops } = setup(t);
  const { stop } = await ops.execute("flow.stop", {
    scope: "all",
    reason: "check it",
  });
  await ops.execute("flow.resume", { stopId: stop.id });
  const view = await ops.execute("flow.view", {});
  const listed = view.stops.find((s) => s.id === stop.id);
  assert.equal(listed.manual, true);
  assert.equal(listed.reason, "check it");
  assert.ok(view.series.day.some((b) => b.stops >= 1));
  const { retroBrief } = await import("../flow-retro.mjs");
  const brief = retroBrief(store, store.read(), { id: "r1", triggers: [] }),
    { lineStops } = JSON.parse(brief.split("```json\n")[1].split("\n```")[0]);
  assert.deepEqual(
    lineStops.find((s) => s.manual),
    {
      check: null,
      culprit: null,
      manual: true,
      scope: "all",
      reason: "check it",
      timeToFixMs: listed.timeToFixMs,
    },
  );
});

test("the CLI pulls and resumes as the person at the command line", async () => {
  const { execFileSync } = await import("node:child_process"),
    { initializeWorkspace } = await import("../workspace.mjs"),
    cli = path.join(import.meta.dirname, "..", "..", "..", "cli.mjs"),
    root = temporaryDirectory("avoozl-andon-cli-");
  initializeWorkspace(root);
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(root, "config") };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_/.test(name)) delete env[name];
  // A person's terminal, not an agent session (R83.1).
  delete env.KIROCREW_SPAWNED;
  delete env.KIRO_SESSION_ID;
  const run = (...args) =>
    JSON.parse(
      execFileSync(process.execPath, [cli, ...args, "--workspace", root], {
        env,
        encoding: "utf8",
      }),
    );
  const { stop } = run(
    "flow",
    "stop",
    "--scope",
    "all",
    "--reason",
    "bad base",
  );
  assert.deepEqual(stop.by, { kind: "person", name: "cli" });
  const { stop: resumed } = run("flow", "resume", stop.id);
  assert.equal(resumed.resumedBy.by, "cli");
});

test("a blocked report stops the line only when a dependent names its blocker", (t) => {
  const { store } = setup(t);
  store.mutate("integrate a1", (data) => {
    data.tasks.find((x) => x.id === "a1").integration = {
      commit: "a".repeat(40),
      at: "2026-11-12T00:00:00Z",
    };
  });
  const blocked = (taskId, text) =>
    store.put("session_bindings", {
      id: "w-" + taskId,
      slot: "w-" + taskId,
      taskId,
      role: "worker",
      attempt: 1,
      source: "tick",
      status: "working",
      boundAt: "2026-11-12T00:00:00Z",
      report: { kind: "blocked", text, at: "2026-11-12T01:00:00Z" },
    });
  // a3 does not depend on a1.
  blocked("a3", "a1 broke the build");
  blockedNaming(store, {});
  assert.deepEqual(openStops(store), []);
  blocked("a2", "a1 broke the build");
  blockedNaming(store, {});
  assert.deepEqual(
    openStops(store).map((s) => s.culprit),
    ["a1"],
  );
});
