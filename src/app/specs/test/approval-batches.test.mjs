// plan.approveMany and plan.approvalBatches: several specs approved in one
// transaction, all or none, with plan.approve's checks on each; and the
// order draft specs can be approved in, a loop sharing one batch.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { approvalLayers } from "../approval-batches.mjs";
import { Operations } from "../../api/operations.mjs";
import { createSpecPlan, readSpecFolder } from "../spec-plans.mjs";
import { Store } from "../../store/store.mjs";
import { initializeWorkspace } from "../../workspace/workspace.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { writeSpec, syntheticSpecFiles } from "../../test/spec-fixture.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const cli = fileURLToPath(new URL("../../../../cli.mjs", import.meta.url));

function setup(t) {
  const { root, store } = fixture(t);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, github: { mode: "local" } }),
  );
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}
const leaf = (summary, requires = []) => ({
  kind: "leaf",
  summary,
  requires,
  paths: ["src/example.mjs"],
  checks: ["node --check src/example.mjs"],
  completion: "integrated",
  acceptance: ["The synthetic fixture produces its expected result."],
});
function draft({ root, store }, name, entries, { checked = [] } = {}) {
  writeSpec(root, name, syntheticSpecFiles(entries, checked));
  return createSpecPlan(store, { id: name }, readSpecFolder(root, name));
}
const item = (store, id) => ({ id, expectedHash: store.get("plans", id).hash });
// Three specs in a loop, each with checked work that needs the next one's
// task: none can be approved alone, all three can together.
function loop(w) {
  draft(
    w,
    "ring-a",
    {
      "a-step": leaf("Build ring a"),
      "a-done": leaf("Finish ring a", ["b-step"]),
    },
    { checked: ["a-done"] },
  );
  draft(
    w,
    "ring-b",
    {
      "b-step": leaf("Build ring b"),
      "b-done": leaf("Finish ring b", ["c-step"]),
    },
    { checked: ["b-done"] },
  );
  draft(
    w,
    "ring-c",
    {
      "c-step": leaf("Build ring c"),
      "c-done": leaf("Finish ring c", ["a-step"]),
    },
    { checked: ["c-done"] },
  );
}

test("approvalLayers keeps a loop in one layer and orders the rest", () => {
  assert.deepEqual(
    approvalLayers([
      { id: "a", needs: ["b"] },
      { id: "b", needs: ["a"] },
      { id: "c", needs: [] },
      { id: "d", needs: ["a", "c"] },
      { id: "e", needs: ["d"] },
    ]),
    [["a", "b", "c"], ["d"], ["e"]],
  );
});

test("one bad hash approves none and reports each failure", async (t) => {
  const w = setup(t);
  draft(w, "first", { "first-step": leaf("Build first") });
  draft(w, "second", { "second-step": leaf("Build second") });
  draft(w, "third", { "third-step": leaf("Build third") });
  const revision = w.store.read().revision,
    result = await w.ops.execute("plan.approveMany", {
      items: [
        item(w.store, "first"),
        { id: "second", expectedHash: "0".repeat(64) },
        item(w.store, "third"),
      ],
    });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map((f) => [f.id, f.error]),
    [["second", "The reviewed document hash changed."]],
  );
  assert.equal(w.store.list("approvals").length, 0);
  assert.equal(w.store.read().revision, revision);
  for (const id of ["first", "second", "third"])
    assert.equal(w.store.get("plans", id).state, "draft");
});

test("a failure inside the transaction rolls back earlier approvals", async (t) => {
  const w = setup(t);
  draft(w, "fine", { "fine-step": leaf("Build fine") });
  // Checked work whose owner is outside the set fails in approvePlan, after
  // `fine` has already been approved inside the transaction.
  draft(w, "owner", { "owner-step": leaf("Build owner") });
  draft(
    w,
    "consumer",
    { "consumer-done": leaf("Claim checked work", ["owner-step"]) },
    { checked: ["consumer-done"] },
  );
  const result = await w.ops.execute("plan.approveMany", {
    items: [item(w.store, "fine"), item(w.store, "consumer")],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map((f) => f.id),
    ["consumer"],
  );
  assert.match(result.failures[0].error, /cannot be baselined/);
  assert.equal(w.store.list("approvals").length, 0);
  assert.equal(
    w.store.read().tasks.some((task) => task.id === "fine-step"),
    false,
  );
});

test("an agent caller is refused batch approval", async (t) => {
  const w = setup(t);
  draft(w, "first", { "first-step": leaf("Build first") });
  for (const context of [{ mcp: true }, { caller: "session-1" }])
    await assert.rejects(
      w.ops.execute(
        "plan.approveMany",
        { items: [item(w.store, "first")] },
        undefined,
        context,
      ),
      /Only a person approves a plan/,
    );
  assert.equal(w.store.list("approvals").length, 0);
  // The batch list is a read, and MCP may call it.
  const listed = await w.ops.execute("plan.approvalBatches", {}, undefined, {
    mcp: true,
  });
  assert.equal(listed.batches[0].specs[0].id, "first");
});

test("a loop of 3 specs approves together but not alone", async (t) => {
  const w = setup(t);
  loop(w);
  for (const id of ["ring-a", "ring-b", "ring-c"]) {
    await assert.rejects(
      w.ops.execute("plan.approve", {
        ...item(w.store, id),
        expectedRevision: w.store.read().revision,
      }),
      /cannot be baselined/,
    );
    const alone = await w.ops.execute("plan.approveMany", {
      items: [item(w.store, id)],
    });
    assert.equal(alone.ok, false);
  }
  const two = await w.ops.execute("plan.approveMany", {
    items: [item(w.store, "ring-a"), item(w.store, "ring-b")],
  });
  assert.equal(two.ok, false);
  assert.equal(w.store.list("approvals").length, 0);
  const { batches } = await w.ops.execute("plan.approvalBatches", {});
  assert.equal(batches.length, 1);
  assert.deepEqual(
    batches[0].specs.map((entry) => [entry.id, entry.loop, entry.tasks]),
    [
      ["ring-a", true, 2],
      ["ring-b", true, 2],
      ["ring-c", true, 2],
    ],
  );
  const all = await w.ops.execute("plan.approveMany", {
    items: ["ring-a", "ring-b", "ring-c"].map((id) => item(w.store, id)),
  });
  assert.equal(all.ok, true, JSON.stringify(all.failures));
  assert.equal(w.store.list("approvals").length, 3);
  const tasks = w.store.read().tasks;
  for (const id of ["a-done", "b-done", "c-done"]) {
    const task = tasks.find((row) => row.id === id);
    assert.equal(task.status, "accepted");
    assert.equal(task.pendingSpecDependencies, undefined);
  }
  assert.deepEqual(
    (await w.ops.execute("plan.approvalBatches", {})).batches,
    [],
  );
});

test("batch numbers follow cross-spec owners and renumber after approval", async (t) => {
  const w = setup(t);
  draft(w, "base", { "base-step": leaf("Build base") });
  draft(w, "middle", {
    "middle-step": leaf("Build middle", ["base-step"]),
  });
  draft(w, "top", { "top-step": leaf("Build top", ["middle-step"]) });
  draft(w, "alone", { "alone-step": leaf("Build alone") });
  const before = await w.ops.execute("plan.approvalBatches", {});
  assert.deepEqual(
    before.batches.map((batch) => batch.specs.map((entry) => entry.spec)),
    [["alone", "base"], ["middle"], ["top"]],
  );
  assert.deepEqual(before.batches[1].specs[0].needs, ["base"]);
  const result = await w.ops.execute("plan.approveMany", {
    items: before.batches[0].specs.map((entry) => ({
      id: entry.id,
      expectedHash: entry.hash,
    })),
  });
  assert.equal(result.ok, true);
  const after = await w.ops.execute("plan.approvalBatches", {});
  assert.deepEqual(
    after.batches.map((batch) => batch.specs.map((entry) => entry.spec)),
    [["middle"], ["top"]],
  );
  // A selection that skips an earlier batch says what it leaves out.
  const { selection } = await w.ops.execute("plan.approvalBatches", {
    ids: ["top"],
  });
  assert.deepEqual(selection.missing, ["middle"]);
});

function cliWorkspace() {
  const workspace = temporaryDirectory("avoozl-batch-approve-cli-"),
    config = initializeWorkspace(workspace, { name: "t" }),
    dbPath = config.dbPath || `${workspace}/.avoozl/local/workspace.sqlite`,
    store = new Store(dbPath);
  try {
    const w = { root: workspace, store };
    draft(w, "base", { "base-step": leaf("Build base") });
    draft(w, "next", { "next-step": leaf("Build next", ["base-step"]) });
  } finally {
    store.close();
  }
  const run = (...args) =>
    spawnSync(process.execPath, [cli, ...args, "--workspace", workspace], {
      encoding: "utf8",
      env: { ...process.env, KIROCREW_SPAWNED: "", KIRO_SESSION_ID: "" },
    });
  const read = (fn) => {
    const s = new Store(dbPath);
    try {
      return fn(s);
    } finally {
      s.close();
    }
  };
  return { run, read };
}

test("the CLI preview without --yes writes nothing; --yes approves", () => {
  const { run, read } = cliWorkspace(),
    revision = read((s) => s.read().revision);
  const listed = run("plan", "batches");
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /Batch 1 \(1 specs\)\n {2}base /);
  assert.match(listed.stdout, /Batch 2 \(1 specs\)\n {2}next /);
  const preview = run("plan", "approve", "--batch", "1");
  assert.equal(preview.status, 0, preview.stderr + preview.stdout);
  assert.match(preview.stdout, /Nothing approved/);
  assert.match(preview.stdout, /1 specs, 1 tasks\./);
  assert.equal(
    read((s) => s.list("approvals").length),
    0,
  );
  assert.equal(
    read((s) => s.read().revision),
    revision,
  );
  const hash = read((s) => s.get("plans", "base").hash);
  assert.ok(preview.stdout.includes(`--expect ${hash.slice(0, 16)}`));
  // --yes alone would approve whatever the specs say now.
  const unpinned = run("plan", "approve", "--batch", "1", "--yes");
  assert.notEqual(unpinned.status, 0);
  assert.match(unpinned.stderr, /--yes needs --expect/);
  const stale = run(
    "plan",
    "approve",
    "--batch",
    "1",
    "--yes",
    "--expect",
    "f".repeat(16),
  );
  assert.notEqual(stale.status, 0);
  assert.equal(
    read((s) => s.list("approvals").length),
    0,
  );
  const approved = run(
    "plan",
    "approve",
    "--batch",
    "1",
    "--yes",
    "--expect",
    hash.slice(0, 16),
  );
  assert.equal(approved.status, 0, approved.stderr + approved.stdout);
  assert.deepEqual(
    read((s) => s.list("approvals").map((a) => [a.planId, a.hash])),
    [["base", hash]],
  );
});
