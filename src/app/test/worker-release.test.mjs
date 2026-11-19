// Task 43.4 (R90.6, R102.14): grants end only by a settled verified result or
// a person's release; quiet never releases, and a stale grant reaches Needs
// you with the release offered.
import assert from "node:assert/strict";
import test from "node:test";
import { workspaceConfig } from "../config.mjs";
import fs from "node:fs";
import path from "node:path";
import { appendRecord, githubJournal } from "../spec-journal.mjs";
import { Store } from "../store.mjs";
import {
  grantBranch,
  publishOffer,
  requestBody,
  reserveGrants,
} from "../worker-grants.mjs";
import {
  checkStaleGrants,
  grantRows,
  grantStaleMs,
  grantStatus,
  reconcileGrants,
  releaseGrant,
  staleNotices,
} from "../worker-release.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const SPEC = "demo",
  D1 = "d".repeat(16),
  D2 = "e".repeat(16),
  DEF = "b".repeat(64),
  OPTIONS = { visibility: "private" },
  OWNER = { login: "owner", from: "spec" },
  HOUR = 3_600_000,
  T0 = Date.parse("2026-11-18T00:00:00Z");

function world() {
  const comments = [],
    branches = new Set(),
    clock = { now: T0 };
  const as = (actor) => ({
    available: () => true,
    listIssueComments: async () =>
      comments.map((c) => ({
        id: c.id,
        body: c.body,
        user: { login: c.author },
        created_at: c.at,
        updated_at: c.at,
      })),
    createIssueComment: async (_repo, _number, body) => {
      const id = 100 + comments.length * 3;
      comments.push({
        id,
        body,
        author: actor,
        at: new Date(clock.now).toISOString(),
      });
      return { id };
    },
    permission: async (_repo, login) => ({
      permission: login === "owner" ? "admin" : "read",
    }),
    branch: async () => ({ commit: { sha: "c".repeat(40) } }),
    createBranch: async (repo, name) => {
      const key = `${repo}:${name}`;
      if (branches.has(key))
        throw Object.assign(new Error("exists"), { status: 422 });
      branches.add(key);
      return {};
    },
    deleteBranch: async (repo, name) => {
      branches.delete(`${repo}:${name}`);
    },
  });
  return { comments, branches, clock, as };
}

const driving = (w, journal, driver = D1) => ({
  github: w.as("owner"),
  journal,
  options: OPTIONS,
  driver,
  owner: OWNER,
  login: "owner",
  spec: SPEC,
  grants: "example/code",
});
const offer = (journal, worker, driver = D1, task = "t1") =>
  publishOffer(
    journal,
    {
      driver,
      owner: OWNER,
      login: "owner",
      spec: SPEC,
      task,
      definition: DEF,
      worker,
      ref: {
        repository: "fork/code",
        branch: "avoozl/demo/work",
        commit: "a".repeat(40),
      },
      base: "a".repeat(40),
    },
    OPTIONS,
  );
const ask = (w, login, generation = 1, task = "t1") =>
  w
    .as(login)
    .createIssueComment(
      "example/plans",
      1,
      requestBody({ spec: SPEC, task, definition: DEF, generation }),
    );

// A granted task: generation 1, one offer, one request, one acknowledgment.
async function granted() {
  const w = world(),
    journal = githubJournal(w.as("owner"), "example/plans", 1);
  await appendRecord(
    journal,
    {
      op: "generation-1",
      kind: "generation",
      spec: SPEC,
      generation: 1,
      driver: D1,
    },
    OPTIONS,
  );
  await offer(journal, "worker-a");
  await ask(w, "worker-a");
  const result = await reserveGrants({ ...driving(w, journal), base: "main" });
  assert.equal(result.acknowledged.length, 1);
  return { w, journal };
}
const state = async (journal) =>
  (await grantStatus(journal, OPTIONS, { now: T0 + 48 * HOUR }))[0];

test("a quiet grant turns stale and is never released by itself", async () => {
  const { w, journal } = await granted();
  w.clock.now = T0 + 48 * HOUR;
  const row = await state(journal);
  assert.equal(row.stale, true);
  assert.equal(row.settled, false);
  // Every driver pass leaves it alone.
  const pass = await reconcileGrants(driving(w, journal));
  assert.deepEqual([pass.carried, pass.settled], [[], []]);
  const again = await reserveGrants({ ...driving(w, journal), base: "main" });
  assert.deepEqual(again.acknowledged, []);
  assert.equal(w.branches.size, 1);
  assert.equal((await grantStatus(journal, OPTIONS, {})).length, 1);
});

test("the stale limit is configurable and a recent grant is not stale", async () => {
  assert.equal(grantStaleMs(undefined), 24 * HOUR);
  assert.equal(grantStaleMs("90m"), 90 * 60_000);
  assert.equal(grantStaleMs("2d"), 48 * HOUR);
  assert.throws(() => grantStaleMs("soon"));
  const { journal } = await granted();
  const rows = await grantStatus(journal, OPTIONS, {
    now: T0 + 2 * HOUR,
    staleAfter: grantStaleMs("1h"),
  });
  assert.equal(rows[0].stale, true);
  const fresh = await grantStatus(journal, OPTIONS, { now: T0 + HOUR / 2 });
  assert.equal(fresh[0].stale, false);
  // A worker seen later keeps the grant fresh.
  const seen = await grantStatus(journal, OPTIONS, {
    now: T0 + 30 * HOUR,
    seen: { t1: new Date(T0 + 29 * HOUR).toISOString() },
  });
  assert.equal(seen[0].stale, false);
});

test("only a person releases, only the owner, and the task can be granted again", async () => {
  const { w, journal } = await granted(),
    release = (over = {}) =>
      releaseGrant({
        ...driving(w, journal),
        task: "t1",
        by: { kind: "person" },
        ...over,
      });
  await assert.rejects(release({ by: { kind: "session" } }), /person's action/);
  await assert.rejects(release({ login: "mallory" }), /owner-changed/);
  assert.equal(w.branches.size, 1);
  const done = await release();
  assert.equal(done.task, "t1");
  assert.equal(w.branches.size, 0);
  assert.deepEqual(await grantStatus(journal, OPTIONS, {}), []);
  await assert.rejects(release(), /no active grant/);
  // The released task is granted afresh by another worker.
  await offer(journal, "worker-b");
  await ask(w, "worker-b");
  const next = await reserveGrants({ ...driving(w, journal), base: "main" });
  assert.deepEqual(
    next.acknowledged.map((a) => a.task),
    ["t1"],
  );
});

test("a takeover carries the grant to the same worker and reissues nothing", async () => {
  const { w, journal } = await granted();
  await appendRecord(
    journal,
    {
      op: "generation-2",
      kind: "generation",
      spec: SPEC,
      generation: 2,
      driver: D2,
    },
    OPTIONS,
  );
  const second = driving(w, journal, D2);
  assert.equal((await grantStatus(journal, OPTIONS, {}))[0].carried, true);
  const pass = await reconcileGrants(second);
  assert.deepEqual(pass.carried, ["t1"]);
  const [row] = await grantStatus(journal, OPTIONS, {});
  assert.equal(row.carried, false);
  assert.equal(row.generation, 2);
  // Another worker asking now is refused: the grant is held, not reissued.
  await offer(journal, "worker-b", D2);
  await ask(w, "worker-b", 2);
  const refused = await reserveGrants({ ...second, base: "main" });
  assert.deepEqual(refused.acknowledged, []);
  assert.deepEqual(
    refused.declined.map((d) => d.reason),
    ["granted"],
  );
  // A second reconcile writes nothing more.
  assert.deepEqual((await reconcileGrants(second)).carried, []);
});

test("an accepted result settles its grant", async () => {
  const { w, journal } = await granted();
  await appendRecord(
    journal,
    {
      op: "done-1",
      kind: "outcome",
      spec: SPEC,
      revision: "a".repeat(64),
      driver: D1,
      outcomes: [{ task: "t1", kind: "done", definition: DEF }],
    },
    OPTIONS,
  );
  const result = await reconcileGrants(driving(w, journal));
  assert.deepEqual(result.settled, ["t1"]);
  assert.equal(w.branches.size, 0);
  assert.deepEqual(await grantStatus(journal, OPTIONS, {}), []);
});

test("Needs you shows a stale grant once, with Release grant offered", async () => {
  const { journal } = await granted(),
    rows = await grantStatus(journal, OPTIONS, { now: T0 + 48 * HOUR }),
    [notice] = staleNotices(rows, { spec: SPEC });
  assert.equal(notice.channel, "decision");
  assert.match(notice.resume, /spec grants release demo t1/);
  assert.deepEqual(
    staleNotices(grantRows({ grants: [], generation: 1, outcomes: [] }), {
      spec: SPEC,
    }),
    [],
  );

  const root = temporaryDirectory("avoozl-grant-notice-"),
    { dbPath } = workspaceConfig({ workspace: root, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  try {
    const run = (now) =>
      checkStaleGrants(store, {
        workspaceRoot: root,
        driving: [SPEC],
        now,
        journalFor: async () => ({ journal, options: OPTIONS }),
      });
    assert.equal(await run(T0 + 48 * HOUR), 1);
    // Within ten minutes it does not look again; later it queues no new row.
    assert.equal(await run(T0 + 48 * HOUR + 60_000), 0);
    assert.equal(await run(T0 + 49 * HOUR), 0);
  } finally {
    store.close();
  }
});
