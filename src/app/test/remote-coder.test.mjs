// rc-15.1, rc-15.2, rc-15.3, rc-15.5 and rc-15.6: the remote coder against a
// fake MCP harness (a child process) and a fake GitHub. Nothing leaves the
// machine and no real harness is started.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mapState, remoteCountsAsDone, remoteTasks } from "../remote-coder.mjs";
import { leaf, setup } from "./radar-coder-release-fixture.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const HARNESS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fake-harness.mjs",
);

async function remote(
  t,
  tasks = [leaf("leaf-a"), leaf("leaf-b")],
  { batch = false } = {},
) {
  const w = await setup(t, { release: { capacity: 5 } }, tasks, "remote"),
    scratch = temporaryDirectory("avoozl-harness-");
  const log = path.join(scratch, "log.jsonl"),
    state = path.join(scratch, "state.json");
  fs.writeFileSync(log, "");
  fs.writeFileSync(state, JSON.stringify({ auth: "ok", statuses: {} }));
  process.env.FAKE_HARNESS_LOG = log;
  process.env.FAKE_HARNESS_STATE = state;
  fs.mkdirSync(path.join(w.root, ".avoozl", "local"), { recursive: true });
  fs.writeFileSync(
    path.join(w.root, ".avoozl", "local", "remote.json"),
    JSON.stringify({ command: [process.execPath, HARNESS] }),
  );
  w.github.available = () => true;
  w.github.closing = new Map();
  w.github.closingPullRequests = (_repository, number) =>
    Promise.resolve(structuredClone(w.github.closing.get(number) || []));
  const calls = () =>
      fs
        .readFileSync(log, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    set = (value) =>
      fs.writeFileSync(
        state,
        JSON.stringify({ auth: "ok", statuses: {}, ...value }),
      ),
    run = () => w.ops.execute("workspace.tick", { sessions: [] }),
    rows = async () =>
      (await w.ops.execute("conflicts.view", {})).items.filter((item) =>
        /^remote-/.test(String(item.id)),
      );
  if (batch)
    await w.ops.execute("github.project", {
      planId: "rel",
      batches: [w.approved.taskIds.slice(0, 2)],
    });
  else await w.tick();
  return { ...w, calls, set, run, rows };
}
const filed = (calls) =>
  calls.filter((call) => call.tool === "create-code-task");
const pid = (calls) => calls.find((call) => call.started)?.started;
const alive = (processId) => {
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
};

test("each ready task is filed once, with only the two tools, and the process ends with the tick", async (t) => {
  const w = await remote(t);
  await w.run();
  await w.run();
  await w.run();
  const calls = w.calls();
  assert.equal(
    filed(calls).length,
    2,
    "one task per ready task, none twice across three ticks",
  );
  assert.deepEqual(
    [...new Set(calls.filter((c) => c.tool).map((c) => c.tool))].sort(),
    ["create-code-task", "get-task-statuses"],
  );
  // A fresh process for each tick, and none is left running.
  const starts = calls
    .filter((call) => call.started)
    .map((call) => call.started);
  assert.ok(starts.length >= 3);
  await new Promise((resolve) => setTimeout(resolve, 300));
  for (const started of starts)
    assert.equal(alive(started), false, "stopped after its tick");
  // The receipt holds the approver, the harness task ID and the Avoozl task IDs.
  const receipts = remoteTasks(w.store);
  assert.equal(receipts.length, 2);
  for (const receipt of receipts) {
    assert.equal(receipt.approver, "Operator");
    assert.match(receipt.harnessId, /^h-/);
    assert.equal(receipt.taskIds.length, 1);
    assert.ok(["filed", "working"].includes(receipt.state));
  }
});

test("the filed task carries the task ID, the spec and the approved task text", async (t) => {
  const w = await remote(t, [leaf("leaf-a")]);
  await w.run();
  const [call] = filed(w.calls());
  assert.match(call.args.prompt, /Task rel-leaf-a of spec/);
  assert.match(call.args.prompt, /avoozl-task/);
  assert.match(call.args.prompt, /leaf-a passes/);
});

test("a harness complete with no pull request is not done, and shows one row; the merge clears it", async (t) => {
  const w = await remote(t, [leaf("leaf-a")]);
  await w.run();
  const [receipt] = remoteTasks(w.store);
  w.set({
    statuses: {
      [receipt.harnessId]: {
        state: "completed",
        url: "https://harness.example/x",
      },
    },
  });
  for (let round = 0; round < 3; round += 1) await w.run();
  assert.equal(remoteTasks(w.store)[0].state, "finished-unpublished");
  assert.equal(remoteCountsAsDone(remoteTasks(w.store)[0]), false);
  let rows = await w.rows();
  assert.equal(rows.length, 1, "one row across three ticks");
  assert.match(
    rows[0].title,
    /Waiting for a person to publish the pull request for rel-leaf-a/,
  );
  assert.equal(rows[0].link, "https://harness.example/x");
  // The person publishes: the row clears and the task is pr-open, not done.
  const issue = w.issueOf(w.approved.taskIds[0]);
  w.github.closing.set(issue.number, [
    { number: 9, state: "OPEN", merged: false },
  ]);
  await w.run();
  assert.equal(remoteTasks(w.store)[0].state, "pr-open");
  assert.deepEqual(await w.rows(), []);
  // It counts as done only when that pull request merges.
  w.github.closing.set(issue.number, [
    { number: 9, state: "MERGED", merged: true },
  ]);
  await w.run();
  assert.equal(remoteTasks(w.store)[0].state, "merged");
  assert.equal(remoteCountsAsDone(remoteTasks(w.store)[0]), true);
});

test("a read failure keeps the last state and says so", async (t) => {
  const w = await remote(t, [leaf("leaf-a")]);
  await w.run();
  const before = remoteTasks(w.store)[0];
  process.env.AVOOZL_REMOTE_COMMAND = JSON.stringify([
    process.execPath,
    "-e",
    "process.exit(1)",
  ]);
  try {
    await w.run();
  } finally {
    delete process.env.AVOOZL_REMOTE_COMMAND;
  }
  const after = remoteTasks(w.store)[0];
  assert.equal(after.state, before.state);
  assert.equal(after.readAt, before.readAt);
  assert.ok(after.error);
});

test("an expired sign-in opens one item, holds filing, tries one cheap check per tick, and resumes", async (t) => {
  const w = await remote(t, [leaf("leaf-a"), leaf("leaf-b")]);
  w.set({ auth: "expired" });
  for (let round = 0; round < 5; round += 1) await w.run();
  assert.equal(remoteTasks(w.store).length, 0);
  const rows = await w.rows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Sign in again");
  assert.match(rows[0].detail, /Operator/);
  // One filing attempt, then one cheap check per later tick: no retry loop.
  const calls = w.calls().filter((call) => call.tool);
  assert.equal(filed(calls).length, 1);
  assert.ok(calls.length <= 1 + 4, "at most one call per tick after the first");
  w.set({ auth: "ok" });
  await w.run();
  await w.run();
  assert.equal(remoteTasks(w.store).length, 2);
  assert.deepEqual(await w.rows(), []);
});

test("the harness's words map onto our states only here", () => {
  assert.equal(mapState({ state: "queued" }), "filed");
  assert.equal(mapState({ state: "RUNNING" }), "working");
  assert.equal(mapState({ state: "completed" }), "finished-unpublished");
  assert.equal(
    mapState({ state: "completed", pullRequestUrl: "https://x/pull/1" }),
    "pr-open",
  );
  assert.equal(mapState({ status: "failed" }), "failed");
  assert.equal(mapState({ state: "mystery" }), null);
  assert.equal(mapState(undefined), null);
});

test("a batch is filed as one task that names every member; the others are filed one each", async (t) => {
  const w = await remote(
    t,
    ["a", "b", "c"].map((id) => leaf("leaf-" + id, { size: "small" })),
    { batch: true },
  );
  await w.run();
  await w.run();
  const sent = filed(w.calls());
  assert.equal(sent.length, 2, "one for the batch of two, one for the third");
  const receipts = remoteTasks(w.store).sort(
    (a, b) => b.taskIds.length - a.taskIds.length,
  );
  assert.deepEqual(receipts[0].taskIds, w.approved.taskIds.slice(0, 2));
  assert.deepEqual(receipts[1].taskIds, [w.approved.taskIds[2]]);
});

test("text the content rules mark private is never sent", async (t) => {
  const w = await remote(t, [leaf("leaf-a")], {});
  // A secret-looking line in the issue text is refused by the built-in screen.
  const issue = w.issueOf(w.approved.taskIds[0]);
  issue.body +=
    "\n-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n";
  await w.run();
  assert.equal(filed(w.calls()).length, 0);
  assert.equal(remoteTasks(w.store).length, 0);
});

// rc-15.3: a chain that fits one batch is batched whole, the preview counts
// publishes, and the remote coder's batch may be larger.
import { planProjectionBatches } from "../radar-coder-batch.mjs";

const small = (id, extra = {}) => ({
  id,
  size: "small",
  status: "planned",
  ...extra,
});
const edge = (from, to) => ({ from, to, kind: "requires" });

test("a remote chain that fits one batch is batched whole; a crew batch never joins linked tasks", () => {
  const tasks = [small("a"), small("b"), small("c"), small("z")],
    edges = [edge("a", "b"), edge("b", "c")];
  const crew = planProjectionBatches({ tasks, edges, mode: "suggest" });
  assert.ok(
    crew.batches.every(
      (b) => !(b.tasks.includes("a") && b.tasks.includes("b")),
    ),
    "a crew keeps linked tasks apart",
  );
  const remoteBatches = planProjectionBatches({
    tasks,
    edges,
    mode: "suggest",
    chains: true,
  });
  assert.deepEqual(
    remoteBatches.batches.map((b) => b.tasks),
    [["a", "b", "c"]],
  );
  assert.deepEqual(remoteBatches.plain, ["z"]);
});

test("a chain with an open blocker outside it, or too long for one batch, is not batched whole", () => {
  const outside = planProjectionBatches({
    tasks: [small("a"), small("b"), small("x", { size: "large" })],
    edges: [edge("a", "b"), edge("x", "a")],
    mode: "suggest",
    chains: true,
  });
  assert.deepEqual(outside.batches, []);
  const ids = Array.from({ length: 9 }, (_, i) => "t" + i);
  const long = planProjectionBatches({
    tasks: ids.map((id) => small(id)),
    edges: ids.slice(1).map((id, i) => edge(ids[i], id)),
    mode: "suggest",
    chains: true,
  });
  assert.deepEqual(long.batches, []);
});

test("the preview counts the publishes a remote coder's plan needs", async (t) => {
  const root = temporaryDirectory("avoozl-pub-"),
    code = temporaryDirectory("avoozl-pub-code-");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_remotepublish001",
      github: {
        mode: "single-repo",
        repositories: {
          "example/code": { baseBranch: "main", coder: "remote" },
        },
      },
    }),
  );
  writeSpec(code, "loader");
  const { Store } = await import("../store.mjs"),
    { Operations } = await import("../operations.mjs"),
    { snapshot } = await import("./fixtures.mjs"),
    { FakeGitHub } = await import("./fake-github.mjs"),
    store = new Store(
      path.join(temporaryDirectory("avoozl-pub-db-"), "w.sqlite"),
    );
  t.after(() => store.close());
  store.importSnapshot(snapshot());
  store.put("projects", {
    id: "code",
    root: code,
    baseBranch: "main",
    checks: [["npm", "test"]],
  });
  const ops = new Operations(store, {
    github: new FakeGitHub(),
    operator: "Owner",
    workspaceRoot: root,
  });
  await ops.execute("github.configure", {
    repository: "example/code",
    projectId: "code",
    allowedActors: ["owner"],
  });
  const plan = await ops.execute("plan.create", {
    spec: "loader",
    context: { projectId: "code" },
  });
  const found = await ops.execute("plan.issues.preview", { planId: plan.id });
  assert.ok(Number.isInteger(found.publishes) && found.publishes >= 1);
});

// rc-15.4: forbidden names come from a local terms file named by the
// environment and are never committed; the release scan reports a hit and
// passes the generic wording.
test("the release scan reads forbidden names from the environment and finds them", async () => {
  const { execFileSync } = await import("node:child_process"),
    { pathToFileURL } = await import("node:url"),
    terms = path.join(temporaryDirectory("avoozl-terms-"), "terms.txt");
  fs.writeFileSync(terms, "codename: \\bzorblat\\b\n");
  const scan = pathToFileURL(
    path.resolve(import.meta.dirname, "../../../scripts/release-scan.mjs"),
  ).href;
  const run = (text) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import { scanText, RULES } from ${JSON.stringify(scan)}; console.log(JSON.stringify(scanText(${JSON.stringify(text)}, RULES)))`,
        ],
        {
          encoding: "utf8",
          env: { ...process.env, AVOOZL_RELEASE_TERMS: terms },
        },
      ),
    );
  assert.deepEqual(run("a managed remote harness files the task"), []);
  assert.equal(run("the zorblat files the task").length, 1);
});
