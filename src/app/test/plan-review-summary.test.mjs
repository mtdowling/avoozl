import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { principalAllows } from "../app-backend.mjs";
import { planReviewSummary } from "../plan-review-summary.mjs";
import { createSpecPlan, readSpecFolder } from "../spec-plans.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";

function setup(t) {
  const { root, store } = fixture(t);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, github: { mode: "local" } }),
  );
  writeSpec(root, "example");
  const plan = createSpecPlan(
    store,
    { id: "example" },
    readSpecFolder(root, "example"),
  );
  const writes = [];
  const ops = new Operations(store, {
    workspaceRoot: root,
    github: {
      available: () => false,
      request: (...args) => {
        writes.push(args);
        throw Error("Unexpected GitHub write");
      },
    },
  });
  return { root, store, ops, plan, writes };
}
function round(env, id, extra = {}) {
  const value = {
    id,
    spec: env.plan.spec,
    planId: env.plan.id,
    revisionHash: env.plan.hash,
    pass: 1,
    round: 1,
    state: "done",
    reviewerModel: "fake-reviewer",
    note: null,
    ...extra,
  };
  env.store.put("review_rounds", value);
  return value;
}
function finding(env, id, roundId, extra = {}) {
  env.store.put("review_threads", {
    id,
    source: "plan-review",
    planId: env.plan.id,
    revisionHash: env.plan.hash,
    roundId,
    state: "open",
    kind: "gap",
    severity: "important",
    file: "design.md",
    line: 1,
    statement: "A requirement has no task.",
    evidence: "Compared the stored requirement and task files.",
    ...extra,
  });
}

test("the latest pass counts stored fixes, leaves answered findings for the person, and marks older revisions", (t) => {
  const env = setup(t);
  round(env, "old-pass");
  finding(env, "old", "old-pass");
  round(env, "current-pass", { pass: 2 });
  finding(env, "fixed", "current-pass", {
    answer: {
      action: "fixed",
      revisionHash: env.plan.hash,
      text: "Added the task.",
      at: "now",
    },
  });
  finding(env, "answered", "current-pass", {
    answer: {
      action: "answered",
      text: "The proof covers this case.",
      at: "now",
    },
  });
  finding(env, "unrecorded", "current-pass", {
    answer: {
      action: "fixed",
      revisionHash: "missing-hash",
      text: "Not stored.",
      at: "now",
    },
  });
  finding(env, "closed", "current-pass", {
    state: "closed",
    disposition: "accepted",
  });
  round(env, "next-round", {
    pass: 2,
    round: 2,
    revisionHash: "older-hash",
    state: "running",
    writerModel: "fake-writer",
  });
  const before = env.store.read().revision,
    summary = planReviewSummary(env.store, env.plan.id);
  assert.equal(summary.state, "running");
  assert.equal(summary.current, false);
  assert.equal(summary.revisionHash, "older-hash");
  assert.equal(
    summary.planHash,
    env.plan.hash,
    "names the stored revision now",
  );
  assert.equal(summary.reviewerModel, "fake-reviewer");
  assert.equal(summary.writerModel, "fake-writer");
  assert.deepEqual([summary.found, summary.fixed, summary.forYou], [4, 1, 2]);
  assert.deepEqual(summary.open.map((f) => f.id).sort(), [
    "answered",
    "fixed",
    "unrecorded",
  ]);
  assert.equal(
    summary.open.find((f) => f.id === "answered").answer.text,
    "The proof covers this case.",
  );
  assert.equal(env.store.read().revision, before, "summary writes nothing");
  env.store.put("plans", {
    ...env.plan,
    history: [{ hash: "stored-old-hash" }],
  });
  finding(env, "history-fix", "current-pass", {
    answer: {
      action: "fixed",
      revisionHash: "stored-old-hash",
      text: "Stored earlier.",
      at: "now",
    },
  });
  assert.equal(planReviewSummary(env.store, env.plan.id).fixed, 2);
});

test("open findings count by severity, and the reviewer's summary is read per revision", (t) => {
  const env = setup(t);
  assert.equal(planReviewSummary(env.store, env.plan.id).summary, null);
  round(env, "older", { revisionHash: "older-hash", summary: "Older text." });
  assert.deepEqual(planReviewSummary(env.store, env.plan.id).summary, {
    text: "Older text.",
    revisionHash: "older-hash",
    current: false,
  });
  round(env, "now", { round: 2, summary: "Reads bytes. 3 tasks." });
  finding(env, "blocker", "now", { severity: "blocking" });
  finding(env, "warn-open", "now");
  finding(env, "warn-fixed", "now", {
    answer: {
      action: "fixed",
      revisionHash: env.plan.hash,
      text: "Done.",
      at: "now",
    },
  });
  finding(env, "info-rejected", "now", {
    severity: "suggestion",
    decisions: [
      {
        action: "reject",
        by: "Owner",
        at: "now",
        revisionHash: env.plan.hash,
        note: "No.",
      },
    ],
  });
  finding(env, "info-accepted", "now", {
    severity: "question",
    decisions: [
      {
        action: "accept",
        by: "Owner",
        at: "now",
        revisionHash: env.plan.hash,
        note: "",
      },
    ],
  });
  const summary = planReviewSummary(env.store, env.plan.id);
  assert.deepEqual(summary.openBySeverity, { info: 1, warn: 1, blocker: 1 });
  assert.deepEqual(summary.bySeverity, { info: 2, warn: 2, blocker: 1 });
  assert.deepEqual(summary.summary, {
    text: "Reads bytes. 3 tasks.",
    revisionHash: env.plan.hash,
    current: true,
  });
});

test("summary, approval checks and batch entries expose the same evidence without a GitHub write", async (t) => {
  const env = setup(t);
  round(env, "review");
  finding(env, "open", "review");
  const summary = await env.ops.execute("plan.reviewSummary", {
    planId: env.plan.id,
  });
  assert.deepEqual(
    env.ops.approvalChecks({ id: env.plan.id, expectedHash: env.plan.hash })
      .review,
    summary,
  );
  assert.deepEqual(
    (await env.ops.execute("plan.get", { id: env.plan.id })).review,
    summary,
  );
  assert.deepEqual(
    (await env.ops.execute("plan.preview", { id: env.plan.id })).review,
    summary,
  );
  const batches = await env.ops.execute("plan.approvalBatches", {
    ids: [env.plan.id],
  });
  assert.deepEqual(batches.batches[0].specs[0].review, summary);
  assert.deepEqual(batches.selection.specs[0].review, summary);
  assert.deepEqual(env.writes, []);
});

for (const batch of [false, true])
  test(`${batch ? "batch" : "single"} approval has the same result without review, with open findings, skipped or running`, async (t) => {
    let baseline;
    for (const state of ["none", "open", "skipped", "running"]) {
      const env = setup(t);
      if (state !== "none")
        round(env, "review", {
          state: state === "open" ? "done" : state,
          note: state === "skipped" ? "The writer model is unknown." : null,
        });
      if (state === "open") finding(env, "open", "review");
      const result = await env.ops.execute(
        batch ? "plan.approveMany" : "plan.approve",
        batch
          ? { items: [{ id: env.plan.id, expectedHash: env.plan.hash }] }
          : {
              id: env.plan.id,
              expectedHash: env.plan.hash,
              expectedRevision: env.store.read().revision,
            },
      );
      if (batch) assert.equal(result.ok, true);
      const snapshot = {
        tasks: env.store
          .read()
          .tasks.map((task) => ({ id: task.id, status: task.status })),
        approvals: env.store
          .list("approvals")
          .map((a) => ({ planId: a.planId, hash: a.hash })),
      };
      if (!baseline) baseline = snapshot;
      else assert.deepEqual(snapshot, baseline, state);
      assert.deepEqual(env.writes, []);
      if (state === "open")
        assert.equal(env.store.get("review_threads", "open").state, "open");
    }
  });

test("only a person closes a spec finding or a text-plan comment", async (t) => {
  const env = setup(t);
  round(env, "review");
  finding(env, "open", "review");
  for (const context of [
    { mcp: true },
    { caller: { sessionKey: "dashboard:fake-agent" } },
  ]) {
    await assert.rejects(
      env.ops.execute(
        "plan.review.dispose",
        { id: "open", disposition: "resolved" },
        undefined,
        context,
      ),
      /Only a person/,
    );
    await assert.rejects(
      env.ops.execute(
        "plan.approve",
        { id: env.plan.id, expectedHash: env.plan.hash },
        undefined,
        context,
      ),
      /person/i,
    );
  }
  assert.equal(
    principalAllows({ kind: "app-token" }, "plan.review.dispose"),
    false,
  );
  assert.equal(
    principalAllows({ kind: "agent-tool" }, "plan.review.dispose"),
    false,
  );
  assert.equal(
    principalAllows({ kind: "owner-session" }, "plan.review.dispose"),
    true,
  );
  assert.equal(
    principalAllows({ kind: "app-token" }, "plan.reviewSummary"),
    true,
  );
  assert.equal(env.store.get("review_threads", "open").state, "open");
  await env.ops.execute("plan.review.dispose", {
    id: "open",
    disposition: "deferred",
  });
  assert.equal(planReviewSummary(env.store, env.plan.id).forYou, 0);
  env.store.put("review_threads", {
    id: "legacy",
    planId: "legacy-text-plan",
    state: "open",
  });
  // A text-plan comment is person-only too now (R104.6), and a person
  // still closes it the old way.
  await assert.rejects(
    env.ops.execute(
      "plan.review.dispose",
      { id: "legacy", disposition: "resolved" },
      undefined,
      { mcp: true },
    ),
    /Only a person/,
  );
  await env.ops.execute("plan.review.dispose", {
    id: "legacy",
    disposition: "resolved",
  });
  assert.equal(env.store.get("review_threads", "legacy").state, "closed");
});

test("Review anyway is offered at the rounds cap once the planner is done", (t) => {
  const env = setup(t);
  // The pass's only round reviewed an older revision; the plan has moved on.
  round(env, "capped", { revisionHash: "a".repeat(64), writerModel: "w" });
  const summary = planReviewSummary(env.store, env.plan.id);
  assert.equal(summary.capped, true);
  assert.equal(summary.canReviewAnyway, true);
  // Not while a planner turn still runs, once pressed, or once a round exists.
  for (const receipt of [
    { id: "a", kind: "plan-answer", planId: env.plan.id, state: "running" },
    {
      id: "c",
      kind: "plan-review-choice",
      planId: env.plan.id,
      revisionHash: env.plan.hash,
      state: "review",
    },
  ]) {
    env.store.put("receipts", receipt);
    assert.equal(
      planReviewSummary(env.store, env.plan.id).canReviewAnyway,
      false,
    );
    env.store.db.prepare("DELETE FROM receipts WHERE id=?").run(receipt.id);
  }
  round(env, "next", { round: 2, state: "running" });
  assert.equal(
    planReviewSummary(env.store, env.plan.id).canReviewAnyway,
    false,
  );
});

test("Review anyway is offered only for an unknown writer skip that never opened", (t) => {
  const env = setup(t),
    round = {
      id: "skipped",
      planId: env.plan.id,
      spec: env.plan.spec,
      pass: 1,
      round: 1,
      revisionHash: env.plan.hash,
      state: "skipped",
      writerModel: null,
      reviewerModel: "fake-reviewer",
      unproven: false,
      slot: null,
    };
  env.store.put("review_rounds", round);
  assert.equal(planReviewSummary(env.store, env.plan.id).canReviewAnyway, true);
  for (const change of [
    { slot: "opened" },
    { unproven: true },
    { writerModel: "fake-writer" },
    { state: "running" },
    { state: "done" },
  ]) {
    env.store.put("review_rounds", { ...round, ...change });
    assert.equal(
      planReviewSummary(env.store, env.plan.id).canReviewAnyway,
      false,
    );
  }
});
