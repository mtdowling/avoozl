// Dashboards › Landing queue (landing.queue, task 44.5): per base, in
// landing order, with each hold reason, from the store only.
import assert from "node:assert/strict";
import test from "node:test";
import { enqueueLanding, landNext } from "../landing-queue.mjs";
import { landingQueueView } from "../landing-queue-view.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

const NOW = Date.parse("2026-11-17T12:00:00Z");
const iso = (minutes) => new Date(NOW - minutes * 60000).toISOString();
const sha = (c) => c.repeat(40);
const task = (id, extra = {}) => ({
  id,
  title: `Task ${id}`,
  scope: "catalog",
  status: "planned",
  track: "catalog",
  kind: "leaf",
  tags: [],
  acceptance: ["Done."],
  ...extra,
});

function seed(t) {
  const { root, store } = fixture(t),
    data = store.read();
  store.importSnapshot({
    ...data,
    tasks: ["a", "b", "c", "d", "e", "f", "g"].map((id) =>
      task(id, { repository: id === "g" ? "lib" : "code" }),
    ),
  });
  store.put("projects", {
    id: "code",
    repository: "example/code",
    landing: "pr",
  });
  store.put("projects", {
    id: "lib",
    repository: "example/lib",
    landing: "off",
  });
  const Q = { projectId: "code", base: "main" };
  for (const [key, c, pr] of [
    ["a", "a", 11],
    ["b", "b", 12],
  ])
    enqueueLanding(
      store,
      { ...Q, key, commit: sha(c), tasks: [key], pr },
      { now: NOW - 60000 },
    );
  enqueueLanding(store, {
    projectId: "lib",
    base: "main",
    key: "g",
    commit: sha("9"),
    tasks: ["g"],
  });
  // The head waits for a review on its exact head.
  const head = store.get("landing_queue", "code\0main\0a");
  store.put("landing_queue", {
    ...head,
    waiting: {
      reason: "review",
      candidate: sha("1"),
      checks: [],
      since: iso(5),
    },
  });
  for (const [id, state] of [
    ["c", "running"],
    ["d", "running"],
    ["e", "decision"],
  ])
    store.put("task_deliveries", {
      id,
      taskId: id,
      state,
      commit: sha(id === "e" ? "e" : "2"),
      ...(id === "c"
        ? { landingConflicts: [{ key: "c" }], cause: "x" }
        : id === "d"
          ? { landingFailures: [{ key: "d" }, { key: "d" }] }
          : {
              cause: "touches protected paths: .github/workflows/ci.yml",
              verifications: [
                {
                  outcome: "protected",
                  commit: sha("e"),
                  cause: "touches protected paths: .github/workflows/ci.yml",
                  at: iso(1),
                },
              ],
            }),
    });
  // c conflicted and d failed checks: both out of the queue, back with
  // their worker chats.
  for (const [key, state, at] of [
    ["c", "conflict", iso(20)],
    ["d", "failed", iso(10)],
  ])
    store.put("landing_queue", {
      id: `code\0main\0${key}`,
      ...Q,
      key,
      commit: sha("2"),
      tasks: [key],
      seq: 0,
      state,
      finishedAt: at,
    });
  store.put("task_worktrees", {
    id: "e",
    taskId: "e",
    repository: "code",
    branch: "task/e",
    base: { branch: "main", kind: "base" },
  });
  return { root, store };
}

test("each base lists its items in landing order with a hold reason", (t) => {
  const { store } = seed(t),
    view = landingQueueView(store, store.read(), { now: NOW });
  assert.deepEqual(
    view.bases.map((b) => [b.repository, b.base, b.landing]),
    [
      ["example/code", "main", "pr"],
      ["example/lib", "main", "off"],
    ],
  );
  const [code, lib] = view.bases;
  assert.deepEqual(
    code.items.map((i) => [i.key, i.position, i.hold.kind, i.hold.text]),
    [
      ["a", 1, "review", "Review missing on this head."],
      ["b", 2, "behind", "Behind 1 portion."],
      ["c", null, "conflict", "Conflict round 1: back with the worker."],
      ["d", null, "failing", "Checks failed round 2: back with the worker."],
      [
        "e",
        null,
        "path",
        "Path hold: touches protected paths: .github/workflows/ci.yml.",
      ],
    ],
  );
  assert.equal(code.items[0].tasks[0].title, "Task a");
  assert.equal(code.items[0].pr.url, "https://github.com/example/code/pull/11");
  assert.equal(
    code.items[4].branch.url,
    "https://github.com/example/code/tree/task/e",
  );
  assert.deepEqual(
    lib.items.map((i) => i.hold.text),
    ["Landing is off for this repository."],
  );
});

test("a line stop holds every queued item first; a head with no wait is next", (t) => {
  const { store } = seed(t);
  store.put("landing_queue", {
    ...store.get("landing_queue", "code\0main\0a"),
    waiting: undefined,
  });
  let [code] = landingQueueView(store, store.read(), { now: NOW }).bases;
  assert.deepEqual(code.items[0].hold, { kind: "next", text: "Next to land." });
  store.put("flow_stops", {
    id: "stop:x",
    manual: true,
    scope: "all",
    reason: "bad base",
    openedAt: iso(1),
    closedAt: null,
  });
  [code] = landingQueueView(store, store.read(), { now: NOW }).bases;
  assert.deepEqual(
    code.items.filter((i) => i.position).map((i) => i.hold.text),
    ["Line stopped: bad base.", "Line stopped: bad base."],
  );
});

test("landing.queue makes no GitHub call, and Refresh reads the same", async (t) => {
  const { root, store } = seed(t),
    calls = [],
    github = new Proxy(
      {},
      {
        get: (_, method) =>
          method === "then"
            ? undefined
            : (...args) => {
                calls.push(String(method));
                return null;
              },
      },
    ),
    real = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = () => {
    fetches += 1;
    return new Promise(() => {});
  };
  t.after(() => (globalThis.fetch = real));
  const ops = new Operations(store, { workspaceRoot: root, github }),
    first = await ops.execute("landing.queue", {}),
    again = await ops.execute("landing.queue", {});
  assert.deepEqual(calls, []);
  assert.equal(fetches, 0);
  assert.equal(first.bases.length, 2);
  assert.deepEqual(
    again.bases.map((b) => b.items.map((i) => i.key)),
    first.bases.map((b) => b.items.map((i) => i.key)),
  );
});

test("landNext keeps why the head waits, once per change, never on a withdrawn entry", async (t) => {
  const { store } = fixture(t),
    Q = { projectId: "p", base: "main" };
  enqueueLanding(store, { ...Q, key: "k", commit: sha("a"), tasks: ["k"] });
  let reason = "review";
  const steps = {
    readBase: async () => sha("0"),
    prepare: async () => ({ candidate: sha("1") }),
    check: async () => ({
      wait: true,
      reason,
      checks: [{ command: "test", conclusion: null }],
    }),
    land: async () => false,
  };
  await landNext(store, Q, steps);
  const first = store.get("landing_queue", "p\0main\0k");
  assert.equal(first.waiting.reason, "review");
  assert.equal(first.waiting.candidate, sha("1"));
  await landNext(store, Q, steps);
  assert.equal(
    store.get("landing_queue", "p\0main\0k").waiting.since,
    first.waiting.since,
  );
  reason = "checks";
  await landNext(store, Q, steps);
  assert.equal(
    store.get("landing_queue", "p\0main\0k").waiting.reason,
    "checks",
  );
  // A withdrawal while checks run is never undone by the wait note.
  reason = "review";
  await landNext(store, Q, {
    ...steps,
    check: async () => {
      store.put("landing_queue", {
        ...store.get("landing_queue", "p\0main\0k"),
        state: "withdrawn",
      });
      return { wait: true, reason, checks: [] };
    },
  });
  assert.equal(store.get("landing_queue", "p\0main\0k").state, "withdrawn");
});
