// A retro's chat and why it failed: the chat is recorded when it starts, the
// failure names what became of it, a paused tick does not fail a retro, the
// Retros page can link the chat, and a failed retro can run again.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  RETRO_TICK_CAP_MS,
  recordRetroReply,
  retroStep,
  runRetroAgain,
} from "../flow-retro.mjs";
import { withRetroChats } from "../retro-chat.mjs";
import {
  bindSession,
  recordSessionStatus,
} from "../../sessions/session-bindings.mjs";
import { Store } from "../../store/store.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const START = Date.parse("2026-11-16T07:04:00Z");
const MINUTE = 60_000;

function setup(t) {
  const root = temporaryDirectory("avoozl-retro-chat-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  store.put("flow_retros", {
    id: "retro-1",
    n: 1,
    state: "running",
    triggers: [
      { kind: "count", key: "count:10", detail: "10 tasks", at: "x" },
      { kind: "slow", key: "slow:a", detail: "slow", waitsForCount: true },
    ],
    startedAt: new Date(START).toISOString(),
    proposals: [],
    dropped: [],
  });
  return { root, store };
}

const bind = (store, extra = {}) =>
  bindSession(store, {
    taskId: "retro-1",
    slot: "avoozl_retro_1",
    role: "retro",
    ...extra,
  }).binding;

// Tick every minute until `minutes` have passed.
function tickFor(store, minutes) {
  for (let m = 1; m <= minutes; m++)
    retroStep(store, {}, { now: START + m * MINUTE });
  return store.get("flow_retros", "retro-1");
}

test("binding a retro's session records it on the retro at once", (t) => {
  const { store } = setup(t);
  const binding = bind(store);
  assert.deepEqual(store.get("flow_retros", "retro-1").session, {
    slot: "avoozl_retro_1",
    executor: "kirocrew",
    boundAt: binding.boundAt,
  });
});

test("a failed retro says what became of its chat and how long it waited", (t) => {
  const kinds = {
    "never-started": [null, /^the chat never started.* 11 minutes/],
    "no-reply": [
      "idle",
      /^the chat started but never replied \(waited 11 minutes\)/,
    ],
    lost: [
      "gone",
      /^the chat was lost: Kiro Crew no longer lists it \(waited 11/,
    ],
    timeout: [
      "working",
      /^timed out: the chat was still working after 11 minutes/,
    ],
  };
  for (const [kind, [status, pattern]] of Object.entries(kinds)) {
    const { store } = setup(t);
    if (status) {
      bind(store);
      recordSessionStatus(store, { slot: "avoozl_retro_1", status });
    }
    const retro = tickFor(store, 11);
    assert.equal(retro.state, "failed", kind);
    assert.equal(retro.failure, kind);
    assert.match(retro.error, pattern, kind);
    assert.equal(retro.waitedMs, 11 * MINUTE);
  }
});

test("a tick that resumes after a long pause does not fail a retro that was never given the time", (t) => {
  const { store } = setup(t);
  bind(store);
  recordSessionStatus(store, { slot: "avoozl_retro_1", status: "idle" });
  retroStep(store, {}, { now: START + MINUTE });
  // Nineteen hours later: the first tick back counts one cap, not the gap.
  const back = START + 19 * 60 * MINUTE;
  retroStep(store, {}, { now: back });
  const waiting = store.get("flow_retros", "retro-1");
  assert.equal(waiting.state, "running");
  assert.equal(waiting.waitedMs, MINUTE + RETRO_TICK_CAP_MS);
  // The session's reply, read after the resume, is still taken.
  const reply = JSON.stringify({
    bottleneck: {
      stage: "queued",
      repository: null,
      evidence: "queued is slow",
    },
    proposals: [],
  });
  const answered = recordRetroReply(store, "retro-1", reply).retro;
  assert.equal(answered.state, "done", answered.error);
});

test("the Retros page links the chat, and an older retro says none was recorded", (t) => {
  const { root, store } = setup(t);
  store.put("flow_retros", {
    id: "retro-0",
    n: 0,
    state: "failed",
    triggers: [],
    startedAt: new Date(START - 1000).toISOString(),
    proposals: [],
  });
  bind(store);
  const [first, old] = withRetroChats(
    store,
    store.list("flow_retros").sort((a, b) => (a.id < b.id ? 1 : -1)),
    { stateDirectory: path.join(root, "none") },
  );
  assert.equal(first.chat.link, "/chat?sid=avoozl_retro_1");
  assert.equal(first.chat.executor, "kirocrew");
  assert.equal(old.chat, null);
});

test("a process retro has no chat link; it keeps its executor and harness", (t) => {
  const { root, store } = setup(t);
  store.put("flow_retros", {
    ...store.get("flow_retros", "retro-1"),
    session: { slot: "process-1", executor: "process", harness: "claude" },
  });
  const [retro] = withRetroChats(store, store.list("flow_retros"), {
    stateDirectory: path.join(root, "none"),
  });
  assert.deepEqual(
    [retro.chat.link, retro.chat.executor, retro.chat.harness],
    [null, "process", "claude"],
  );
});

test("run again queues the failed retro's triggers for the next tick", (t) => {
  const { store } = setup(t);
  assert.throws(() => runRetroAgain(store, "retro-1"), /failed retro/);
  store.put("flow_retros", {
    ...store.get("flow_retros", "retro-1"),
    state: "failed",
  });
  runRetroAgain(store, "retro-1");
  runRetroAgain(store, "retro-1");
  const { pending } = store.getMeta("flow.retro.state");
  assert.deepEqual(
    pending.map((p) => [p.kind, p.waitsForCount]),
    [
      ["count", undefined],
      ["slow", undefined],
    ],
  );
});
