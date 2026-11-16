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
  claim: "The named helper is absent.",
  evidence: "Searched src/ for missing.mjs; no matching file was found.",
  ...extra,
});

function setup(t, { writer = true, rounds = 1, mode = "auto" } = {}) {
  const { root, store } = fixture(t),
    files = {
      "requirements.md": "# Requirements\n\nThe app reads a file.\n",
      "design.md": "# Design\n\nUse src/missing.mjs.\n",
      "tasks.md": "# Tasks\n\n- [ ] 1.1 Read the file\n",
      "avoozl/manifest.json":
        '{"version":1,"tasks":{"1.1":{"repository":"app"}}}\n',
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
      models: { planReviewer: "fake-reviewer", planner: "fake-writer" },
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
  same.options.config.models = { planReviewer: "fake-writer" };
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
          claim: "An ordering edge is missing.",
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
    { planId: env.plan.id, revisionHash: saved.hash, findings: [finding()] },
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
  await env.step();
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
  env.store.put("projects", {
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
