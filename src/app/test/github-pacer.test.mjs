// Paced GitHub writes: a serial pacer in front of every write, a journal that
// counts the windows, and a projection that stops at the cap and carries on.
// A virtual clock and fakes only: no network and no real waiting.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { GitHubClient } from "../github.mjs";
import {
  WritePacer,
  clampLimits,
  dueRun,
  paceEstimate,
  paceNeedsYou,
  readRun,
  runView,
} from "../github-pacer.mjs";
import { refreshProjectedReadiness } from "../github-projection.mjs";
import { planningIdentity } from "../github-marker.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { fixture } from "./fixtures.mjs";
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
    // 927 creates, 736 sub-issue links and 75 blocked-by links.
    writes = 927 + 736 + 75,
    estimate = paceEstimate(writes, [], start, {}),
    finish = Date.parse(estimate.finishAt);
  assert.equal(estimate.writes, 1738);
  // 400 an hour: four full hours of waiting cannot be needed for 1,738.
  assert.ok(
    finish - start > 3 * HOUR && finish - start < 4 * HOUR + 10 * MINUTE,
  );
  assert.equal(estimate.minutes, Math.ceil((finish - start) / MINUTE));
});

// ---- A projection that stops at the cap and carries on ----------------

const NAMESPACE = "avz_testtesttesttest";
const WRITE_CALLS = new Set([
  "createIssue",
  "updateIssue",
  "addLabels",
  "removeLabel",
  "addAssignees",
  "addSubIssue",
  "addIssueBlocker",
  "removeIssueBlocker",
  "createIssueComment",
  "updateIssueComment",
]);

// The in-memory GitHub, with each write passing a real pacer. `lose(n)` makes
// the nth issue the fake receives vanish from the answer (the issue is made,
// the reply is lost), as when a process is killed mid-request.
function pacedFake(store, time, limits) {
  const fake = new FakeGitHub(),
    pacer = new WritePacer(store, {
      now: time.read,
      sleep: time.sleep,
      limits: () => limits,
    }),
    state = { loseNthCreate: 0, creates: 0 };
  const proxy = new Proxy(fake, {
    get(target, name) {
      const value = Reflect.get(target, name);
      if (typeof value !== "function") return value;
      if (!WRITE_CALLS.has(name)) return value.bind(target);
      return (...args) =>
        pacer.run({ method: "POST", pathname: "/" + name }, async () => {
          const result = await value.apply(target, args);
          if (name === "createIssue" && ++state.creates === state.loseNthCreate)
            throw Object.assign(new Error("connection lost"), { status: 0 });
          return result;
        });
    },
  });
  proxy.pacer = pacer;
  return { fake, proxy, pacer, state };
}

async function projection(t, { tasks, limits }) {
  const { store } = fixture(t),
    time = clock(Date.now() - 6 * HOUR),
    { fake, proxy, pacer, state } = pacedFake(store, time, limits),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      github: {
        mode: "single-repo",
        repositories: { "example/code": { baseBranch: "main" } },
      },
    }),
  );
  const ops = new Operations(store, {
    github: proxy,
    operator: "Operator",
    workspaceRoot: root,
  });
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    worktreeRoot: "/tmp/code-worktrees",
    checks: [["npm", "test"]],
  });
  await ops.execute("github.configure", {
    repository: "example/code",
    projectId: "code",
    allowedActors: ["maintainer"],
  });
  const plan = await ops.execute("plan.create", {
    id: "big",
    prompt: "Project big",
    text:
      "# big\n\n" +
      Array.from(
        { length: tasks },
        (_, index) =>
          "```task\n" +
          JSON.stringify({
            id: "leaf-" + index,
            title: "Task " + index,
            acceptance: ["passes"],
            projectId: "code",
          }) +
          "\n```\n",
      ).join("\n"),
  });
  await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  return { store, time, fake, pacer, state, ops, plan, root };
}

const taskIds = (fake) =>
  fake.created
    .map((issue) =>
      JSON.parse(issue.body.match(/<!-- avoozl-task\n(.*)\n-->/)[1]),
    )
    .map((marker) => marker.taskId)
    .filter((id) => id.startsWith("leaf-") || /leaf-/.test(id));

test("a projection stops at the hour cap, resumes from the tick, and makes no duplicate", async (t) => {
  const { store, time, fake, ops, plan, root } = await projection(t, {
    tasks: 12,
    limits: { perMinute: 60, perHour: 10 },
  });
  await assert.rejects(
    ops.execute("github.project", { planId: plan.id }),
    (error) => error.paced === true,
  );
  assert.equal(readRun(store).state, "paused");
  const first = runView(store, time.now);
  assert.equal(first.done, 10);
  assert.ok(first.total > first.done, first.line);
  assert.match(first.line, /^10 of [\d,]+ writes, resumes at \d\d:\d\d$/);
  assert.equal(paceNeedsYou(store, time.now).length, 1);
  assert.equal(
    dueRun(store, time.now),
    null,
    "not due before its wait is over",
  );
  // The tick takes it up again whenever its time comes, until it is done.
  const identity = planningIdentity(root);
  for (
    let round = 0;
    round < 12 && readRun(store).state !== "done";
    round += 1
  ) {
    time.now = Math.max(time.now, readRun(store).resumeAt || 0);
    const done = await refreshProjectedReadiness(store, ops.github, {
      identity,
      now: time.now,
    });
    assert.deepEqual(done.errors, []);
  }
  assert.equal(readRun(store).state, "done");
  const ids = taskIds(fake);
  assert.equal(new Set(ids).size, 12);
  assert.equal(ids.length, 12, "no task has two issues");
  assert.equal(paceNeedsYou(store, time.now).length, 0);
});

test("a reply lost after the issue was made does not make a second issue", async (t) => {
  const { store, time, fake, state, ops, plan } = await projection(t, {
    tasks: 6,
    limits: { perMinute: 60, perHour: 400 },
  });
  state.loseNthCreate = 3;
  await assert.rejects(
    ops.execute("github.project", { planId: plan.id }),
    /connection lost/,
  );
  assert.equal(fake.created.length, 3);
  await ops.execute("github.project", { planId: plan.id });
  assert.equal(new Set(taskIds(fake)).size, 6);
  assert.equal(taskIds(fake).length, 6);
  assert.equal(time.now > 0, true);
});

test("a run cut off is picked up again, and the preview counts what the run writes", async (t) => {
  const { store, fake, pacer, ops, plan } = await projection(t, {
    tasks: 10,
    limits: { perMinute: 60, perHour: 400 },
  });
  const preview = await ops.execute("github.project.preview", {
    planId: plan.id,
  });
  assert.equal(preview.pace.writes, preview.writes.length);
  assert.equal(preview.pace.perMinute, 60);
  await ops.execute("github.project", { planId: plan.id });
  const issues = fake.created.length,
    written = store.db
      .prepare("SELECT COUNT(*) AS n FROM github_write_journal")
      .get().n;
  assert.equal(issues, 10);
  // The preview names every write the run makes, plus none it does not.
  assert.equal(written, preview.writes.length);
  assert.equal(written / issues, 1, "one create call per ready leaf");
  // The ready label rides in the create call: no separate label write.
  assert.ok(fake.created.some((issue) => issue.labels.length === 2));
  assert.equal(pacer.history().length, written);
});
