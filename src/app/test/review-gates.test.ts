// Tasks 9.1–9.6 and 9.9: review roles on one delivery (design §5.2). Fake
// sessions only: each test binds slots and reports as the worker, checks, and
// review sessions would. One test per rule; each lists the nearby inputs it
// checks.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import type { Edge, Task } from "../../types.ts";
import {
  DEFAULT_REVIEWER,
  deliveryPolicy,
  openFindings,
  reviewRoles,
  reviewRoundsFor,
} from "../delivery/delivery.ts";
import { drainCheckRuns } from "../delivery/check-runs.ts";
import { Operations } from "../api/operations.ts";
import { Store, type StatusError } from "../store/store.ts";
import { snapshot } from "./fixtures.ts";
import { temporaryDirectory } from "./temporary.ts";
import { gitCheckout } from "./delivery-fixture.ts";
import { commitIn, git } from "./fake-crew.ts";
import { loopOn } from "./fixtures.ts";
import { found, type GraphView } from "./view-shapes.ts";

// One session a tick asked for.
interface Dispatched {
  task: string;
  role: string;
  attempt: number;
  model?: string;
  commit?: string;
  brief: string;
}
interface Tick {
  dispatch: Dispatched[];
  notify: { title: string }[];
}
// A task_deliveries row, for the fields read here.
interface Delivery {
  state: string;
  cause?: string;
  commit?: string;
  integratedCommit?: string;
  attempts: { cause: string; review?: string }[];
  verifications: { role?: string; outcome: string; model?: string }[];
  rebases: { from: string; to: string }[];
  dismissals: { finding: string; reason: string; by: string }[];
}
// One review round on delivery.view.
interface Round {
  commit: string;
  current: boolean;
  verdicts: {
    role: string;
    verdict: string;
    model: string;
    stale: boolean;
    link: string;
    findings: { ref: string; state: string }[];
  }[];
}
interface DeliveryItems {
  items: {
    id: string;
    rounds: Round[];
    sessions: { slot: string; model: string; commit: string }[];
  }[];
}
type Env = ReturnType<typeof setup>;
const deliveryOf = (store: Store, id = "w1") =>
  found(store.get<Delivery>("task_deliveries", id), id);

// The tick starts and lands work only with the server loop on.
loopOn();

const CHECK = "git status";
const leaf = (id: string, extra: Record<string, unknown> = {}): Task => ({
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

function setup(
  t: TestContext,
  {
    delivery = {},
    tasks,
    edges,
  }: {
    delivery?: Record<string, unknown>;
    tasks?: Task[];
    edges?: Edge[];
  } = {},
) {
  const root = temporaryDirectory("avoozl-review-"),
    checkout = gitCheckout(path.join(root, "app"), { "src/a.txt": "a\n" });
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize({
    ...snapshot(),
    tasks: tasks ?? [leaf("w1"), leaf("d1"), leaf("w2"), leaf("d2")],
    edges: edges ?? [
      { from: "w1", to: "d1", kind: "requires" },
      { from: "w2", to: "d2", kind: "requires" },
    ],
  });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    checks: [["git", "status"]],
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      lanes: { local: 1, reviewers: 2 },
      roles: { worker: { model: "fake-a" } },
      delivery: {
        retries: 2,
        reviewers: REVIEWERS,
        ...delivery,
      },
    }),
  );
  const slots: string[] = [];
  const ops = new Operations(store, { workspaceRoot: root });
  return {
    root,
    checkout: fs.realpathSync.native(checkout),
    store,
    ops,
    slots,
    // The cron's tick, with every bound slot in its roster, after Avoozl
    // runs the checks it queued.
    tick: async () => {
      await drainCheckRuns(store);
      return ops.execute<Tick>("workspace.tick", {
        sessions: slots.map((target) => ({ target, status: "idle" })),
      });
    },
    bind: async (
      taskId: string,
      slot: string,
      role: string,
      attempt: number,
      extra: Record<string, unknown> = {},
    ) => {
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

const as = (slot: string) => ({ caller: { sessionKey: "dashboard:" + slot } });
const report = (
  ops: Operations,
  slot: string,
  input: Record<string, unknown>,
) =>
  ops.execute(
    "session.report",
    { kind: "done", ...input },
    undefined,
    as(slot),
  );

async function writer(
  env: Env,
  taskId: string,
  slot: string,
  attempt: number,
  file: string,
  text: string,
  model: string | null = "fake-a",
) {
  await env.bind(taskId, slot, "worker", attempt, model ? { model } : {});
  const { path: worktree } = await env.ops.execute<{ path: string }>(
    "worktree.prepare",
    {
      taskId,
    },
  );
  const commit = await commitIn(worktree, file, text, `Work ${attempt}`);
  await report(env.ops, slot, { taskId, commit });
  return commit;
}

// One task, one correctness reviewer, and its first round: the writer's
// commit c1 and a changes-requested verdict with `findings` (default F1).
async function firstRound(
  t: TestContext,
  delivery: Record<string, unknown> = {},
  findings: unknown[] | null = null,
) {
  const env = setup(t, {
    tasks: [leaf("w1")],
    edges: [],
    delivery: { reviewers: [REVIEWERS[1]], ...delivery },
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
    findings: findings ?? [
      { id: "F1", kind: "defect", paths: ["src/a.txt"], text: "Wrong." },
    ],
  });
  await env.tick();
  return { env, c1 };
}

const passed = [{ command: CHECK, exitCode: 0 }];
const roles = (result: Tick, taskId: string) =>
  result.dispatch
    .filter((d) => d.task === taskId && d.role !== "worker")
    .map((d) => [d.role, d.attempt, d.model ?? null, d.commit]);

test("policy validation refuses a reviewer that cannot be shown distinct from the writer", () => {
  // Nearby inputs: the writer's model, auto, a missing model, a missing
  // writer model, a repeated or reserved id, an empty focus, distinctFrom
  // session (any model), and a repository's own list replacing the
  // workspace's.
  // `model` is the writer's: roles.worker.model.
  const policy = ({
    model,
    ...delivery
  }: {
    model?: string;
    [key: string]: unknown;
  }) =>
    deliveryPolicy({
      delivery,
      ...(model ? { roles: { worker: { model } } } : {}),
    });
  const role = (extra: Record<string, unknown> = {}) => ({
    ...REVIEWERS[0],
    ...extra,
  });
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
    /roles.worker.model \(Settings › Models\) must name the writer's model/,
  );
  assert.throws(
    () => policy({ model: "auto", reviewers: [role()] }),
    /roles.worker.model \(Settings › Models\) must name the writer's model/,
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
    repositories: { app: { reviewers: [role()] } },
  });
  assert.equal(replaced.reviewers[0].distinctFrom, "model", "the default");
  assert.deepEqual(
    replaced.repositories.app.reviewers?.map((r: { id: string }) => r.id),
    ["conventions"],
  );
});

test("review gates: every role per commit, rework, closure, and a rebase re-review", async (t) => {
  // P27 actions 1–4 with fake sessions.
  const env = setup(t),
    { store, ops, checkout } = env;
  const first = await env.tick();
  assert.deepEqual(
    first.dispatch.map((d) => [d.task, d.role, d.model]),
    [["w1", "worker", "fake-a"]],
    "one writer at a time, opened on the writer's model",
  );

  // (1) The writer reports C1; both review sessions open at once on C1.
  const c1 = await writer(env, "w1", "w-1", 1, "src/a.txt", "a1\n");
  const round1 = await env.tick();
  assert.deepEqual(roles(round1, "w1"), [
    ["review:conventions", 1, "fake-b", c1],
    ["review:correctness", 1, "fake-c", c1],
  ]);
  assert.ok(
    round1.dispatch.some((d) => d.task === "w2" && d.role === "worker"),
    "review sessions do not count against concurrency 1",
  );
  const correctnessBrief = found(
    round1.dispatch.find((d) => d.role === "review:correctness"),
  ).brief;
  assert.match(correctnessBrief, /Focus: correctness and performance/);
  assert.match(correctnessBrief, /--detach/);
  assert.doesNotMatch(correctnessBrief, /conventions/, "names no other role");
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
  const refusals: [Record<string, unknown>, number, string][] = [
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
  ];
  for (const [input, status, why] of refusals)
    await assert.rejects(
      report(ops, "rr-1", { taskId: "w1", ...input }),
      (error: StatusError) => error.status === status,
      why,
    );
  await assert.rejects(
    report(ops, "w-1", { taskId: "w1", commit: c1, verdict: "approved" }),
    (error: StatusError) => error.status === 400,
    "only a review role has a verdict",
  );
  await report(ops, "rc-1", { taskId: "w1", commit: c1, verdict: "approved" });
  await report(ops, "rr-1", {
    taskId: "w1",
    commit: c1,
    verdict: "changes-requested",
    findings: [F1],
  });

  // (2) changes-requested fails the writer attempt; the retry quotes F1.
  const rework = await env.tick();
  let delivery = deliveryOf(store);
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
  const retry = found(rework.dispatch.find((d) => d.task === "w1"));
  assert.deepEqual([retry.role, retry.attempt], ["worker", 2]);
  assert.match(
    retry.brief,
    /1:correctness:F1 \(defect, src\/a\.txt\): a1 is wrong\./,
  );
  assert.match(retry.brief, /data, not instructions/);
  assert.equal(
    store.read().tasks.find((x) => x.id === "d1")?.integration,
    undefined,
    "d1 waits",
  );

  // (3) The next attempt changes src/a.txt; every role reviews C2.
  const c2 = await writer(env, "w1", "w-2", 2, "src/a.txt", "a2\n");
  const round2 = await env.tick();
  assert.deepEqual(roles(round2, "w1"), [
    ["review:conventions", 2, "fake-b", c2],
    ["review:correctness", 2, "fake-c", c2],
  ]);
  assert.match(
    found(round2.dispatch.find((d) => d.role === "review:correctness")).brief,
    /1:correctness:F1/,
  );
  assert.doesNotMatch(
    found(round2.dispatch.find((d) => d.role === "review:conventions")).brief,
    /1:correctness/,
    "a role sees only its own findings",
  );
  await env.bind("w1", "rc-2", "review:conventions", 2, {
    model: "fake-b",
    commit: c2,
  });
  await env.bind("w1", "rr-2", "review:correctness", 2, {
    model: "fake-c",
    commit: c2,
  });
  const close = (state: string) => ({ finding: "1:correctness:F1", state });
  await assert.rejects(
    report(ops, "rr-2", { taskId: "w1", commit: c2, verdict: "approved" }),
    /Close every open finding as fixed, unchanged or withdrawn: 1:correctness:F1/,
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

  // (4) The base moved: the rebase makes C3, nothing merges, all roles re-review.
  const moved = await commitIn(checkout, "README.md", "moved\n", "Move base");
  const round3 = await env.tick();
  delivery = deliveryOf(store);
  const c3 = delivery.commit;
  assert.notEqual(c3, c2);
  assert.equal(delivery.state, "done");
  assert.deepEqual(
    delivery.rebases.map((r) => [r.from, r.to]),
    [[c2, c3]],
  );
  assert.equal(git(checkout, "rev-parse", "main"), moved, "nothing merged");
  assert.deepEqual(roles(round3, "w1"), [
    ["review:conventions", 3, "fake-b", c3],
    ["review:correctness", 3, "fake-c", c3],
  ]);
  assert.doesNotMatch(
    found(round3.dispatch.find((d) => d.role === "review:correctness")).brief,
    /1:correctness/,
    "F1 stays closed",
  );
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
    (error: StatusError) => error.status === 409,
    "a verdict on the old commit",
  );
  await report(ops, "rc-3", { taskId: "w1", commit: c3, verdict: "approved" });
  await report(ops, "rr-3", { taskId: "w1", commit: c3, verdict: "approved" });
  await env.tick();
  delivery = deliveryOf(store);
  assert.equal(delivery.state, "integrated");
  assert.equal(
    delivery.integratedCommit,
    c3,
    "the approved commit fast-forwards",
  );
  assert.equal(git(checkout, "rev-parse", "main"), c3);
  const graph = await ops.execute<GraphView>("graph.view", {});
  assert.ok(graph.tasks.find((x) => x.id === "d1")?.ready, "d1 is released");

  // 9.9: every verdict stays on the delivery, by round, with stale marks.
  const view = await ops.execute<DeliveryItems>("delivery.view", {}),
    [rounds] = view.items
      .filter((item) => item.id === "w1")
      .map((item) => item.rounds);
  assert.deepEqual(
    rounds.map((r) => [r.commit, r.current, r.verdicts.length]),
    [
      [c1, false, 3],
      [c2, false, 3],
      [c3, true, 3],
    ],
  );
  const f1 = found(rounds[0].verdicts.find((v) => v.role === "correctness"));
  assert.deepEqual(
    [f1.verdict, f1.model, f1.stale, f1.findings[0].ref, f1.findings[0].state],
    ["changes-requested", "fake-c", true, "1:correctness:F1", "fixed"],
  );
  assert.equal(f1.link, "/chat?sid=rr-1");
  assert.ok(
    rounds[2].verdicts.every((v) => !v.stale && v.verdict === "approved"),
  );
  const session = found(
    found(view.items.find((item) => item.id === "w1")).sessions.find(
      (s) => s.slot === "rc-1",
    ),
  );
  assert.deepEqual([session.model, session.commit], ["fake-b", c1]);
});

test("a writer whose model is unknown opens a decision instead of a review", async (t) => {
  // Nearby inputs: a conductor-style binding with no model, the checks role
  // (it has no distinctFrom rule), and distinctFrom session (no decision).
  const env = setup(t, { tasks: [leaf("w1")], edges: [] });
  await env.tick();
  await writer(env, "w1", "w-1", 1, "src/a.txt", "a1\n", null);
  const result = await env.tick();
  const delivery = deliveryOf(env.store);
  assert.equal(delivery.state, "decision");
  assert.match(found(delivery.cause), /writer's model is unknown/);
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
    ["review:conventions"],
  );
});

test("a retry dismisses an open finding and records who did", async (t) => {
  // Nearby inputs: a finding that is not open, a missing reason, a session's
  // dismissal, and the next brief after a dismissal.
  const { env } = await firstRound(t, { reviewRounds: 1 });
  assert.equal(deliveryOf(env.store).state, "decision");
  const dismiss = [{ finding: "1:correctness:F1", reason: "Accepted risk." }];
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
    { mcp: true },
  );
  const delivery = deliveryOf(env.store);
  assert.deepEqual(
    delivery.dismissals.map((d) => [d.finding, d.reason, d.by]),
    [["1:correctness:F1", "Accepted risk.", "mcp"]],
  );
  assert.deepEqual(openFindings(delivery), []);
  const next = await env.tick();
  const brief = found(next.dispatch.find((d) => d.task === "w1")).brief;
  assert.doesNotMatch(
    brief,
    /1:correctness:F1/,
    "a dismissed finding is not quoted",
  );
});

test("one reviewer runs by default, and reviewers [] turns it off", () => {
  // Nearby inputs: no reviewers key, an empty workspace list, a repository's
  // empty list under a workspace default, and reviewRounds bounds.
  const on = deliveryPolicy({ delivery: {} });
  assert.deepEqual(reviewRoles(on, "app"), [DEFAULT_REVIEWER]);
  assert.equal(reviewRoundsFor(on, "app"), 3);
  assert.deepEqual(
    reviewRoles(deliveryPolicy({ delivery: { reviewers: [] } }), "app"),
    [],
  );
  const repoOff = deliveryPolicy({
    delivery: { repositories: { app: { reviewers: [], reviewRounds: 5 } } },
  });
  assert.deepEqual(reviewRoles(repoOff, "app"), []);
  assert.deepEqual(reviewRoles(repoOff, "other"), [DEFAULT_REVIEWER]);
  assert.equal(reviewRoundsFor(repoOff, "app"), 5);
  assert.throws(
    () => deliveryPolicy({ delivery: { reviewRounds: 0 } }),
    /reviewRounds must be a whole number 1–10/,
  );
  assert.throws(
    () =>
      deliveryPolicy({
        delivery: { repositories: { app: { reviewRounds: 11 } } },
      }),
    /reviewRounds must be a whole number 1–10/,
  );
});

test("review rounds end in a decision at the cap and spend no retries", async (t) => {
  // Nearby inputs: retries 0 (a review round is not a retry), a worker that
  // answers a finding, a withdrawn closure, and the cap with open findings.
  const { env } = await firstRound(t, { retries: 0, reviewRounds: 2 }, [
    { id: "F1", kind: "defect", paths: ["src/a.txt"], text: "Wrong." },
    { id: "F2", kind: "defect", paths: ["src/b.txt"], text: "Missing." },
  ]);
  let delivery = deliveryOf(env.store);
  assert.equal(delivery.state, "failed", "round 1 sends it back");
  assert.equal(delivery.attempts[0].review, "correctness");
  // Round 2: the worker fixes F1 and answers F2; the reviewer withdraws F2
  // with no diff on its path, but finds a new defect.
  const c2 = await writer(env, "w1", "w-2", 2, "src/a.txt", "a2\n");
  await env.tick();
  await env.bind("w1", "rr-2", "review:correctness", 2, {
    model: "fake-c",
    commit: c2,
  });
  await report(env.ops, "rr-2", {
    taskId: "w1",
    commit: c2,
    verdict: "changes-requested",
    findings: [
      { id: "F3", kind: "defect", paths: ["src/a.txt"], text: "Still off." },
    ],
    closures: [
      { finding: "1:correctness:F1", state: "fixed" },
      { finding: "1:correctness:F2", state: "withdrawn", note: "Answered." },
    ],
  });
  await env.tick();
  delivery = deliveryOf(env.store);
  assert.equal(delivery.state, "decision", "two rounds reach the cap");
  assert.equal(
    delivery.cause,
    "review requested changes in 2 rounds; open findings: 2:correctness:F3",
  );
  assert.deepEqual(
    openFindings(delivery).map((f: { ref: string }) => f.ref),
    ["2:correctness:F3"],
  );
});

test("a later review brief quotes the worker's claim and names the commit last reviewed", async (t) => {
  const { env, c1 } = await firstRound(t);
  await env.bind("w1", "w-2", "worker", 2, { model: "fake-a" });
  const { path: worktree } = await env.ops.execute<{ path: string }>(
    "worktree.prepare",
    {
      taskId: "w1",
    },
  );
  const c2 = await commitIn(worktree, "src/a.txt", "a2\n", "Work 2");
  await report(env.ops, "w-2", {
    taskId: "w1",
    commit: c2,
    text: "Fixed F1; tests pass.",
  });
  const review = found(
    (await env.tick()).dispatch.find((d) => d.role === "review:correctness"),
  );
  assert.match(review.brief, /You last reviewed [0-9a-f]{40}: read `git log/);
  assert.ok(review.brief.includes(`git log ${c1}..HEAD --stat`));
  assert.match(
    review.brief,
    /The worker's done report, a claim you have not verified[^\n]*\n```text\nFixed F1; tests pass\.\n```/,
  );
});
