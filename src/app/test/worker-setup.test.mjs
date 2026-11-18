// Task 43.6 (R90.7, R90.8): the worker setup preview reads access and the
// executor, and writes nothing.
import assert from "node:assert/strict";
import test from "node:test";
import { previewWorker } from "../worker-setup.mjs";

const pool = (spec, claims = "example/code") => ({
  spec,
  repository: "example/plans",
  issue: 1,
  target: "example/code",
  claims,
  base: "main",
  visibility: "private",
});
const config = (over = {}) => ({
  role: "worker",
  executor: "kirocrew",
  pools: [pool("demo")],
  sources: {
    "example/code": { url: "x" },
    "me/code": { url: "y", parent: "example/code" },
  },
  ...over,
});
const github = (roles) => ({
  available: () => true,
  currentUser: async () => ({ login: "me" }),
  permission: async (repository) => ({
    permission: roles[repository] ?? "none",
  }),
});

test("setup shows login, readable target, writable fork and claim mode", async () => {
  const result = await previewWorker({
    config: config(),
    github: github({ "example/code": "read", "me/code": "admin" }),
    gateway: () => ({}),
  });
  assert.equal(result.ok, true);
  assert.equal(result.login, "me");
  assert.deepEqual(result.targets, [
    { repository: "example/code", role: "read", readable: true },
  ]);
  assert.deepEqual(result.sources, [
    { repository: "me/code", role: "admin", push: true },
  ]);
  assert.equal(result.claims[0].mode, "request");
  // Write access to the claim repository lets this login reserve itself.
  const writer = await previewWorker({
    config: config(),
    github: github({ "example/code": "write" }),
    gateway: () => ({}),
  });
  assert.equal(writer.claims[0].mode, "reserve");
});

test("an unreadable target, no push right or no login is a problem", async () => {
  const result = await previewWorker({
    config: config(),
    github: github({}),
    gateway: () => ({}),
  });
  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 3);
  const none = await previewWorker({
    config: config(),
    github: { available: () => false },
    gateway: () => ({}),
  });
  assert.equal(none.transport, "ssh-envelope");
  assert.equal(none.ok, false);
});

test("Kiro Crew is required only for the kirocrew executor", async () => {
  const roles = { "example/code": "write" };
  const missing = await previewWorker({
    config: config(),
    github: github(roles),
    gateway: () => null,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.executor.kirocrewRequired, true);
  const headless = await previewWorker({
    config: config({ executor: "process" }),
    github: github(roles),
    gateway: () => null,
  });
  assert.equal(headless.ok, true);
  assert.deepEqual(headless.executor, {
    name: "process",
    kirocrewRequired: false,
    ready: true,
  });
});
