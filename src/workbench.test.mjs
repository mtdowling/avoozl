import test from "node:test";
import assert from "node:assert/strict";
import {
  nowBoard,
  taskTree,
  taskSignals,
  focusedNeighborhood,
  taskSession,
  conversationSignal,
  recentLandings,
} from "./workbench-model.mjs";
import { createWorkbench } from "./workbench.mjs";
import { queryTasks } from "./query.mjs";

const now = Date.parse("2026-11-09T01:00:00Z");
function fixture() {
  const task = (id, extra = {}) => ({
    id,
    title: id,
    epic: "W1",
    track: "core",
    scope: "runtime",
    status: "planned",
    tags: [],
    ...extra,
  });
  return {
    statuses: [
      { id: "planned" },
      { id: "partial" },
      { id: "accepted", complete: true },
      { id: "deferred" },
      { id: "review" },
      { id: "blocked" },
    ],
    epics: [{ id: "W1" }, { id: "W2" }],
    tracks: [{ id: "core" }],
    documents: { "done/old.md": { historical: true } },
    tasks: [
      task("done", { status: "accepted" }),
      task("ready"),
      task("blocked"),
      task("supported"),
      task("partial", { status: "partial" }),
      task("deferred", { status: "deferred" }),
    ],
    edges: [
      { from: "done", to: "ready", kind: "requires" },
      { from: "partial", to: "blocked", kind: "sequence" },
      { from: "partial", to: "supported", kind: "supports" },
    ],
  };
}
test("workbench readiness agrees with the existing query and ignores supporting links", () => {
  const data = fixture();
  assert.deepEqual(
    data.tasks
      .filter((task) => taskSignals(data, task, now).ready)
      .map((task) => task.id),
    queryTasks(data, { scope: "all", q: "ready:true" }).map((task) => task.id),
  );
  assert.deepEqual(taskSignals(data, data.tasks[2], now).blockers, ["partial"]);
});
test("Now distinguishes reported activity, stale ownership and actual completion", () => {
  const data = fixture();
  data.tasks[1].activity = {
    state: "active",
    owner: "Agent",
    expiresAt: new Date(now + 60000).toISOString(),
  };
  data.tasks[4].activity = {
    state: "active",
    owner: "Agent",
    expiresAt: new Date(now - 1).toISOString(),
  };
  let lanes = nowBoard(data, data.tasks, { now });
  assert.deepEqual(
    lanes.reported.map((task) => task.id),
    ["ready"],
  );
  assert.deepEqual(
    lanes.attention.map((task) => task.id),
    ["partial"],
  );
  assert.deepEqual(
    lanes.ready.map((task) => task.id),
    ["supported"],
  );
  assert.deepEqual(
    lanes.completed.map((task) => task.id),
    ["done"],
  );
  lanes = nowBoard(data, data.tasks, { now: now + 60001 });
  assert.equal(lanes.reported.length, 0);
  assert.equal(lanes.attention.length, 2);
});
test("tree completion denominator is stable when completed rows are hidden", () => {
  const data = fixture(),
    before = structuredClone(data);
  const hidden = taskTree(data, data.tasks),
    shown = taskTree(data, data.tasks, { completed: true });
  assert.equal(hidden[0].total, shown[0].total);
  assert.equal(hidden[0].complete, 1);
  assert.equal(hidden[0].tasks.length + 1, shown[0].tasks.length);
  assert.deepEqual(
    data,
    before,
    "read-only UI must preserve task state and task order",
  );
});
test("historical inventory is opt-in and explicit metadata survives grouping", () => {
  const data = fixture();
  data.tasks.push({
    ...data.tasks[1],
    id: "old",
    source: { document: "done/old.md" },
  });
  assert.ok(
    !taskTree(data, data.tasks)[0].tasks.some((task) => task.id === "old"),
  );
  assert.ok(
    taskTree(data, data.tasks, { inventory: true })[0].tasks.some(
      (task) => task.id === "old",
    ),
  );
});
test("a focused graph is one hop and does not mistake dependencies for parents", () => {
  const data = fixture();
  data.tasks.push({ ...data.tasks[1], id: "far" });
  data.edges.push({ from: "blocked", to: "far", kind: "requires" });
  assert.deepEqual(focusedNeighborhood(data, "partial").sort(), [
    "blocked",
    "partial",
    "supported",
  ]);
  assert.deepEqual(focusedNeighborhood(data, "missing"), []);
});
test("Now never hides a reported work session behind the inventory toggle", () => {
  const data = fixture();
  data.tasks[1].tags = ["historical"];
  data.tasks[1].activity = {
    state: "active",
    owner: "Agent",
    expiresAt: new Date(now + 60000).toISOString(),
  };
  assert.deepEqual(
    nowBoard(data, data.tasks, { now }).reported.map((task) => task.id),
    ["ready"],
  );
  assert.ok(
    nowBoard(data, data.tasks, { now: now + 60001 }).attention.some(
      (task) => task.id === "ready",
    ),
  );
});
test("Now opens the exact checked-in session before other active work on the task", () => {
  const task = { id: "delivery", activity: { sessionId: "thread-checked-in" } };
  const runs = [
    { id: "run-new", taskId: "delivery", state: "running" },
    {
      id: "run-checked-in",
      providerSessionId: "thread-checked-in",
      taskId: "delivery",
      state: "completed",
    },
  ];
  assert.equal(taskSession(runs, task).id, "run-checked-in");
  assert.equal(
    taskSession(runs, { ...task, activity: { sessionId: "external-check-in" } })
      .id,
    "run-new",
  );
  assert.equal(
    taskSession([{ ...runs[0], state: "completed" }], task),
    null,
    "An earlier completed task run must not impersonate an external lease.",
  );
  assert.equal(taskSession([{ ...runs[1], deletedAt: "today" }], task), null);
});

test("conversation signals distinguish attention, activity and unread completed replies", () => {
  for (const [state, kind] of Object.entries({
    "waiting-input": "input",
    "waiting-approval": "approval",
    starting: "working",
    running: "working",
    failed: "failed",
    disconnected: "disconnected",
    interrupted: "stopped",
    observing: "external",
  }))
    assert.equal(conversationSignal({ state }).kind, kind);
  const run = { state: "completed", updatedAt: "2026-11-09T12:00:00Z" };
  assert.equal(conversationSignal(run).kind, "unread");
  assert.equal(conversationSignal(run, run.updatedAt).kind, "read");
  assert.equal(
    conversationSignal(
      { ...run, updatedAt: "2026-11-09T12:01:00Z" },
      run.updatedAt,
    ).kind,
    "unread",
  );
  assert.match(
    conversationSignal({ state: "observing" }).label,
    /status unavailable/,
  );
});

test("Recently landed requires integration receipts, respects filters, and sorts by landing time", () => {
  const data = fixture(),
    at = new Date(now - 1000).toISOString(),
    older = new Date(now - 60000).toISOString();
  data.tasks[0].updatedAt = new Date(now).toISOString();
  data.tasks[1].integration = { commit: "1234567", at: older, branch: "main" };
  data.tasks[2].integration = { commit: "abcdef0", at, branch: "main" };
  data.tasks[3].integration = {
    commit: "abcdef1",
    at: new Date(now - 31 * 86400000).toISOString(),
  };
  const before = structuredClone(data),
    rows = recentLandings(data, data.tasks, [], { now });
  assert.deepEqual(
    rows.map((r) => r.task.id),
    ["blocked", "ready"],
  );
  assert.deepEqual(
    recentLandings(data, [data.tasks[1]], [], { now }).map((r) => r.task.id),
    ["ready"],
  );
  assert.deepEqual(
    data,
    before,
    "A landing list must not change source status or task order.",
  );
  assert.ok(
    !rows.some((r) => r.task.id === "done"),
    "Accepted status and recently edited prose alone do not prove landing.",
  );
});
test("Recently landed deduplicates managed receipts and keeps acceptance explicit and current", () => {
  const data = fixture(),
    at = new Date(now - 1000).toISOString();
  data.tasks[1].integration = { commit: "1234567", at };
  data.tasks[1].status = "accepted";
  const entries = [
    {
      taskId: "ready",
      state: "integrated",
      integratedCommit: "1234567",
      integratedAt: at,
      runId: "run-ready",
    },
    { taskId: "blocked", state: "ready", commit: "abcdef0", createdAt: at },
  ];
  let rows = recentLandings(data, data.tasks, entries, { now });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].acceptance, "pending");
  assert.equal(rows[0].runId, "run-ready");
  data.tasks[1].acceptanceEvidence = {
    at: new Date(now).toISOString(),
    evidence: "Explicit acceptance",
    componentOnly: true,
  };
  assert.equal(
    recentLandings(data, data.tasks, [], { now })[0].acceptance,
    "component",
  );
  data.tasks[1].acceptanceEvidence.componentOnly = false;
  assert.equal(
    recentLandings(data, data.tasks, [], { now })[0].acceptance,
    "accepted",
  );
  data.tasks[1].acceptanceEvidence.at = new Date(now - 2000).toISOString();
  assert.equal(
    recentLandings(data, data.tasks, [], { now })[0].acceptance,
    "pending",
  );
});
test("Recently landed excludes historical, malformed, future and undated receipts", () => {
  const data = fixture(),
    at = new Date(now - 1000).toISOString();
  data.tasks[0].integration = { commit: "1234567", at };
  data.tasks[0].tags = ["historical"];
  data.tasks[1].integration = { commit: "not-a-commit", at };
  data.tasks[2].integration = { commit: "1234567" };
  data.tasks[3].integration = {
    commit: "1234567",
    at: new Date(now + 1000).toISOString(),
  };
  data.tasks[4].integration = { commit: 1234567, at };
  assert.deepEqual(recentLandings(data, data.tasks, [], { now }), []);
});

test("Now keeps task navigation on rows and session attachment on explicit accessible controls", async () => {
  const original = Object.fromEntries(
      ["document", "fetch", "localStorage", "window"].map((key) => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key),
      ]),
    ),
    install = (key, value) =>
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value,
      }),
    restore = (key) =>
      original[key]
        ? Object.defineProperty(globalThis, key, original[key])
        : delete globalThis[key],
    element = () => ({
      hidden: false,
      innerHTML: "",
      scrollTop: 0,
      addEventListener() {},
      querySelector() {
        return null;
      },
      replaceChildren() {
        this.innerHTML = "";
      },
    }),
    tasksElement = element(),
    nowElement = element(),
    data = fixture();
  let workbench,
    fetches = 0;
  data.tasks.push({
    id: "external",
    title: "External task",
    epic: "W1",
    track: "core",
    scope: "runtime",
    status: "planned",
    tags: [],
    activity: {
      state: "active",
      owner: "Claude",
      sessionId: "external-session",
      heartbeatAt: new Date(now).toISOString(),
      expiresAt: "2099-01-01T00:00:00Z",
    },
  });
  try {
    install("localStorage", {
      getItem() {
        return null;
      },
      setItem() {},
    });
    install("document", {
      hidden: false,
      querySelectorAll() {
        return [];
      },
    });
    install("window", { dispatchEvent() {} });
    install("fetch", async () => {
      fetches++;
      return {
        ok: true,
        async json() {
          return {
            requests: [],
            integrations: [],
            runs: [
              {
                id: "run-ready",
                taskId: "ready",
                title: "Ready task session",
                state: "running",
                provider: "OpenHands",
                createdAt: new Date(now).toISOString(),
              },
              {
                id: "run-unlinked",
                title: "Unlinked session",
                state: "running",
                provider: "OpenHands",
                createdAt: new Date(now).toISOString(),
              },
              {
                id: "run-done",
                taskId: "done",
                state: "completed",
                provider: "OpenHands",
                updatedAt: new Date(now).toISOString(),
              },
            ],
          };
        },
      };
    });
    workbench = createWorkbench({
      tasksElement,
      nowElement,
      badge: (id) => id,
      epicName: (id) => id,
      trackName: (id) => id,
      refresh() {},
      setCount() {},
    });
    const workspace = await fetch().then((response) => response.json());
    fetches = 0;
    workbench.renderNow({ data, rows: data.tasks, workspace });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    const html = nowElement.innerHTML;
    assert.equal(
      fetches,
      0,
      "A supplied live workspace snapshot avoids an independent stale session poll.",
    );
    assert.match(
      html,
      /<article class="hub-work-row hub-session-row" data-task="ready"/,
    );
    assert.doesNotMatch(
      html,
      /<article class="hub-work-row hub-session-row" data-open-run=/,
    );
    assert.match(
      html,
      /<button class="hub-task-name" data-task="ready">ready<\/button>/,
    );
    assert.equal(
      html.match(/data-open-run="run-ready"/g)?.length,
      1,
      "A linked run is opened only by its session control.",
    );
    assert.match(
      html,
      /class="hub-session-open" data-session-control data-open-run="run-ready" aria-label="Open active session: ready"/,
    );
    assert.match(
      html,
      /<article class="hub-work-row" data-workbench-task="external" data-task="external"/,
    );
    assert.equal(
      html.match(/data-reported-task="external"/g)?.length,
      1,
      "An external check-in exposes one explicit attach control.",
    );
    assert.match(
      html,
      /class="hub-session-open" data-session-control data-reported-task="external" aria-label="Find or attach a session for External task"/,
    );
    assert.match(
      html,
      /class="hub-session-open" data-session-control data-open-run="run-unlinked" aria-label="Open active session: Unlinked session"/,
    );
    assert.match(
      html,
      /class="hub-session-open" data-session-control data-open-run="run-done" aria-label="Open completed session: done"/,
    );
    const readyRow = html.slice(
      html.indexOf(
        '<article class="hub-work-row hub-session-row" data-task="ready"',
      ),
      html.indexOf(
        "</article>",
        html.indexOf(
          '<article class="hub-work-row hub-session-row" data-task="ready"',
        ),
      ),
    );
    assert.ok(
      readyRow.indexOf("Task ↗") < readyRow.indexOf("hub-session-open"),
      "The session control is the rightmost action in an active row.",
    );
    const externalRow = html.slice(
      html.indexOf(
        '<article class="hub-work-row" data-workbench-task="external"',
      ),
      html.indexOf(
        "</article>",
        html.indexOf(
          '<article class="hub-work-row" data-workbench-task="external"',
        ),
      ),
    );
    assert.ok(
      externalRow.indexOf("Details ↗") <
        externalRow.indexOf("hub-session-open"),
      "The attach control is the rightmost action in a task row.",
    );
    const completedRow = html.slice(
      html.indexOf(
        '<article class="hub-work-row hub-session-row is-complete" data-task="done"',
      ),
      html.indexOf(
        "</article>",
        html.indexOf(
          '<article class="hub-work-row hub-session-row is-complete" data-task="done"',
        ),
      ),
    );
    assert.ok(
      completedRow.indexOf("Task ↗") <
        completedRow.indexOf("hub-session-open"),
      "The session control is the rightmost action in a completed row.",
    );
  } finally {
    workbench?.suspend();
    restore("document");
    restore("fetch");
    restore("localStorage");
    restore("window");
  }
});
