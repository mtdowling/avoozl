// Reading GitHub within its limits (triage-agent ta-2.1 to ta-2.3, TA10,
// design §D7), with the real client over a fake GitHub that counts calls
// by kind.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  countingClient,
  itemDetail,
  itemRow,
  pullFiles,
  readChangedItems,
  readPullCounts,
  triageBudget,
  triageCalls,
} from "../github-items.mjs";
import { fixture } from "./fixtures.mjs";
import { FakeGitHubApi } from "./fake-github-api.mjs";

const REPO = "o/app";

function setup(t, options = {}) {
  const { store } = fixture(t),
    fake = new FakeGitHubApi({ repository: REPO, ...options }),
    github = fake.client().bind(store, { sleep: async () => {} });
  return { store, fake, github };
}

test("an unchanged repository costs one conditional call answered 304", async (t) => {
  const w = setup(t);
  w.fake.add(1);
  w.fake.add(2, { pr: true });
  const first = await readChangedItems(w.store, w.github, REPO);
  assert.equal(first.changed.length, 2);
  assert.equal(w.fake.calls.rest, 1);
  // The first read takes the open items; from the next one on, every state
  // since the cursor, so a close is seen. That read changes nothing here.
  assert.deepEqual(
    (await readChangedItems(w.store, w.github, REPO)).changed,
    [],
  );
  w.fake.reset();
  const again = await readChangedItems(w.store, w.github, REPO);
  assert.equal(again.notModified, true);
  assert.deepEqual(w.fake.calls, {
    rest: 1,
    notModified: 1,
    graphql: 0,
    writes: 0,
  });
  // A change is read with one call, and only the changed item comes back.
  w.fake.reset();
  w.fake.edit(1, { title: "New title" });
  const changed = await readChangedItems(w.store, w.github, REPO);
  assert.deepEqual(
    changed.changed.map((row) => row.number),
    [1],
  );
  assert.equal(itemRow(w.store, REPO, 1).title, "New title");
  assert.equal(w.fake.calls.rest, 1);
});

test("this path makes no search call", () => {
  const source = fs.readFileSync(
    path.join(import.meta.dirname, "..", "github-items.mjs"),
    "utf8",
  );
  assert.doesNotMatch(source, /\/search\/|search\(|searchIssues/);
});

test("120 changed pull requests cost three GraphQL queries", async (t) => {
  const w = setup(t);
  for (let n = 1; n <= 120; n += 1)
    w.fake.add(n, { pr: true, checks: ["SUCCESS", "FAILURE", "SKIPPED"] });
  const { changed } = await readChangedItems(w.store, w.github, REPO);
  w.fake.reset();
  const queries = await readPullCounts(
    w.store,
    w.github,
    REPO,
    changed.filter((row) => row.kind === "pr").map((row) => row.number),
  );
  assert.equal(queries, 3);
  assert.equal(w.fake.calls.graphql, 3);
  assert.equal(w.fake.calls.rest, 0);
  assert.deepEqual(itemRow(w.store, REPO, 7).counts.checks, {
    failed: 1,
    passed: 1,
    skipped: 1,
    pending: 0,
  });
  assert.equal(itemRow(w.store, REPO, 7).counts.additions, 10);
});

test("opening an unchanged item twice costs one query, and a moved one is read again", async (t) => {
  const w = setup(t);
  w.fake.add(4);
  await readChangedItems(w.store, w.github, REPO);
  w.fake.reset();
  const first = await itemDetail(w.store, w.github, REPO, 4),
    second = await itemDetail(w.store, w.github, REPO, 4);
  assert.equal(first.read, true);
  assert.equal(second.read, false);
  assert.equal(w.fake.calls.graphql, 1);
  w.fake.edit(4, { body: "Edited." });
  await readChangedItems(w.store, w.github, REPO);
  const third = await itemDetail(w.store, w.github, REPO, 4);
  assert.equal(third.read, true);
  assert.equal(third.detail.body, "Edited.");
  assert.equal(w.fake.calls.graphql, 2);
});

test("a pull request's diff is read once per head", async (t) => {
  const w = setup(t);
  w.fake.add(8, { pr: true, head: "h1" });
  w.fake.files.set(8, [{ filename: "a.js", patch: "@@ -1 +1 @@\n-a\n+b" }]);
  await readChangedItems(w.store, w.github, REPO);
  w.fake.reset();
  assert.equal((await pullFiles(w.store, w.github, REPO, 8, "h1")).read, true);
  assert.equal((await pullFiles(w.store, w.github, REPO, 8, "h1")).read, false);
  assert.equal((await pullFiles(w.store, w.github, REPO, 8, "h2")).read, true);
});

test("below the low mark with a landing read waiting, triage reads and starts nothing", async (t) => {
  const low = setup(t, { remaining: 150 });
  low.fake.add(1);
  // The rate is known once any call has answered.
  await low.github.currentUser();
  assert.deepEqual(
    (({ read, start }) => ({ read, start }))(
      triageBudget(low.github, { othersWaiting: true }),
    ),
    { read: false, start: false },
  );
  // Nothing else waits: it may read, and still starts nothing.
  assert.deepEqual(
    (({ read, start }) => ({ read, start }))(triageBudget(low.github)),
    { read: true, start: false },
  );
  const high = setup(t, { remaining: 4000 });
  await high.github.currentUser();
  assert.deepEqual(
    (({ read, start }) => ({ read, start }))(
      triageBudget(high.github, { othersWaiting: true }),
    ),
    { read: true, start: true },
  );
});

test("triage's calls are counted by kind and match the fake's", async (t) => {
  const w = setup(t),
    now = () => w.fake.clock,
    counted = countingClient(w.github, w.store, { now });
  w.fake.add(1);
  w.fake.add(2, { pr: true });
  await readChangedItems(w.store, counted, REPO);
  await readChangedItems(w.store, counted, REPO);
  await readChangedItems(w.store, counted, REPO);
  await readPullCounts(w.store, counted, REPO, [2]);
  await itemDetail(w.store, counted, REPO, 1);
  await counted.createIssueComment(REPO, 1, "Hello");
  const calls = triageCalls(w.store, now());
  assert.deepEqual(
    {
      rest: calls.rest,
      notModified: calls.notModified,
      graphql: calls.graphql,
      writes: calls.writes,
    },
    w.fake.calls,
  );
  assert.equal(calls.notModified, 1);
  assert.equal(calls.writes, 1);
});

test("a write through the content-rules and driver guards is still counted", async (t) => {
  const { guardGitHub } = await import("../content-rules.mjs");
  const { driverGuard } = await import("../driver-scope.mjs");
  const w = setup(t),
    now = () => w.fake.clock,
    // As the tick builds it: the driver guard over the content guard.
    counted = countingClient(
      driverGuard(w.store, guardGitHub(w.github, w.store)),
      w.store,
      { now },
    );
  w.fake.add(1);
  await counted.createIssueComment(REPO, 1, "Hello");
  await counted.addLabels(REPO, 1, ["bug"]);
  assert.equal(triageCalls(w.store, now()).writes, 2);
  assert.equal(w.fake.calls.writes, 2);
});

test("the fake answers the open pull requests read the tick makes", async (t) => {
  const w = setup(t);
  w.fake.add(1);
  w.fake.add(2, { pr: true });
  const { open, recent } = await w.github.readOpenPullRequests(REPO);
  assert.deepEqual(
    open.map((pull) => pull.number),
    [2],
  );
  assert.deepEqual(recent, []);
});
