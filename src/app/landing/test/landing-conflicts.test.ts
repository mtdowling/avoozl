import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../../test/fixtures.ts";
import {
  DEFAULT_CONFLICT_ROUNDS,
  conflictMessage,
  sendConflictBack,
} from "../landing-conflicts.ts";

const SHA = "a".repeat(40);

function setup(t: TestContext, { chat = true } = {}) {
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

const conflict = (
  files = ["src/a.mjs", "docs/b.md"],
  baseHead = "b".repeat(40),
) => ({
  state: "conflict",
  entry: {
    key: "spec.aaaa",
    repositoryId: "app",
    base: "main",
    baseHead,
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
    // Each round is a new conflict: the base moved again.
    const out = sendConflictBack(
      store,
      conflict(undefined, String(round).repeat(40)),
    );
    assert.equal(out.notify.length, 0);
    assert.equal(out.messages.length, 1);
    assert.equal(out.messages[0].slot, "slot-1");
    assert.match(out.messages[0].text, new RegExp(`round ${round} of 2`));
    assert.match(out.messages[0].text, /src\/a\.mjs\ndocs\/b\.md/);
    assert.match(out.messages[0].text, /git merge, never a rebase/);
    assert.equal(store.get("task_deliveries", "t1")?.state, "running");
  }
  const last = sendConflictBack(store, conflict());
  assert.equal(last.messages.length, 0);
  assert.equal(last.notify.length, 1);
  assert.equal(last.notify[0].channel, "decision");
  const delivery = store.get<{
    id: string;
    state: string;
    landingConflicts: unknown[];
  }>("task_deliveries", "t1");
  assert.equal(delivery?.state, "decision");
  assert.equal(delivery?.landingConflicts.length, 2);
});

test("zero rounds, or a gone chat, goes straight to Needs you", (t) => {
  const store = setup(t);
  const out = sendConflictBack(store, conflict(), { rounds: 0 });
  assert.equal(out.messages.length, 0);
  assert.equal(out.notify.length, 1);
  const none = setup(t, { chat: false });
  const gone = sendConflictBack(none, conflict());
  assert.equal(gone.messages.length, 0);
  assert.match(String(gone.notify[0].text), /worker chat is gone/);
});

test("only a conflict result is accepted, and long file lists are cut", () => {
  assert.throws(
    () => sendConflictBack(null as never, { state: "failed" }),
    /conflict/,
  );
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

const needsYou = (store: ReturnType<typeof setup>) =>
  store.get<{ id: string; state: string; cause?: string }>(
    "task_deliveries",
    "t1",
  );

test("one try per conflict: the same base head conflicting again goes to Needs you", (t) => {
  const store = setup(t);
  assert.equal(sendConflictBack(store, conflict()).messages.length, 1);
  const again = sendConflictBack(store, conflict());
  assert.equal(again.messages.length, 0);
  assert.match(String(again.notify[0].text), /after one try/);
  assert.equal(needsYou(store)?.state, "decision");
});

test("conflicts.mode ask sends a conflict straight to Needs you", (t) => {
  const store = setup(t);
  const out = sendConflictBack(store, conflict(), { mode: "ask" });
  assert.equal(out.messages.length, 0);
  assert.match(String(out.notify[0].text), /conflicts\.mode is ask/);
});

test("a pull request a person opened keeps its conflict for them", (t) => {
  const store = setup(t);
  const out = sendConflictBack(store, conflict(), { person: "mona" });
  assert.equal(out.messages.length, 0, "no worker is sent to it");
  assert.match(String(out.notify[0].text), /mona's, so Avoozl leaves/);
  assert.equal(needsYou(store)?.state, "decision");
});

test("Stop the line holds the conflict round until it clears", (t) => {
  const store = setup(t);
  const stop = {
    id: "stop-1",
    scope: "repo",
    repositoryId: "app",
    openedAt: "2026-11-24T00:00:00Z",
  };
  store.put("flow_stops", stop);
  const held = sendConflictBack(store, conflict());
  assert.deepEqual(held, { messages: [], notify: [] });
  assert.equal(needsYou(store)?.state, "verified", "left as it was");
  store.put("flow_stops", { ...stop, closedAt: "2026-11-24T01:00:00Z" });
  assert.equal(sendConflictBack(store, conflict()).messages.length, 1);
});
