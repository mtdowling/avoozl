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
  refuseOtherRun,
  runView,
} from "../github-pacer.mjs";
import { refreshProjectedReadiness } from "../github-projection.mjs";
import { planningIdentity } from "../github-marker.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import { setRadarHandoverPaused } from "../coder-adapter.mjs";

// These tests cover the Radar hand-over kept while Phase 45 is paused
// (R103.4 pauses it in the product).
setRadarHandoverPaused(false);

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

async function projection(t, { tasks, limits, extra = () => ({}) }) {
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
            ...extra(index),
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

test("a second plan's projection is refused while another run is paused", async (t) => {
  const { store, ops, plan } = await projection(t, {
    tasks: 12,
    limits: { perMinute: 60, perHour: 10 },
  });
  await assert.rejects(
    ops.execute("github.project", { planId: plan.id }),
    (error) => error.paced === true,
  );
  const paused = readRun(store);
  await assert.rejects(
    ops.execute("github.project", { planId: "another-plan" }),
    (error) =>
      error.status === 409 &&
      error.message.includes(`still projecting ${plan.id} (paused)`),
  );
  // The paused run is kept as it was, and its own plan may go again.
  assert.deepEqual(readRun(store), paused);
  assert.doesNotThrow(() => refuseOtherRun(store, plan.id));
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

test("a child is made under its parent in the create call, with no addSubIssue", async (t) => {
  const { store, fake, state, ops, plan } = await projection(t, {
    tasks: 4,
    limits: { perMinute: 60, perHour: 400 },
  });
  // Task 0 becomes a package; the other three sit under it.
  const tasks = store.read().tasks,
    byTitle = (title) => tasks.find((task) => task.title === title);
  store.mutate("Nest", (data) => {
    const parent = data.tasks.find((task) => task.title === "Task 0");
    parent.kind = "package";
    for (const task of data.tasks)
      if (/^Task [123]$/.test(task.title)) task.parent = parent.id;
  });
  assert.ok(byTitle("Task 0"));
  let linked = 0;
  const add = fake.addSubIssue.bind(fake);
  fake.addSubIssue = (...args) => ((linked += 1), add(...args));
  state.loseNthCreate = 0;
  await ops.execute("github.project", { planId: plan.id });
  const parent = fake.created.find((issue) =>
    issue.body.includes('"taskId":"' + byTitle("Task 0").id + '"'),
  );
  assert.ok(parent, "the package issue exists");
  const under = fake.subIssues.filter(([number]) => number === parent.number);
  assert.equal(under.length, 3, "three children sit under the package");
  assert.equal(linked, 0, "no child needed its own link call");
  // The package came first.
  assert.equal(fake.created[0].number, parent.number);
});

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

test("a fresh projection is made in graph order and never edited after", async (t) => {
  // Listed backwards: leaf-0 waits on leaf-1 and leaf-2, leaf-1 on leaf-3,
  // and leaf-4 is a package over leaf-2 and leaf-3.
  const requires = { 0: ["leaf-1", "leaf-2"], 1: ["leaf-3"] },
    { store, fake, ops, plan } = await projection(t, {
      tasks: 5,
      limits: { perMinute: 60, perHour: 400 },
      extra: (index) => (requires[index] ? { requires: requires[index] } : {}),
    });
  const idOf = (title) =>
    store.read().tasks.find((task) => task.title === title).id;
  store.mutate("Nest", (data) => {
    const parent = data.tasks.find((task) => task.title === "Task 4");
    parent.kind = "package";
    for (const task of data.tasks)
      if (["Task 2", "Task 3"].includes(task.title)) task.parent = parent.id;
  });
  const calls = { updateIssue: 0, addSubIssue: 0, addIssueBlocker: 0 };
  for (const name of Object.keys(calls)) {
    const call = fake[name].bind(fake);
    fake[name] = (...args) => ((calls[name] += 1), call(...args));
  }
  await ops.execute("github.project", { planId: plan.id });
  assert.equal(calls.updateIssue, 0, "no issue is edited after its create");
  assert.equal(calls.addSubIssue, 0, "every child is made under its parent");
  // One link per real edge: 0<-1, 0<-2, 1<-3. A package's own roll-up
  // edges from its children, if the graph has them, are links too.
  const rollups = store
    .read()
    .edges.filter(
      (edge) =>
        edge.to === idOf("Task 4") &&
        [idOf("Task 2"), idOf("Task 3")].includes(edge.from),
    ).length;
  assert.equal(calls.addIssueBlocker, 3 + rollups);
  // Each issue is made after what it waits on, and its body links them.
  const made = (title) =>
      fake.created.find((issue) =>
        issue.body.includes('"taskId":"' + idOf(title) + '"'),
      ),
    at = (title) => fake.created.indexOf(made(title));
  assert.ok(at("Task 4") < at("Task 2") && at("Task 4") < at("Task 3"));
  assert.ok(at("Task 3") < at("Task 1") && at("Task 1") < at("Task 0"));
  assert.ok(at("Task 2") < at("Task 0"));
  assert.match(
    made("Task 0").body,
    new RegExp(`- ${idOf("Task 1")} \\(#${made("Task 1").number}\\)`),
  );
  assert.match(
    made("Task 2").body,
    new RegExp(`Parent: #${made("Task 4").number}`),
  );
  // A second projection finds everything in step and writes nothing.
  const before =
    fake.created.length + calls.updateIssue + calls.addIssueBlocker;
  await ops.execute("github.project", { planId: plan.id });
  assert.equal(
    fake.created.length + calls.updateIssue + calls.addIssueBlocker,
    before,
  );
});

test("a cycle through parents and blockers fails the preview, writing nothing", async (t) => {
  // Task 1 is the package over Task 0, so it is made first. It also waits on
  // Task 2, which waits on Task 0: no create order exists.
  const { store, fake, ops, plan } = await projection(t, {
    tasks: 3,
    limits: { perMinute: 60, perHour: 400 },
    extra: (index) =>
      index === 1
        ? { requires: ["leaf-2"] }
        : index === 2
          ? { requires: ["leaf-0"] }
          : {},
  });
  store.mutate("Nest", (data) => {
    const parent = data.tasks.find((task) => task.title === "Task 1");
    parent.kind = "package";
    data.tasks.find((task) => task.title === "Task 0").parent = parent.id;
  });
  await assert.rejects(
    ops.execute("github.project.preview", { planId: plan.id }),
    /cycle/,
  );
  await assert.rejects(
    ops.execute("github.project", { planId: plan.id }),
    /cycle/,
  );
  assert.equal(fake.created.length, 0);
});
