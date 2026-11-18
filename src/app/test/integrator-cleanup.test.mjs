// A taker cleans up a dead train (lt-2.4). A dead integrator is stood in for by
// a train record left behind, with its worktree, slot rows and environment.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { cleanupDeadTrain } from "../integrator-cleanup.mjs";
import { addLandingWorktree, stackMembers } from "../integrator-stack.mjs";
import { requireTrainSettings, startTrain } from "../integrator-trains.mjs";
import { heldSlots, takeSlots } from "../resource-slots.mjs";
import { openSupervisorDatabase } from "../supervisor.mjs";
import {
  git,
  node,
  queued,
  queue,
  trunk,
  workspace,
} from "./integrator-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const DEAD_PID = 2 ** 22 + 77;

async function dead(t, { policy = "gated" } = {}) {
  const dir = temporaryDirectory("avoozl-cleanup-"),
    log = path.join(dir, "cleanup.log"),
    full = path.join(dir, "full.log"),
    w = await workspace(t, { policy });
  w.config.machine.platforms["macos-arm64"] = {
    kind: "native",
    cleanup: node(`require('fs').appendFileSync(${JSON.stringify(log)}, 'x')`),
    slot: "vm",
  };
  w.config.machine.slots = { vm: 1 };
  w.config.landing.trains.validation.full["macos-arm64"].command = node(
    `require('fs').appendFileSync(${JSON.stringify(full)}, require('child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}))`,
  );
  const db = openSupervisorDatabase(
    temporaryDirectory("avoozl-cleanup-state-"),
  );
  t.after(() => db.close());
  const a = await queued(w, "t1"),
    b = await queued(w, "t2"),
    settings = requireTrainSettings(w.config, "main"),
    project = w.store.get("projects", "app"),
    members = queue(w),
    base = trunk(w),
    train = startTrain(w.store, {
      projectId: "app",
      target: "main",
      policy,
      members,
      baseHead: base,
    }),
    worktree = await addLandingWorktree(project.root, base);
  w.store.put("landing_trains", {
    ...train,
    worktrees: [worktree],
    checks: { "macos-arm64": { ok: true } },
    slots: [{ slot: "vm", n: 1 }],
  });
  takeSlots(db, {
    names: ["vm"],
    counts: { vm: 1 },
    workspace: w.root,
    train: train.id,
    pid: DEAD_PID,
  });
  const clean = () =>
    cleanupDeadTrain(w.store, {
      project,
      target: "main",
      settings,
      config: w.config,
      slots: { db },
      by: "taker",
    });
  return {
    w,
    db,
    a,
    b,
    train,
    worktree,
    base,
    log,
    full,
    project,
    clean,
    settings,
  };
}
const lines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");

test("killed mid-stack: no worktree, one cleanup, slot freed, members requeued in order", async (t) => {
  const x = await dead(t);
  assert.ok(fs.existsSync(x.worktree));
  const out = await x.clean();
  assert.equal(fs.existsSync(x.worktree), false);
  assert.ok(!git(x.project.root, "worktree", "list").includes("avoozl-train-"));
  assert.equal(lines(x.log), "x", "the cleanup command ran once");
  assert.deepEqual(heldSlots(x.db), []);
  assert.deepEqual(
    queue(x.w).map((e) => e.key),
    ["t1", "t2"],
  );
  assert.equal(out.train.outcome, "abandoned");
  assert.ok(out.train.steps.every((s) => s.by === "taker"));
  assert.deepEqual(out.train.steps.map((s) => s.name).sort(), [
    "cleanup macos-arm64",
    "release slots",
    "remove worktree",
  ]);
  // Nothing is left to clean: a second call does nothing.
  assert.equal(await x.clean(), null);
  assert.equal(lines(x.log), "x");
});

test("killed during gated full validation: the same cleanup, nothing pushed", async (t) => {
  const x = await dead(t, { policy: "gated" });
  x.w.store.put("landing_trains", {
    ...x.w.store.get("landing_trains", x.train.id),
    steps: [{ name: "full on the stack", result: "running" }],
  });
  const before = trunk(x.w);
  await x.clean();
  assert.equal(trunk(x.w), before);
  assert.deepEqual(
    queue(x.w).map((e) => e.key),
    ["t1", "t2"],
  );
  assert.deepEqual(heldSlots(x.db), []);
  assert.equal(lines(x.log), "x");
});

test("killed after an optimistic push: full validation runs on the pushed head before a new train", async (t) => {
  const x = await dead(t, { policy: "optimistic" }),
    dir = await addLandingWorktree(x.project.root, x.base),
    entries = x.w.store.list("landing_queue").sort((a, b) => a.seq - b.seq),
    stacked = await stackMembers({
      root: x.project.root,
      dir,
      baseHead: x.base,
      members: entries,
      others: entries,
    });
  // The dead integrator pushed the stack and died before validating it.
  git(dir, "push", "-q", x.w.origin, `HEAD:refs/heads/main`);
  x.w.store.put("landing_trains", {
    ...x.w.store.get("landing_trains", x.train.id),
    pushed: stacked.stack,
    members: x.train.members.map((m) => ({
      ...m,
      state: "stacked",
      boundary: stacked.members.find((s) => s.key === m.key).boundary,
    })),
  });
  const out = await x.clean();
  assert.equal(
    lines(x.full).trim(),
    stacked.stack,
    "full validation ran on the pushed head",
  );
  assert.equal(out.train.outcome, "abandoned");
  assert.equal(out.train.validated, true);
  assert.deepEqual(
    queue(x.w),
    [],
    "the members are on the trunk, not queued again",
  );
  assert.equal(x.w.store.get("landing_queue", "app\0main\0t1").state, "landed");
  assert.deepEqual(heldSlots(x.db), []);
});
