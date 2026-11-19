// Dashboards › Landing queue (landing.queue, task 44.5): per base, in
// landing order, with each hold reason, from the store only.
import assert from "node:assert/strict";
import test from "node:test";
import { enqueueLanding, landNext } from "../landing-queue.mjs";
import {
  landingQueueView,
  landingWaitNeedsYou,
} from "../landing-queue-view.mjs";
import { recordBatch, setTesting } from "../merge-batch-size.mjs";
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
  store.put("repositories", {
    id: "code",
    github: "example/code",
    landing: "pr",
  });
  store.put("repositories", {
    id: "lib",
    github: "example/lib",
    landing: "off",
  });
  const Q = { repositoryId: "code", base: "main" };
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
    repositoryId: "lib",
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
    Q = { repositoryId: "p", base: "main" };
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

// ---- merge batches (mb-2.2) ----

test("a direct base shows waiting, testing, last merge batches and size from stored records", (t) => {
  const { store } = fixture(t),
    now = Date.parse("2026-01-01T01:00:00.000Z"),
    at = (minutes) => new Date(now - minutes * 60000).toISOString(),
    Q = { repositoryId: "app", base: "main" };
  store.put("repositories", {
    id: "app",
    root: "/x",
    baseBranch: "main",
    landing: "direct",
    github: "acme/app",
  });
  const sha = (n) => String(n).padStart(40, "0");
  for (const [n, key] of ["a", "b", "c"].entries())
    enqueueLanding(
      store,
      { ...Q, key, commit: sha(n + 1), tasks: [key], spec: "s", driver: "d" },
      { now: now - (30 - n * 10) * 60000 },
    );
  setTesting(store, Q, { members: ["a", "b"], step: "bisect", since: at(2) });
  recordBatch(store, Q, {
    landed: ["x", "y"],
    culprits: ["z"],
    held: 3,
    waiting: 5,
    at: at(20),
    seconds: 95,
  });
  recordBatch(store, Q, {
    landed: ["w"],
    held: 1,
    waiting: 4,
    at: at(10),
    seconds: 40,
  });
  const [base] = landingQueueView(store, { tasks: [] }, { now }).bases;
  assert.equal(base.landing, "direct");
  assert.deepEqual(
    base.items.map((i) => [i.key, i.waitedMinutes]),
    [
      ["a", 30],
      ["b", 20],
      ["c", 10],
    ],
  );
  assert.deepEqual(base.testing, {
    members: ["a", "b"],
    step: "bisect",
    since: at(2),
  });
  assert.deepEqual(
    base.last.map((l) => [l.outcome, l.size, l.seconds]),
    [
      ["landed", 1, 40],
      ["partly landed", 3, 95],
    ],
  );
  assert.equal(base.size.limit, 2);
  assert.equal(base.size.fixed, false);
  assert.equal(base.size.results, 4);
  assert.equal(base.size.failureRate, 0.1);
  // A fixed setting replaces the limit on the page.
  const config = {
      github: {
        repositories: { "acme/app": { landing: { mergeBatch: 5 } } },
      },
    },
    fixed = landingQueueView(store, { tasks: [] }, { now, config }).bases[0];
  assert.deepEqual([fixed.size.limit, fixed.size.fixed], [5, true]);
});

test("a member that waited 61 minutes opens one Needs you row, and a second read opens no more", (t) => {
  const { store } = fixture(t),
    now = Date.parse("2026-01-01T03:00:00.000Z"),
    Q = { repositoryId: "app", base: "main" };
  store.put("repositories", {
    id: "app",
    root: "/x",
    baseBranch: "main",
    landing: "direct",
    github: "acme/app",
  });
  const sha = (n) => String(n).padStart(40, "0");
  enqueueLanding(
    store,
    { ...Q, key: "old", commit: sha(1), tasks: ["old"] },
    { now: now - 61 * 60000 },
  );
  enqueueLanding(
    store,
    { ...Q, key: "new", commit: sha(2), tasks: ["new"] },
    { now: now - 59 * 60000 },
  );
  const first = landingWaitNeedsYou(store, { tasks: [] }, { now }),
    again = landingWaitNeedsYou(store, { tasks: [] }, { now: now + 1000 });
  assert.equal(first.length, 1);
  assert.equal(first[0].id, "landing-wait:app:main:old");
  assert.match(first[0].detail, /Next to land|Behind|Landing is off/);
  assert.deepEqual(
    again.map((r) => r.id),
    [first[0].id],
  );
});
