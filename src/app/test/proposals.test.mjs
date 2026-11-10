import test from "node:test";
import assert from "node:assert/strict";
import { fixture, markdown, runCapability } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";
import { handleMcp } from "../mcp.mjs";
import { extractPlan } from "../plans.mjs";

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
  summary: "Found while implementing the delivery task.",
  acceptance: ["A changed record invalidates its cache entry."],
  requires: ["delivery"],
  tags: ["discovered"],
  ...overrides,
});

test("a discovery adjacent to the current plan becomes a proposal, not a request task", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    plan = await ops.execute("plan.create", {
      prompt: "Feature",
      text: markdown,
    });
  const receipt = await approve(ops, plan);
  const before = store.read().tasks.length;
  const amended = await ops.execute("plan.propose", {
    id: plan.id,
    proposal: proposal(),
    expectedHash: store.get("plans", plan.id).hash,
  });
  // The proposal is design prose, not execution state.
  assert.equal(store.read().tasks.length, before);
  assert.equal(
    store.read().tasks.some((t) => t.id.startsWith("request-")),
    false,
  );
  assert.equal(amended.approved, false);
  assert.equal(amended.proposalId, "cache-invalidation");
  assert.equal(amended.proposalCount, 3);
  assert.equal(store.list("approvals").length, 1);
  // The plan reads as changed against its receipt and its tasks need review.
  assert.equal(amended.state, "draft");
  assert.notEqual(amended.hash, receipt.hash);
  assert.equal(amended.revision, plan.revision + 1);
  assert.equal(
    store.read().tasks.filter((t) => t.planId === plan.id && t.needsReview)
      .length,
    receipt.taskIds.length,
  );
  assert.equal(
    (await ops.execute("workspace")).audit.findings.filter(
      (f) => f.kind === "changed-context",
    ).length,
    receipt.taskIds.length,
  );
  // The appended block follows the existing proposals and preserves prose.
  const text = store.get("plans", plan.id).text;
  assert(text.startsWith(markdown.trimEnd()));
  assert.deepEqual(
    extractPlan(text).map((p) => p.id),
    ["foundation", "delivery", "cache-invalidation"],
  );
  // Approving the old revision is refused; the stale receipt must be replaced.
  await assert.rejects(
    ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: receipt.hash,
      expectedRevision: store.read().revision,
      approvedBy: "User",
      evidence: "Approved",
    }),
    /hash changed/,
  );
});

test("approving the amended revision converts the appended proposal in one mapping", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    plan = await ops.execute("plan.create", {
      prompt: "Feature",
      text: markdown,
    });
  const first = await approve(ops, plan);
  const existing = first.mapping.delivery;
  await ops.execute("task.update", {
    id: existing,
    status: "partial",
    notes: "Prior evidence",
  });
  await ops.execute("plan.propose", { id: plan.id, proposal: proposal() });
  const amended = store.get("plans", plan.id),
    second = await approve(
      ops,
      amended,
      "Approved the amendment including the discovered work",
    );
  assert.equal(store.list("approvals").length, 2);
  assert.deepEqual(Object.keys(second.mapping).sort(), [
    "cache-invalidation",
    "delivery",
    "foundation",
  ]);
  assert.equal(second.taskIds.length, 3);
  const added = store
    .read()
    .tasks.find((t) => t.id === second.mapping["cache-invalidation"]);
  assert.equal(added.status, "planned");
  assert.equal(added.planId, plan.id);
  assert.deepEqual(added.acceptance, [
    "A changed record invalidates its cache entry.",
  ]);
  assert(
    store
      .read()
      .edges.some(
        (e) =>
          e.from === second.mapping.delivery &&
          e.to === added.id &&
          e.kind === "requires",
      ),
  );
  const kept = store.read().tasks.find((t) => t.id === existing);
  assert.equal(kept.status, "partial");
  assert.equal(kept.notes, "Prior evidence");
  assert.equal(store.get("plans", plan.id).state, "approved");
});

test("proposals are rejected by the rules extraction already enforces", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    plan = await ops.execute("plan.create", {
      prompt: "Feature",
      text: markdown,
    });
  const rejects = async (value, message) => {
    const before = store.get("plans", plan.id);
    await assert.rejects(
      ops.execute("plan.propose", { id: plan.id, proposal: value }),
      message,
    );
    const after = store.get("plans", plan.id);
    assert.equal(after.text, before.text);
    assert.equal(after.revision, before.revision);
  };
  await rejects(
    proposal({ id: "Cache_Invalidation" }),
    /stable lowercase local ID/,
  );
  await rejects(proposal({ title: "" }), /title of 1–240 characters/);
  await rejects(proposal({ acceptance: [] }), /observable acceptance criteria/);
  await rejects(proposal({ tags: "discovered" }), /tags must be a list/);
  await rejects(proposal({ summary: 7 }), /summary must be text/);
  await rejects(
    proposal({ id: "delivery" }),
    /Repeated local task ID delivery/,
  );
  await rejects("cache", /one proposed task as a JSON object/);
  await assert.rejects(
    ops.execute("plan.propose", { id: "plan-missing", proposal: proposal() }),
    /Plan not found/,
  );
});

test("concurrent appends either both land or the loser fails with no partial write", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    plan = await ops.execute("plan.create", {
      prompt: "Feature",
      text: markdown,
    });
  const stale = plan.hash;
  await ops.execute("plan.propose", {
    id: plan.id,
    proposal: proposal(),
    expectedHash: stale,
  });
  const landed = store.get("plans", plan.id);
  await assert.rejects(
    ops.execute("plan.propose", {
      id: plan.id,
      proposal: proposal({
        id: "retry-budget",
        title: "Bound the retry budget",
      }),
      expectedHash: stale,
    }),
    (error) => error.status === 409 && /Reload before proposing/.test(error),
  );
  assert.equal(store.get("plans", plan.id).text, landed.text);
  assert.equal(store.get("plans", plan.id).revision, landed.revision);
  // Without a hash, independent appends serialize and both land.
  await ops.execute("plan.propose", {
    id: plan.id,
    proposal: proposal({ id: "retry-budget", title: "Bound the retry budget" }),
  });
  assert.deepEqual(
    extractPlan(store.get("plans", plan.id).text).map((p) => p.id),
    ["foundation", "delivery", "cache-invalidation", "retry-budget"],
  );
});

test("a plan with no blocks yet keeps its appended proposal inside the proposed-work section", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    text =
      "# Shape the design\n\n## Design\n\nProse to preserve.\n\n## Proposed work\n\nAdd one task block per deliverable.\n\n## Risks\n\nTrailing prose.\n",
    plan = await ops.execute("plan.create", { prompt: "Shape", text });
  const amended = await ops.execute("plan.propose", {
    id: plan.id,
    proposal: proposal({ requires: [] }),
  });
  assert.match(
    amended.text,
    /Add one task block per deliverable\.\n\n```task\n[\s\S]*```\n\n## Risks\n\nTrailing prose\.\n$/,
  );
  assert.deepEqual(
    extractPlan(amended.text).map((p) => p.id),
    ["cache-invalidation"],
  );
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
    await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ops, {
      runId: "run-worker",
      runCapability: runCapability(store, "run-worker"),
    })
  ).body.result.tools;
  const capture = tools.find((x) => x.name === "plans_capture"),
    propose = tools.find((x) => x.name === "plans_propose_work");
  assert.equal(capture, undefined);
  assert.match(propose.description, /not executable/);
  assert.equal(propose.annotations.readOnlyHint, false);
});
