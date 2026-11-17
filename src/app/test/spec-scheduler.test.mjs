// Task 41.1: the scheduler for spec drivers. Unblock ranking, repository-wide
// path holds, the branch-only release rule (R102.4), and the journal check
// before dispatch (§4.32.7). Workspaces and journals are scratch copies.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { digest } from "../../model.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { GitHubClient } from "../github.mjs";
import {
  branchOnly,
  rememberDriver,
  revalidateSpecs,
  scheduleReady,
} from "../spec-scheduler.mjs";
import { localJournalFile } from "../spec-publication.mjs";
import { appendRecord, localJournal } from "../spec-journal.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "app",
  ...extra,
});

const ids = (tasks) => tasks.map((task) => task.id);

test("ranking: more unblocked first within a rank; pins and ranks stay first", () => {
  const tasks = [
      leaf("pin2"),
      leaf("pin1"),
      leaf("urgent", { rank: 1 }),
      leaf("few"),
      leaf("many"),
      leaf("x"),
      leaf("y"),
      leaf("z"),
    ],
    data = {
      ...snapshot(),
      tasks,
      edges: [
        { from: "many", to: "x", kind: "requires" },
        { from: "x", to: "y", kind: "requires" },
        { from: "few", to: "z", kind: "sequence" },
        { from: "pin1", to: "z", kind: "requires" },
        { from: "pin1", to: "y", kind: "requires" },
      ],
    };
  const { order, notes } = scheduleReady({
    data,
    candidates: tasks.slice(0, 5),
    pinned: new Set(["pin2", "pin1"]),
  });
  assert.deepEqual(order, ["pin2", "pin1", "urgent", "many", "few"]);
  assert.equal(notes.get("many"), "Next: unblocks 2 tasks.");
  assert.equal(notes.get("few"), "Next: unblocks 1 task.");
  assert.equal(notes.has("urgent"), false);
});

test("path holds are repository-wide, across specs, and the first by rank goes", () => {
  const running = leaf("running", { planId: "spec-a", paths: ["src/app"] }),
    tasks = [
      running,
      leaf("other-spec", { planId: "spec-b", paths: ["src/app/x.mjs"] }),
      leaf("other-repo", {
        planId: "spec-b",
        repository: "lib",
        paths: ["src/app/x.mjs"],
      }),
      leaf("no-paths", { planId: "spec-b" }),
      leaf("first", { planId: "spec-c", paths: ["docs/*.md"], rank: 1 }),
      leaf("second", { planId: "spec-d", paths: ["docs/guide.md"], rank: 2 }),
      leaf("apart", { planId: "spec-d", paths: ["test"] }),
    ],
    data = { ...snapshot(), tasks, edges: [] };
  const { order, held } = scheduleReady({
    data,
    candidates: tasks.slice(1),
    flight: [running],
  });
  assert.deepEqual(order, ["other-repo", "no-paths", "first", "apart"]);
  assert.equal(held.get("other-spec"), "Held: paths overlap running in app.");
  assert.equal(held.get("second"), "Held: paths overlap first in app.");
  // Nothing in flight and nothing ahead: nothing is held.
  assert.equal(scheduleReady({ data, candidates: [tasks[1]] }).held.size, 0);
});

test("a branch-only prerequisite releases only its own spec's work in its repository", () => {
  const onBranch = {
      commit: "a".repeat(40),
      into: "avoozl/spec-a/work",
      branch: "avoozl/a",
    },
    tasks = [
      leaf("verified", {
        planId: "spec-a",
        status: "accepted",
        integration: onBranch,
      }),
      leaf("landed", {
        planId: "spec-a",
        status: "accepted",
        integration: { ...onBranch, into: "main" },
      }),
      leaf("same-spec", { planId: "spec-a" }),
      leaf("cross-spec", { planId: "spec-b" }),
      leaf("cross-repo", { planId: "spec-a", repository: "lib" }),
      leaf("after-landed", { planId: "spec-b" }),
    ],
    edges = [
      { from: "verified", to: "same-spec", kind: "requires" },
      { from: "verified", to: "cross-spec", kind: "requires" },
      { from: "verified", to: "cross-repo", kind: "sequence" },
      { from: "landed", to: "after-landed", kind: "requires" },
    ];
  assert.equal(branchOnly(tasks[0], "main"), true);
  assert.equal(branchOnly(tasks[1], "main"), false);
  assert.equal(branchOnly(tasks[0], "avoozl/spec-a/work"), false);
  const { order, held } = scheduleReady({
    data: { ...snapshot(), tasks, edges },
    candidates: tasks.slice(2),
  });
  assert.deepEqual(order, ["same-spec", "after-landed"]);
  assert.match(held.get("cross-spec"), /Waits for verified to land/);
  assert.match(held.get("cross-repo"), /Waits for verified to land/);
});

// A workspace with a real checkout `app`, a tick-run delivery policy and
// the given tasks.
function workspace(t, { tasks, edges = [] }) {
  const root = temporaryDirectory("avoozl-scheduler-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  const git = (...args) => execFileSync("git", args, { cwd: checkout });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git("add", ".");
  git("commit", "-q", "-m", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks, edges });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, delivery: { concurrency: 4 } }),
  );
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

const dispatched = async (ops) =>
  (await ops.execute("workspace.tick", { sessions: [] })).dispatch.map(
    (d) => d.task,
  );

test("the tick holds overlapping work behind a task in flight, then releases it", async (t) => {
  const { store, ops } = workspace(t, {
    tasks: [
      leaf("busy", { planId: "spec-a", paths: ["src/app"] }),
      leaf("clash", { planId: "spec-b", paths: ["src/app/x.mjs"] }),
      leaf("free", { planId: "spec-b", paths: ["docs"] }),
    ],
  });
  // `busy` is in flight: a delivery record claims it.
  store.put("task_deliveries", {
    taskId: "busy",
    state: "running",
    attempts: [],
  });
  assert.deepEqual(await dispatched(ops), ["free"]);
  store.mutate("Finish busy", (data) => {
    data.tasks.find((task) => task.id === "busy").status = "accepted";
  });
  assert.deepEqual((await dispatched(ops)).sort(), ["clash", "free"]);
});

const REVISION = digest("revision");

async function journalFor(store, root, planId) {
  store.put("receipts", {
    id: `spec-journal:${planId}`,
    kind: "spec-journal",
    planId,
    home: "local",
  });
  const journal = localJournal(localJournalFile(root, planId), "owner"),
    options = {
      visibility: "private",
      machine: { hostname: "made-up-host", username: "madeupuser" },
      configFile: path.join(root, "machine.json"),
    };
  return {
    append: (fields) =>
      appendRecord(journal, { spec: planId, ...fields }, options),
  };
}

test("before dispatch the journal holds a displaced, stopped or intent-held spec", async (t) => {
  const { root, store, ops } = workspace(t, {
    tasks: [
      leaf("a1", { planId: "spec-a" }),
      leaf("a2", { planId: "spec-a" }),
      leaf("b1", { planId: "spec-b" }),
    ],
  });
  // No journal: the plan-issue driver rule alone applies.
  assert.deepEqual((await dispatched(ops)).sort(), ["a1", "a2", "b1"]);
  const a = await journalFor(store, root, "spec-a"),
    driver = "0123456789abcdef";
  // A published journal nobody took over yet changes nothing.
  assert.equal(
    (await revalidateSpecs(store, { workspaceRoot: root, planIds: ["spec-a"] }))
      .plans.size,
    0,
  );
  await a.append({
    op: "generation-1",
    kind: "generation",
    generation: 1,
    driver,
  });
  // Another workspace's generation: this one is displaced.
  assert.deepEqual(await dispatched(ops), ["b1"]);
  rememberDriver(store, "spec-a", driver);
  assert.deepEqual((await dispatched(ops)).sort(), ["a1", "a2", "b1"]);
  // An outstanding landing intent holds only its own tasks.
  await a.append({
    op: "intent-1",
    kind: "intent",
    generation: 1,
    driver,
    revision: REVISION,
    base: "b".repeat(40),
    tasks: [{ task: "a1", definition: digest("a1") }],
    refs: [{ repository: "acme/app", commit: "c".repeat(40) }],
    checks: [{ name: "npm test", conclusion: "success" }],
  });
  assert.deepEqual((await dispatched(ops)).sort(), ["a2", "b1"]);
  // A stop control holds the spec's new work.
  await a.append({
    op: "control-1",
    kind: "control",
    generation: 1,
    driver,
    controls: [{ flag: "stop", id: "stop-1" }],
  });
  assert.deepEqual(await dispatched(ops), ["b1"]);
  const result = await revalidateSpecs(store, {
    workspaceRoot: root,
    planIds: ["spec-a"],
  });
  assert.equal(result.reasons.get("spec-a"), "stopped");
});

test("a GitHub journal that cannot be read holds its spec", async (t) => {
  const { store } = workspace(t, { tasks: [leaf("a1", { planId: "spec-a" })] });
  store.put("receipts", {
    id: "github-parent:plan:spec-a",
    kind: "github-parent",
    level: "plan",
    parentId: "spec-a",
    repository: "acme/app",
    number: 7,
  });
  const offline = await revalidateSpecs(store, {
    github: null,
    planIds: ["spec-a"],
  });
  assert.equal(offline.reasons.get("spec-a"), "journal-unreadable");
  const failing = await revalidateSpecs(store, {
    github: {
      listIssueComments: async () => {
        throw Error("boom");
      },
      repository: async () => ({ private: true }),
    },
    planIds: ["spec-a"],
  });
  assert.equal(failing.reasons.get("spec-a"), "journal-unreadable");
  const readable = await revalidateSpecs(store, {
    github: {
      listIssueComments: async () => [],
      repository: async () => ({ private: true }),
    },
    planIds: ["spec-a"],
  });
  assert.equal(readable.plans.size, 0);
  // With no repository row, the real client still reads the receipt's
  // repository (it once asked for /repos/undefined/undefined).
  const paths = [],
    client = new GitHubClient({
      token: "test",
      fetch: async (input) => {
        const at = new URL(String(input)).pathname;
        paths.push(at);
        return new Response(
          at.endsWith("/comments") ? "[]" : '{"private":true}',
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    });
  const real = await revalidateSpecs(store, {
    github: client,
    planIds: ["spec-a"],
  });
  assert.equal(real.plans.size, 0, JSON.stringify([...real.reasons]));
  assert.ok(paths.includes("/repos/acme/app/issues/7/comments"), paths.join());
});

test("the tick dispatches the leaf that unblocks more first, within a rank", async (t) => {
  const { ops } = workspace(t, {
    tasks: [
      leaf("few"),
      leaf("many"),
      leaf("x"),
      leaf("y"),
      leaf("top", { rank: 1 }),
    ],
    edges: [
      { from: "many", to: "x", kind: "requires" },
      { from: "many", to: "y", kind: "requires" },
    ],
  });
  assert.deepEqual(await dispatched(ops), ["top", "many", "few"]);
});
