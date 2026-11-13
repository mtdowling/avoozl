import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fixture, markdown } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";
import { handleMcp } from "../mcp.mjs";
import { readSpecFolder, specItems } from "../spec-plans.mjs";
import { writeSpec } from "./spec-fixture.mjs";

const approve = (ops, plan, evidence = "Approved") =>
  ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: ops.read().revision,
    approvedBy: "User",
    evidence,
  });
const proposal = (overrides = {}) => ({
  id: "cache-invalidation",
  title: "Invalidate the stale cache entry",
  kind: "leaf",
  summary: "Found while implementing the delivery task.",
  acceptance: ["A changed record invalidates its cache entry."],
  checks: ["npm test"],
  completion: "integrated",
  requires: ["1.2"],
  tags: ["discovered"],
  ...overrides,
});
// A workspace with one stored spec plan, "config".
async function specPlan(t) {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root }),
    directory = writeSpec(root, "config"),
    plan = await ops.execute("plan.create", { spec: "config" });
  return { root, store, ops, directory, plan };
}

test("a discovery on a spec plan adds a tasks.md item and a manifest entry", async (t) => {
  const { root, store, ops, directory, plan } = await specPlan(t);
  const receipt = await approve(ops, plan);
  const before = store.read().tasks.length;
  const amended = await ops.execute("plan.propose", {
    id: plan.id,
    proposal: proposal(),
    expectedHash: store.get("plans", plan.id).hash,
  });
  // The proposal is design prose, not execution state.
  assert.equal(store.read().tasks.length, before);
  assert.equal(amended.approved, false);
  assert.equal(amended.proposalId, "cache-invalidation");
  assert.equal(amended.proposalCount, 4);
  assert.equal(store.list("approvals").length, 1);
  assert.equal(amended.state, "draft");
  assert.equal(amended.revision, plan.revision + 1);
  assert.equal(amended.hash, readSpecFolder(root, "config").hash);
  assert.notEqual(amended.hash, receipt.hash);
  assert.equal(
    store.read().tasks.filter((t) => t.planId === plan.id && t.needsReview)
      .length,
    receipt.taskIds.length,
  );
  // The item and its entry are on disk; no fenced block is written anywhere.
  const tasks = fs.readFileSync(path.join(directory, "tasks.md"), "utf8"),
    manifest = JSON.parse(
      fs.readFileSync(path.join(directory, "avoozl/manifest.json"), "utf8"),
    );
  assert.ok(
    tasks.endsWith(
      "- [ ] cache-invalidation Invalidate the stale cache entry\n",
    ),
  );
  assert.doesNotMatch(tasks, /```task/);
  assert.deepEqual(manifest.tasks["cache-invalidation"].requires, ["1.2"]);
  assert.equal(manifest.tasks["cache-invalidation"].title, undefined);
  await assert.rejects(
    ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: receipt.hash,
      expectedRevision: store.read().revision,
    }),
    /hash changed/,
  );
});

test("approving the amended spec converts the proposal in one mapping", async (t) => {
  const { store, ops, plan } = await specPlan(t);
  const first = await approve(ops, plan);
  await ops.execute("task.update", {
    id: "config.1.2",
    status: "partial",
    notes: "Prior evidence",
  });
  await ops.execute("plan.propose", { id: plan.id, proposal: proposal() });
  const second = await approve(ops, store.get("plans", plan.id));
  assert.equal(first.taskIds.length, 3);
  assert.deepEqual(second.taskIds.sort(), [
    "cache-invalidation",
    "config.1",
    "config.1.1",
    "config.1.2",
  ]);
  const added = store.read().tasks.find((t) => t.id === "cache-invalidation");
  assert.equal(added.status, "planned");
  assert.ok(
    store
      .read()
      .edges.some(
        (e) =>
          e.from === "config.1.2" && e.to === added.id && e.kind === "requires",
      ),
  );
  const kept = store.read().tasks.find((t) => t.id === "config.1.2");
  assert.equal(kept.status, "partial");
  assert.equal(kept.notes, "Prior evidence");
});

test("spec proposals are rejected by the task rules with no partial write", async (t) => {
  const { ops, store, directory, plan } = await specPlan(t);
  const files = () =>
    ["tasks.md", "avoozl/manifest.json"].map((file) =>
      fs.readFileSync(path.join(directory, file), "utf8"),
    );
  const rejects = async (value, message) => {
    const before = files();
    await assert.rejects(
      ops.execute("plan.propose", { id: plan.id, proposal: value }),
      message,
    );
    assert.deepEqual(files(), before);
    assert.equal(store.get("plans", plan.id).revision, plan.revision);
  };
  await rejects(proposal({ id: "cache" }), /ID with a separator/);
  await rejects(proposal({ title: "" }), /title of 1–240 characters/);
  await rejects(proposal({ title: "two\nlines" }), /on one line/);
  await rejects(proposal({ acceptance: [] }), /observable acceptance criteria/);
  await rejects(proposal({ tags: "discovered" }), /tags must be a list/);
  await rejects(proposal({ summary: 7 }), /summary must be text/);
  await rejects(proposal({ id: "1.2" }), /Repeated local task ID 1\.2/);
  await rejects("cache", /one proposed task as a JSON object/);
  await assert.rejects(
    ops.execute("plan.propose", { id: "plan-missing", proposal: proposal() }),
    /Plan not found/,
  );
});

test("a stale hash or a folder changed on disk refuses the proposal", async (t) => {
  const { ops, store, directory, plan } = await specPlan(t);
  await ops.execute("plan.propose", {
    id: plan.id,
    proposal: proposal(),
    expectedHash: plan.hash,
  });
  await assert.rejects(
    ops.execute("plan.propose", {
      id: plan.id,
      proposal: proposal({ id: "retry-budget", title: "Bound retries" }),
      expectedHash: plan.hash,
    }),
    (error) => error.status === 409 && /Reload before proposing/.test(error),
  );
  fs.appendFileSync(path.join(directory, "design.md"), "Edited by hand.\n");
  await assert.rejects(
    ops.execute("plan.propose", {
      id: plan.id,
      proposal: proposal({ id: "retry-budget", title: "Bound retries" }),
    }),
    /changed on disk/,
  );
  // Without a hash, proposals on a current folder serialize and both land.
  const current = store.get("plans", plan.id);
  await ops.execute("plan.save", { id: plan.id, expectedHash: current.hash });
  await ops.execute("plan.propose", {
    id: plan.id,
    proposal: proposal({ id: "retry-budget", title: "Bound retries" }),
  });
  assert.deepEqual(
    specItems("config", store.get("plans", plan.id).text).map((i) => i.id),
    [
      "config.1",
      "config.1.1",
      "config.1.2",
      "cache-invalidation",
      "retry-budget",
    ],
  );
});

test("a task proposal on a free-form design is refused instead of writing a fenced block", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    plan = await ops.execute("plan.create", {
      prompt: "Feature",
      text: markdown,
    });
  await assert.rejects(
    ops.execute("plan.propose", { id: plan.id, proposal: proposal() }),
    (error) =>
      error.status === 409 && /no longer writes fenced task blocks/.test(error),
  );
  assert.equal(store.get("plans", plan.id).text, markdown);
});

test("the agent-facing surfaces route discoveries away from capture", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  const handoff = await ops.execute("handoff", { id: "sample-task" });
  assert.match(handoff.policy, /plan\.propose/);
  assert.match(handoff.policy, /record the evidence here/);
  assert.match(
    handoff.policy,
    /do not capture discoveries as new request tasks/,
  );
  // In-scope findings stay on the task being worked.
  const updated = await ops.execute("task.update", {
    id: "sample-task",
    status: "partial",
    notes: "Fixed the adjacent typo in the same change.",
    evidence: ["workspace:evidence/run-check"],
  });
  assert.deepEqual(updated.evidence, ["workspace:evidence/run-check"]);
  assert.equal(
    store.read().tasks.some((t) => t.id.startsWith("request-")),
    false,
  );
  const tools = (
    await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ops)
  ).body.result.tools;
  const capture = tools.find((x) => x.name === "plans_capture"),
    propose = tools.find((x) => x.name === "plans_propose_work");
  assert.match(
    capture.description,
    /Not a channel for work an agent discovered/,
  );
  assert.match(propose.description, /not executable/);
  assert.equal(propose.annotations.readOnlyHint, false);
});
