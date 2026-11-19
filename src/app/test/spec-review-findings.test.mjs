import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../api/operations.mjs";
import {
  bindSpecReviewRound,
  createSpecReviewRound,
  listReviewThreads,
  listSpecReviewRounds,
  reportedPlanModel,
  settleSpecReviewRounds,
} from "../reviews/plan-reviews.mjs";
import { writeRevision } from "../specs/plans.mjs";
import { recordSessionStatus } from "../sessions/session-bindings.mjs";
import { createSpecPlan, specHash } from "../specs/spec-plans.mjs";
import { fixture } from "./fixtures.mjs";

function setup(t) {
  const { store } = fixture(t),
    files = {
      "requirements.md": "# Needs\n\nThe app reads a file.\n",
      "design.md": "# Design\n\nUse src/missing.mjs.\n",
      "tasks.md": "# Tasks\n\n- [ ] 1.1 Read the file\n",
      "avoozl/manifest.json": '{"version":1,"tasks":{}}\n',
    },
    plan = createSpecPlan(
      store,
      { id: "file-reader" },
      {
        name: "file-reader",
        exists: true,
        files,
        hash: specHash(files),
      },
    ),
    ops = new Operations(store);
  store.put("session_bindings", {
    id: "writer",
    slot: "writer",
    role: "planner",
    taskId: plan.id,
    model: "fake-requested-writer",
  });
  recordSessionStatus(
    store,
    { slot: "writer", status: "idle" },
    {
      served: {
        model: "fake-writer",
        requested: "fake-requested-writer",
        changed: false,
        withheld: false,
      },
    },
  );
  const start = (extra = {}) =>
    createSpecReviewRound(store, {
      planId: plan.id,
      revisionHash: store.get("plans", plan.id).hash,
      reviewerModel: "fake-reviewer",
      writer: { slot: "writer" },
      ...extra,
    });
  const advance = (text = "# Changed design\n") => {
    const current = store.get("plans", plan.id),
      next = { ...current.files, "design.md": text };
    return writeRevision(store, current, current.text, "Change spec: ", {
      files: next,
      hash: specHash(next),
    });
  };
  const bind = async (
    round,
    { slot = "reviewer", model = "fake-reviewer", reported = true } = {},
  ) => {
    await ops.execute("session.bind", {
      slot,
      taskId: round.id,
      role: "plan-review",
      model: "fake-requested-reviewer",
    });
    assert.deepEqual(store.get("session_bindings", slot).review, {
      planId: round.planId,
      revisionHash: round.revisionHash,
      roundId: round.id,
    });
    recordSessionStatus(
      store,
      { slot, status: "idle" },
      reported
        ? {
            served: {
              model,
              requested: "fake-requested-reviewer",
              changed: false,
              withheld: false,
            },
          }
        : {},
    );
    return (findings = [finding()], extra = {}, context = {}) =>
      ops.execute(
        "plan.review.submit",
        {
          planId: plan.id,
          revisionHash: round.revisionHash,
          findings,
          ...extra,
        },
        undefined,
        { caller: { sessionKey: "dashboard:" + slot }, mcp: true, ...context },
      );
  };
  return { store, plan, ops, start, advance, bind };
}

function finding(extra = {}) {
  return {
    kind: "wrong-reference",
    severity: "important",
    file: "design.md",
    line: 3,
    quote: "Use src/missing.mjs.",
    statement: "The named source file does not exist.",
    evidence: "Searched src/ for missing.mjs; no matching file was found.",
    ...extra,
  };
}

test("unset, unknown and same-model pairs are skipped with a reason, without opening a chat", (t) => {
  for (const [input, reason] of [
    [{ reviewerModel: "auto" }, /Pick a Plan reviewer model/],
    [{ writer: {} }, /wrote this revision is unknown/],
    [{ reviewerModel: "fake-writer" }, /same as/],
  ]) {
    const { store, start } = setup(t),
      { round } = start(input);
    assert.equal(round.state, "skipped");
    assert.match(round.note, reason);
    assert.ok(round.endedAt);
    assert.equal(store.list("session_requests").length, 0);
    const repeated = start(input);
    assert.equal(repeated.created, false);
    assert.equal(repeated.round.id, round.id);
  }
});

test("requested models never prove the writer model, and a person-only override stays unproven", async (t) => {
  const { store, start, bind } = setup(t);
  store.put("session_bindings", {
    id: "unknown-writer",
    slot: "unknown-writer",
    model: "fake-writer",
  });
  assert.equal(reportedPlanModel(store, { slot: "unknown-writer" }), null);
  assert.throws(() => start({ writer: {}, unproven: true }), /Only a person/);
  const { round } = start({ writer: {}, unproven: true, person: true });
  assert.equal(round.state, "running");
  assert.equal(round.unproven, true);
  const submit = await bind(round);
  assert.equal((await submit()).round.state, "done");
});

test("a reported writer model overrides the requested model when checking the pair", (t) => {
  const { start } = setup(t),
    { round } = start({ reviewerModel: "fake-requested-writer" });
  assert.equal(round.state, "running");
  assert.equal(round.writerModel, "fake-writer");
});

test("a configured different reviewer cannot submit from the writer's actual model", async (t) => {
  const { store, start, bind } = setup(t),
    { round } = start(),
    submit = await bind(round, { model: "fake-writer" });
  await assert.rejects(
    submit([finding()], { model: "fake-other", reviewerModel: "fake-other" }),
    /ran on the model that wrote/,
  );
  assert.equal(store.list("review_threads").length, 0);
  assert.equal(store.get("review_rounds", round.id).state, "skipped");
});

test("an unreported reviewer stays unproven even when the caller names a different model", async (t) => {
  const { store, start, bind } = setup(t),
    { round } = start(),
    submit = await bind(round, { reported: false });
  await assert.rejects(
    submit([finding()], { model: "fake-reviewer" }),
    /no proven reported model/,
  );
  assert.equal(store.list("review_threads").length, 0);
  assert.match(store.get("review_rounds", round.id).note, /review skipped/);
});

test("valid findings use the served model, survive revision changes, and retry without duplicates", async (t) => {
  const { store, plan, ops, start, advance, bind } = setup(t),
    { round } = start({
      commits: { app: "a".repeat(40) },
    }),
    submit = await bind(round);
  const updated = advance("# New design\n"); // line 3 exists only in the recorded old revision.
  const result = await submit();
  assert.equal(result.round.reviewerModel, "fake-reviewer");
  assert.equal(result.round.writerModel, "fake-writer");
  assert.deepEqual(result.round.commits, { app: "a".repeat(40) });
  assert.equal(result.threads[0].source, "plan-review");
  assert.equal(result.threads[0].revisionHash, plan.hash);
  assert.equal(result.threads[0].file, "design.md");
  assert.equal(result.threads[0].line, 3);
  const listed = await ops.execute("plan.review.list", { planId: plan.id });
  assert.equal(listed.items[0].stale, true);
  assert.equal(listed.items[0].current, false);
  assert.equal(listed.items[0].reanchored, null);
  const duplicate = await submit();
  assert.equal(duplicate.threads[0].id, result.threads[0].id);
  assert.equal(duplicate.threads[0].existing, true);
  assert.equal(store.list("review_threads").length, 1);
  const rebound = await ops.execute("session.bind", {
    taskId: round.id,
    role: "plan-review",
    slot: "reviewer",
  });
  assert.equal(rebound.changed, false);
  assert.equal(rebound.binding.review.roundId, round.id);
  await assert.rejects(
    submit([finding({ statement: "A different statement." })]),
    /final findings/,
  );
  assert.equal(store.get("plans", plan.id).hash, updated.hash);
  assert.equal(store.get("plans", plan.id).state, "draft");
  assert.equal(store.list("approvals").length, 0);
});

test("invalid findings are refused atomically against the exact stored files", async (t) => {
  const { store, start, bind } = setup(t),
    { round } = start(),
    submit = await bind(round);
  for (const bad of [
    { file: "../design.md" },
    { file: "avoozl/critique.md" },
    { file: "missing.md" },
    { quote: undefined },
    { quote: " " },
    { quote: "not in the design" },
    { quote: "a" },
    { quote: 3 },
    { quote: "x".repeat(501) },
    { kind: "other" },
    { severity: "minor" },
    { statement: " " },
    { evidence: "" },
  ]) {
    await assert.rejects(submit([finding(), finding(bad)]));
    assert.equal(store.list("review_threads").length, 0);
    assert.equal(store.get("review_rounds", round.id).state, "running");
  }
  await assert.rejects(
    submit(Array.from({ length: 51 }, () => finding())),
    /at most 50/,
  );
  assert.equal((await submit([])).round.state, "done");
});

test("the attested session cannot target another revision or round", async (t) => {
  const { store, plan, start, bind } = setup(t),
    { round } = start(),
    submit = await bind(round);
  for (const [extra, context] of [
    [{ revisionHash: "0".repeat(64) }, {}],
    [{ roundId: "missing-round" }, {}],
    [{}, { caller: { sessionKey: "dashboard:another-slot" } }],
    [{}, { caller: null }],
  ])
    await assert.rejects(submit([finding()], extra, context), /not authorized/);
  assert.equal(store.list("review_threads").length, 0);
  assert.throws(
    () => bindSpecReviewRound(store, { roundId: round.id, slot: "writer" }),
    /not assigned/,
  );
  const result = await submit([finding()], { planId: plan.id });
  assert.equal(result.round.state, "done");
});

test("each stored hash gets its own round, and a planner answer cannot escape its pass limit", async (t) => {
  const { store, plan, start, advance, bind } = setup(t),
    first = start(),
    submit = await bind(first.round);
  await submit();
  const secondRevision = advance("# A planner fix\n");
  const limited = start({ previousRoundId: first.round.id, maxRounds: 1 });
  assert.equal(limited.limited, true);
  assert.equal(store.list("review_rounds").length, 1);
  const second = start({ previousRoundId: first.round.id, maxRounds: 2 });
  assert.equal(second.round.pass, first.round.pass);
  assert.equal(second.round.round, 2);
  assert.equal(second.round.revisionHash, secondRevision.hash);
  const submitSecond = await bind(second.round, { slot: "reviewer-2" });
  await submitSecond([]);
  const thirdRevision = advance("# An independent manual edit\n");
  const third = start();
  assert.equal(third.round.pass, first.round.pass + 1);
  assert.equal(third.round.round, 1);
  assert.equal(third.round.revisionHash, thirdRevision.hash);
  const rounds = listSpecReviewRounds(store, { planId: plan.id }).items;
  assert.deepEqual(
    rounds.map((row) => row.current),
    [false, false, true],
  );
  assert.equal(
    listReviewThreads(store, { planId: plan.id, revisionHash: plan.hash }).items
      .length,
    1,
  );
});

test("findings sent mid-turn wait for the reviewer's model, then record or skip", async (t) => {
  // Kiro Crew names a chat's model only after its turn ends. Nearby inputs:
  // still working, then idle on another model; idle on the writer's model.
  for (const [model, state] of [
    ["fake-reviewer", "done"],
    ["fake-writer", "skipped"],
  ]) {
    const { store, start, bind } = setup(t),
      { round } = start(),
      submit = await bind(round, { reported: false });
    recordSessionStatus(store, { slot: "reviewer", status: "working" });
    const waiting = await submit();
    assert.equal(waiting.pending, true);
    assert.equal(store.list("review_threads").length, 0);
    settleSpecReviewRounds(store);
    assert.equal(store.get("review_rounds", round.id).state, "running");
    recordSessionStatus(
      store,
      { slot: "reviewer", status: "idle" },
      {
        served: {
          model,
          requested: null,
          changed: false,
          withheld: false,
        },
      },
    );
    settleSpecReviewRounds(store);
    const settled = store.get("review_rounds", round.id);
    assert.equal(settled.state, state, model);
    assert.equal(settled.pendingFindings, undefined);
    assert.equal(store.list("review_threads").length, state === "done" ? 1 : 0);
    if (state === "done") assert.equal(settled.reviewerModel, model);
  }
});

test("a reviewer's summary is stored on its round for that revision, and a bad one is refused", async (t) => {
  const { store, start, bind } = setup(t),
    { round } = start(),
    submit = await bind(round);
  await assert.rejects(
    submit([finding()], { summary: "x".repeat(801) }),
    /summary must be 1–800/,
  );
  assert.equal(store.get("review_rounds", round.id).state, "running");
  const result = await submit([finding()], {
    summary: "  Reads one file. One task.  ",
  });
  assert.equal(result.round.summary, "Reads one file. One task.");
  assert.equal(
    store.get("review_rounds", round.id).summary,
    "Reads one file. One task.",
  );
});
