import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { createSpecPlan, specHash } from "../spec-plans.mjs";
import { recordSessionStatus } from "../session-bindings.mjs";
import {
  recordPlanReviewWriter,
  planReviewWriter,
} from "../plan-review-authorship.mjs";
import {
  answerReceiptId,
  assertPlanAnswerWrite,
} from "../plan-review-answers.mjs";
import {
  planReviewStep,
  planReviewNeedsYou,
  decidePlanReview,
} from "../plan-review-step.mjs";
import {
  preparePlanReviewWorktrees,
  removePlanReviewWorktrees,
} from "../plan-review-worktrees.mjs";
import { bindContentRules } from "../content-rules.mjs";
import { planReviewSummary } from "../plan-review-summary.mjs";
import { listSpecReviewRounds } from "../plan-reviews.mjs";
import { recordFindingDecision } from "../review-findings.mjs";
import { finishProcessSession } from "../executors/process.mjs";
import { parseHarnessDefinition } from "../harness-definitions.mjs";
import { sessionServedModel } from "../process-view.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const as = (slot) => ({
  caller: { sessionKey: "dashboard:" + slot },
  mcp: true,
});
const finding = (extra = {}) => ({
  kind: "wrong-reference",
  severity: "important",
  file: "design.md",
  line: 3,
  quote: "Use src/missing.mjs.",
  statement: "The named helper is absent.",
  evidence: "Searched src/ for missing.mjs; no matching file was found.",
  ...extra,
});

function setup(t, { writer = true, rounds = 1, mode = "auto" } = {}) {
  const { root, store } = fixture(t),
    files = {
      "requirements.md": "# Requirements\n\nThe app reads a file.\n",
      "design.md": "# Design\n\nUse src/missing.mjs.\n",
      "tasks.md": "# Tasks\n\n- [ ] 1.1 Read the file\n  - $repo: app\n",
    };
  let folder = {
    name: "reader",
    exists: true,
    root,
    files,
    hash: specHash(files),
  };
  const plan = createSpecPlan(store, { id: "reader" }, folder),
    ops = new Operations(store);
  ops.readSpec = () => folder;
  const observe = (slot, model) =>
    recordSessionStatus(
      store,
      { slot, status: "idle" },
      {
        served: {
          model,
          requested: "fake-requested",
          changed: false,
          withheld: false,
        },
      },
    );
  store.put("session_bindings", {
    id: "writer",
    slot: "writer",
    role: "planner",
    taskId: "draft",
    model: "fake-requested",
  });
  observe("writer", "fake-writer");
  recordPlanReviewWriter(store, plan, writer ? as("writer") : {});
  const counts = { prepared: 0, removed: 0 },
    config = {
      roles: {
        planReviewer: { model: "fake-reviewer" },
        planner: { model: "fake-writer" },
      },
      planReview: { mode, rounds },
    };
  const options = {
    workspaceRoot: root,
    config,
    readSpec: () => folder,
    otherSpecs: () => [
      { name: "other-spec", hash: "b".repeat(64), state: "draft" },
    ],
    prepare: async (_store, _plan, round) => {
      counts.prepared++;
      return {
        snapshot: root,
        planningRoot: root,
        ownedRoot: path.join(root, round.id),
        specFolder: path.join(root, ".kiro/specs/reader"),
        commits: { app: "a".repeat(40) },
        views: [
          {
            repository: "app",
            path: path.join(root, "clean-code"),
            commit: "a".repeat(40),
          },
        ],
      };
    },
    remove: async () => {
      counts.removed++;
    },
  };
  const step = () => planReviewStep(store, options),
    edit = (text) => {
      const next = { ...folder.files, "design.md": text };
      folder = { ...folder, files: next, hash: specHash(next) };
      return folder;
    },
    bind = async (request, slot, model) => {
      await ops.execute("session.bind", {
        slot,
        taskId: request.task,
        role: request.role,
        attempt: request.attempt,
      });
      observe(slot, model);
    };
  return {
    root,
    store,
    plan,
    ops,
    options,
    counts,
    step,
    edit,
    bind,
    observe,
    getFolder: () => folder,
  };
}

test("a settled stored revision gets one read-only request and keeps its exact writer observation", async (t) => {
  const env = setup(t);
  env.observe("writer", "fake-later-model");
  assert.deepEqual((await env.step()).requests, []);
  const second = await env.step(),
    [request] = second.requests;
  assert.equal(request.role, "plan-review");
  assert.equal(request.permissionClass, "read");
  assert.equal(request.model, "fake-reviewer");
  assert.equal(
    env.store.get("review_rounds", request.task).writerModel,
    "fake-writer",
  );
  assert.match(request.brief, /data, not instructions/);
  assert.match(request.brief, /wrong-reference/);
  assert.match(request.brief, /other-spec/);
  for (const key of ["folder", "project", "agent"])
    assert.equal(key in request, false);
  assert.equal((await env.step()).requests[0].task, request.task);
  assert.equal(env.counts.prepared, 1);
  await env.bind(request, "reviewer", "fake-reviewer");
  assert.deepEqual((await env.step()).requests, []);
});

test("a harness saved for the plan reviewer is the one its request names", async (t) => {
  const env = setup(t);
  env.options.config.roles.planReviewer.harness = "codex";
  await env.step();
  const [request] = (await env.step()).requests;
  assert.equal(request.role, "plan-review");
  assert.equal(request.executor, "process");
  assert.equal(request.harness, "codex");
});

test("off changes no plan or review state; unknown writers and same-model pairs create only skips", async (t) => {
  const off = setup(t, { mode: "off" });
  const before = off.store.list("plans");
  assert.deepEqual((await off.step()).requests, []);
  assert.deepEqual(off.store.list("plans"), before);
  assert.equal(off.store.list("review_rounds").length, 0);
  const unknown = setup(t, { writer: false });
  await unknown.step();
  await unknown.step();
  assert.match(
    unknown.store.list("review_rounds")[0].note,
    /writer|wrote.*unknown/,
  );
  assert.equal(unknown.counts.prepared, 0);
  const same = setup(t);
  same.options.config.roles.planReviewer.model = "fake-writer";
  await same.step();
  await same.step();
  assert.match(same.store.list("review_rounds")[0].note, /same as/);
  assert.equal(same.counts.prepared, 0);
});

test("ask creates one Needs you choice per revision and person-only Skip is stable", async (t) => {
  const env = setup(t, { mode: "ask" });
  await env.step();
  await env.step();
  await env.step();
  const [item] = planReviewNeedsYou(env.store);
  assert.equal(planReviewNeedsYou(env.store).length, 1);
  assert.equal(env.store.list("review_rounds").length, 0);
  assert.throws(
    () =>
      decidePlanReview(
        env.store,
        { ...item.planReview, action: "review" },
        as("writer"),
      ),
    /Only a person/,
  );
  decidePlanReview(env.store, { ...item.planReview, action: "skip" });
  for (let i = 0; i < 3; i++)
    assert.equal((await env.step()).requests.length, 0);
  assert.equal(env.store.list("review_rounds").length, 1);
  assert.match(
    env.store.list("review_rounds")[0].note,
    /Skipped by the person/,
  );
  assert.equal(planReviewNeedsYou(env.store).length, 0);
});

test("ask Review queues the same proven, read-only request", async (t) => {
  const env = setup(t, { mode: "ask" });
  await env.step();
  await env.step();
  const choice = planReviewNeedsYou(env.store)[0].planReview;
  decidePlanReview(env.store, { ...choice, action: "review" });
  assert.equal((await env.step()).requests[0].permissionClass, "read");
});

test("planner answers are revision-bound, preserve open findings, and stop at the round limit", async (t) => {
  const env = setup(t, { rounds: 2 });
  await env.step();
  const [review] = (await env.step()).requests;
  await env.bind(review, "reviewer", "fake-reviewer");
  const submitted = await env.ops.execute(
    "plan.review.submit",
    {
      planId: env.plan.id,
      revisionHash: env.plan.hash,
      findings: [
        finding(),
        finding({
          kind: "hidden-order",
          statement: "An ordering edge is missing.",
        }),
      ],
    },
    undefined,
    as("reviewer"),
  );
  const [answer] = (await env.step()).requests;
  assert.equal(answer.role, "plan-answer");
  assert.equal(answer.permissionClass, "write");
  assert.equal(env.counts.removed, 1);
  await env.bind(answer, "answerer", "fake-writer");
  assert.throws(
    () =>
      assertPlanAnswerWrite(env.store, { id: "another-spec" }, as("answerer")),
    /only its own/,
  );
  env.edit("# Design\n\nUse a real file.\n");
  const saved = await env.ops.execute(
    "plan.save",
    { id: env.plan.id, expectedHash: env.plan.hash },
    undefined,
    as("answerer"),
  );
  const result = await env.ops.execute(
    "plan.review.answer",
    {
      planId: env.plan.id,
      roundId: review.task,
      answers: [
        {
          id: submitted.threads[0].id,
          action: "fixed",
          revisionHash: saved.hash,
        },
        {
          id: submitted.threads[1].id,
          action: "answered",
          text: "The order is already covered by the existing edge.",
        },
      ],
    },
    undefined,
    as("answerer"),
  );
  assert.equal(result.complete, true);
  assert.ok(result.findings.every((thread) => thread.state === "open"));
  assert.equal(
    env.store.get("receipts", answerReceiptId(review.task)).resultHash,
    saved.hash,
  );
  await env.step();
  const [second] = (await env.step()).requests;
  assert.equal(second.role, "plan-review");
  assert.equal(second.attempt, 2);
  assert.match(second.brief, /earlierFindingsAndAnswers/);
  await env.bind(second, "reviewer2", "fake-reviewer");
  const again = await env.ops.execute(
    "plan.review.submit",
    {
      planId: env.plan.id,
      revisionHash: saved.hash,
      findings: [finding({ quote: "Use a real file." })],
    },
    undefined,
    as("reviewer2"),
  );
  const [answer2] = (await env.step()).requests;
  await env.bind(answer2, "answerer2", "fake-writer");
  env.edit("# Design\n\nFinal answer revision.\n");
  const final = await env.ops.execute(
    "plan.save",
    { id: env.plan.id, expectedHash: saved.hash },
    undefined,
    as("answerer2"),
  );
  await env.ops.execute(
    "plan.review.answer",
    {
      planId: env.plan.id,
      roundId: second.task,
      answers: [
        { id: again.threads[0].id, action: "fixed", revisionHash: final.hash },
      ],
    },
    undefined,
    as("answerer2"),
  );
  await env.step();
  assert.equal((await env.step()).requests.length, 0);
  assert.equal(env.store.list("review_rounds").length, 2);
  assert.equal(env.store.list("approvals").length, 0);
});

test("an answer revision cannot restart the pass by labeling its findings answered", async (t) => {
  const env = setup(t, { rounds: 1 });
  await env.step();
  const [review] = (await env.step()).requests;
  await env.bind(review, "reviewer", "fake-reviewer");
  const submitted = await env.ops.execute(
    "plan.review.submit",
    { planId: env.plan.id, revisionHash: env.plan.hash, findings: [finding()] },
    undefined,
    as("reviewer"),
  );
  const [answer] = (await env.step()).requests;
  await env.bind(answer, "answerer", "fake-writer");
  env.edit("# Design\n\nA revised answer.\n");
  const saved = await env.ops.execute(
    "plan.save",
    { id: env.plan.id, expectedHash: env.plan.hash },
    undefined,
    as("answerer"),
  );
  await env.ops.execute(
    "plan.review.answer",
    {
      planId: env.plan.id,
      roundId: review.task,
      answers: [
        {
          id: submitted.threads[0].id,
          action: "answered",
          text: "The design now explains the existing contract.",
        },
      ],
    },
    undefined,
    as("answerer"),
  );
  assert.equal(
    env.store.get("receipts", answerReceiptId(review.task)).resultHash,
    saved.hash,
  );
  await env.step();
  assert.equal((await env.step()).requests.length, 0);
  assert.equal(env.store.list("review_rounds").length, 1);
});

test("a manual reload waits for a stable folder and cannot inherit an active planner's model", async (t) => {
  const env = setup(t);
  env.edit("# First write\n");
  await env.step();
  env.edit("# Still writing\n");
  await env.step();
  assert.equal(env.store.get("plans", env.plan.id).hash, env.plan.hash);
  const settled = await env.step();
  assert.equal(settled.requests.length, 0);
  assert.notEqual(env.store.get("plans", env.plan.id).hash, env.plan.hash);
  assert.match(env.store.list("review_rounds")[0].note, /unknown/);
});

for (const state of ["pending", "claimed"])
  test(`a superseded ${state} review preserves an opening chat and cleans only unclaimed views`, async (t) => {
    const env = setup(t);
    await env.step();
    const [request] = (await env.step()).requests;
    env.store.put("session_requests", {
      id: "fake-review-start",
      kind: "start",
      state,
      request,
    });
    env.edit("# Design\n\nA person changed the plan before binding.\n");
    await env.step();
    await env.step();
    const round = env.store.get("review_rounds", request.task);
    assert.equal(round.state, state === "claimed" ? "running" : "skipped");
    assert.equal(env.counts.removed, state === "claimed" ? 0 : 1);
    if (state === "pending") assert.match(round.note, /draft changed/);
  });

for (const state of ["pending", "claimed"])
  test(`approval handles a ${state} review without replacing an opening chat`, async (t) => {
    const env = setup(t);
    await env.step();
    const [request] = (await env.step()).requests;
    env.store.put("session_requests", {
      id: "fake-review-start",
      kind: "start",
      state,
      request,
    });
    env.store.put("plans", { ...env.plan, state: "approved" });
    await env.step();
    assert.equal(
      env.store.get("review_rounds", request.task).state,
      state === "claimed" ? "running" : "skipped",
    );
    assert.equal(env.counts.removed, state === "claimed" ? 0 : 1);
  });

test("a first-turn save waits for the recorded writer's reported model", async (t) => {
  const env = setup(t);
  recordSessionStatus(env.store, { slot: "writer", status: "working" });
  env.edit("# Draft\n\nA first-turn write.\n");
  const saved = await env.ops.execute(
    "plan.save",
    { id: env.plan.id, expectedHash: env.plan.hash },
    undefined,
    as("writer"),
  );
  assert.equal(
    planReviewWriter(env.store, saved.id, saved.hash).actualModel,
    null,
  );
  // Two steps: the folder settles, then the writer is still in its turn.
  assert.deepEqual((await env.step()).requests, []);
  assert.deepEqual((await env.step()).requests, []);
  // No unknown-writer skip is recorded while the writer is mid-turn.
  assert.equal(
    listSpecReviewRounds(env.store, { planId: env.plan.id }).items.length,
    0,
  );
  env.observe("writer", "fake-writer");
  const [request] = (await env.step()).requests;
  assert.equal(request.role, "plan-review");
  assert.equal(
    env.store.get("review_rounds", request.task).writerModel,
    "fake-writer",
  );
});

test("approval during review turns the queued planner answer into reasons only", async (t) => {
  const env = setup(t);
  await env.step();
  const [review] = (await env.step()).requests;
  await env.bind(review, "reviewer", "fake-reviewer");
  const submitted = await env.ops.execute(
    "plan.review.submit",
    { planId: env.plan.id, revisionHash: env.plan.hash, findings: [finding()] },
    undefined,
    as("reviewer"),
  );
  assert.equal((await env.step()).requests[0].permissionClass, "write");
  env.store.put("plans", {
    ...env.store.get("plans", env.plan.id),
    state: "approved",
  });
  const [answer] = (await env.step()).requests;
  assert.equal(answer.permissionClass, "read");
  assert.match(answer.brief, /approved or superseded/);
  await env.bind(answer, "late-answer", "fake-writer");
  assert.throws(
    () =>
      assertPlanAnswerWrite(env.store, { id: env.plan.id }, as("late-answer")),
    /still-draft/,
  );
  await env.ops.execute(
    "plan.review.answer",
    {
      planId: env.plan.id,
      roundId: review.task,
      answers: [
        {
          id: submitted.threads[0].id,
          action: "answered",
          text: "The person already approved this revision; follow up separately.",
        },
      ],
    },
    undefined,
    as("late-answer"),
  );
  assert.equal(env.store.get("plans", env.plan.id).state, "approved");
});

test("a manual edit makes an unbound answer read-only before and after folder settling", async (t) => {
  const env = setup(t);
  await env.step();
  const [review] = (await env.step()).requests;
  await env.bind(review, "reviewer", "fake-reviewer");
  await env.ops.execute(
    "plan.review.submit",
    { planId: env.plan.id, revisionHash: env.plan.hash, findings: [finding()] },
    undefined,
    as("reviewer"),
  );
  assert.equal((await env.step()).requests[0].permissionClass, "write");
  const changed = env.edit("# Design\n\nA person changed this draft.\n");
  const [settling] = (await env.step()).requests;
  assert.equal(settling.permissionClass, "read");
  assert.match(settling.brief, /Do not change any file/);
  const [answer] = (await env.step()).requests;
  assert.equal(answer.permissionClass, "read");
  assert.equal(answer.context.revisionHash, changed.hash);
  assert.equal(answer.context.reviewRevisionHash, review.context.revisionHash);
  assert.equal(env.store.list("review_threads").length, 1);
  const [next] = env.store
    .list("review_rounds")
    .filter((round) => round.revisionHash === changed.hash);
  assert.equal(next.pass, 2);
  assert.equal(next.state, "skipped");
  assert.match(next.note, /writer.*unknown|wrote.*unknown/);
});

test("brief content rules block dispatch and leave one stable skipped round", async (t) => {
  const env = setup(t),
    terms = path.join(env.root, ".avoozl/local/content-rules");
  fs.mkdirSync(terms, { recursive: true });
  fs.writeFileSync(path.join(terms, "fake-private.txt"), "missing.mjs\n");
  fs.writeFileSync(
    path.join(env.root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      contentRules: { sets: [{ id: "fake-private", boundaries: ["brief"] }] },
    }),
  );
  bindContentRules(env.store, {
    workspaceRoot: env.root,
    configFile: path.join(env.root, "config.json"),
  });
  await env.step();
  assert.equal((await env.step()).requests.length, 0);
  assert.equal((await env.step()).requests.length, 0);
  assert.equal(env.store.list("review_rounds").length, 1);
  assert.match(env.store.list("review_rounds")[0].note, /Content rules/);
  assert.equal(env.counts.removed, 1);
});

test("real scratch code views are detached, clean, recorded at the default head, then removed", async (t) => {
  const env = setup(t),
    root = temporaryDirectory("avoozl-review-code-"),
    remote = path.join(root, "remote.git"),
    code = path.join(root, "code"),
    git = (cwd, ...args) =>
      execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
  fs.mkdirSync(code);
  git(root, "init", "--bare", "--initial-branch=main", remote);
  git(code, "init", "--initial-branch=main");
  git(code, "config", "user.name", "Test");
  git(code, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(code, "index.mjs"), "export const value = 1;\n");
  git(code, "add", ".");
  git(code, "commit", "-m", "Start");
  git(code, "remote", "add", "origin", remote);
  git(code, "push", "origin", "main");
  env.store.put("repositories", {
    id: "app",
    root: code,
    worktreeRoot: path.join(root, "views"),
  });
  env.options.prepare = preparePlanReviewWorktrees;
  env.options.remove = removePlanReviewWorktrees;
  await env.step();
  const [request] = (await env.step()).requests;
  const round = env.store.get("review_rounds", request.task),
    job = env.store
      .list("receipts")
      .find(
        (row) => row.roundId === round.id && row.kind === "plan-review-job",
      ),
    [view] = job.resources.views;
  assert.equal(round.commits.app, git(code, "rev-parse", "HEAD"));
  assert.equal(git(view.path, "rev-parse", "HEAD"), round.commits.app);
  assert.equal(git(view.path, "status", "--porcelain"), "");
  assert.throws(() => git(view.path, "symbolic-ref", "HEAD"));
  assert.equal(
    fs.readFileSync(
      path.join(request.worktree, ".kiro/specs/reader/design.md"),
      "utf8",
    ),
    env.plan.files["design.md"],
  );
  await env.bind(request, "reviewer", "fake-reviewer");
  await env.ops.execute(
    "plan.review.submit",
    { planId: env.plan.id, revisionHash: env.plan.hash, findings: [] },
    undefined,
    as("reviewer"),
  );
  await env.step();
  assert.equal(fs.existsSync(view.path), false);
  assert.equal(fs.existsSync(job.resources.ownedRoot), false);
});

test("a partial snapshot-copy failure removes its owned directory before returning", async (t) => {
  const env = setup(t),
    round = { id: "plan-review-partial" },
    ownedRoot = path.join(env.root, ".avoozl/local/plan-reviews", round.id);
  fs.mkdirSync(
    path.join(ownedRoot, "spec/.kiro/specs/reader/requirements.md"),
    { recursive: true },
  );
  await assert.rejects(
    preparePlanReviewWorktrees(env.store, env.plan, round, {
      workspaceRoot: env.root,
      planningRoot: env.root,
    }),
  );
  assert.equal(fs.existsSync(ownedRoot), false);
});

test("an ask-mode unknown-writer skip can be upgraded by a person without reopening a live round", async (t) => {
  const env = setup(t, { writer: false, mode: "ask" });
  await env.step();
  await env.step();
  const choice = {
    planId: env.plan.id,
    revisionHash: env.plan.hash,
    action: "review",
  };
  decidePlanReview(env.store, choice);
  await env.step();
  assert.equal(env.store.list("review_rounds").at(-1).state, "skipped");
  for (const state of ["review", "auto", "skip"]) {
    const receipt = env.store
      .list("receipts")
      .find((row) => row.kind === "plan-review-choice");
    env.store.put("receipts", { ...receipt, state, unproven: false });
    decidePlanReview(env.store, { ...choice, unproven: true });
  }
  const [request] = (await env.step()).requests;
  assert.equal(request.role, "plan-review");
  assert.equal(env.store.get("review_rounds", request.task).unproven, true);
  const receipt = env.store
    .list("receipts")
    .find((row) => row.kind === "plan-review-choice");
  env.store.put("receipts", { ...receipt, unproven: false });
  assert.throws(
    () => decidePlanReview(env.store, { ...choice, unproven: true }),
    /already has/,
  );
  assert.equal(env.store.get("review_rounds", request.task).state, "running");
});

test("a folder reload credits the one New spec planner that ran since the last revision", async (t) => {
  // Nearby inputs: the planner idle since before the revision (not credited),
  // then the same planner after a new turn (credited, so a round opens).
  const env = setup(t);
  env.store.put("session_bindings", {
    id: "np",
    slot: "np",
    role: "planner",
    taskId: "new-plan:reader",
    status: "idle",
    statusAt: "2000-01-01T00:00:00.000Z",
  });
  env.edit("# Design\n\nA person edit.\n");
  await env.step();
  await env.step();
  const first = env.store.get("plans", env.plan.id);
  assert.notEqual(first.hash, env.plan.hash);
  assert.equal(planReviewWriter(env.store, first.id, first.hash).slot, null);
  recordSessionStatus(env.store, { slot: "np", status: "working" });
  env.edit("# Design\n\nThe planner's fix.\n");
  await env.step();
  env.observe("np", "fake-writer");
  await env.step();
  const second = env.store.get("plans", env.plan.id);
  assert.notEqual(second.hash, first.hash);
  const writer = planReviewWriter(env.store, second.id, second.hash);
  assert.equal(writer.slot, "np");
});

test("a person's Accept starts one planner turn outside the rounds cap; Review anyway adds one round that drops a rejected repeat", async (t) => {
  const env = setup(t, { rounds: 1 });
  await env.step();
  const [review] = (await env.step()).requests;
  assert.match(review.brief, /blocker/);
  assert.match(review.brief, /exact text the finding is about/);
  await env.bind(review, "reviewer", "fake-reviewer");
  const submitted = await env.ops.execute(
    "plan.review.submit",
    {
      planId: env.plan.id,
      revisionHash: env.plan.hash,
      findings: [
        finding({ severity: "blocker", line: undefined }),
        finding({
          kind: "hidden-order",
          severity: "warn",
          statement: "An ordering edge is missing.",
        }),
      ],
    },
    undefined,
    as("reviewer"),
  );
  const [accepted, rejected] = submitted.threads;
  assert.deepEqual(
    [accepted.severity, accepted.line, accepted.anchor.lineStart],
    ["blocker", 3, 3],
  );
  const [answer] = (await env.step()).requests;
  await env.bind(answer, "answerer", "fake-writer");
  await env.ops.execute(
    "plan.review.answer",
    {
      planId: env.plan.id,
      roundId: review.task,
      answers: [accepted, rejected].map((thread) => ({
        id: thread.id,
        action: "answered",
        text: "The helper is created by the first task.",
      })),
    },
    undefined,
    as("answerer"),
  );
  assert.deepEqual((await env.step()).requests, []);

  recordFindingDecision(env.store, {
    id: accepted.id,
    action: "accept",
    revisionHash: env.plan.hash,
    by: "Owner",
  });
  recordFindingDecision(env.store, {
    id: rejected.id,
    action: "reject",
    revisionHash: env.plan.hash,
    note: "The manifest already orders these.",
    by: "Owner",
  });
  const [turn] = (await env.step()).requests;
  assert.equal(turn.role, "plan-answer");
  assert.equal(turn.permissionClass, "write");
  assert.equal(turn.attempt, 2);
  // Kiro Crew names a chat by its title; a reused title reopens the first
  // answer chat, whose binding refuses attempt 2.
  assert.notEqual(turn.title, answer.title);
  assert.match(turn.brief, /personAccepted/);
  assert.match(turn.brief, /The manifest already orders these\./);
  assert.equal((await env.step()).requests.length, 1, "one turn per plan");
  assert.equal(env.store.list("review_rounds").length, 1);

  await env.bind(turn, "answerer2", "fake-writer");
  env.edit(
    "# Design\n\nUse src/missing.mjs.\n\nsrc/missing.mjs is added by task 1.1.\n",
  );
  const saved = await env.ops.execute(
    "plan.save",
    { id: env.plan.id, expectedHash: env.plan.hash },
    undefined,
    as("answerer2"),
  );
  const done = await env.ops.execute(
    "plan.review.answer",
    {
      planId: env.plan.id,
      roundId: review.task,
      answers: [
        {
          id: accepted.id,
          action: "fixed",
          revisionHash: saved.hash,
          text: "",
        },
      ],
    },
    undefined,
    as("answerer2"),
  );
  assert.equal(done.complete, true);
  const fixed = env.store.get("review_threads", accepted.id);
  assert.equal(fixed.answer.action, "fixed");
  assert.equal(fixed.answers[0].action, "answered", "the old answer is kept");

  // The cap holds: no reviewer round for the fix revision until Review anyway.
  await env.step();
  assert.deepEqual((await env.step()).requests, []);
  assert.equal(env.store.list("review_rounds").length, 1);
  // The Approve dialogs offer the button, and its call is the UI's own.
  assert.equal(planReviewSummary(env.store, env.plan.id).canReviewAnyway, true);
  decidePlanReview(env.store, {
    planId: env.plan.id,
    revisionHash: saved.hash,
    action: "review",
    unproven: true,
  });
  const [extra] = (await env.step()).requests;
  assert.equal(extra.role, "plan-review");
  assert.equal(extra.attempt, 2);
  assert.match(extra.brief, /personRejected/);
  await env.bind(extra, "reviewer2", "fake-reviewer");
  const again = await env.ops.execute(
    "plan.review.submit",
    {
      planId: env.plan.id,
      revisionHash: saved.hash,
      findings: [
        finding({ kind: "hidden-order", severity: "warn" }),
        finding({
          kind: "gap",
          severity: "info",
          quote: "src/missing.mjs is added by task 1.1.",
        }),
      ],
    },
    undefined,
    as("reviewer2"),
  );
  assert.deepEqual(
    again.threads.map((thread) => [thread.kind, thread.anchor.lineStart]),
    [["gap", 5]],
  );
  assert.match(again.round.note, /Dropped 1 finding/);
  assert.equal(env.store.list("approvals").length, 0);
});

// nk-3.1 (NK3.3, NK5.1, NK5.2): plan review as a `process` child. Its
// findings come from its output file, are recorded as this session through
// plans_submit_review's own checks, and count only with a served model the
// harness output names.
async function childReview(t, served, findings = [finding()]) {
  const env = setup(t);
  await env.step();
  const [request] = (await env.step()).requests;
  const slot = "process-review-" + Math.random().toString(36).slice(2);
  await env.ops.execute("session.bind", {
    slot,
    taskId: request.task,
    role: request.role,
    attempt: request.attempt,
    context: request.context,
  });
  const folder = temporaryDirectory("avoozl-review-child-");
  fs.mkdirSync(path.join(folder, ".avoozl", "output"), { recursive: true });
  fs.writeFileSync(
    path.join(folder, ".avoozl", "output", "review.json"),
    JSON.stringify({ findings, summary: "The plan reads a file." }),
  );
  const binding = env.store.get("session_bindings", slot),
    result = {
      state: "done",
      text: "",
      output: "review.json",
      worktree: folder,
      ...(served ? { served } : {}),
    };
  const run = () => finishProcessSession(env.ops, binding, result, env.store);
  return {
    env,
    request,
    run,
    round: () => env.store.get("review_rounds", request.task),
  };
}

test("a child's review with a served model records the round as a chat's does", async (t) => {
  const { run, round, env } = await childReview(t, "fake-reviewer");
  await run();
  assert.equal(round().state, "done");
  assert.equal(round().reviewerModel, "fake-reviewer");
  const threads = env.store
    .list("review_threads")
    .filter((thread) => thread.roundId === round().id);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].statement, "The named helper is absent.");
});

test("with no served model the round is skipped with today's reason", async (t) => {
  const { run, round } = await childReview(t, null);
  await assert.rejects(run(), /no proven reported model/);
  assert.equal(round().state, "skipped");
  assert.match(
    round().note ?? round().reason ?? JSON.stringify(round()),
    /no proven reported model/,
  );
});

test("a child review by the model that wrote the plan is refused", async (t) => {
  const { run, round } = await childReview(t, "fake-writer");
  await assert.rejects(run(), /model that wrote this revision/);
  assert.equal(round().state, "skipped");
});

test("findings over the tool's limit are refused", async (t) => {
  const many = Array.from({ length: 51 }, () => finding());
  const { run, round } = await childReview(t, "fake-reviewer", many);
  await assert.rejects(run(), /at most 50/);
  assert.equal(round().state, "running");
});

test("servedModel reads a model name, or one model key, from the harness output", (t) => {
  const definition = parseHarnessDefinition({
    name: "x",
    start: ["x"],
    resume: ["x"],
    promptFrom: "stdin",
    permission: { write: "w", read: "r" },
    servedModel: { from: "output", field: "modelUsage" },
  });
  const log = path.join(temporaryDirectory("avoozl-served-"), "log");
  const read = (lines) => {
    fs.writeFileSync(log, lines.join("\n") + "\n");
    return sessionServedModel({ log_file: log }, definition);
  };
  assert.equal(
    read(['{"modelUsage": {"model-a": {"inputTokens": 1}}}']),
    "model-a",
  );
  assert.equal(read(['{"modelUsage": {"model-a": {}, "model-b": {}}}']), null);
  assert.equal(read(["no json here"]), null);
  assert.equal(sessionServedModel({ log_file: log }, { name: "y" }), null);
  assert.throws(
    () =>
      parseHarnessDefinition({
        name: "x",
        start: ["x"],
        resume: ["x"],
        promptFrom: "stdin",
        permission: { write: "w", read: "r" },
        servedModel: { from: "file", path: "/x" },
      }),
    /servedModel must be/,
  );
});
// nk-3.2 (NK5.1, NK5.3): the plan answer as a `process` child. It edits only
// its spec folder; on exit Avoozl stores the revision as this session's and
// records each answer from its report.
async function childAnswer(t) {
  const env = setup(t);
  env.options.config.roles.planAnswer = { harness: "fake-cli" };
  await env.step();
  const [review] = (await env.step()).requests;
  await env.bind(review, "reviewer", "fake-reviewer");
  const submitted = await env.ops.execute(
    "plan.review.submit",
    {
      planId: env.plan.id,
      revisionHash: env.plan.hash,
      findings: [finding()],
    },
    undefined,
    as("reviewer"),
  );
  const [answer] = (await env.step()).requests;
  assert.equal(answer.role, "plan-answer");
  assert.equal(answer.executor, "process");
  assert.equal(answer.permissionClass, "write");
  // Its folder, and so its one write root, is the spec folder alone.
  assert.equal(
    answer.worktree,
    path.join(env.root, ".kiro", "specs", "reader"),
  );
  const slot = "process-answer-" + Math.random().toString(36).slice(2);
  await env.ops.execute("session.bind", {
    slot,
    taskId: answer.task,
    role: answer.role,
    attempt: answer.attempt,
    permissionClass: answer.permissionClass,
    worktree: answer.worktree,
  });
  const binding = env.store.get("session_bindings", slot);
  const finish = (answers) =>
    finishProcessSession(
      env.ops,
      binding,
      { state: "done", text: "", report: { answers } },
      env.store,
    );
  return { env, review, answer, thread: submitted.threads[0], finish, binding };
}

test("a child's fixed answer is recorded against the revision it wrote", async (t) => {
  const { env, thread, finish } = await childAnswer(t);
  const before = env.store.get("plans", env.plan.id).hash;
  env.edit("# Design\n\nUse a real file.\n");
  await finish([
    { id: thread.id, action: "fixed", text: "Named a real file." },
  ]);
  const plan = env.store.get("plans", env.plan.id),
    answered = env.store.get("review_threads", thread.id).answer;
  assert.notEqual(plan.hash, before);
  assert.equal(answered.action, "fixed");
  assert.equal(answered.revisionHash, plan.hash);
});

test("a child that changed nothing may answer with reasons only", async (t) => {
  const { env, thread, finish } = await childAnswer(t);
  await assert.rejects(
    finish([{ id: thread.id, action: "fixed", text: "Fixed it." }]),
    /stored revision this planner wrote/,
  );
  await finish([
    {
      id: thread.id,
      action: "answered",
      text: "The file is created by task 1.1.",
    },
  ]);
  assert.equal(
    env.store.get("review_threads", thread.id).answer.action,
    "answered",
  );
});

test("an answer for a spec approved meanwhile changes no file", async (t) => {
  const { env, thread, finish, binding } = await childAnswer(t);
  const stored = env.store.get("plans", env.plan.id);
  fs.mkdirSync(binding.worktree, { recursive: true });
  fs.writeFileSync(
    path.join(binding.worktree, "design.md"),
    "# Design\n\nChanged.\n",
  );
  env.store.put("plans", { ...stored, state: "approved" });
  await finish([
    { id: thread.id, action: "answered", text: "Left for the person." },
  ]);
  assert.equal(
    fs.readFileSync(path.join(binding.worktree, "design.md"), "utf8"),
    stored.files["design.md"],
  );
  assert.equal(env.store.get("plans", env.plan.id).hash, stored.hash);
});

test("a child's folder with new lint errors stores nothing and opens one decision", async (t) => {
  const { env, thread, finish } = await childAnswer(t);
  const before = env.store.get("plans", env.plan.id).hash,
    good = env.getFolder(),
    files = {
      ...good.files,
      "tasks.md":
        "# Tasks\n\n- [ ] 1.1 Read the file\n- [ ] 1.1 Read it again\n",
    };
  env.ops.readSpec = () => ({ ...good, files, hash: specHash(files) });
  await assert.rejects(
    finish([{ id: thread.id, action: "fixed", text: "Split the task." }]),
    /lint error/,
  );
  assert.equal(env.store.get("plans", env.plan.id).hash, before);
  assert.equal(env.store.get("review_threads", thread.id).answer, undefined);
  const decisions = env.store
    .list("app_notifications")
    .filter(
      (row) => row.payload.title === "The answer for reader left lint errors",
    );
  assert.equal(decisions.length, 1);
});
