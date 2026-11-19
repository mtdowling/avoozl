import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueSessionRequests,
  takeSessionRequest,
} from "../session-requests.mjs";
import {
  kirocrewRequest,
  kirocrewConfiguration,
  kirocrewDispatches,
  persistKirocrewConfiguration,
} from "../executors/kirocrew.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

const context = (id) => ({ caller: { sessionKey: `cron:${id}` } });
const start = (extra = {}) => ({
  executor: "kirocrew",
  role: "worker",
  task: "sample-task",
  title: "avoozl:sample-task work",
  brief: "Do the synthetic work.",
  worktree: null,
  model: "fake-model",
  permissionClass: "write",
  ...extra,
});
const env = (t) => {
  const value = fixture(t);
  return {
    ...value,
    ops: new Operations(value.store, { workspaceRoot: value.root }),
  };
};
const call = (ops, name, input, consumer = "one") =>
  ops.execute(`executor.kirocrew.${name}`, input, undefined, context(consumer));
const input = (request) => ({ id: request.id, version: request.version });

test("native consumers cannot take process requests or complete another consumer's claim", async (t) => {
  const { store, ops } = env(t),
    queued = enqueueSessionRequests(store, {
      starts: [start(), start({ executor: "process" })],
      sends: [
        { executor: "process", slot: "s", text: "Feedback" },
        { executor: "kirocrew", slot: "s", text: "Feedback" },
      ],
    });
  const native = queued.starts[0],
    foreign = queued.starts[1],
    before = store.get("session_requests", foreign.id);
  assert.equal(
    await call(ops, "take", {
      ...input(foreign),
      executor: "process",
      consumer: "process-owner",
    }),
    null,
  );
  assert.deepEqual(store.get("session_requests", foreign.id), before);
  await assert.rejects(
    ops.execute("executor.kirocrew.take", input(native), undefined, {
      mcp: true,
      caller: { sessionKey: "dashboard:worker" },
    }),
    /Only the native executor cron/,
  );
  const claim = await call(ops, "take", input(native));
  assert.ok(claim.claimToken);
  assert.equal(await call(ops, "take", input(native)), null);
  await assert.rejects(
    ops.execute(
      "session.bind",
      {
        taskId: native.task,
        slot: "s-native",
        role: native.role,
        source: "tick",
        executor: "kirocrew",
        model: native.model,
        permissionClass: native.permissionClass,
        requestId: native.id,
        claimToken: claim.claimToken,
      },
      undefined,
      context("two"),
    ),
    /does not own/,
  );
  assert.equal(store.get("session_bindings", "s-native"), null);
  const message = queued.sends[1],
    messageClaim = await call(ops, "take", input(message));
  await assert.rejects(
    call(ops, "complete", { id: message.id, outcome: "sent" }),
    /does not own/,
  );
  await assert.rejects(
    call(
      ops,
      "complete",
      { id: message.id, claimToken: messageClaim.claimToken, outcome: "sent" },
      "two",
    ),
    /does not own/,
  );
  await call(ops, "complete", {
    id: message.id,
    claimToken: messageClaim.claimToken,
    outcome: "sent",
  });
  assert.equal(store.get("session_requests", message.id).state, "sent");
  const foreignMessage = queued.sends[0],
    processClaim = takeSessionRequest(store, input(foreignMessage), {
      executor: "process",
      consumer: "process-owner",
    });
  await assert.rejects(
    call(ops, "complete", {
      id: foreignMessage.id,
      claimToken: processClaim.claimToken,
      outcome: "sent",
      executor: "process",
    }),
    /does not own/,
  );
});

test("a version change fences stale starts, and a claim never expires from age", async (t) => {
  const { store, ops } = env(t),
    first = enqueueSessionRequests(store, { starts: [start()] }).starts[0],
    latest = enqueueSessionRequests(store, {
      starts: [start({ brief: "Updated synthetic work." })],
    }).starts[0];
  assert.equal(first.id, latest.id);
  assert.notEqual(first.version, latest.version);
  assert.equal(await call(ops, "take", input(first)), null);
  const taken = await call(ops, "take", input(latest));
  const row = store.get("session_requests", latest.id);
  store.put("session_requests", {
    ...row,
    claim: { ...row.claim, claimedAt: "1970-01-01T00:00:00Z" },
  });
  assert.equal(await call(ops, "take", input(latest), "two"), null);
  await assert.rejects(
    call(ops, "release", {
      id: latest.id,
      claimToken: taken.claimToken,
      reason: "quiet",
    }),
    /before opening/,
  );
  await call(ops, "release", {
    id: latest.id,
    claimToken: taken.claimToken,
    reason: "before-open",
  });
  assert.equal(store.get("session_requests", latest.id).state, "pending");
});

test("a successful binding accepts reordered context and replay cannot start it again", async (t) => {
  const { store, ops } = env(t),
    request = enqueueSessionRequests(store, {
      starts: [
        start({
          context: {
            spec: "synthetic",
            revisionHash: "h",
            nested: { left: 1, right: 2 },
          },
        }),
      ],
    }).starts[0],
    claim = await call(ops, "take", input(request));
  await ops.execute(
    "session.bind",
    {
      taskId: request.task,
      slot: "s",
      context: {
        nested: { right: 2, left: 1 },
        revisionHash: "h",
        spec: "synthetic",
      },
      role: request.role,
      source: "tick",
      executor: "kirocrew",
      model: request.model,
      permissionClass: request.permissionClass,
      requestId: request.id,
      claimToken: claim.claimToken,
    },
    undefined,
    context("one"),
  );
  assert.equal(store.get("session_requests", request.id).state, "bound");
  assert.equal(await call(ops, "take", input(request)), null);
  const again = enqueueSessionRequests(store, { starts: [start()] }).starts[0];
  assert.equal(again.id, request.id);
  assert.equal(await call(ops, "take", input(again)), null);
});

test("worker consumption rechecks prerequisites, owner approval and the approved hash", async (t) => {
  for (const mutate of [
    (store) =>
      store.mutate("add blocker", (data) => {
        data.tasks.push({ ...data.tasks[0], id: "blocker" });
        data.edges.push({
          from: "blocker",
          to: "sample-task",
          kind: "requires",
        });
      }),
    (store) =>
      store.put("plans", { ...store.get("plans", "p"), state: "draft" }),
    (store) =>
      store.put("plans", { ...store.get("plans", "p"), hash: "new-hash" }),
    (store) => store.put("drivers", { id: "p", state: "read-only" }),
  ]) {
    const { store, ops } = env(t);
    store.put("plans", { id: "p", state: "approved", hash: "approved-hash" });
    store.mutate("link synthetic plan", (data) => {
      data.tasks[0].planId = "p";
    });
    const request = enqueueSessionRequests(store, { starts: [start()] })
      .starts[0];
    mutate(store);
    assert.equal(await call(ops, "take", input(request)), null);
    assert.equal(store.get("session_requests", request.id).state, "canceled");
  }
  const { store, ops } = env(t),
    request = enqueueSessionRequests(store, { starts: [start()] }).starts[0];
  store.setMeta("unrelated-reading", { at: "now" });
  assert.ok(
    await call(ops, "take", input(request)),
    "unrelated writes do not invalidate a request",
  );
});

test("virtual review roles check round state, revision, model and write scope", async (t) => {
  for (const bad of [
    "round",
    "revision",
    "model",
    "approved",
    "deleted",
    null,
  ]) {
    const { store, ops } = env(t);
    store.put("plans", {
      id: "p",
      spec: "synthetic",
      state: bad === "approved" ? "approved" : "draft",
      hash: bad === "revision" ? "changed" : "h",
      ...(bad === "deleted" ? { deletedAt: "2026-01-01T00:00:00Z" } : {}),
    });
    store.put("review_rounds", {
      id: "r",
      planId: "p",
      spec: "synthetic",
      state: bad === "round" ? "done" : "running",
      revisionHash: "h",
      reviewerModel: "review-model",
    });
    const request = enqueueSessionRequests(store, {
      starts: [
        start({
          role: "plan-review",
          task: "r",
          model: bad === "model" ? "wrong" : "review-model",
          permissionClass: "read",
          context: { spec: "synthetic", revisionHash: "h", roundId: "r" },
        }),
      ],
    }).starts[0];
    const result = await call(ops, "take", input(request));
    assert.equal(Boolean(result), bad === null, bad ?? "current round");
  }
  const { store, ops } = env(t);
  store.put("plans", {
    id: "p",
    spec: "synthetic",
    state: "approved",
    hash: "h",
  });
  store.put("review_rounds", {
    id: "r",
    planId: "p",
    spec: "synthetic",
    state: "done",
    revisionHash: "h",
  });
  store.put("receipts", {
    id: "plan-answer:r",
    kind: "plan-answer",
    roundId: "r",
    planId: "p",
    state: "queued",
    slot: null,
  });
  store.put("review_threads", {
    id: "finding",
    source: "plan-review",
    roundId: "r",
  });
  const request = enqueueSessionRequests(store, {
    starts: [
      start({ role: "plan-answer", task: "r", context: { revisionHash: "h" } }),
    ],
  }).starts[0];
  assert.equal(
    await call(ops, "take", input(request)),
    null,
    "approved plans reject queued writes",
  );
});

test("native configuration stays outside planner objects and durable neutral rows", async (t) => {
  const { store } = env(t),
    request = kirocrewRequest(store, {
      ...start(),
      folder: "Avoozl/synthetic",
      project: false,
      agent: "synthetic-agent",
      mode: "trust_reads",
    });
  for (const field of ["folder", "project", "agent", "mode"])
    assert.equal(Object.hasOwn(request, field), false);
  persistKirocrewConfiguration(store, request);
  const queued = enqueueSessionRequests(store, { starts: [request] }).starts[0];
  assert.doesNotMatch(
    JSON.stringify(store.get("session_requests", queued.id)),
    /Avoozl\/synthetic|synthetic-agent|trust_reads/,
  );
});

test("request IDs cannot be reassigned to another executor or start target", (t) => {
  const { store } = env(t),
    request = start({ id: "fixed-start" });
  enqueueSessionRequests(store, { starts: [request] });
  for (const change of [
    { executor: "process" },
    { task: "another-task" },
    { role: "verifier" },
    { attempt: 2 },
  ])
    assert.throws(
      () =>
        enqueueSessionRequests(store, { starts: [{ ...request, ...change }] }),
      /cannot change/,
    );
  assert.equal(store.get("session_requests", request.id).executor, "kirocrew");
});

test("runner starts recheck their own state without requiring a local plan", async (t) => {
  for (const record of [
    { state: "starting" },
    { state: "working" },
    { state: "reported" },
    { state: "starting", worker: { slot: "old" } },
  ]) {
    const { store, ops } = env(t);
    store.setMeta("runner.tasks", { "remote-only": record });
    const request = enqueueSessionRequests(store, {
      starts: [
        start({
          task: "remote-only",
          remote: true,
          worktree: "/scratch/worktree",
        }),
      ],
    }).starts[0];
    const claim = await call(ops, "take", input(request));
    assert.equal(Boolean(claim), record.state === "starting" && !record.worker);
  }
  const { store, ops } = env(t);
  const request = enqueueSessionRequests(store, {
    starts: [start({ task: "missing-remote", remote: true })],
  }).starts[0];
  assert.equal(
    await call(ops, "take", input(request)),
    null,
    "remote flag alone does not bypass task readiness",
  );
});

test("later real ticks reoffer pending transport rows but never claimed or completed ones", async (t) => {
  const { store, ops } = env(t);
  const queued = enqueueSessionRequests(store, {
    starts: [start()],
    sends: [
      { executor: "kirocrew", slot: "s", text: "Recovered feedback" },
      { executor: "process", slot: "p", text: "Other executor" },
    ],
  });
  const tick = () =>
    ops.execute("workspace.tick", { cron: true, sessions: [] });
  const replay = await tick();
  assert.equal(
    replay.dispatch.some((request) => request.id === queued.starts[0].id),
    true,
  );
  assert.deepEqual(
    replay.messages.map((request) => request.id).sort(),
    queued.sends.map((request) => request.id).sort(),
  );
  await call(ops, "take", input(queued.starts[0]));
  const claim = await call(ops, "take", input(queued.sends[0]));
  await call(ops, "complete", {
    id: queued.sends[0].id,
    claimToken: claim.claimToken,
    outcome: "sent",
  });
  const again = await tick();
  assert.equal(
    again.dispatch.some((request) => request.id === queued.starts[0].id),
    false,
  );
  assert.deepEqual(
    again.messages.map((request) => request.id),
    [queued.sends[1].id],
  );
});

test("a pending write answer rebuilt as read consumes the read-only native agent", async (t) => {
  const { store, ops } = env(t);
  store.put("plans", { id: "p", state: "draft", hash: "h" });
  store.put("review_rounds", {
    id: "r",
    planId: "p",
    spec: "synthetic",
    state: "done",
    revisionHash: "h",
  });
  store.put("receipts", {
    id: "plan-answer:r",
    kind: "plan-answer",
    roundId: "r",
    planId: "p",
    state: "queued",
    slot: null,
  });
  store.put("review_threads", {
    id: "finding",
    source: "plan-review",
    roundId: "r",
  });
  const write = kirocrewRequest(store, {
    ...start({
      role: "plan-answer",
      task: "r",
      context: { revisionHash: "h" },
    }),
    folder: "Avoozl/answer",
    project: false,
  });
  const old = enqueueSessionRequests(store, { starts: [write] }).starts[0];
  persistKirocrewConfiguration(store, old);
  assert.equal(kirocrewConfiguration(store, old).agent, "avoozl-planner");
  store.put("plans", { ...store.get("plans", "p"), state: "approved" });
  const read = enqueueSessionRequests(store, {
    starts: [{ ...write, permissionClass: "read" }],
  }).starts[0];
  assert.equal(read.id, old.id);
  assert.notEqual(read.version, old.version);
  assert.equal(await call(ops, "take", input(old)), null);
  const claim = await call(ops, "take", input(read));
  assert.equal(claim.configuration.agent, "avoozl-plan-answer-read");
  assert.equal(claim.configuration.folder, "Avoozl/answer");
  assert.equal(claim.configuration.project, false);
  const changed = kirocrewRequest(store, {
    ...write,
    folder: "Avoozl/changed",
    agent: "other-agent",
  });
  persistKirocrewConfiguration(store, changed);
  const frozen = kirocrewConfiguration(store, changed);
  assert.equal(
    frozen.agent,
    "avoozl-plan-answer-read",
    "a claimed permission class stays frozen",
  );
  assert.equal(frozen.folder, "Avoozl/answer");
});

test("a planner that writes a workspace's specs opens in the Specs folder", (t) => {
  // Nearby inputs: a read-only answer, a worker with no repository, and a
  // planner whose folder has no project directory yet.
  const { store } = env(t);
  const [planner, answer, worker] = enqueueSessionRequests(store, {
    starts: [
      start({ role: "planner", task: "new-plan:x", worktree: "/ws" }),
      start({
        role: "plan-answer",
        task: "round-x",
        worktree: "/ws",
        permissionClass: "read",
      }),
      start({ worktree: "/ws" }),
    ],
  }).starts;
  const planned = kirocrewConfiguration(store, planner);
  assert.equal(planned.folder, "Avoozl/Specs");
  assert.equal(planned.project, undefined);
  assert.equal(kirocrewConfiguration(store, answer).project, false);
  assert.equal(kirocrewConfiguration(store, worker).project, false);
  const dispatches = [planner, worker];
  const [notice, ...rest] = kirocrewDispatches(store, dispatches, {
    "Avoozl/Specs": false,
  });
  assert.deepEqual(rest, []);
  assert.deepEqual(
    dispatches.map((d) => d.id),
    [worker.id],
  );
  assert.match(notice.resume, /set its project directory to \/ws\./);
});
