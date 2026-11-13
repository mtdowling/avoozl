// The activity log (tasks 29.1–29.3, design §4.19, Requirement 71): one
// table, one helper, screening and redaction, local actions, the tick's
// GitHub and plugin events, retention and the MCP read. Every term and
// secret here is fake.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_RETENTION_DAYS,
  REDACTED_SUMMARY,
  listActivity,
  pruneActivity,
  recordActivity,
  recordTickActivity,
  recordTickChanges,
  tickSnapshot,
} from "../activity-log.mjs";
import { groupedCall } from "../mcp-tools.mjs";
import { classifyOperation } from "../operation-kinds.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "r1",
  ...extra,
});

function setup(t, config = {}) {
  const root = temporaryDirectory("avoozl-activity-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: [leaf("a1"), leaf("a2")],
    edges: [{ from: "a1", to: "a2", kind: "requires" }],
  });
  store.put("projects", { id: "r1" });
  fs.mkdirSync(path.join(root, ".avoozl", "local", "content-rules"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, ".avoozl", "local", "content-rules", "names.txt"),
    "codename: \\bsecretword\\b\n",
  );
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      contentRules: { sets: [{ id: "names" }] },
      ...config,
    }),
  );
  const ops = new Operations(store, { workspaceRoot: root, operator: "owner" });
  return { root, store, ops };
}

// Every stored column of every row, as one string.
const everything = (store) =>
  JSON.stringify(store.db.prepare("SELECT * FROM activity_log").all());

test("a row holds time, source, actor, kind, summary, target and link", (t) => {
  const { store } = setup(t);
  const row = recordActivity(store, {
    source: "github",
    actor: "octocat",
    kind: "github.close",
    summary: "octocat closed #4",
    targetId: "a1",
    link: "https://github.com/acme/app/issues/4",
  });
  assert.equal(row.redacted, false);
  const [item] = listActivity(store).items;
  assert.equal(item.source, "github");
  assert.equal(item.actor, "octocat");
  assert.equal(item.kind, "github.close");
  assert.equal(item.summary, "octocat closed #4");
  assert.equal(item.targetId, "a1");
  assert.equal(item.link, "https://github.com/acme/app/issues/4");
  assert.ok(Date.parse(item.at));
});

test("bad input throws; long text is cut; odd targets and links are dropped", (t) => {
  const { store } = setup(t);
  assert.throws(
    () => recordActivity(store, { source: "web", kind: "x", summary: "s" }),
    /source/,
  );
  assert.throws(
    () =>
      recordActivity(store, {
        source: "local",
        kind: "Bad Kind",
        summary: "s",
      }),
    /kind/,
  );
  recordActivity(store, {
    source: "local",
    kind: "dispatch",
    summary: "x".repeat(500),
    targetId: "has space",
    link: "javascript:alert(1)",
  });
  const [item] = listActivity(store).items;
  assert.equal(item.summary.length, 200);
  assert.equal(item.targetId, null);
  assert.equal(item.link, null);
});

test("a secret-shaped value is never saved: the row is stored redacted", (t) => {
  const { store } = setup(t);
  const secrets = [
    "ghp_" + "a1B2".repeat(9),
    "AKIA" + "ABCDEFGHIJKLMNOP",
    "-----BEGIN RSA PRIVATE KEY-----",
    "xoxb-" + "1234567890abc",
    "password=" + "s3cretvalue99",
  ];
  for (const secret of secrets) {
    recordActivity(store, {
      source: "local",
      kind: "settings.save",
      summary: `Saved ${secret}`,
    });
    recordActivity(store, {
      source: "local",
      kind: "settings.save",
      summary: "Saved",
      actor: secret,
    });
    recordActivity(store, {
      source: "github",
      kind: "github.close",
      summary: "Closed",
      link: `https://github.com/acme/app/issues/1?t=${secret}`,
    });
  }
  // A machine path is screened like a secret.
  recordActivity(store, {
    source: "local",
    kind: "delete",
    summary: "Deleted /home/someone/private/file",
  });
  const stored = everything(store);
  for (const secret of secrets) assert.ok(!stored.includes(secret), secret);
  assert.ok(!stored.includes("/home/someone/"));
  const { items } = listActivity(store);
  assert.equal(items.length, secrets.length * 3 + 1);
  for (const item of items) {
    assert.equal(item.redacted, true);
    assert.equal(item.summary, REDACTED_SUMMARY);
    assert.equal(item.actor, null);
    assert.equal(item.targetId, null);
    assert.equal(item.link, null);
  }
});

test("content rules run on each row; a match or an unavailable set redacts it", (t) => {
  const { root, store } = setup(t);
  recordActivity(store, {
    source: "local",
    kind: "approve",
    summary: "Approved plan secretword",
  });
  assert.ok(!everything(store).includes("secretword"));
  assert.equal(listActivity(store).items[0].redacted, true);
  // A set with no terms file cannot check, so it fails closed.
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      contentRules: { sets: [{ id: "names" }, { id: "missing" }] },
    }),
  );
  const ops = new Operations(store, { workspaceRoot: root });
  assert.ok(ops);
  recordActivity(store, {
    source: "local",
    kind: "approve",
    summary: "Approved plan p1",
  });
  assert.equal(listActivity(store).items[0].redacted, true);
});

test("keyed rows are written once", (t) => {
  const { store } = setup(t);
  for (let i = 0; i < 3; i++)
    recordActivity(store, {
      source: "github",
      kind: "github.label",
      summary: "Label",
      key: "label:1:9",
    });
  assert.equal(listActivity(store).total, 1);
});

test("filters, facets, newest first and pages of at most 100", (t) => {
  const { store } = setup(t);
  for (let i = 0; i < 130; i++)
    recordActivity(store, {
      source: i % 2 ? "github" : "local",
      actor: i % 2 ? "octocat" : "owner",
      kind: i % 2 ? "github.close" : "dispatch",
      summary: `Row ${i}`,
      at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    });
  const page = listActivity(store, { limit: 500 });
  assert.equal(page.items.length, 100);
  assert.equal(page.total, 130);
  assert.equal(page.items[0].summary, "Row 129");
  assert.deepEqual(page.sources, ["github", "local"]);
  assert.deepEqual(page.kinds, ["dispatch", "github.close"]);
  assert.deepEqual(page.actors, ["octocat", "owner"]);
  const github = listActivity(store, { source: "github", offset: 60 });
  assert.equal(github.total, 65);
  assert.equal(github.items.length, 5);
  assert.ok(github.items.every((item) => item.source === "github"));
  assert.equal(
    listActivity(store, { actor: "owner", kind: "dispatch" }).total,
    65,
  );
});

test("pruning removes rows older than the retention", (t) => {
  const { store } = setup(t);
  const now = Date.parse("2026-03-01T00:00:00Z");
  recordActivity(store, {
    source: "local",
    kind: "dispatch",
    summary: "old",
    at: new Date(now - 40 * 86400_000).toISOString(),
  });
  recordActivity(store, {
    source: "local",
    kind: "dispatch",
    summary: "new",
    at: new Date(now - 2 * 86400_000).toISOString(),
  });
  assert.equal(DEFAULT_RETENTION_DAYS, 30);
  assert.equal(pruneActivity(store, { now }), 1);
  assert.equal(pruneActivity(store, { days: 1, now }), 1);
  assert.equal(listActivity(store).total, 0);
});

test("local actions record one row with the person, and MCP calls the session", async (t) => {
  const { store, ops } = setup(t);
  const { stop } = await ops.execute("flow.stop", {
    scope: "task",
    taskId: "a1",
    reason: "a private text reason",
  });
  await ops.execute("flow.resume", { stopId: stop.id });
  await ops.execute(
    "flow.stop",
    { scope: "all", reason: "agent stop" },
    undefined,
    { mcp: true },
  );
  const { items } = listActivity(store);
  assert.deepEqual(
    items.map((item) => [item.kind, item.source, item.actor]),
    [
      ["andon.pull", "mcp", "mcp"],
      ["andon.resume", "local", "owner"],
      ["andon.pull", "local", "owner"],
    ],
  );
  // A person's reason is free text: it is not copied into the log.
  assert.ok(!everything(store).includes("private text"));
  assert.equal(items[2].targetId, "a1");
  // A failed action records nothing.
  await assert.rejects(ops.execute("flow.resume", { stopId: "nope" }));
  assert.equal(listActivity(store).total, 3);
});

test("a settings save and a Deferred stop are recorded", async (t) => {
  const { store, ops } = setup(t);
  const settings = await ops.execute("activity.settings.get", {});
  assert.equal(settings.retentionDays, DEFAULT_RETENTION_DAYS);
  await ops.execute("activity.settings.update", {
    retentionDays: 7,
    expectedHash: settings.hash,
  });
  assert.equal(
    (await ops.execute("activity.settings.get", {})).retentionDays,
    7,
  );
  await ops.execute("task.update", { id: "a2", status: "deferred" });
  const kinds = listActivity(store).items.map((item) => item.kind);
  assert.deepEqual(kinds, ["stop", "settings.save"]);
});

test("retention is a person's setting, bounded, and the tick prunes by it", async (t) => {
  const { store, ops } = setup(t, { activity: { retentionDays: 1 } });
  assert.equal(classifyOperation("activity.list"), "observe");
  assert.equal(classifyOperation("activity.settings.update"), "protect");
  const { hash } = await ops.execute("activity.settings.get", {});
  await assert.rejects(
    ops.execute(
      "activity.settings.update",
      { retentionDays: 5, expectedHash: hash },
      undefined,
      { mcp: true },
    ),
    (error) => error.status === 403,
  );
  await assert.rejects(
    ops.execute("activity.settings.update", {
      retentionDays: 0,
      expectedHash: hash,
    }),
    /1.365/,
  );
  recordActivity(store, {
    source: "local",
    kind: "dispatch",
    summary: "old",
    at: new Date(Date.now() - 3 * 86400_000).toISOString(),
  });
  await ops.execute("workspace.tick", {});
  assert.ok(!listActivity(store).items.some((item) => item.summary === "old"));
});

test("plans_view action activity reads the log; recent keeps the Dashboard timeline", async (t) => {
  assert.deepEqual(groupedCall("plans_view", { action: "activity" }), {
    operation: "activity.list",
    input: {},
  });
  assert.equal(
    groupedCall("plans_view", { action: "recent" }).operation,
    "activity.recent",
  );
  const { store, ops } = setup(t);
  recordActivity(store, { source: "local", kind: "dispatch", summary: "one" });
  const read = await ops.execute(
    "activity.list",
    { source: "local" },
    undefined,
    { mcp: true },
  );
  assert.equal(read.items[0].summary, "one");
  recordActivity(store, {
    source: "local",
    kind: "dispatch",
    summary: "Dispatched a1",
    targetId: "a1",
  });
  const [row] = (await ops.execute("activity.list", {})).items;
  assert.equal(row.task, true, "a task target opens the drawer");
  assert.equal(read.retentionDays, DEFAULT_RETENTION_DAYS);
});

test("the tick's snapshot diff records each GitHub and plugin change once", (t) => {
  const { store } = setup(t);
  const before = tickSnapshot(store);
  store.mutate("verdicts", (data) => {
    data.tasks[0].githubVerdict = {
      state: "verified",
      key: "k1",
      pullRequest: "https://github.com/acme/app/pull/7",
    };
    data.tasks[1].githubVerdict = {
      state: "order",
      key: "k2",
      order: { actor: "octocat", reason: "COMPLETED", closedAt: "2026-01-01" },
      issue: "https://github.com/acme/app/issues/8",
    };
    data.tasks[1].projectionConflicts = [{ field: "title" }];
    data.tasks[0].tracker = { conflicts: [{ field: "status" }] };
  });
  store.put("receipts", {
    id: "project-item:a2",
    kind: "project-item",
    taskId: "a2",
    paused: { actor: "octocat", at: "2026-01-01T00:00:00Z" },
    ignored: null,
    releaseDraft: null,
  });
  store.put("github_issues", {
    id: "acme/app#8",
    repository: "acme/app",
    number: 8,
    url: "https://github.com/acme/app/issues/8",
    title: "Private issue title",
    body: "Private issue body",
    rule: "deliver",
    action: "deliver",
    labelEventId: 99,
    labelActor: "octocat",
  });
  store.put("incoming_items", {
    id: "tracker:T-1",
    source: "tracker",
    itemId: "T-1",
    via: "plugin",
    record: {
      kind: "ticket",
      title: "Private ticket title",
      url: "https://tracker.example/T-1",
    },
  });
  const after = tickSnapshot(store);
  recordTickChanges(store, before, after);
  recordTickChanges(store, before, after);
  const { items } = listActivity(store);
  const kinds = items.map((item) => `${item.source}:${item.kind}`).sort();
  assert.deepEqual(kinds, [
    "github:github.board-deferred",
    "github:github.close",
    "github:github.conflict",
    "github:github.label",
    "github:github.pr-merged",
    "plugin:intake.item",
    "plugin:plugin.conflict",
  ]);
  const stored = everything(store);
  for (const text of [
    "Private issue title",
    "Private issue body",
    "Private ticket title",
  ])
    assert.ok(!stored.includes(text), text);
  const merged = items.find((item) => item.kind === "github.pr-merged");
  assert.equal(merged.targetId, "a1");
  assert.equal(merged.link, "https://github.com/acme/app/pull/7");
  assert.equal(
    items.find((item) => item.kind === "github.close").actor,
    "octocat",
  );
});

test("an older database starts from its current state; later changes are logged", (t) => {
  const root = temporaryDirectory("avoozl-activity-old-"),
    file = path.join(root, "workspace.sqlite");
  const old = new Store(file);
  old.importSnapshot({
    ...snapshot(),
    tasks: [
      leaf("a1", {
        githubVerdict: { state: "verified", key: "k0", pullRequest: null },
      }),
    ],
  });
  // As before the activity log existed.
  old.db.exec("DROP TABLE activity_log");
  old.close();
  const store = new Store(file);
  t.after(() => store.close());
  assert.equal(recordTickActivity(store, {}), 0);
  assert.equal(listActivity(store).total, 0);
  store.mutate("verdict", (data) => {
    data.tasks[0].githubVerdict = { state: "verified", key: "k1" };
  });
  assert.equal(recordTickActivity(store, {}), 1);
  assert.equal(listActivity(store).items[0].kind, "github.pr-merged");
});
