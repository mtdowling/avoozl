import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  createExecutor,
  EXECUTOR_CONTRACT,
  executorStatus,
} from "../executors.mjs";

const start = [
  "worker",
  "task-one",
  "/scratch/task-one",
  "Edit the file.\nReport the result.",
  "model-one",
  "write",
];
const implementation = (overrides = {}) => ({
  start: () => "session-one",
  send: () => "accepted",
  status: () => "idle",
  ...overrides,
});

test("start and send preserve the neutral arguments and implementation context", async () => {
  const calls = [],
    adapter = implementation({
      id: "session-one",
      async start(...args) {
        calls.push(["start", ...args]);
        return this.id;
      },
      send(...args) {
        calls.push(["send", this.id, ...args]);
        return "refused";
      },
    }),
    executor = createExecutor(adapter);
  assert.equal(await executor.start(...start), "session-one");
  assert.equal(
    await executor.send("session-one", "Feedback\nTry again."),
    "refused",
  );
  assert.deepEqual(calls, [
    ["start", ...start],
    ["send", "session-one", "session-one", "Feedback\nTry again."],
  ]);
  assert.equal(
    await createExecutor(implementation()).send("session-one", ""),
    "accepted",
  );
});

test("read-only sessions may omit a worktree and use the default model", async () => {
  let received;
  const executor = createExecutor(
    implementation({
      start: (...args) => {
        received = args;
        return "review-one";
      },
    }),
  );
  assert.equal(
    await executor.start("reviewer", "task-one", null, "Review.", null, "read"),
    "review-one",
  );
  assert.deepEqual(received, [
    "reviewer",
    "task-one",
    null,
    "Review.",
    null,
    "read",
  ]);
});

test("status preserves every allowed state and distinguishes idle from gone", async () => {
  for (const state of [
    "working",
    "idle",
    "gone",
    "exited 0",
    "exited 7",
    "exited -15",
  ]) {
    let observed;
    const executor = createExecutor(
      implementation({
        status: (id) => {
          observed = id;
          return state;
        },
      }),
    );
    assert.equal(await executor.status("session-one"), state);
    assert.equal(observed, "session-one");
  }
  for (const bad of [
    null,
    "",
    "quiet",
    "lost",
    "stopped",
    "exited",
    "exited null",
    "exited 1.5",
    "exited 01",
    "exited 9007199254740992",
    { state: "gone" },
  ])
    assert.throws(() => executorStatus(bad), /Executor status/);
});

test("observation and call errors propagate without marking a session gone", async () => {
  const error = new Error("observation unavailable");
  const executor = createExecutor(
    implementation({
      start: () => {
        throw error;
      },
      send: async () => {
        throw error;
      },
      status: async () => {
        throw error;
      },
    }),
  );
  await assert.rejects(executor.start(...start), (caught) => caught === error);
  await assert.rejects(
    executor.send("session-one", "hello"),
    (caught) => caught === error,
  );
  await assert.rejects(
    executor.status("session-one"),
    (caught) => caught === error,
  );
});

test("optional capabilities are absent when unsupported, and validate their results", async () => {
  const minimal = createExecutor(implementation());
  assert.equal("stop" in minimal, false);
  assert.equal("usage" in minimal, false);
  const calls = [],
    executor = createExecutor(
      implementation({
        stop: (id) => {
          calls.push(id);
          return "stopped";
        },
        usage: (id) => {
          calls.push(id);
          return { tokens: 42, cost: 0.03 };
        },
      }),
    );
  assert.equal(await executor.stop("session-one"), "stopped");
  assert.deepEqual(await executor.usage("session-one"), {
    tokens: 42,
    cost: 0.03,
  });
  assert.deepEqual(calls, ["session-one", "session-one"]);
  assert.equal(
    await createExecutor(implementation({ usage: () => null })).usage(
      "session-one",
    ),
    null,
  );
  await assert.rejects(
    createExecutor(implementation({ stop: () => "gone" })).stop("session-one"),
    /return stopped/,
  );
  for (const result of [
    {},
    [],
    "unknown",
    { tokens: -1 },
    { tokens: 0.5 },
    { cost: Infinity },
    { cost: -1 },
    { vendorDetails: {} },
  ])
    await assert.rejects(
      createExecutor(implementation({ usage: () => result })).usage(
        "session-one",
      ),
      /Executor usage/,
    );
});

test("invalid implementations, start inputs and required results are refused", async () => {
  for (const adapter of [
    null,
    {},
    { start() {}, send() {} },
    implementation({ stop: true }),
    implementation({ usage: 3 }),
  ])
    assert.throws(() => createExecutor(adapter), /[Ee]xecutor/);
  let called = false;
  const executor = createExecutor(
    implementation({
      start: () => {
        called = true;
        return "session-one";
      },
    }),
  );
  for (const [index, bad] of [
    [0, ""],
    [1, {}],
    [2, ""],
    [3, null],
    [4, {}],
    [5, "trust"],
  ]) {
    const args = [...start];
    args[index] = bad;
    await assert.rejects(executor.start(...args), TypeError);
  }
  assert.equal(called, false);
  await assert.rejects(
    createExecutor(implementation({ start: () => null })).start(...start),
    /sessionId/,
  );
  await assert.rejects(
    createExecutor(implementation({ send: () => true })).send(
      "session-one",
      "x",
    ),
    /accepted or refused/,
  );
  await assert.rejects(executor.status(""), /sessionId/);
});

test("the portable contract and interface contain no provider-specific session details", () => {
  assert.deepEqual(EXECUTOR_CONTRACT.start, [
    "role",
    "task",
    "worktree",
    "brief",
    "model",
    "permissionClass",
  ]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(EXECUTOR_CONTRACT)),
    JSON.parse(
      fs.readFileSync(
        new URL("../../../executor-contract.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  for (const file of ["../executors.mjs", "../../../executor-contract.json"])
    assert.doesNotMatch(
      fs.readFileSync(new URL(file, import.meta.url), "utf8"),
      /kiro.?crew|folder|project|agent[-_/ ]?file/i,
    );
  assert.ok(Object.isFrozen(EXECUTOR_CONTRACT.start));
  assert.ok(Object.isFrozen(EXECUTOR_CONTRACT.optional.stop));
});
