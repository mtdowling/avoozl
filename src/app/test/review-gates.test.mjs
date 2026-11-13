// Tasks 9.1–9.6 and 9.9: review roles on one delivery (design §5.2). Fake
// sessions only: each test binds slots and reports as the worker, checks, and
// review sessions would. One test per rule; each lists the nearby inputs it
// checks.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { deliveryPolicy, openFindings } from "../delivery.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

const CHECK = "scripts/validate.sh";
const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  checks: [CHECK],
  repository: "app",
  ...extra,
});

const REVIEWERS = [
  {
    id: "conventions",
    focus: "language and repository conventions",
    agent: "avoozl-reviewer",
    model: "fake-b",
  },
  {
    id: "correctness",
    focus: "correctness and performance",
    agent: "avoozl-reviewer",
    model: "fake-c",
  },
];

function setup(t, { delivery = {}, tasks, edges } = {}) {
  const root = temporaryDirectory("avoozl-review-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(path.join(checkout, "src"), { recursive: true });
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "src/a.txt"), "a\n");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: tasks ?? [leaf("w1"), leaf("d1"), leaf("w2"), leaf("d2")],
    edges: edges ?? [
      { from: "w1", to: "d1", kind: "requires" },
      { from: "w2", to: "d2", kind: "requires" },
    ],
  });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync(checkout),
    baseBranch: "main",
    checks: [["git", "status"]],
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      delivery: {
        concurrency: 1,
        retries: 2,
        model: "fake-a",
        reviewers: REVIEWERS,
        ...delivery,
      },
    }),
  );
  const slots = [];
  const ops = new Operations(store, { workspaceRoot: root });
  return {
    root,
    checkout: fs.realpathSync(checkout),
    store,
    ops,
    slots,
    // The cron's tick, with every bound slot in its roster.
    tick: () =>
      ops.execute("workspace.tick", {
        sessions: slots.map((target) => ({ target, status: "idle" })),
      }),
    bind: async (taskId, slot, role, attempt, extra = {}) => {
      slots.push(slot);
      await ops.execute("session.bind", {
        taskId,
        slot,
        role,
        attempt,
        source: "tick",
        title: `avoozl:${taskId} ${role} ${attempt}`,
        ...extra,
      });
    },
  };
}

const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });
const report = (ops, slot, input) =>
  ops.execute(
    "session.report",
    { kind: "done", ...input },
    undefined,
    as(slot),
  );

async function commitIn(worktree, file, text, message) {
  fs.mkdirSync(path.dirname(path.join(worktree, file)), { recursive: true });
  fs.writeFileSync(path.join(worktree, file), text);
  git(worktree, "add", ".");
  git(worktree, "commit", "-m", message);
  return git(worktree, "rev-parse", "HEAD");
}

async function writer(
  env,
  taskId,
  slot,
  attempt,
  file,
  text,
  model = "fake-a",
) {
  await env.bind(taskId, slot, "worker", attempt, model ? { model } : {});
  const { path: worktree } = await env.ops.execute("worktree.prepare", {
    taskId,
  });
  const commit = await commitIn(worktree, file, text, `Work ${attempt}`);
  await report(env.ops, slot, { taskId, commit });
  return commit;
}

const passed = [{ command: CHECK, exitCode: 0 }];
const roles = (result, taskId) =>
  result.dispatch
    .filter((d) => d.task === taskId && d.role !== "worker")
    .map((d) => [d.role, d.attempt, d.model ?? null, d.commit]);

test("policy validation refuses a reviewer that cannot be shown distinct from the writer", () => {
  // Nearby inputs: the writer's model, auto, a missing model, a missing
  // writer model, a repeated or reserved id, an empty focus, distinctFrom
  // session (any model), and a repository's own list replacing the
  // workspace's.
  const policy = (delivery) => deliveryPolicy({ delivery });
  const role = (extra = {}) => ({ ...REVIEWERS[0], ...extra });
  assert.throws(
    () => policy({ model: "fake-a", reviewers: [role({ model: "fake-a" })] }),
    /must differ from the writer's model fake-a/,
  );
  assert.throws(
    () => policy({ model: "fake-a", reviewers: [role({ model: "auto" })] }),
    /not auto/,
  );
  assert.throws(
    () => policy({ model: "fake-a", reviewers: [role({ model: undefined })] }),
    /must name a model/,
  );
  assert.throws(
    () => policy({ reviewers: [role()] }),
    /delivery.model must name the writer's model/,
  );
  assert.throws(
    () => policy({ model: "auto", reviewers: [role()] }),
    /delivery.model must name the writer's model/,
  );
  assert.throws(
    () => policy({ model: "fake-a", reviewers: [role(), role()] }),
    /repeated/,
  );
  assert.throws(
    () => policy({ model: "fake-a", reviewers: [role({ id: "checks" })] }),
    /not "checks"/,
  );
  assert.throws(
    () => policy({ model: "fake-a", reviewers: [role({ focus: " " })] }),
    /focus/,
  );
  assert.throws(
    () =>
      policy({
        model: "fake-a",
        repositories: { app: { reviewers: [role({ model: "fake-a" })] } },
      }),
    /repositories.app.reviewers\[0\].model must differ/,
  );
  const relaxed = policy({
    reviewers: [role({ model: "auto", distinctFrom: "session" })],
  });
  assert.equal(relaxed.reviewers[0].distinctFrom, "session");
  const replaced = policy({
    model: "fake-a",
    reviewers: REVIEWERS,
    repositories: { app: { concurrency: 1, reviewers: [role()] } },
  });
  assert.equal(replaced.reviewers[0].distinctFrom, "model", "the default");
  assert.deepEqual(
    replaced.repositories.app.reviewers.map((r) => r.id),
    ["conventions"],
  );
});

test("review gates: three roles per commit, rework, closure, not-run checks, and a rebase re-review", async (t) => {
  // P27 actions 1–4 with fake sessions.
  const env = setup(t),
    { store, ops, checkout } = env;
  const first = await env.tick();
  assert.deepEqual(
    first.dispatch.map((d) => [d.task, d.role, d.model]),
    [["w1", "worker", "fake-a"]],
    "one writer at a time, opened on the writer's model",
  );

  // (1) The writer reports C1; three role sessions open at once on C1.
  const c1 = await writer(env, "w1", "w-1", 1, "src/a.txt", "a1\n");
  const round1 = await env.tick();
  assert.deepEqual(roles(round1, "w1"), [
    ["verifier", 1, null, c1],
    ["review:conventions", 1, "fake-b", c1],
    ["review:correctness", 1, "fake-c", c1],
  ]);
  assert.ok(
    round1.dispatch.some((d) => d.task === "w2" && d.role === "worker"),
    "review sessions do not count against concurrency 1",
  );
  const correctnessBrief = round1.dispatch.find(
    (d) => d.role === "review:correctness",
  ).brief;
  assert.match(correctnessBrief, /Focus: correctness and performance/);
  assert.match(correctnessBrief, /--detach/);
  assert.doesNotMatch(correctnessBrief, /conventions/, "names no other role");
  await env.bind("w1", "v-1", "verifier", 1, { commit: c1 });
  await env.bind("w1", "rc-1", "review:conventions", 1, {
    model: "fake-b",
    commit: c1,
  });
  await env.bind("w1", "rr-1", "review:correctness", 1, {
    model: "fake-c",
    commit: c1,
  });

  // Verdicts that disagree with their findings or commit are refused in-session.
  const base = git(checkout, "rev-parse", "main");
  const F1 = {
    id: "F1",
    kind: "defect",
    paths: ["src/a.txt"],
    text: "a1 is wrong.",
  };
  for (const [input, status, why] of [
    [{ commit: base, verdict: "approved" }, 409, "another commit"],
    [
      {
        commit: c1,
        verdict: "changes-requested",
        findings: [{ ...F1, paths: [] }],
      },
      400,
      "a pathless finding",
    ],
    [
      {
        commit: c1,
        verdict: "changes-requested",
        findings: [{ ...F1, paths: ["../x"] }],
      },
      400,
      "a path outside the repository",
    ],
    [
      { commit: c1, verdict: "approved", findings: [F1] },
      409,
      "approved with a defect",
    ],
    [{ commit: c1, verdict: "changes-requested" }, 409, "no defect"],
    [
      { commit: c1, verdict: "approved", checks: passed },
      400,
      "a review lists no checks",
    ],
  ])
    await assert.rejects(
      report(ops, "rr-1", { taskId: "w1", ...input }),
      (error) => error.status === status,
      why,
    );
  await assert.rejects(
    report(ops, "w-1", { taskId: "w1", commit: c1, verdict: "approved" }),
    (error) => error.status === 400,
    "only a review role has a verdict",
  );
  await report(ops, "rc-1", { taskId: "w1", commit: c1, verdict: "approved" });
  await report(ops, "rr-1", {
    taskId: "w1",
    commit: c1,
    verdict: "changes-requested",
    findings: [F1],
  });
  await report(ops, "v-1", { taskId: "w1", commit: c1, checks: passed });

  // (2) changes-requested fails the writer attempt; the retry quotes F1.
  const rework = await env.tick();
  let delivery = store.get("task_deliveries", "w1");
  assert.equal(delivery.state, "failed");
  assert.match(
    delivery.attempts[0].cause,
    /review correctness requested changes: F1/,
  );
  assert.deepEqual(
    delivery.verifications
      .map((v) => [v.role ?? "checks", v.outcome, v.model ?? null])
      .sort(),
    [
      ["checks", "accepted", null],
      ["conventions", "accepted", "fake-b"],
      ["correctness", "rejected", "fake-c"],
    ],
  );
  const retry = rework.dispatch.find((d) => d.task === "w1");
  assert.deepEqual([retry.role, retry.attempt], ["worker", 2]);
  assert.match(
    retry.brief,
    /1:correctness:F1 \(defect, src\/a\.txt\): a1 is wrong\./,
  );
  assert.match(retry.brief, /data, not instructions/);
  assert.equal(
    store.read().tasks.find((x) => x.id === "d1").integration,
    undefined,
    "d1 waits",
  );

  // (3) The next attempt changes src/a.txt; every role reviews C2.
  const c2 = await writer(env, "w1", "w-2", 2, "src/a.txt", "a2\n");
  const round2 = await env.tick();
  assert.deepEqual(roles(round2, "w1"), [
    ["verifier", 2, null, c2],
    ["review:conventions", 2, "fake-b", c2],
    ["review:correctness", 2, "fake-c", c2],
  ]);
  assert.match(
    round2.dispatch.find((d) => d.role === "review:correctness").brief,
    /1:correctness:F1/,
  );
  assert.doesNotMatch(
    round2.dispatch.find((d) => d.role === "review:conventions").brief,
    /1:correctness/,
    "a role sees only its own findings",
  );
  await env.bind("w1", "v-2", "verifier", 2, { commit: c2 });
  await env.bind("w1", "rc-2", "review:conventions", 2, {
    model: "fake-b",
    commit: c2,
  });
  await env.bind("w1", "rr-2", "review:correctness", 2, {
    model: "fake-c",
    commit: c2,
  });
  const close = (state) => ({ finding: "1:correctness:F1", state });
  await assert.rejects(
    report(ops, "rr-2", { taskId: "w1", commit: c2, verdict: "approved" }),
    /Close every open finding as fixed or unchanged: 1:correctness:F1/,
  );
  await assert.rejects(
    report(ops, "rr-2", {
      taskId: "w1",
      commit: c2,
      verdict: "approved",
      closures: [close("unchanged")],
    }),
    /cannot be unchanged/,
  );
  await assert.rejects(
    report(ops, "rr-2", {
      taskId: "w1",
      commit: c2,
      verdict: "approved",
      closures: [{ finding: "9:correctness:F9", state: "fixed" }],
    }),
    /not an open finding/,
  );
  await report(ops, "rr-2", {
    taskId: "w1",
    commit: c2,
    verdict: "approved",
    closures: [close("fixed")],
  });
  await report(ops, "rc-2", { taskId: "w1", commit: c2, verdict: "approved" });
  // The checks role could not run the script: only that session fails.
  await report(ops, "v-2", {
    taskId: "w1",
    commit: c2,
    checks: [{ command: CHECK, exitCode: null, notRun: "bash missing" }],
  });
  const rerun = await env.tick();
  delivery = store.get("task_deliveries", "w1");
  assert.equal(delivery.state, "done");
  assert.equal(delivery.attempts[1].outcome, "done", "no writer attempt spent");
  assert.match(
    delivery.verifications.find((v) => !v.role && v.outcome === "failed").cause,
    /checks not run: .*bash missing/,
  );
  assert.deepEqual(roles(rerun, "w1"), [["verifier", 3, null, c2]]);
  await env.bind("w1", "v-3", "verifier", 3, { commit: c2 });
  await report(ops, "v-3", { taskId: "w1", commit: c2, checks: passed });

  // (4) The base moved: the rebase makes C3, nothing merges, all roles re-review.
  const moved = await commitIn(checkout, "README.md", "moved\n", "Move base");
  const round3 = await env.tick();
  delivery = store.get("task_deliveries", "w1");
  const c3 = delivery.commit;
  assert.notEqual(c3, c2);
  assert.equal(delivery.state, "done");
  assert.deepEqual(
    delivery.rebases.map((r) => [r.from, r.to]),
    [[c2, c3]],
  );
  assert.equal(git(checkout, "rev-parse", "main"), moved, "nothing merged");
  assert.deepEqual(roles(round3, "w1"), [
    ["verifier", 4, null, c3],
    ["review:conventions", 3, "fake-b", c3],
    ["review:correctness", 3, "fake-c", c3],
  ]);
  assert.doesNotMatch(
    round3.dispatch.find((d) => d.role === "review:correctness").brief,
    /1:correctness/,
    "F1 stays closed",
  );
  await env.bind("w1", "v-4", "verifier", 4, { commit: c3 });
  await env.bind("w1", "rc-3", "review:conventions", 3, {
    model: "fake-b",
    commit: c3,
  });
  await env.bind("w1", "rr-3", "review:correctness", 3, {
    model: "fake-c",
    commit: c3,
  });
  await assert.rejects(
    report(ops, "rr-3", { taskId: "w1", commit: c2, verdict: "approved" }),
    (error) => error.status === 409,
    "a verdict on the old commit",
  );
  await report(ops, "v-4", { taskId: "w1", commit: c3, checks: passed });
  await report(ops, "rc-3", { taskId: "w1", commit: c3, verdict: "approved" });
  await report(ops, "rr-3", { taskId: "w1", commit: c3, verdict: "approved" });
  await env.tick();
  delivery = store.get("task_deliveries", "w1");
  assert.equal(delivery.state, "integrated");
  assert.equal(
    delivery.integratedCommit,
    c3,
    "the approved commit fast-forwards",
  );
  assert.equal(git(checkout, "rev-parse", "main"), c3);
  const graph = await ops.execute("graph.view", {});
  assert.ok(graph.tasks.find((x) => x.id === "d1").ready, "d1 is released");

  // 9.9: every verdict stays on the delivery, by round, with stale marks.
  const view = await ops.execute("delivery.view", {}),
    [rounds] = view.items
      .filter((item) => item.id === "w1")
      .map((item) => item.rounds);
  assert.deepEqual(
    rounds.map((r) => [r.commit, r.current, r.verdicts.length]),
    [
      [c1, false, 3],
      [c2, false, 4],
      [c3, true, 3],
    ],
  );
  const f1 = rounds[0].verdicts.find((v) => v.role === "correctness");
  assert.deepEqual(
    [f1.verdict, f1.model, f1.stale, f1.findings[0].ref, f1.findings[0].state],
    ["changes-requested", "fake-c", true, "1:correctness:F1", "fixed"],
  );
  assert.equal(f1.link, "/chat?sid=rr-1");
  assert.ok(
    rounds[2].verdicts.every((v) => !v.stale && v.verdict === "approved"),
  );
  const session = view.items
    .find((item) => item.id === "w1")
    .sessions.find((s) => s.slot === "rc-1");
  assert.deepEqual([session.model, session.commit], ["fake-b", c1]);
});

test("a writer whose model is unknown opens a decision instead of a review", async (t) => {
  // Nearby inputs: a conductor-style binding with no model, the checks role
  // (it has no distinctFrom rule), and distinctFrom session (no decision).
  const env = setup(t, { tasks: [leaf("w1")], edges: [] });
  await env.tick();
  await writer(env, "w1", "w-1", 1, "src/a.txt", "a1\n", null);
  const result = await env.tick();
  const delivery = env.store.get("task_deliveries", "w1");
  assert.equal(delivery.state, "decision");
  assert.match(delivery.cause, /writer's model is unknown/);
  assert.deepEqual(roles(result, "w1"), [], "no review and no checks session");
  assert.ok(result.notify.some((n) => n.title === "Avoozl will not review w1"));

  const relaxed = setup(t, {
    tasks: [leaf("w1")],
    edges: [],
    delivery: {
      model: undefined,
      reviewers: [{ ...REVIEWERS[0], model: "auto", distinctFrom: "session" }],
    },
  });
  await relaxed.tick();
  await writer(relaxed, "w1", "w-1", 1, "src/a.txt", "a1\n", null);
  const opened = await relaxed.tick();
  assert.deepEqual(
    roles(opened, "w1").map((r) => r[0]),
    ["verifier", "review:conventions"],
  );
});

test("only a person dismisses an open finding when retrying a stopped delivery", async (t) => {
  // Nearby inputs: a dismissal from a session, a finding that is not open,
  // a missing reason, and the next brief after a dismissal.
  const env = setup(t, {
    tasks: [leaf("w1")],
    edges: [],
    delivery: { retries: 0, reviewers: [REVIEWERS[1]] },
  });
  await env.tick();
  const c1 = await writer(env, "w1", "w-1", 1, "src/a.txt", "a1\n");
  await env.tick();
  await env.bind("w1", "rr-1", "review:correctness", 1, {
    model: "fake-c",
    commit: c1,
  });
  await report(env.ops, "rr-1", {
    taskId: "w1",
    commit: c1,
    verdict: "changes-requested",
    findings: [
      { id: "F1", kind: "defect", paths: ["src/a.txt"], text: "Wrong." },
    ],
  });
  await env.tick();
  assert.equal(env.store.get("task_deliveries", "w1").state, "decision");
  const dismiss = [{ finding: "1:correctness:F1", reason: "Accepted risk." }];
  await assert.rejects(
    env.ops.execute(
      "delivery.retry",
      { taskId: "w1", dismiss },
      undefined,
      as("w-1"),
    ),
    (error) => error.status === 403,
  );
  await assert.rejects(
    env.ops.execute("delivery.retry", {
      taskId: "w1",
      dismiss: [{ finding: "1:correctness:F2", reason: "x" }],
    }),
    /not an open finding/,
  );
  await assert.rejects(
    env.ops.execute("delivery.retry", {
      taskId: "w1",
      dismiss: [{ finding: "1:correctness:F1" }],
    }),
    /reason/,
  );
  await env.ops.execute(
    "delivery.retry",
    { taskId: "w1", dismiss },
    undefined,
    { local: true },
  );
  const delivery = env.store.get("task_deliveries", "w1");
  assert.deepEqual(
    delivery.dismissals.map((d) => [d.finding, d.reason, d.by]),
    [["1:correctness:F1", "Accepted risk.", "cli"]],
  );
  assert.deepEqual(openFindings(delivery), []);
  const next = await env.tick();
  const brief = next.dispatch.find((d) => d.task === "w1").brief;
  assert.doesNotMatch(
    brief,
    /1:correctness:F1/,
    "a dismissed finding is not quoted",
  );
});
