import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";
import { RunManager } from "../manager.mjs";
import { createPlan, approvePlan } from "../plans.mjs";
import { runPage, planPage, viewSnapshot } from "../views.mjs";

test("Ask acknowledges a conversation before the provider connects and retries retain the original context", async (t) => {
  const { store, root } = fixture(t);
  store.put("projects", {
    id: "fixture",
    root,
    baseBranch: "main",
    worktreeRoot: root + "/worktrees",
    checks: [],
  });
  let release,
    starts = 0;
  const gate = new Promise((resolve) => (release = resolve)),
    manager = new RunManager(store, {
      factories: {
        codex: ({ emit }) => ({
          async start() {
            starts++;
            await gate;
            emit("session", { providerSessionId: "saved-thread" });
          },
          async close() {},
        }),
      },
    });
  t.after(() => manager.close());
  const ops = new Operations(store, { manager }),
    input = {
      action: "ask",
      prompt: "What needs my decision?",
      submissionId: "question-1",
      provider: "codex",
      projectId: "fixture",
      context: { view: "tasks", q: "status:blocked" },
    };
  const first = await ops.execute("intent.submit", input);
  assert.equal(first.run.mode, "ask");
  assert.equal(first.run.state, "starting");
  assert.equal(store.list("plans").length, 0);
  assert.equal(store.read().tasks.length, 1);
  assert.equal(first.run.readOnly, true);
  assert.equal(first.run.worktree, root);
  const retry = await ops.execute("intent.submit", {
    ...input,
    context: { selected: "sample-task", view: "graph" },
  });
  assert.equal(retry.run.id, first.run.id);
  assert.equal(starts, 1);
  assert.equal(retry.run.context.view, "tasks");
  const afterWebReload = await new Operations(store, { manager }).execute(
    "intent.submit",
    input,
  );
  assert.equal(afterWebReload.run.id, first.run.id);
  assert.equal(starts, 1);
  await assert.rejects(
    ops.execute("intent.submit", { ...input, prompt: "A different question" }),
    /different message/,
  );
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    store.get("runs", first.run.id).providerSessionId,
    "saved-thread",
  );
});
test("conversation history starts at the latest events and pages backward without gaps", async (t) => {
  const { store } = fixture(t);
  store.put("runs", {
    id: "run-history",
    taskId: "conversation:history",
    mode: "ask",
    state: "completed",
    prompt: "Original question",
  });
  for (let i = 0; i < 1200; i++)
    store.event("run-history", "message", { text: "Message " + i });
  const ops = new Operations(store),
    recent = await ops.execute("run.get", { id: "run-history", limit: 80 });
  assert.equal(recent.events.length, 80);
  assert.equal(recent.events.at(-1).text, "Message 1199");
  assert.equal(recent.hasEarlier, true);
  const earlier = await ops.execute("run.get", {
    id: "run-history",
    before: recent.events[0].seq,
    limit: 80,
  });
  assert.equal(earlier.events.at(-1).seq, recent.events[0].seq - 1);
  assert.equal(earlier.events[0].text, "Message 1040");
});
test("workspace lists bound session payloads and exclude conversations from the plan library", async (t) => {
  const { store } = fixture(t);
  const question = createPlan(store, {
    prompt: "Question",
    text: "# Question",
    kind: "conversation",
  });
  assert.equal(planPage(store).total, 0);
  assert.throws(
    () =>
      approvePlan(store, {
        id: question.id,
        expectedHash: question.hash,
        expectedRevision: store.read().revision,
        approvedBy: "User",
        evidence: "Not a plan",
      }),
    /conversation is not a plan/,
  );
  for (let i = 0; i < 80; i++)
    store.put("runs", {
      id: "run-" + i,
      taskId: "sample-task",
      state: "completed",
      mode: "ask",
      provider: "codex",
      prompt: "A question " + i + "x".repeat(20000),
      createdAt: new Date(i * 1000).toISOString(),
    });
  const page = runPage(store, { limit: 12 });
  assert.equal(page.items.length, 12);
  assert.equal(page.total, 80);
  assert(JSON.stringify(page).length < 8000);
  assert.equal(page.items[0].id, "run-79");
  const data = store.read();
  data.documents.large = { id: "large", text: "x".repeat(100000), hash: "abc" };
  const view = viewSnapshot(data);
  assert.equal(view.documents.large.text, undefined);
  assert.equal(data.documents.large.text.length, 100000);
});
test("a follow-up resumes the saved provider session without an extra turn or duplicate delivery", async (t) => {
  const { store, root } = fixture(t);
  store.put("runs", {
    id: "run-saved-chat",
    taskId: "conversation:saved",
    mode: "ask",
    provider: "codex",
    providerSessionId: "thread-saved",
    state: "completed",
    worktree: root,
    prompt: "Original question",
  });
  let connected,
    deliveries = 0;
  const manager = new RunManager(store, {
    factories: {
      codex: () => ({
        async start(options) {
          connected = options;
        },
        async send(text) {
          deliveries++;
          assert.equal(text, "Follow up");
          return { turnId: "follow-up" };
        },
        async close() {},
      }),
    },
  });
  t.after(() => manager.close());
  const input = {
    id: "run-saved-chat",
    text: "Follow up",
    submissionId: "message-saved",
    mode: "queue",
  };
  const delivery = await manager.send(input);
  assert.equal(delivery.state, "accepted");
  assert.equal(connected.resumeId, "thread-saved");
  assert.equal(connected.prompt, undefined);
  await manager.send(input);
  assert.equal(deliveries, 1);
});
test("Now resolves task sessions independently of the bounded workspace history", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  store.put("runs", {
    id: "run-original",
    taskId: "sample-task",
    state: "completed",
    mode: "implement",
    prompt: "Old task run",
  });
  for (let i = 0; i < 60; i++)
    store.put("runs", {
      id: "run-other-" + i,
      taskId: "other-task",
      state: "running",
      mode: "implement",
      prompt: "Other task run",
      createdAt: new Date((i + 1) * 1000).toISOString(),
    });
  assert.equal(
    (await ops.execute("task.sessions", { id: "sample-task" })).length,
    0,
    "Old completed work is not a current external session.",
  );
  store.put("runs", {
    id: "run-current",
    taskId: "sample-task",
    state: "running",
    mode: "implement",
    prompt: "x".repeat(100000),
    createdAt: new Date(0).toISOString(),
  });
  const active = await ops.execute("task.sessions", { id: "sample-task" });
  assert.deepEqual(
    active.map((r) => r.id),
    ["run-current"],
  );
  assert(JSON.stringify(active).length < 1000);
  assert.equal(
    runPage(store).items.some((r) => r.id === "run-current"),
    false,
    "Resolution must not rely on the first page.",
  );
  await ops.execute("activity", {
    id: "sample-task",
    action: "start",
    owner: "Fixture agent",
    sessionId: "saved-provider-thread",
  });
  store.put("runs", {
    id: "run-linked",
    taskId: "sample-task",
    providerSessionId: "saved-provider-thread",
    state: "completed",
    mode: "implement",
    prompt: "Linked task run",
  });
  assert.deepEqual(
    (await ops.execute("task.sessions", { id: "sample-task" })).map(
      (r) => r.id,
    ),
    ["run-linked", "run-current"],
  );
  store.put("runs", { ...store.get("runs", "run-linked"), deletedAt: "now" });
  assert.deepEqual(
    (await ops.execute("task.sessions", { id: "sample-task" })).map(
      (r) => r.id,
    ),
    ["run-current"],
  );
  await assert.rejects(
    ops.execute("task.sessions", { id: "missing" }),
    /Task not found/,
  );
});

test("archiving is reversible, persists independently of run updates, and retains the transcript", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    run = {
      id: "archive-chat",
      taskId: "sample-task",
      state: "completed",
      mode: "ask",
      prompt: "Keep this question",
      updatedAt: "original",
    };
  store.put("runs", run);
  store.event(run.id, "message", { text: "Keep this answer" });
  const archived = await ops.execute("run.archive", { id: run.id });
  assert.ok(archived.archivedAt);
  assert.equal(
    (await ops.execute("run.archive", { id: run.id })).archivedAt,
    archived.archivedAt,
    "Archive retries retain the first timestamp.",
  );
  assert.equal(
    store.events({ runId: run.id }).filter((e) => e.kind === "run.archive")
      .length,
    1,
  );
  assert.equal(runPage(store).total, 0);
  assert.equal(runPage(store, { archived: true }).total, 1);
  assert.equal(runPage(store, { archived: "all" }).total, 1);
  assert.equal(
    runPage(store, { archived: true }).items[0].archivedAt,
    archived.archivedAt,
  );
  store.put("runs", {
    ...run,
    state: "completed",
    updatedAt: "later provider update",
  });
  const reload = new Operations(store),
    detail = await reload.execute("run.get", { id: run.id });
  assert.equal(detail.archivedAt, archived.archivedAt);
  assert.equal(detail.events[0].text, "Keep this answer");
  assert.equal((await reload.execute("run.list")).total, 0);
  await reload.execute("run.unarchive", { id: run.id });
  assert.equal(
    (await reload.execute("run.get", { id: run.id })).archivedAt,
    null,
  );
  assert.equal(runPage(store).total, 1);
  assert.equal(runPage(store, { archived: true }).total, 0);
  assert.equal(store.get("runs", run.id).state, "completed");
});
test("archiving active and external conversations does not hide ongoing work or affect agents", async (t) => {
  const { store } = fixture(t),
    manager = {
      remote: true,
      command() {
        throw Error("Archiving must not call the agent manager");
      },
    },
    ops = new Operations(store, { manager: null });
  for (const [id, state] of [
    ["live", "waiting-input"],
    ["external", "observing"],
  ]) {
    store.put("runs", { id, taskId: "sample-task", state, mode: "ask" });
    await ops.execute("run.archive", { id });
    assert.equal(store.get("runs", id).state, state);
  }
  const active = await ops.execute("task.sessions", { id: "sample-task" });
  assert.ok(
    active.some((r) => r.id === "live"),
    "Task session resolution still finds archived live work.",
  );
  assert.equal(runPage(store, { archived: true, limit: 1 }).items.length, 1);
  assert.equal(runPage(store, { archived: true, limit: 1 }).total, 2);
  assert.equal(
    (await ops.execute("workspace")).runs.length,
    2,
    "Workspace activity retains archived sessions.",
  );
  ops.manager = manager;
  await ops.execute("run.unarchive", { id: "live" });
  assert.equal(store.get("runs", "live").state, "waiting-input");
});
test("archives exclude trash and return useful errors for missing conversations", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  store.put("runs", {
    id: "deleted-chat",
    state: "completed",
    taskId: "sample-task",
  });
  await ops.execute("run.archive", { id: "deleted-chat" });
  await ops.execute("run.delete", { id: "deleted-chat" });
  assert.equal(runPage(store, { archived: true }).total, 0);
  await assert.rejects(
    ops.execute("run.archive", { id: "deleted-chat" }),
    /not found/,
  );
  await assert.rejects(
    ops.execute("run.unarchive", { id: "missing" }),
    /not found/,
  );
  await ops.execute("run.restore", { id: "deleted-chat" });
  assert.equal(runPage(store).total, 0);
  assert.equal(runPage(store, { archived: true }).total, 1);
});

test("external landing metadata remains separate from acceptance and workspace receipts stay bounded", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    at = new Date(Date.now() - 1000).toISOString(),
    integration = {
      commit: "abcdef0123456789",
      at,
      repo: "/fixture/repo",
      branch: "main",
      evidence: ["evidence/landing.json"],
    };
  await ops.execute("task.update", { id: "sample-task", integration });
  const task = store.read().tasks[0];
  assert.equal(task.integration.commit, integration.commit);
  assert.equal(task.status, "planned");
  assert.equal(task.acceptanceEvidence, undefined);
  assert.ok(task.integration.recordedAt);
  assert.ok(task.evidence.includes("evidence/landing.json"));
  for (const invalid of [
    { ...integration, commit: 1234567 },
    { ...integration, evidence: [] },
    { ...integration, at: "tomorrow" },
    { ...integration, repo: "" },
  ])
    await assert.rejects(
      ops.execute("task.update", { id: "sample-task", integration: invalid }),
      /Integration requires/,
    );
  assert.equal(
    store.read().tasks[0].integration.commit,
    integration.commit,
    "Invalid writes roll back.",
  );
  for (let i = 0; i < 110; i++)
    store.put("integration", {
      id: "landing-" + i,
      taskId: "sample-task",
      state: "integrated",
      integratedCommit: "abcdef0",
      integratedAt: new Date(i * 1000).toISOString(),
      evidenceIds: ["x".repeat(100000)],
    });
  store.put("integration", {
    id: "not-landed",
    taskId: "sample-task",
    state: "ready",
    commit: "abcdef0",
  });
  const workspace = await ops.execute("workspace");
  assert.equal(workspace.recentIntegrations.length, 100);
  assert.equal(workspace.recentIntegrations[0].id, "landing-109");
  assert.equal(workspace.recentIntegrations[0].evidenceIds, undefined);
  assert.ok(JSON.stringify(workspace.recentIntegrations).length < 30000);
  assert.equal(workspace.integrations.length, 1);
});
