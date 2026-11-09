import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { CodexAdapter } from "../providers/codex.mjs";
import { ClaudeAdapter, claudeModels } from "../providers/claude.mjs";
import { RunManager } from "../manager.mjs";
import { fixture } from "./fixtures.mjs";

test("provider catalogs load without inference and selected models reach adapters", async (t) => {
  const { root } = fixture(t),
    script = path.join(root, "catalog.mjs");
  fs.writeFileSync(
    script,
    `import readline from 'node:readline';for await(const line of readline.createInterface({input:process.stdin})){const m=JSON.parse(line);if(m.method==='initialize')process.stdout.write(JSON.stringify({id:m.id,result:{}})+'\\n');else if(m.method==='model/list')process.stdout.write(JSON.stringify({id:m.id,result:{data:[{id:'chosen-model',displayName:'Chosen',isDefault:true}]}})+'\\n');else if(m.method&&m.method!=='initialized')throw Error('Unexpected inference call');}`,
  );
  const codex = new CodexAdapter({
    command: process.execPath,
    args: [script],
    emit: () => {},
    onRequest: () => {},
  });
  try {
    assert.equal(
      (await codex.start({ cwd: root, catalogOnly: true }))[0].id,
      "chosen-model",
    );
  } finally {
    await codex.close();
  }
  let closed = false;
  const models = await claudeModels({
    query: () => ({
      supportedModels: async () => [
        { value: "chosen-claude", displayName: "Chosen Claude" },
      ],
      close() {
        closed = true;
      },
    }),
  });
  assert.equal(models[0].id, "chosen-claude");
  assert.equal(closed, true);
  let captured;
  const adapter = new ClaudeAdapter({
    query: (options) => {
      captured = options;
      const q = (async function* () {})();
      q.close = () => {};
      return q;
    },
    emit: () => {},
    onRequest: () => {},
  });
  await adapter.start({ cwd: root, model: "chosen-claude", mode: "ask" });
  assert.equal(captured.options.model, "chosen-claude");
  await adapter.close();
});

test("Codex adapter handles the actual JSON-lines transport, steering, approval and interrupt", async (t) => {
  const { root } = fixture(t),
    script = path.join(root, "fake-codex.mjs");
  fs.writeFileSync(
    script,
    `import readline from 'node:readline';const send=m=>process.stdout.write(JSON.stringify(m)+'\\n');for await(const line of readline.createInterface({input:process.stdin})){const m=JSON.parse(line);if(m.method==='initialize')send({id:m.id,result:{}});else if(m.method==='thread/start'||m.method==='thread/resume')send({id:m.id,result:{thread:{id:'thread-test'}}});else if(m.method==='turn/start'){send({id:m.id,result:{turn:{id:'turn-test'}}});send({method:'turn/started',params:{turn:{id:'turn-test'}}});send({id:900,method:'item/commandExecution/requestApproval',params:{command:'node --test'}});}else if(m.method==='turn/steer')send({id:m.id,result:{turnId:'turn-test'}});else if(m.method==='turn/interrupt'){send({id:m.id,result:{}});send({method:'turn/completed',params:{turn:{id:'turn-test',status:'interrupted'}}});}else if(m.id===900){send({method:'item/agentMessage/delta',params:{delta:'Approved'}});}}`,
  );
  const events = [],
    requests = [],
    adapter = new CodexAdapter({
      command: process.execPath,
      args: [script],
      emit: (kind, body) => events.push({ kind, ...body }),
      onRequest: (r) => requests.push(r),
    });
  t.after(() => adapter.close());
  await adapter.start({ cwd: root, prompt: "Start", mode: "implement" });
  await delay(30);
  assert.equal(adapter.threadId, "thread-test");
  assert.equal(requests[0].kind, "approval");
  assert.equal(
    (await adapter.send("Focus tests", "steer")).turnId,
    "turn-test",
  );
  await adapter.answer({ providerRequestId: "900", decision: "allow" });
  await adapter.interrupt();
  await delay(30);
  assert.ok(
    events.some((e) => e.kind === "message.delta" && e.text === "Approved"),
  );
  assert.ok(
    events.some(
      (e) => e.kind === "turn.completed" && e.state === "interrupted",
    ),
  );
});
test("Claude adapter uses SDK streaming input, permission callbacks, interruption and resume", async (t) => {
  const { root } = fixture(t),
    events = [],
    requests = [];
  let captured,
    permission,
    inputReceived = false,
    finish;
  const query = (options) => {
    captured = options;
    const iterator = (async function* () {
      yield { type: "system", subtype: "init", session_id: "claude-test" };
      const first = await options.prompt[Symbol.asyncIterator]().next();
      inputReceived = first.value.message.content === "Start";
      permission = options.options.canUseTool(
        "Bash",
        { command: "node --test" },
        {
          requestId: "permission-test",
          toolUseID: "tool-test",
          signal: new AbortController().signal,
        },
      );
      yield {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Working" },
        },
      };
      await new Promise((resolve) => {
        finish = resolve;
      });
      yield { type: "result", is_error: false, result: "Done" };
    })();
    iterator.interrupt = async () => finish();
    iterator.close = () => finish?.();
    return iterator;
  };
  const adapter = new ClaudeAdapter({
    query,
    emit: (kind, body) => events.push({ kind, ...body }),
    onRequest: (r) => requests.push(r),
  });
  t.after(() => adapter.close());
  await adapter.start({
    cwd: root,
    prompt: "Start",
    resumeId: "previous-session",
    mode: "implement",
  });
  await delay(20);
  assert.equal(inputReceived, true);
  assert.equal(captured.options.resume, "previous-session");
  assert.equal(requests[0].providerRequestId, "permission-test");
  await adapter.answer({
    providerRequestId: "permission-test",
    decision: "deny",
  });
  assert.equal((await permission).behavior, "deny");
  await adapter.interrupt();
  await delay(20);
  assert.ok(events.some((e) => e.state === "interrupted"));
  assert.ok(events.some((e) => e.text === "Working"));
});
test("follow-ups are idempotent, queued in order, and uncertain sends are not automatically replayed", async (t) => {
  const { store } = fixture(t),
    sent = [];
  let manager;
  const adapter = {
    async send(text) {
      sent.push(text);
      return { turnId: "next" };
    },
    async close() {},
    async interrupt() {},
  };
  manager = new RunManager(store, { recover: false });
  t.after(() => manager.close());
  store.put("runs", {
    id: "run-delivery",
    taskId: "sample-task",
    provider: "codex",
    state: "running",
  });
  manager.live.set("run-delivery", adapter);
  const first = {
    id: "run-delivery",
    text: "First",
    mode: "queue",
    submissionId: "message-first",
  };
  assert.equal((await manager.send(first)).state, "queued");
  assert.equal((await manager.send(first)).state, "queued");
  assert.equal(sent.length, 0);
  await manager.send({
    id: "run-delivery",
    text: "Second",
    mode: "queue",
    submissionId: "message-second",
  });
  manager.receive("run-delivery", "turn.completed", { state: "completed" });
  await delay(20);
  assert.deepEqual(sent, ["First"]);
  manager.receive("run-delivery", "turn.completed", { state: "completed" });
  await delay(20);
  assert.deepEqual(sent, ["First", "Second"]);
  adapter.send = async () => {
    throw Error("Connection lost after write");
  };
  const uncertain = await manager.send({
    id: "run-delivery",
    text: "Third",
    mode: "steer",
    submissionId: "message-third",
  });
  assert.equal(uncertain.state, "uncertain");
  assert.equal(
    (
      await manager.send({
        id: "run-delivery",
        text: "Third",
        mode: "steer",
        submissionId: "message-third",
      })
    ).state,
    "uncertain",
  );
  await assert.rejects(
    manager.send({ ...first, text: "Different" }),
    /belongs to another/,
  );
});
