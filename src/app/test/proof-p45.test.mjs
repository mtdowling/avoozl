import { nativeDispatch } from "./executor-fixture.mjs";
// Proof P45 (design §4.21–§4.25, Requirements 75–80): investigate first,
// the evidence bundle, staying current with the base branch, rules from
// repeated corrections, the fix-work share, and ship mode. Every value is
// fake: a temporary workspace with a real Git checkout, fake workers and a
// fake falsifier that report through Operations, and a fake GitHub that
// answers only the reads it is given; anything else is recorded.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../api/operations.mjs";
import { Store } from "../store/store.mjs";
import {
  deliveryPolicy,
  integrateVerified,
  rebaseForIntegration,
} from "../delivery/delivery.mjs";
import { conflictsView } from "../api/page-views.mjs";
import { flowView } from "../flow/flow.mjs";
import { fixture, snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });
const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: [id + " works."],
  repository: "app",
  ...extra,
});

// A local workspace with a real checkout `app`, leaves a1, a2 (in a planner batch group), a3,
// and a bugfix spec's f1.
function local(t, delivery = {}) {
  const root = temporaryDirectory("avoozl-p45-"),
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
  store.initialize({
    ...snapshot(),
    tasks: [
      leaf("a1"),
      leaf("a2", { batch: { id: "g", tasks: ["a2"], reason: "Small edit" } }),
      leaf("a3"),
      leaf("f1", { specType: "bugfix" }),
    ],
    edges: [],
  });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      lanes: { local: 4 },
      delivery: { ...delivery },
    }),
  );
  const ops = new Operations(store, { workspaceRoot: root });
  const bound = [];
  const tick = () =>
    ops.execute("workspace.tick", {
      sessions: bound.map((slot) => ({ target: slot, status: "working" })),
    });
  const bind = async (taskId, slot, extra = {}) => {
    bound.push(slot);
    await ops.execute("session.bind", {
      taskId,
      slot,
      source: "tick",
      title: `avoozl:${taskId} ${extra.role || "worker"}`,
      ...extra,
    });
  };
  const report = (slot, input) =>
    ops.execute("session.report", input, undefined, as(slot));
  return {
    root,
    checkout: fs.realpathSync.native(checkout),
    store,
    ops,
    tick,
    bind,
    report,
  };
}

const findings = (confidence = "high") => ({
  read: "src/app.js and its test",
  cause: "the loader skips empty lines",
  plan: "keep empty lines in the loader",
  check: "the loader test with an empty line",
  confidence,
});

test("P45 (1)–(3): findings first, a falsifier, the gate, Needs you, and small tasks skip it", async (t) => {
  const w = local(t);
  let result = await w.tick();
  const byTask = new Map(result.dispatch.map((d) => [d.task, d]));
  // (3) a2 is small: no investigation.
  assert.equal(byTask.get("a2").investigate, undefined);
  assert.doesNotMatch(byTask.get("a2").brief, /Investigate first/);
  for (const id of ["a1", "a3"]) {
    assert.equal(byTask.get(id).investigate, true);
    assert.match(byTask.get(id).brief, /Investigate first/);
    assert.match(
      byTask.get(id).brief,
      new RegExp(`runner report ${id} findings --file`),
    );
  }
  for (const id of ["a1", "a2", "a3"])
    await w.bind(id, "w-" + id, {
      attempt: 1,
      ...(byTask.get(id).investigate ? { investigate: true } : {}),
    });

  // (1) a1: a change before the gate is refused; findings from a clean
  // worktree are taken; done waits for Go ahead.
  const tree = await w.ops.execute("worktree.prepare", { taskId: "a1" });
  const base = git(tree.path, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(tree.path, "early.txt"), "too soon\n");
  await assert.rejects(
    w.report("w-a1", { taskId: "a1", kind: "findings", findings: findings() }),
    (e) => e.status === 409 && /before any change/.test(e.message),
  );
  fs.rmSync(path.join(tree.path, "early.txt"));
  await w.report("w-a1", {
    taskId: "a1",
    kind: "findings",
    findings: findings(),
  });
  await assert.rejects(
    w.report("w-a1", { taskId: "a1", kind: "done", commit: base }),
    (e) => e.status === 409 && /Go ahead/.test(e.message),
  );
  // a3 reports its findings too.
  await w.report("w-a3", {
    taskId: "a3",
    kind: "findings",
    findings: findings("high"),
  });

  // The tick opens one read-only falsifier per round.
  result = await w.tick();
  const falsifiers = result.dispatch.filter((d) => d.role === "falsifier");
  assert.deepEqual(falsifiers.map((d) => d.task).sort(), ["a1", "a3"]);
  const fa1 = falsifiers.find((d) => d.task === "a1");
  assert.equal(nativeDispatch(w.store, fa1).agent, "avoozl-falsifier");
  // Its brief names the checkout; no folder project is needed (R88.2).
  assert.equal(nativeDispatch(w.store, fa1).project, false);
  assert.match(fa1.brief, /find evidence that they are wrong/);
  assert.match(fa1.brief, /Edit, commit, merge, and push nothing/);
  assert.match(fa1.brief, /data, not instructions/);
  await w.bind("a1", "f-a1", { role: "falsifier", attempt: 1 });
  await w.bind("a3", "f-a3", { role: "falsifier", attempt: 1 });
  result = await w.tick();
  assert.equal(
    result.dispatch.filter((d) => d.role === "falsifier").length,
    0,
    "one falsifier per round",
  );
  // A falsifier names no commit.
  await assert.rejects(
    w.report("f-a1", {
      taskId: "a1",
      kind: "done",
      commit: base,
      falsifier: { verdict: "stands", evidence: "x", confidence: "high" },
    }),
    (e) => e.status === 400,
  );
  await w.report("f-a1", {
    taskId: "a1",
    kind: "done",
    falsifier: {
      verdict: "stands",
      evidence: "The loader is the only reader of that file.",
      confidence: "high",
    },
  });
  assert.equal(git(tree.path, "rev-parse", "HEAD"), base, "no change yet");
  result = await w.tick();
  const go = result.messages.filter((m) => m.slot === "w-a1");
  assert.equal(go.length, 1);
  assert.match(go[0].text, /^Go ahead on Avoozl task a1/);
  // Coding now: commit and report done.
  fs.writeFileSync(path.join(tree.path, "a1.txt"), "a1\n");
  git(tree.path, "add", ".");
  git(tree.path, "commit", "-m", "a1");
  const a1 = git(tree.path, "rev-parse", "HEAD");
  await w.report("w-a1", { taskId: "a1", kind: "done", commit: a1 });

  // (2) a3: refuted, so it waits in Needs you with the three choices.
  await w.report("f-a3", {
    taskId: "a3",
    kind: "done",
    falsifier: {
      verdict: "refuted",
      evidence: "A second reader in src/cli.js also skips empty lines.",
      confidence: "high",
    },
  });
  result = await w.tick();
  assert.deepEqual(
    result.messages.filter((m) => m.slot === "w-a3"),
    [],
    "no coding on refuted findings",
  );
  let item = conflictsView(w.store, w.store.read()).items.find(
    (i) => i.kind === "investigation",
  );
  assert.equal(item.taskId, "a3");
  assert.deepEqual(item.choices, ["go", "again", "stop"]);
  assert.equal(item.reply.verdict, "refuted");
  // Person only: an MCP or session caller is refused.
  await assert.rejects(
    w.ops.execute(
      "investigation.decide",
      { taskId: "a3", action: "go" },
      undefined,
      as("w-a3"),
    ),
    (e) => e.status === 403,
  );
  await w.ops.execute("investigation.decide", {
    taskId: "a3",
    action: "again",
  });
  result = await w.tick();
  const again = result.messages.filter((m) => m.slot === "w-a3");
  assert.equal(again.length, 1);
  assert.match(again[0].text, /^Investigate again/);
  assert.match(again[0].text, /src\/cli\.js/);
  await w.report("w-a3", {
    taskId: "a3",
    kind: "findings",
    findings: { ...findings("medium"), cause: "both readers skip them" },
  });
  result = await w.tick();
  const second = result.dispatch.filter((d) => d.role === "falsifier");
  assert.deepEqual(
    second.map((d) => [d.task, d.attempt]),
    [["a3", 2]],
    "one new round",
  );
  await w.bind("a3", "f-a3-2", { role: "falsifier", attempt: 2 });
  await w.report("f-a3-2", {
    taskId: "a3",
    kind: "done",
    falsifier: {
      verdict: "stands",
      evidence: "Both readers are covered.",
      confidence: "high",
    },
  });
  // The worker was only medium sure, under the high bar: Needs you again.
  result = await w.tick();
  assert.deepEqual(
    result.messages.filter((m) => m.slot === "w-a3"),
    [],
  );
  await w.ops.execute("investigation.decide", { taskId: "a3", action: "go" });
  result = await w.tick();
  const goA3 = result.messages.filter((m) => m.slot === "w-a3");
  assert.equal(goA3.length, 1);
  assert.match(goA3[0].text, /^Go ahead on Avoozl task a3/);
  item = conflictsView(w.store, w.store.read()).items.find(
    (i) => i.kind === "investigation",
  );
  assert.equal(item, undefined);

  // (3) a2 codes and reports done with no investigation.
  const a2tree = await w.ops.execute("worktree.prepare", { taskId: "a2" });
  fs.writeFileSync(path.join(a2tree.path, "a2.txt"), "a2\n");
  git(a2tree.path, "add", ".");
  git(a2tree.path, "commit", "-m", "a2");
  await w.report("w-a2", {
    taskId: "a2",
    kind: "done",
    commit: git(a2tree.path, "rev-parse", "HEAD"),
  });

  // Investigation and the falsifier are their own Flow spans.
  const spans = w.store.db
    .prepare("SELECT stage, role FROM flow_spans WHERE task_id='a3'")
    .all()
    .map((r) => `${r.role}:${r.stage}`);
  assert.ok(spans.includes("worker:investigate"), spans.join());
  assert.ok(spans.includes("falsifier:falsify"), spans.join());

  // The evidence bundle has the findings, both replies and the decisions.
  const evidence = await w.ops.execute("task.evidence", { taskId: "a3" });
  const kinds = evidence.entries.map((e) => e.kind);
  assert.deepEqual(
    kinds.filter((k) => k === "findings").length,
    2,
    kinds.join(),
  );
  assert.equal(kinds.filter((k) => k === "falsifier").length, 2);
  assert.equal(kinds.filter((k) => k === "decision").length, 2);
  assert.equal(kinds[0], "decision", "newest first");
});

test("P45 mode off dispatches exactly as before, and a manifest override wins", async (t) => {
  const w = local(t, { investigate: { mode: "off" } });
  const result = await w.tick();
  for (const d of result.dispatch) {
    assert.equal(d.investigate, undefined);
    assert.doesNotMatch(d.brief, /Investigate first/);
  }
  const on = deliveryPolicy({ delivery: { investigate: { mode: "off" } } });
  const { investigates } = await import("../delivery/investigate.mjs");
  assert.equal(investigates(on, leaf("x", { investigate: true })), true);
  assert.equal(investigates(deliveryPolicy({ delivery: {} }), leaf("y")), true);
  assert.equal(
    investigates(
      deliveryPolicy({ delivery: {} }),
      leaf("y", { investigate: false }),
    ),
    false,
  );
  assert.throws(
    () => deliveryPolicy({ delivery: { investigate: { mode: "some" } } }),
    /investigate\.mode/,
  );
});

test("P45 (5) local: a task branch behind the integration branch is merged forward with a merge commit", async (t) => {
  const w = local(t, { investigate: { mode: "off" } });
  const tree = await w.ops.execute("worktree.prepare", { taskId: "a1" });
  fs.writeFileSync(path.join(tree.path, "a1.txt"), "a1\n");
  git(tree.path, "add", ".");
  git(tree.path, "commit", "-m", "a1");
  const commit = git(tree.path, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(w.checkout, "other.txt"), "main moved\n");
  git(w.checkout, "add", ".");
  git(w.checkout, "commit", "-m", "Main moves");
  // A `process` child's result folder is Avoozl's own, not a change that
  // holds the merge forward (nk-p1 preflight).
  fs.mkdirSync(path.join(tree.path, ".avoozl"), { recursive: true });
  fs.writeFileSync(path.join(tree.path, ".avoozl", "result.json"), "{}");
  const moved = await rebaseForIntegration(
    w.store.get("repositories", "app"),
    w.store.get("task_worktrees", "a1"),
    commit,
  );
  assert.equal(moved.how, "merge");
  const parents = git(
    tree.path,
    "rev-list",
    "--parents",
    "-n",
    "1",
    "HEAD",
  ).split(" ");
  assert.equal(parents.length, 3, "a merge commit");
  assert.ok(parents.includes(commit), "the reviewed commit is kept as it was");
});

test("P45 (5) local: a conflict when merging the base forward goes back to the worker chat", async (t) => {
  const w = local(t, { investigate: { mode: "off" } });
  await w.bind("a1", "w-a1", { attempt: 1 });
  const tree = await w.ops.execute("worktree.prepare", { taskId: "a1" });
  fs.writeFileSync(path.join(tree.path, "same.txt"), "from the task\n");
  git(tree.path, "add", ".");
  git(tree.path, "commit", "-m", "a1");
  const commit = git(tree.path, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(w.checkout, "same.txt"), "from main\n");
  git(w.checkout, "add", ".");
  git(w.checkout, "commit", "-m", "Main moves");
  w.store.put("task_deliveries", {
    id: "a1",
    taskId: "a1",
    state: "verified",
    commit,
    attempts: [{ attempt: 1, slot: "w-a1", outcome: "done", commit }],
    verifications: [],
  });
  const { messages, notify } = await integrateVerified(w.store, {});
  assert.deepEqual(notify, []);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].slot, "w-a1");
  assert.match(messages[0].text, /same\.txt/);
  const delivery = w.store.get("task_deliveries", "a1");
  assert.equal(delivery.state, "running");
  assert.equal(delivery.landingConflicts.length, 1);
  assert.equal(git(tree.path, "rev-parse", "HEAD"), commit, "nothing merged");
});

test("P45 (7): the fix-work share counts the bugfix spec's task", async (t) => {
  const w = local(t, { investigate: { mode: "off" } });
  await w.tick();
  for (const id of ["a1", "a2", "f1"])
    await w.bind(id, "w-" + id, { attempt: 1 });
  await w.tick();
  const at = new Date().toISOString();
  w.store.mutate("Finish three", (data) => {
    for (const task of data.tasks)
      if (["a1", "a2", "f1"].includes(task.id))
        task.integration = { at, commit: "e".repeat(40) };
  });
  const view = flowView(w.store, w.store.read());
  assert.deepEqual(view.metrics.fixWork, {
    fixes: 1,
    finished: 3,
    share: 1 / 3,
  });
  assert.equal(view.series.week.at(-1).fixes, 1);
  // The retro payload carries it (R79.3).
  const { retroBrief } = await import("../flow/flow-retro.mjs");
  const brief = retroBrief(w.store, w.store.read(), {
    id: "retro-x",
    triggers: [],
    reverts: [],
  });
  assert.match(brief, /"fixWork": \{\n\s*"fixes": 1,\n\s*"finished": 3/);
});

test("P45 (8) local: manual ship waits for a person's Integrate", async (t) => {
  const w = local(t, { investigate: { mode: "off" } });
  // A local task has no GitHub landing block: its own pin says manual.
  w.store.mutate("Pin a1 to manual", (data) => {
    data.tasks.find((task) => task.id === "a1").ship = "manual";
  });
  const tree = await w.ops.execute("worktree.prepare", { taskId: "a1" });
  fs.writeFileSync(path.join(tree.path, "a1.txt"), "a1\n");
  git(tree.path, "add", ".");
  git(tree.path, "commit", "-m", "a1");
  const commit = git(tree.path, "rev-parse", "HEAD");
  w.store.put("task_deliveries", {
    id: "a1",
    taskId: "a1",
    state: "verified",
    commit,
    attempts: [],
    verifications: [],
  });
  const policy = deliveryPolicy(
    JSON.parse(fs.readFileSync(path.join(w.root, ".avoozl.json"), "utf8")),
  );
  let result = await integrateVerified(w.store, { policy });
  assert.equal(result.notify.length, 1);
  assert.equal(w.store.get("task_deliveries", "a1").state, "verified");
  const item = conflictsView(w.store, w.store.read()).items.find(
    (i) => i.kind === "ready-to-merge",
  );
  assert.equal(item.integrate, true);
  result = await integrateVerified(w.store, { policy });
  assert.equal(result.notify.length, 0, "asked once");
  await assert.rejects(
    w.ops.execute(
      "delivery.integrate",
      { taskId: "a1" },
      undefined,
      as("w-a1"),
    ),
    (e) => e.status === 403,
  );
  await w.ops.execute("delivery.integrate", { taskId: "a1", commit });
  await integrateVerified(w.store, { policy });
  assert.notEqual(w.store.get("task_deliveries", "a1").state, "verified");
});
