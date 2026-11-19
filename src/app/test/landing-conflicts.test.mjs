import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import {
  DEFAULT_CONFLICT_ROUNDS,
  conflictMessage,
  sendConflictBack,
} from "../landing-conflicts.mjs";

const SHA = "a".repeat(40);

function setup(t, { chat = true } = {}) {
  const { store } = fixture(t);
  store.put("task_deliveries", {
    id: "t1",
    taskId: "t1",
    state: "verified",
    commit: SHA,
    attempts: [],
  });
  if (chat)
    store.put("session_bindings", {
      id: "slot-1",
      slot: "slot-1",
      taskId: "t1",
      role: "worker",
      attempt: 1,
      status: "working",
    });
  return store;
}

const conflict = (files = ["src/a.mjs", "docs/b.md"]) => ({
  state: "conflict",
  entry: {
    key: "spec.aaaa",
    base: "main",
    baseHead: "b".repeat(40),
    tasks: [{ task: "t1", definition: "d".repeat(64) }],
    files,
  },
});

test("a repository that sets no conflicts.maxAttempts gets 2 rounds", () => {
  assert.equal(DEFAULT_CONFLICT_ROUNDS, 2);
});

test("a conflict goes to the same chat with the file list, twice, then Needs you", (t) => {
  const store = setup(t);
  for (const round of [1, 2]) {
    const out = sendConflictBack(store, conflict());
    assert.equal(out.notify.length, 0);
    assert.equal(out.messages.length, 1);
    assert.equal(out.messages[0].slot, "slot-1");
    assert.match(out.messages[0].text, new RegExp(`round ${round} of 2`));
    assert.match(out.messages[0].text, /src\/a\.mjs\ndocs\/b\.md/);
    assert.equal(store.get("task_deliveries", "t1").state, "running");
  }
  const last = sendConflictBack(store, conflict());
  assert.equal(last.messages.length, 0);
  assert.equal(last.notify.length, 1);
  assert.equal(last.notify[0].channel, "decision");
  const delivery = store.get("task_deliveries", "t1");
  assert.equal(delivery.state, "decision");
  assert.equal(delivery.landingConflicts.length, 2);
});

test("zero rounds, or a gone chat, goes straight to Needs you", (t) => {
  const store = setup(t);
  const out = sendConflictBack(store, conflict(), { rounds: 0 });
  assert.equal(out.messages.length, 0);
  assert.equal(out.notify.length, 1);
  const none = setup(t, { chat: false });
  const gone = sendConflictBack(none, conflict());
  assert.equal(gone.messages.length, 0);
  assert.match(gone.notify[0].text, /worker chat is gone/);
});

test("only a conflict result is accepted, and long file lists are cut", () => {
  assert.throws(() => sendConflictBack(null, { state: "failed" }), /conflict/);
  const files = Array.from({ length: 60 }, (_, i) => `f${i}`);
  const text = conflictMessage("t1", {
    files,
    base: "main",
    round: 1,
    rounds: 2,
  });
  assert.match(text, /\.\.\. and 10 more/);
  assert.doesNotMatch(text, /f59/);
});
