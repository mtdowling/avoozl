import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { globalAvoozlConfigPath } from "../layered-config.mjs";
import { createSpecPlan, readSpecFolder } from "../spec-plans.mjs";
import { recordPlanReviewWriter } from "../plan-review-authorship.mjs";
import { recordSessionStatus } from "../session-bindings.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.KIRO_HOME = temporaryDirectory("avoozl-review-kiro-");
process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-review-xdg-");
const native = { mcp: true, caller: { sessionKey: "cron:fake-review" } },
  agent = (slot) => ({
    mcp: true,
    caller: { sessionKey: "dashboard:" + slot },
  });

function reviewWorkspace(t, planReviewOptions = {}) {
  const { root, store } = fixture(t),
    globalFile = globalAvoozlConfigPath();
  fs.mkdirSync(path.dirname(globalFile), { recursive: true });
  fs.writeFileSync(
    globalFile,
    JSON.stringify({ version: 1, models: { planReviewer: "fake-reviewer" } }),
  );
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      github: { mode: "local" },
      models: { planner: "fake-writer" },
    }),
  );
  store.mutate("Empty the synthetic execution queue", (data) => {
    data.tasks = [];
    data.edges = [];
  });
  writeSpec(root, "reader", {
    "design.md": "# Design\n\nRead a file.\n",
    "tasks.md": "# Tasks\n",
    "avoozl/manifest.json": '{"version":1,"tasks":{}}\n',
  });
  const plan = createSpecPlan(
      store,
      { id: "reader" },
      readSpecFolder(root, "reader"),
    ),
    ops = new Operations(store, {
      workspaceRoot: root,
      plugins: null,
      planReviewOptions,
    });
  store.put("runs", {
    id: "fake-drafting-run",
    taskId: "plan:reader",
    state: "done",
    actualModel: "fake-writer",
  });
  recordPlanReviewWriter(store, plan, { runId: "fake-drafting-run" });
  return { root, store, plan, ops };
}

test("the real tick queues one review, then rebuilds a superseded answer as current read-only evidence", async (t) => {
  const { root, store, plan, ops } = reviewWorkspace(t);
  const tick = () =>
      ops.execute("workspace.tick", {
        cron: true,
        sessions: store
          .list("session_bindings")
          .map((binding) => ({ target: binding.slot, status: "idle" })),
      }),
    take = (request) =>
      ops.execute(
        "executor.kirocrew.take",
        { id: request.id, version: request.version },
        undefined,
        native,
      ),
    bind = async (request, claim, slot, model) => {
      await ops.execute(
        "session.bind",
        {
          slot,
          taskId: request.task,
          role: request.role,
          attempt: request.attempt,
          executor: request.executor,
          permissionClass: request.permissionClass,
          worktree: request.worktree,
          model: request.model,
          context: request.context,
          requestId: request.id,
          claimToken: claim.claimToken,
        },
        undefined,
        native,
      );
      recordSessionStatus(
        store,
        { slot, status: "idle" },
        {
          served: {
            model,
            requested: request.model,
            changed: false,
            withheld: false,
          },
        },
      );
    };
  assert.equal(
    (await tick()).dispatch.filter((row) => row.role === "plan-review").length,
    0,
  );
  const [review] = (await tick()).dispatch.filter(
    (row) => row.role === "plan-review",
  );
  assert.equal(review.model, "fake-reviewer", "the inherited model is honored");
  assert.equal(review.permissionClass, "read");
  assert.equal(
    (await tick()).dispatch.filter((row) => row.id === review.id).length,
    1,
  );
  const reviewClaim = await take(review);
  assert.equal(reviewClaim.configuration.agent, "avoozl-plan-review");
  await bind(review, reviewClaim, "reviewer", "fake-reviewer");
  const submitted = await ops.execute(
    "plan.review.submit",
    {
      planId: plan.id,
      revisionHash: plan.hash,
      findings: [
        {
          kind: "gap",
          severity: "important",
          file: "design.md",
          line: 3,
          quote: "Read a file.",
          claim: "The missing-file behavior is unspecified.",
          evidence: "The exact design revision only says to read a file.",
        },
      ],
    },
    undefined,
    agent("reviewer"),
  );
  const [writeAnswer] = (await tick()).dispatch.filter(
    (row) => row.role === "plan-answer",
  );
  assert.equal(writeAnswer.permissionClass, "write");
  await tick(); // The generic transport may cache the first native configuration.
  fs.writeFileSync(
    path.join(root, ".kiro/specs/reader/design.md"),
    "# Design\n\nA person revised this draft.\n",
  );
  const changed = await ops.execute("plan.save", {
    id: plan.id,
    expectedHash: plan.hash,
  });
  assert.equal(
    await take(writeAnswer),
    null,
    "the old queued hash is canceled",
  );
  const [readAnswer] = (await tick()).dispatch.filter(
    (row) => row.role === "plan-answer",
  );
  assert.equal(readAnswer.id, writeAnswer.id);
  assert.notEqual(readAnswer.version, writeAnswer.version);
  assert.equal(readAnswer.permissionClass, "read");
  assert.equal(readAnswer.context.revisionHash, changed.hash);
  assert.equal(readAnswer.context.reviewRevisionHash, plan.hash);
  assert.match(readAnswer.brief, /Do not change any file/);
  assert.equal(
    (await tick()).dispatch.filter((row) => row.id === readAnswer.id).length,
    1,
  );
  const answerClaim = await take(readAnswer);
  assert.equal(answerClaim.configuration.agent, "avoozl-plan-answer-read");
  await bind(readAnswer, answerClaim, "answerer", "fake-writer");
  await assert.rejects(
    ops.execute(
      "plan.save",
      { id: plan.id, expectedHash: changed.hash },
      undefined,
      agent("answerer"),
    ),
    /still-draft/,
  );
  await ops.execute(
    "plan.review.answer",
    {
      planId: plan.id,
      roundId: review.task,
      answers: [
        {
          id: submitted.threads[0].id,
          action: "answered",
          text: "This older finding is preserved for the person after their edit.",
        },
      ],
    },
    undefined,
    agent("answerer"),
  );
  await tick();
  const findings = store.list("review_threads");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].revisionHash, plan.hash);
  assert.equal(findings[0].answer.action, "answered");
  assert.equal(findings[0].state, "open");
  assert.ok(
    store
      .list("review_rounds")
      .some((round) => round.pass === 2 && round.revisionHash === changed.hash),
  );
  assert.equal(store.list("approvals").length, 0);
});

test("overlapping real ticks leave the first review view and single queued start intact", async (t) => {
  let release,
    entered,
    prepared = 0,
    removed = 0;
  const ready = new Promise((resolve) => {
      entered = resolve;
    }),
    paused = new Promise((resolve) => {
      release = resolve;
    }),
    { root, store, ops } = reviewWorkspace(t, {
      prepare: async (_store, plan, round) => {
        prepared++;
        const ownedRoot = path.join(root, "fake-owned-review"),
          snapshot = path.join(ownedRoot, "snapshot");
        fs.mkdirSync(snapshot, { recursive: true });
        fs.writeFileSync(path.join(snapshot, "revision.txt"), plan.hash);
        entered();
        await paused;
        return {
          ownedRoot,
          snapshot,
          planningRoot: root,
          specFolder: snapshot,
          views: [],
          commits: {},
        };
      },
      remove: async (store, resources) => {
        removed++;
        fs.rmSync(resources.ownedRoot, { recursive: true, force: true });
      },
    }),
    tick = () => ops.execute("workspace.tick", { cron: true, sessions: [] });
  t.after(() => release());
  await tick();
  const first = tick();
  await ready;
  const second = await tick();
  assert.equal(second.skipped, "locked");
  assert.equal(prepared, 1);
  assert.equal(removed, 0);
  assert.equal(
    fs.existsSync(path.join(root, "fake-owned-review/snapshot/revision.txt")),
    true,
  );
  release();
  const result = await first;
  assert.equal(
    result.dispatch.filter((row) => row.role === "plan-review").length,
    1,
  );
  assert.equal(
    (await tick()).dispatch.filter((row) => row.role === "plan-review").length,
    1,
  );
  assert.equal(prepared, 1);
  assert.equal(removed, 0);
  assert.equal(store.list("review_rounds").length, 1);
  assert.equal(store.list("review_rounds")[0].state, "running");
  assert.equal(
    store.list("receipts").filter((row) => row.kind === "plan-review-job")
      .length,
    1,
  );
  assert.equal(
    store
      .list("session_requests")
      .filter((row) => row.request?.role === "plan-review").length,
    1,
  );
  assert.equal(
    fs.existsSync(path.join(root, "fake-owned-review/snapshot/revision.txt")),
    true,
  );
});
