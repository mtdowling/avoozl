// Direct links to work and decisions (spec direct-links): a notice opens its
// exact decision, an old link never opens a newer one, every link target is
// checked, and each attempt opens its own chat or log.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  attemptDestination,
  chatRoute,
  decisionPath,
  pageTarget,
  resolveDecision,
  validateLinks,
} from "../api/direct-links.mjs";
import { sinkPayload } from "../tick/notification-sinks.mjs";
import { queueNotifications } from "../tick/notifications.mjs";
import { Operations } from "../api/operations.mjs";
import { deliveryView } from "../api/page-views.mjs";
import { Store } from "../store/store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const page = (href) => new URL(href, "http://127.0.0.1:1");

function workspace(t, tasks) {
  const root = temporaryDirectory(),
    store = new Store(path.join(root, "workspace.sqlite"));
  store.initialize({ ...snapshot(), tasks });
  store.setMeta("workspaceId", "main");
  t.after(() => store.close());
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

const task = (id, extra = {}) => ({
  id,
  title: `Task ${id}`,
  scope: "catalog",
  status: "planned",
  track: "catalog",
  tags: [],
  acceptance: ["Done."],
  ...extra,
});

test("only the app page with a checked decision is a sign-in target", () => {
  assert.equal(
    pageTarget(page("/apps/avoozl?workspace=main&decision=AbCdEfGhIjKl&q=1")),
    "/apps/avoozl?workspace=main&decision=AbCdEfGhIjKl",
  );
  assert.equal(
    pageTarget(page("/apps/avoozl/?decision=AbCdEfGhIjKl")),
    "/apps/avoozl?decision=AbCdEfGhIjKl",
  );
  for (const href of [
    "/apps/avoozl",
    "/apps/other?decision=AbCdEfGhIjKl",
    "/logout?decision=AbCdEfGhIjKl",
    "/apps/avoozl?decision=short",
    "/apps/avoozl?decision=../../etc/passwd",
    "/apps/avoozl?decision=AbCdEfGhIjKl&workspace=Main",
    "/apps/avoozl/assets/a.js?decision=AbCdEfGhIjKl",
  ])
    assert.equal(pageTarget(page(href)), null, href);
  // The target is rebuilt from its parts, so another origin cannot leak in.
  assert.equal(
    pageTarget(
      new URL("https://evil.example/apps/avoozl?decision=AbCdEfGhIjKl"),
    ),
    "/apps/avoozl?decision=AbCdEfGhIjKl",
  );
});

test("a decision notice links to its own occurrence in Needs you; others keep the session", (t) => {
  const { store } = workspace(t, [task("a")]);
  queueNotifications(store, [
    { channel: "decision", task: "a", slot: "s1", title: "a asks", text: "1" },
    { channel: "failure", task: "a", slot: "s1", title: "a failed", text: "x" },
  ]);
  queueNotifications(store, [
    { channel: "decision", task: "a", slot: "s1", title: "a asks", text: "2" },
  ]);
  const rows = store.list("app_notifications"),
    decisions = rows.filter((row) => row.decision),
    failure = rows.find((row) => !row.decision);
  assert.equal(decisions.length, 2);
  assert.notEqual(decisions[0].decision.id, decisions[1].decision.id);
  for (const row of decisions) {
    assert.equal(
      row.payload.url,
      decisionPath("main", row.decision.id),
      "a dashboard-relative path, which a DM bridge can turn into a link",
    );
    assert.equal(pageTarget(page(row.payload.url)), row.payload.url);
  }
  assert.equal(failure.payload.url, "/chat?sid=s1");
  // A standalone sink with the page on gets the same exact target.
  const small = sinkPayload(decisions[0].payload, decisions[0], {
    pageUrl: "http://127.0.0.1:5000/apps/avoozl",
  });
  assert.equal(
    small.link,
    `http://127.0.0.1:5000${decisionPath("main", decisions[0].decision.id)}`,
  );
  // Without the page on, the sink keeps its command line.
  assert.equal(
    sinkPayload(decisions[0].payload, decisions[0]).link,
    "avoozl show a",
  );
});

test("an old link never opens a newer decision for the same task", () => {
  const at = (s) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();
  const rows = [
    {
      queuedAt: at(10),
      decision: { id: "oldoldold1", task: "a", slot: null, record: null },
    },
    {
      queuedAt: at(50),
      decision: { id: "newnewnew1", task: "a", slot: null, record: null },
    },
    {
      queuedAt: at(10),
      decision: { id: "slotslot01", task: "b", slot: "s1", record: null },
    },
    {
      queuedAt: at(10),
      decision: {
        id: "recordrec1",
        task: null,
        slot: null,
        record: "content:x",
      },
    },
    {
      queuedAt: at(10),
      decision: { id: "timedtime1", task: "c", slot: null, record: null },
    },
  ];
  const decision = { kind: "decision", taskId: "a" },
    stale = { kind: "stale-session", taskId: "b", slot: "s2" },
    staleOld = { kind: "stale-session", taskId: "b", slot: "s1" },
    content = { kind: "content-match", id: "content:x", openedAt: at(9) },
    reopened = { kind: "untick", taskId: "c", openedAt: at(40) };
  const items = [decision, stale, staleOld, content, reopened];
  // The newest alert for a row with no time of its own opens it.
  assert.equal(resolveDecision(rows, items, "newnewnew1").item, decision);
  assert.deepEqual(resolveDecision(rows, items, "oldoldold1"), {
    state: "closed",
    taskId: "a",
    newer: true,
  });
  // A session link opens that session's row, not the newer attempt's.
  assert.equal(resolveDecision(rows, items, "slotslot01").item, staleOld);
  assert.equal(
    resolveDecision(rows, [stale], "slotslot01").state,
    "closed",
    "the old attempt's row is gone: closed, never the new attempt",
  );
  // A stable record opens while that occurrence is open...
  assert.equal(resolveDecision(rows, items, "recordrec1").item, content);
  // ...and not once it reopened later.
  assert.equal(
    resolveDecision(rows, [{ ...content, openedAt: at(30) }], "recordrec1")
      .state,
    "closed",
  );
  // A row opened after the alert is a newer occurrence.
  assert.equal(resolveDecision(rows, items, "timedtime1").state, "closed");
  assert.deepEqual(resolveDecision(rows, items, "nosuchlink"), {
    state: "unknown",
  });
  assert.deepEqual(resolveDecision(rows, items, "../x"), { state: "unknown" });
});

test("conflicts.view marks the linked item and writes nothing", async (t) => {
  const { store, ops } = workspace(t, [
    task("a", { decision: "Pick one" }),
    task("b"),
  ]);
  queueNotifications(store, [
    { channel: "decision", task: "a", title: "a needs you", text: "Pick" },
  ]);
  const id = store.list("app_notifications")[0].decision.id,
    before = store.read().revision;
  const view = await ops.execute("conflicts.view", { decision: id });
  assert.deepEqual(view.target, { state: "open" });
  assert.deepEqual(
    view.items.filter((item) => item.linked).map((item) => item.taskId),
    ["a"],
  );
  const plain = await ops.execute("conflicts.view", {});
  assert.equal(plain.target, undefined);
  assert.equal(plain.items.filter((item) => item.linked).length, 0);
  const unknown = await ops.execute("conflicts.view", {
    decision: "AbCdEfGhIjKl",
  });
  assert.deepEqual(unknown.target, { state: "unknown" });
  assert.equal(store.read().revision, before);
});

test("each attempt opens its own chat, log, or where to connect", () => {
  const local = { slot: "dashboard:avoozl_a1", role: "worker", attempt: 1 };
  assert.deepEqual(attemptDestination(local), {
    action: "chat",
    label: "Open worker chat",
    href: "/chat?sid=avoozl_a1",
    machine: "this machine",
  });
  const older = attemptDestination({
    ...local,
    slot: "avoozl_a0",
    status: "closed",
  });
  assert.equal(older.href, "/chat?sid=avoozl_a0");
  assert.equal(older.label, "Open ended worker chat");
  // A connected Remote Crew: Kiro Crew 0.13's exact remote chat route.
  assert.deepEqual(attemptDestination({ ...local, crew: "devbox" }), {
    action: "chat",
    label: "Open worker chat",
    href: "/chat?crew=devbox&crewSid=avoozl_a1",
    machine: "devbox",
  });
  const away = attemptDestination({
    ...local,
    crew: "devbox",
    crewUnreachable: true,
  });
  assert.equal(away.action, "connect");
  assert.equal(away.href, "/settings/instances");
  assert.match(away.note, /devbox does not answer/);
  const log = attemptDestination({
    ...local,
    executor: "process",
    process: { logTail: "x" },
  });
  assert.equal(log.action, "log");
  assert.equal(log.label, "View worker log");
  // Standalone: the owner's dashboard address, else the desktop app's link.
  assert.equal(
    attemptDestination(
      { ...local, crew: "devbox" },
      { standalone: true, links: { dashboard: "https://crew.example" } },
    ).href,
    "https://crew.example/chat?crew=devbox&crewSid=avoozl_a1",
  );
  const desktop = attemptDestination(local, {
    standalone: true,
    links: { desktop: true },
  });
  assert.equal(desktop.label, "Open in Kiro Crew");
  assert.equal(desktop.href, "kirocrew://chat?sid=avoozl_a1");
  const none = attemptDestination(local, { standalone: true });
  assert.equal(none.href, null);
  assert.match(none.note, /links\.dashboard/);
  // A slot or crew outside Kiro Crew's grammar gets no link at all.
  assert.equal(chatRoute("bad slot"), null);
  assert.equal(chatRoute("ok", "-x"), null);
  assert.equal(attemptDestination({ ...local, slot: "a b" }).href, null);
});

test("links settings are checked, and hold no sign-in", () => {
  assert.deepEqual(
    validateLinks({
      dashboard: "https://crew.example/some/path",
      desktop: true,
    }),
    {
      dashboard: "https://crew.example",
      desktop: true,
    },
  );
  for (const [value, message] of [
    [{ dashboard: "http://crew.example" }, /must be https/],
    [{ dashboard: "https://user:pw@crew.example" }, /no sign-in/],
    [{ dashboard: "https://crew.example/?token=x" }, /no sign-in/],
    [{ desktop: "yes" }, /true or false/],
    [
      { workers: { alice: { crew: "devbox" } } },
      /links\.workers is not a setting/,
    ],
    [{ other: 1 }, /links\.other is not a setting/],
  ])
    assert.throws(() => validateLinks(value), message);
});

test("a queued worker start shows as starting until its session binds", (t) => {
  const { store } = workspace(t, [task("a", { status: "partial" })]);
  store.put("session_requests", {
    id: "start:1",
    kind: "start",
    state: "pending",
    request: { task: "a", role: "worker", attempt: 1, executor: "kirocrew" },
  });
  const starting = () =>
    deliveryView(store, store.read()).items.find((row) => row.id === "a");
  assert.equal(starting().starting, true);
  store.put("session_bindings", {
    id: "avoozl_a1",
    slot: "avoozl_a1",
    taskId: "a",
    role: "worker",
    attempt: 1,
    boundAt: new Date().toISOString(),
  });
  assert.equal(starting().starting, false);
  assert.equal(starting().sessions[0].open.href, "/chat?sid=avoozl_a1");
});
