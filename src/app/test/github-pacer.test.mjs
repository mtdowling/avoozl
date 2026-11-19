// Paced GitHub writes: a serial pacer in front of every write, a journal that
// counts the windows, and the pace estimate.
// A virtual clock and fakes only: no network and no real waiting.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { GitHubClient } from "../github.mjs";
import { WritePacer, clampLimits, paceEstimate } from "../github-pacer.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// The most writes any sliding window of `span` ms holds.
const busiest = (times, span) =>
  Math.max(
    0,
    ...times.map(
      (start) => times.filter((at) => at >= start && at < start + span).length,
    ),
  );

function clock(start = Date.parse("2026-11-15T10:00:00Z")) {
  const time = { now: start };
  time.read = () => time.now;
  time.sleep = async (ms) => {
    time.now += ms;
  };
  return time;
}

// A GitHub over fetch that creates issues, and refuses with a secondary limit
// once when `refuseAt` writes have gone through.
function fakeFetch(time, { refuseAt = 0 } = {}) {
  const log = { writes: [], refused: 0, sentWhileHeld: 0 };
  let heldUntil = 0;
  const fetch = async (url, options) => {
    if (options.method === "GET") return new Response("[]", { status: 200 });
    if (time.now < heldUntil) log.sentWhileHeld += 1;
    log.writes.push(time.now);
    if (refuseAt && log.writes.length === refuseAt) {
      log.refused += 1;
      heldUntil = time.now + 30 * 1000;
      return new Response(
        JSON.stringify({
          message: "You have exceeded a secondary rate limit.",
        }),
        { status: 403, headers: { "retry-after": "30" } },
      );
    }
    return new Response(JSON.stringify({ number: log.writes.length }), {
      status: 201,
    });
  };
  return { fetch, log };
}

function client(t, time, fetch, limits) {
  const store = new Store(
      path.join(temporaryDirectory("avoozl-pacer-"), "workspace.sqlite"),
    ),
    github = new GitHubClient({ token: "t", fetch }).bind(store, {
      now: time.read,
      sleep: time.sleep,
      writeLimits: () => limits,
    });
  t.after(() => store.close());
  return { store, github };
}

// Makes `count` issues, waiting out each pause the pacer reports.
async function createAll(github, time, count) {
  let made = 0,
    pauses = 0;
  while (made < count) {
    try {
      await github.createIssue("o/r", {
        title: "t" + made,
        labels: ["a", "b"],
      });
      made += 1;
    } catch (error) {
      assert.ok(error.rateLimited, error.message);
      pauses += 1;
      time.now = Math.max(time.now, error.rateLimited.until);
    }
  }
  return pauses;
}

test("writes never go past the minute and hour caps", async (t) => {
  const time = clock(),
    { fetch, log } = fakeFetch(time),
    { github } = client(t, time, fetch, { perMinute: 30, perHour: 100 });
  const pauses = await createAll(github, time, 250);
  assert.equal(log.writes.length, 250);
  assert.ok(busiest(log.writes, MINUTE) <= 30);
  assert.ok(busiest(log.writes, HOUR) <= 100);
  assert.ok(pauses >= 2, "the hour cap stopped the run more than once");
});

test("settings above GitHub's ceilings are held to 80 a minute and 500 an hour", () => {
  assert.deepEqual(clampLimits({ perMinute: 900, perHour: 9000 }), {
    perMinute: 80,
    perHour: 500,
  });
  assert.deepEqual(clampLimits({}), { perMinute: 60, perHour: 400 });
});

test("a secondary-limit refusal holds every write until its retry-after", async (t) => {
  const time = clock(),
    { fetch, log } = fakeFetch(time, { refuseAt: 5 }),
    { github } = client(t, time, fetch, {});
  const pauses = await createAll(github, time, 20);
  assert.equal(log.refused, 1);
  assert.equal(log.sentWhileHeld, 0, "nothing was sent while held");
  assert.ok(pauses >= 1);
  assert.equal(log.writes.length, 21, "20 created and the one refused");
});

test("a primary limit under 10% left stops writes until its reset", async (t) => {
  const time = clock(),
    reset = Math.floor((time.now + 20 * MINUTE) / 1000),
    { store } = client(t, time, async () => new Response("{}"), {}),
    pacer = new WritePacer(store, {
      now: time.read,
      sleep: time.sleep,
      primary: () => ({ limit: 5000, remaining: 400, resetAtMs: reset * 1000 }),
    });
  await assert.rejects(
    pacer.run({ method: "POST", pathname: "/x" }, async () => {}),
    (error) => error.paced && error.rateLimited.until === reset * 1000,
  );
});

test("a write cut off before it was recorded is found again on restart", (t) => {
  const time = clock(),
    { store } = client(t, time, async () => new Response("{}"), {});
  new WritePacer(store, { now: time.read }).history();
  store.db
    .prepare("INSERT INTO github_write_journal(at,method,path) VALUES (?,?,?)")
    .run(time.now, "POST", "/repos/o/r/issues");
  let interrupted = 0;
  new WritePacer(store, {
    now: time.read,
    onInterrupted: () => (interrupted += 1),
  }).history();
  assert.equal(interrupted, 1);
});

test("the estimate for 927 issues replays the pace and respects both caps", () => {
  const start = Date.parse("2026-11-15T10:00:00Z"),
    // 927 creates (each under its parent), 75 blocked-by links and the
    // marker rewrite each of those issues needs.
    writes = 927 + 75 + 75,
    estimate = paceEstimate(writes, [], start, {}),
    finish = Date.parse(estimate.finishAt);
  assert.equal(estimate.writes, 1077);
  // 400 an hour: 1,077 writes need two full waits and part of a third hour.
  assert.ok(finish - start > 2 * HOUR && finish - start < 3 * HOUR);
  assert.equal(estimate.minutes, Math.ceil((finish - start) / MINUTE));
});

// ---- A projection that stops at the cap and carries on ----------------

test("GraphQL createIssue and addBlockedBy are one paced write each", async (t) => {
  const time = clock(),
    sent = [],
    fetch = async (url, options) => {
      const path = new URL(url).pathname,
        body = options.body ? JSON.parse(options.body) : null;
      if (options.method === "POST") sent.push({ path, body });
      if (path === "/repos/o/r")
        return new Response(JSON.stringify({ node_id: "R1" }));
      if (path.startsWith("/repos/o/r/labels/"))
        return new Response(
          JSON.stringify({ node_id: "L_" + path.split("/").pop() }),
        );
      if (path === "/graphql" && /createIssue/.test(body.query))
        return new Response(
          JSON.stringify({
            data: {
              createIssue: {
                issue: {
                  id: "I1",
                  databaseId: 11,
                  number: 5,
                  url: "u",
                  state: "OPEN",
                  title: "t",
                  body: "b",
                  labels: { nodes: [{ name: "a" }] },
                  assignees: { nodes: [] },
                  subIssuesSummary: { total: 0 },
                },
              },
            },
          }),
        );
      return new Response(JSON.stringify({ data: { addBlockedBy: {} } }));
    },
    { store, github } = client(t, time, fetch, {});
  const issue = await github.createIssue("o/r", {
    title: "t",
    body: "b",
    labels: ["a", "b"],
    parentIssueId: "P1",
  });
  assert.equal(issue.node_id, "I1");
  assert.equal(issue.number, 5);
  await github.addIssueBlocker("o/r", 5, 99, {
    issueId: "I1",
    blockingIssueId: "I0",
  });
  assert.deepEqual(
    sent.map((call) => call.path),
    ["/graphql", "/graphql"],
  );
  assert.deepEqual(sent[0].body.variables.input, {
    repositoryId: "R1",
    title: "t",
    body: "b",
    parentIssueId: "P1",
    // Avoozl's ownership label rides in the same create (R103.1).
    labelIds: ["L_a", "L_b", "L_crew%3Aavoozl"],
  });
  assert.match(sent[1].body.query, /addBlockedBy/);
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM github_write_journal").get().n,
    2,
    "each mutation is one write in the journal",
  );
});
