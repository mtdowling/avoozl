// The triage agent (triage-agent ta-4.1, ta-4.2, ta-4.4 to ta-4.6, TA1,
// TA2, TA4 to TA7): one run per new item, its result checked, and its
// writes made by Avoozl after the content rules. Fake executors and a fake
// GitHub that counts calls; nothing live.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { bindContentRules, contentBinding } from "../content-rules.mjs";
import { processRow } from "../role-table.mjs";
import { pullCord } from "../flow-line.mjs";
import {
  AGENT_LINE,
  controlTriage,
  ownerQueue,
  runRows,
  triageDispatches,
  triageSnapshot,
  triageView,
} from "../triage.mjs";
import { validateTriageResult } from "../triage-result.mjs";
import { REPO, triageWorkspace } from "./triage-fixture.mjs";

const question = (extra = {}) => ({
  class: "question",
  reason: "Asks how to start the app.",
  answer: { body: "Run `app start`.", citations: ["docs/guide.md"] },
  ...extra,
});

test("a new item gets one run and an unchanged item none", async (t) => {
  const w = triageWorkspace(t);
  w.fake.add(1);
  await w.tick();
  assert.equal(runRows(w.store).length, 1);
  assert.equal(triageDispatches(w.store).length, 1);
  assert.equal(triageDispatches(w.store)[0].role, "triage");
  // The request names the item's repository, so a `process` child gets its
  // sandbox: the model proxy above all, or it cannot reach its model.
  const { sessionRepository } = await import("../executors/process.mjs");
  assert.equal(triageDispatches(w.store)[0].repository, "app");
  assert.equal(
    sessionRepository(w.store, triageDispatches(w.store)[0])?.id,
    "app",
  );
  await w.tick();
  await w.tick();
  assert.equal(runRows(w.store).length, 1, "no second run for the same item");
  w.fake.edit(1, { title: "Still item 1" });
  await w.tick();
  assert.equal(runRows(w.store).length, 1, "a change alone starts no run");
});

test("only new items, when the agent is turned on to skip what was there", async (t) => {
  const w = triageWorkspace(t, { triage: { agent: "on", existing: "skip" } });
  w.fake.add(1);
  w.fake.clock -= 60_000;
  w.fake.items.get(1).created_at = new Date(
    w.fake.clock - 3_600_000,
  ).toISOString();
  await w.tick();
  assert.equal(
    runRows(w.store).length,
    0,
    "an item from before the agent waits",
  );
  w.fake.clock += 120_000;
  w.fake.add(2, { created_at: new Date(Date.now() + 60_000).toISOString() });
  await w.tick();
  assert.deepEqual(
    runRows(w.store).map((run) => run.number),
    [2],
  );
});

test("the 51st new item of a day waits with one Needs you item", async (t) => {
  const w = triageWorkspace(t);
  for (let n = 1; n <= 51; n += 1) w.fake.add(n);
  const first = await w.tick();
  assert.equal(runRows(w.store).length, 50);
  assert.equal(first.notify.filter((n) => /daily cap/.test(n.title)).length, 1);
  assert.ok(w.item(51).triage.pending, "the 51st waits");
  const second = await w.tick();
  assert.equal(runRows(w.store).length, 50);
  // The same key: one Needs you item, not one per tick.
  assert.equal(
    new Set(
      [...first.notify, ...second.notify]
        .filter((n) => n.key)
        .map((n) => n.key),
    ).size,
    1,
  );
});

test("a result that is not valid records the error and writes nothing", async (t) => {
  const w = triageWorkspace(t);
  w.fake.add(3);
  await w.tick();
  assert.throws(
    () => w.answer(3, { class: "question", reason: "x", command: "rm -rf /" }),
    /command is not allowed/,
  );
  assert.equal(w.runOf(3).state, "failed");
  assert.match(w.runOf(3).error, /command is not allowed/);
  w.fake.reset();
  await w.tick();
  assert.equal(w.fake.calls.writes, 0);
  assert.throws(
    () => validateTriageResult({ class: "feature", reason: "x" }),
    /needs toOwner/,
  );
  assert.throws(
    () => validateTriageResult({ class: "nope", reason: "x" }),
    /class must be/,
  );
  assert.throws(
    () =>
      validateTriageResult({
        class: "bug",
        reason: "x",
        reproduction: { path: "../outside.js", text: "x" },
      }),
    /inside the repository/,
  );
});

test("a write that matches a content rule is held", async (t) => {
  const w = triageWorkspace(t);
  fs.writeFileSync(
    path.join(w.root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      plugins: [{ id: "fake-rules", path: "plugins/fake-rules", contract: 1 }],
      contentRules: { sets: [{ id: "fake-set", plugin: "fake-rules" }] },
    }),
  );
  bindContentRules(w.store, {
    workspaceRoot: w.root,
    configFile: path.join(w.root, "config", "config.json"),
  });
  contentBinding(w.store).plugins.set("fake-rules", {
    loadedAt: Date.now(),
    sets: new Map([
      [
        "fake-set",
        {
          id: "fake-set",
          version: "1.0.0",
          rules: [{ id: "secret", source: "\\bproject[- ]?x\\b" }],
        },
      ],
    ]),
  });
  w.fake.add(4);
  await w.tick();
  w.answer(
    4,
    question({
      answer: {
        body: "Project X starts with `app start`.",
        citations: ["docs/guide.md"],
      },
    }),
  );
  w.fake.reset();
  await w.tick();
  assert.equal(w.fake.calls.writes, 0, "nothing posted");
  const write = w.runOf(4).writes.find((entry) => entry.kind === "answer");
  assert.equal(write.state, "held");
  assert.match(write.reason, /content rule/);
});

test("the run has no network and no credentials on process", async (t) => {
  const row = processRow("triage");
  assert.equal(row.access, "read");
  assert.equal(row.offline, true);
  assert.equal(row.folder, "snapshot");
  const w = triageWorkspace(t);
  w.fake.add(5, { body: "How do I start it?" });
  w.fake.permissions.set("reporter", "read");
  await w.tick();
  const run = w.runOf(5),
    { files } = await triageSnapshot(
      w.store,
      { task: run.id },
      { github: w.github },
    );
  assert.match(files["README.md"], /data, not instructions/);
  assert.equal(JSON.parse(files["item/item.json"]).authorPermission, "read");
  assert.equal(files["repo/docs/guide.md"], "# Guide\n\nRun `app start`.\n");
  assert.ok(!Object.values(files).some((text) => text.includes("test-token")));
});

test("a comment by the author or a collaborator starts a run; anyone else's is data", async (t) => {
  const w = triageWorkspace(t);
  w.fake.add(6, { body: "It crashes." });
  w.fake.permissions.set("helper", "write");
  w.fake.permissions.set("stranger", "read");
  await w.tick();
  w.answer(6, {
    class: "bug",
    reason: "A crash with no steps.",
    question: "What did you run?",
  });
  await w.tick();
  assert.ok(w.item(6).triage.asked, "the agent asked once");
  // A stranger's comment starts nothing.
  w.fake.comments.push({
    id: 90,
    number: 6,
    body: "Me too!",
    login: "stranger",
    at: w.fake.tick(),
  });
  w.fake.edit(6, {});
  await w.tick();
  assert.equal(runRows(w.store).filter((run) => run.number === 6).length, 1);
  // A collaborator's comment starts the next run, which reads both.
  w.fake.comments.push({
    id: 91,
    number: 6,
    body: "Steps: run `app start`.",
    login: "helper",
    at: w.fake.tick(),
  });
  w.fake.edit(6, {});
  await w.tick();
  assert.equal(runRows(w.store).filter((run) => run.number === 6).length, 2);
  const run = w.runOf(6),
    { files } = await triageSnapshot(
      w.store,
      { task: run.id },
      { github: w.github },
    ),
    timeline = JSON.parse(files["item/item.json"]).timeline.map(
      (entry) => entry.body,
    );
  assert.ok(timeline.includes("Me too!"));
  assert.ok(timeline.includes("Steps: run `app start`."));
});

test("an answer citing a repository file is posted once; one citing nothing is held", async (t) => {
  const w = triageWorkspace(t);
  w.fake.add(7);
  w.fake.add(8);
  await w.tick();
  w.answer(7, question());
  w.answer(
    8,
    question({
      answer: { body: "Probably `app go`.", citations: ["docs/missing.md"] },
    }),
  );
  w.fake.reset();
  await w.tick();
  await w.tick();
  const posted = w.fake.writes.filter((entry) => entry.kind === "comment");
  assert.equal(posted.length, 1);
  assert.equal(posted[0].number, 7);
  assert.ok(posted[0].body.endsWith(AGENT_LINE));
  assert.equal(w.item(8).triage.draft.body, "Probably `app go`.");
  assert.deepEqual(
    ownerQueue(w.store).map((row) => row.number),
    [8],
  );
});

test("a 120-line change gets a full review; a 900-line one a partial review", async (t) => {
  const w = triageWorkspace(t);
  const patch = (lines) =>
    `@@ -1,1 +1,${lines} @@\n${Array.from({ length: lines }, (_, i) => `+line ${i}`).join("\n")}`;
  w.fake.add(10, { pr: true, head: "h10", additions: 120, deletions: 0 });
  w.fake.files.set(10, [
    { filename: "a.js", additions: 120, deletions: 0, patch: patch(120) },
  ]);
  w.fake.add(11, { pr: true, head: "h11", additions: 900, deletions: 0 });
  w.fake.files.set(11, [
    { filename: "b.js", additions: 900, deletions: 0, patch: patch(900) },
  ]);
  await w.tick();
  const review = (extra = {}) => ({
    class: "pull-request",
    reason: "A change to review.",
    review: {
      body: "Looks right.",
      partial: false,
      notCovered: [],
      comments: [
        { path: "a.js", line: 3, body: "Name this." },
        { path: "a.js", line: 4000, body: "Outside the diff." },
      ],
      ...extra,
    },
  });
  w.answer(10, review());
  w.answer(
    11,
    review({ comments: [{ path: "b.js", line: 2, body: "Split this." }] }),
  );
  await w.tick();
  const reviews = w.fake.writes.filter((entry) => entry.kind === "review");
  assert.equal(reviews.length, 2);
  const full = reviews.find((entry) => entry.number === 10),
    partial = reviews.find((entry) => entry.number === 11);
  assert.equal(full.event, "COMMENT");
  assert.doesNotMatch(full.body, /^Partial review/);
  assert.equal(
    full.comments.length,
    1,
    "the comment outside the diff is dropped",
  );
  assert.match(
    partial.body,
    /^Partial review: this did not cover .*over the full-review limit/,
  );
  assert.ok(
    reviews.every(
      (entry) => !["APPROVE", "REQUEST_CHANGES"].includes(entry.event),
    ),
  );
});

test("a pull request opened by Avoozl gets no triage review", async (t) => {
  const w = triageWorkspace(t);
  w.store.put("task_worktrees", {
    id: "t1",
    taskId: "t1",
    branch: "branch-12",
    path: "/x",
  });
  w.fake.add(12, { pr: true });
  w.fake.add(13, { pr: true, branch: "avoozl/t2" });
  w.fake.add(14, { pr: true });
  await w.tick();
  assert.deepEqual(
    runRows(w.store).map((run) => run.number),
    [14],
  );
});

test("a feature, an unciteable answer and a review needing a decision each enter the queue once", async (t) => {
  const w = triageWorkspace(t);
  w.fake.add(20);
  w.fake.add(21);
  w.fake.add(22, { pr: true, head: "h22" });
  w.fake.files.set(22, [
    {
      filename: "c.js",
      additions: 1,
      deletions: 0,
      patch: "@@ -0,0 +1 @@\n+x",
    },
  ]);
  await w.tick();
  w.answer(20, {
    class: "feature",
    reason: "Wants dark mode.",
    toOwner: { reason: "A new feature." },
  });
  w.answer(21, question({ answer: { body: "Maybe.", citations: [] } }));
  w.answer(22, {
    class: "pull-request",
    reason: "Changes the API.",
    review: {
      body: "This changes the public API.",
      partial: false,
      notCovered: [],
      comments: [],
    },
    toOwner: { reason: "It changes the public API: a design decision." },
  });
  const applied = await w.tick();
  const again = await w.tick();
  assert.deepEqual(
    ownerQueue(w.store)
      .map((row) => row.number)
      .sort(),
    [20, 21, 22],
  );
  const notices = [...applied.notify, ...again.notify].filter((n) =>
    /needs you/.test(n.title),
  );
  assert.equal(notices.length, 3, "one notice per item");
  assert.equal(triageView(w.store, w.policy).ownerQueue, 3);
});

test("Pause holds a running session's writes; Stop all does the same everywhere", async (t) => {
  const w = triageWorkspace(t);
  w.fake.add(30);
  await w.tick();
  controlTriage(w.store, w.policy, "pause", { repository: REPO });
  w.answer(30, question());
  w.fake.reset();
  w.fake.add(31);
  await w.tick();
  assert.equal(w.fake.calls.writes, 0);
  assert.equal(w.runOf(30).state, "held");
  assert.equal(
    runRows(w.store).filter((run) => run.number === 31).length,
    0,
    "no new run while paused",
  );
  controlTriage(w.store, w.policy, "resume", { repository: REPO });
  await w.tick();
  assert.equal(runRows(w.store).filter((run) => run.number === 31).length, 1);
  controlTriage(w.store, w.policy, "stop");
  w.fake.add(32);
  await w.tick();
  assert.equal(runRows(w.store).filter((run) => run.number === 32).length, 0);
  assert.equal(triageView(w.store, w.policy).stopAll !== null, true);
  controlTriage(w.store, w.policy, "start");
  await w.tick();
  assert.equal(runRows(w.store).filter((run) => run.number === 32).length, 1);
});

test("a pulled stop line stops triage in its scope", async (t) => {
  const w = triageWorkspace(t);
  pullCord(
    w.store,
    { scope: "repo", repository: "app", reason: "Main is red." },
    { by: { name: "owner" } },
  );
  w.fake.add(40);
  await w.tick();
  assert.equal(runRows(w.store).length, 0);
  assert.match(
    triageView(w.store, w.policy).repositories[0].hold,
    /line is stopped/,
  );
});

test("an item closed or merged while its run runs stops the run and sends nothing", async (t) => {
  const w = triageWorkspace(t);
  w.fake.add(50);
  w.fake.add(51, { pr: true });
  await w.tick();
  w.bind();
  w.fake.edit(50, { state: "closed" });
  w.fake.edit(51, {
    state: "closed",
    merged: true,
    pull_request: { url: "x", merged_at: w.fake.tick() },
  });
  w.fake.reset();
  await w.tick();
  assert.equal(w.runOf(50).state, "stopped");
  assert.match(w.runOf(50).reason, /closed while it ran/);
  assert.match(w.runOf(51).reason, /merged while it ran/);
  assert.match(w.item(50).triage.note, /closed while it ran/);
  assert.equal(w.fake.calls.writes, 0);
});

test("the Triage agent page shows runs, counts, caps and calls", async (t) => {
  const w = triageWorkspace(t);
  w.fake.add(60);
  w.fake.add(61);
  await w.tick();
  w.answer(60, question());
  await w.tick();
  const view = triageView(w.store, w.policy, w.github);
  assert.equal(view.inProgress.length, 1);
  assert.equal(view.runs.length, 2);
  assert.equal(view.runs.find((run) => run.number === 60).class, "question");
  assert.equal(view.repositories[0].cap, 50);
  assert.equal(view.repositories[0].left, 48);
  assert.ok(view.calls.rest >= 1);
  assert.ok(view.calls.writes >= 1);
  assert.equal(view.days[0].runs, 2);
});

test("a triage child the drain starts on process gets its repository's model proxy", async (t) => {
  const { enqueueSessionRequests } = await import("../session-requests.mjs");
  const { drainProcessRequests } = await import("../executors/process.mjs");
  const { childRecord, openSupervisorDatabase } = await import(
    "../supervisor.mjs"
  );
  const w = triageWorkspace(t);
  // The item's repository runs its roles on `process`, its model through a
  // loopback proxy; the triage role has no network of its own.
  w.store.put("repositories", {
    ...w.store.get("repositories", "app"),
    executor: "process",
    harness: "fake-cli",
    sandbox: {
      network: ["localhost:8080"],
      modelProxy: ["localhost:18471"],
    },
  });
  w.fake.add(1);
  const { dispatch } = await w.tick();
  enqueueSessionRequests(w.store, { starts: dispatch });
  const stateDirectory = fs.mkdtempSync(path.join(w.root, "state-"));
  const { errors } = await drainProcessRequests(w.store, {
    stateDirectory,
    ops: { github: w.github },
  });
  assert.deepEqual(errors, []);
  const [binding] = w.store
    .list("session_bindings")
    .filter((entry) => entry.role === "triage");
  const db = openSupervisorDatabase(stateDirectory);
  try {
    // What the supervisor will give the child: the proxy, and not the network.
    assert.deepEqual(
      JSON.parse(childRecord(db, binding.slot).settings).network,
      ["localhost:18471"],
    );
  } finally {
    db.close();
  }
});
