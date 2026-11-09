import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";
import { ExternalSessions } from "../external-sessions.mjs";
import { taskSession } from "../../workbench-model.mjs";
import { RunManager } from "../manager.mjs";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const session = "df54699e-26df-598b-806e-51b4996e9038";
async function setup(t) {
  const { store, root } = fixture(t);
  store.put("projects", { id: "fixture", root });
  let reads = 0,
    stamp = 1,
    all = Array.from({ length: 1250 }, (_, i) => ({
      uuid: "message-" + i,
      type: i % 2 ? "assistant" : "user",
      message: {
        content: [
          { type: "text", text: "Message " + i },
          { type: "tool_use", name: "Read", input: { file: "fixture.nupp" } },
        ],
      },
    }));
  const sdk = {
    async getSessionInfo(id) {
      return id === session
        ? {
            sessionId: session,
            cwd: root,
            summary: "Existing worker",
            lastModified: stamp,
            fileSize: 100,
          }
        : undefined;
    },
    async listSessions() {
      return [
        {
          sessionId: session,
          cwd: root,
          summary: "Existing worker",
          lastModified: stamp,
        },
      ];
    },
    async listSubagents() {
      return ["worker-1"];
    },
    async getSessionMessages(id, { offset = 0, limit } = {}) {
      reads++;
      return all.slice(
        offset,
        limit === undefined ? undefined : offset + limit,
      );
    },
    async getSubagentMessages(id, agent, options) {
      assert.equal(agent, "worker-1");
      return this.getSessionMessages(id, options);
    },
  };
  const externalSessions = new ExternalSessions(store, { sdk }),
    ops = new Operations(store, { externalSessions }),
    claim = await ops.execute("activity", {
      id: "sample-task",
      action: "start",
      owner: "External Claude",
      sessionId: "old-nickname",
      worktree: root,
    });
  const input = {
    taskId: "sample-task",
    leaseId: claim.activity.leaseId,
    provider: "claude",
    providerSessionId: session,
  };
  return {
    store,
    ops,
    externalSessions,
    input,
    sdk,
    reads: () => reads,
    append() {
      all.push({
        uuid: "latest",
        type: "assistant",
        message: { content: "New result" },
      });
      stamp++;
    },
  };
}
test("registering an external session preserves its ownership lease, is idempotent and survives recovery", async (t) => {
  const { store, ops, input } = await setup(t),
    before = structuredClone(store.read().tasks[0].activity),
    run = await ops.execute("session.register", input),
    again = await ops.execute("session.register", input);
  assert.equal(run.id, again.id);
  assert.equal(store.list("runs").length, 1);
  assert.equal(run.capabilities.transcript, true);
  assert.equal(run.capabilities.resume, false);
  assert.equal(run.machine, store.read().tasks[0].activity.connection.machine);
  const activity = store.read().tasks[0].activity;
  for (const key of Object.keys(before))
    assert.deepEqual(activity[key], before[key]);
  assert.equal(
    taskSession(
      await ops.execute("task.sessions", { id: "sample-task" }),
      store.read().tasks[0],
    ).id,
    run.id,
  );
  const manager = new RunManager(store);
  t.after(() => manager.close());
  assert.equal(store.get("runs", run.id).state, "observing");
  assert.equal(manager.live.size, 0);
  await ops.execute("activity", {
    id: "sample-task",
    action: "finish",
    leaseId: input.leaseId,
  });
  await ops.execute("activity", {
    id: "sample-task",
    action: "start",
    owner: "New worker",
    sessionId: "new-session",
  });
  assert.deepEqual(
    await ops.execute("task.sessions", { id: "sample-task" }),
    [],
    "A new lease must not inherit the old transcript.",
  );
});
test("external transcripts page newest first, retain user/tool content, cache unchanged files and refresh additions", async (t) => {
  const s = await setup(t),
    run = await s.ops.execute("session.register", s.input),
    latest = await s.ops.execute("run.get", { id: run.id, limit: 80 });
  assert.equal(latest.events.length, 80);
  assert.equal(latest.events[0].text, "Message 1170");
  assert.equal(latest.events.at(-1).seq, 1250);
  assert.equal(latest.events[0].role, "user");
  assert.equal(latest.events[0].tools[0].tool, "Read");
  assert.equal(latest.hasEarlier, true);
  await s.ops.execute("run.get", { id: run.id, limit: 80 });
  assert.equal(s.reads(), 1, "Idle transcript must not be reparsed.");
  const earlier = await s.ops.execute("run.get", {
    id: run.id,
    before: latest.events[0].seq,
    limit: 80,
  });
  assert.equal(earlier.events.at(-1).text, "Message 1169");
  const oldest = await s.ops.execute("run.get", {
    id: run.id,
    before: 81,
    limit: 80,
  });
  assert.equal(oldest.events[0].text, "Message 0");
  assert.equal(oldest.hasEarlier, false);
  s.append();
  const next = await s.ops.execute("run.get", { id: run.id, after: 1250 });
  assert.equal(next.events.length, 1);
  assert.equal(next.events[0].text, "New result");
  assert.equal(
    s.store.events({ runId: run.id }).length,
    1,
    "Transcript content stays in provider storage.",
  );
});
test("registration validates real identity, machine, project and subagent without stealing work", async (t) => {
  const { ops, input, sdk } = await setup(t);
  await assert.rejects(
    ops.execute("session.register", { ...input, leaseId: "someone-else" }),
    /lease changed/,
  );
  await assert.rejects(
    ops.execute("session.register", {
      ...input,
      providerSessionId: "worker-nickname",
    }),
    /UUID/,
  );
  await assert.rejects(
    ops.execute("session.register", {
      ...input,
      providerSessionId: "aa54699e-26df-598b-806e-51b4996e9038",
    }),
    /not found/,
  );
  await assert.rejects(
    ops.execute("session.register", { ...input, machine: "elsewhere" }),
    /another machine/,
  );
  await assert.rejects(
    ops.execute("session.register", { ...input, agentId: "../escape" }),
    /Invalid/,
  );
  await assert.rejects(
    ops.execute("session.register", { ...input, agentId: "missing" }),
    /Subagent transcript not found/,
  );
  const child = await ops.execute("session.register", {
    ...input,
    agentId: "worker-1",
  });
  assert.equal(child.parentSessionId, session);
  assert.equal(
    (await ops.execute("run.get", { id: child.id, limit: 2 })).events.length,
    2,
  );
  sdk.getSessionInfo = async () => ({ cwd: "/unrelated-project" });
  await assert.rejects(ops.execute("session.register", input), /not found/);
});
test("external transcript controls fail before forwarding to a manager or launching duplicate agents", async (t) => {
  const { store, ops, input, externalSessions } = await setup(t),
    run = await ops.execute("session.register", input);
  let forwarded = 0;
  const guarded = new Operations(store, {
    externalSessions,
    manager: {
      remote: true,
      command() {
        forwarded++;
        throw Error("must not launch");
      },
    },
  });
  for (const operation of [
    "run.send",
    "run.resume",
    "run.interrupt",
    "run.validate",
  ])
    await assert.rejects(
      guarded.execute(operation, {
        id: run.id,
        text: "Continue",
        submissionId: "no-duplicate",
      }),
      /read-only external transcript/,
    );
  store.put("requests", {
    id: "external-question",
    runId: run.id,
    state: "pending",
  });
  await assert.rejects(
    guarded.execute("run.answer", {
      id: "external-question",
      decision: "allow",
    }),
    /read-only external transcript/,
  );
  assert.equal(forwarded, 0);
  assert.equal(store.list("deliveries").length, 0);
});
test("session discovery returns bounded project metadata and explicit parent/subagent choices", async (t) => {
  const { ops } = await setup(t),
    page = await ops.execute("session.discover", { taskId: "sample-task" });
  assert.equal(page.items[0].providerSessionId, session);
  assert.equal(page.items[0].provider, "claude");
  assert.equal(page.items[0].messages, undefined);
  assert.deepEqual(
    (
      await ops.execute("session.discover", {
        taskId: "sample-task",
        providerSessionId: session,
      })
    ).subagents,
    ["worker-1"],
  );
});
test("registration rechecks the lease after asynchronous provider verification", async (t) => {
  const { ops, input, sdk } = await setup(t),
    original = sdk.getSessionInfo;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  sdk.getSessionInfo = async (id) => {
    await gate;
    return original(id);
  };
  const pending = ops.execute("session.register", input);
  await ops.execute("activity", {
    id: input.taskId,
    action: "finish",
    leaseId: input.leaseId,
  });
  await ops.execute("activity", {
    id: input.taskId,
    action: "start",
    owner: "Replacement",
    sessionId: "new-owner",
  });
  release();
  await assert.rejects(pending, /lease changed/);
});
test("launcher hook registers real parent and child identities and does not block a worker when unavailable", async (t) => {
  const { ops, input, store } = await setup(t),
    server = http.createServer(async (req, res) => {
      let text = "";
      for await (const chunk of req) text += chunk;
      try {
        const { operation, input } = JSON.parse(text);
        res.end(
          JSON.stringify({ result: await ops.execute(operation, input) }),
        );
      } catch (error) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const invoke = (lease = input.leaseId) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("../cli.mjs", import.meta.url)),
          "session-hook",
          "--task",
          input.taskId,
          "--lease",
          lease,
          "--url",
          "http://127.0.0.1:" + server.address().port,
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      let out = "",
        err = "";
      child.stdout.on("data", (s) => (out += s));
      child.stderr.on("data", (s) => (err += s));
      child.on("error", reject);
      child.on("exit", (code) => resolve({ code, out, err }));
      child.stdin.end(
        JSON.stringify({
          session_id: session,
          agent_id: "worker-1",
          cwd: "/ignored",
          unrelated: "must not be registered",
        }),
      );
    });
  const good = await invoke();
  assert.equal(good.code, 0);
  assert.equal(good.err, "");
  assert.equal(good.out, "");
  assert.equal(store.list("runs")[0].agentId, "worker-1");
  const revision = store.read().revision;
  await invoke();
  assert.equal(
    store.read().revision,
    revision,
    "Repeated hook registration does not churn task revisions.",
  );
  const stale = await invoke("old-lease");
  assert.equal(stale.code, 0);
  assert.match(stale.err, /lease changed/);
  assert.equal(store.list("runs").length, 1);
});
