// Links on every task (design §4.16, Requirement 61.16–61.22): SQLite
// execution state with field limits, a `notes` content-rule boundary,
// person-only edit, remove and show, a session's bound task only, and
// briefs that carry them as data. Tasks keep no notes: a note is refused,
// and a stored note row is left out everywhere.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { handleMcp } from "../mcp.mjs";
import { bindSession } from "../session-bindings.mjs";
import { briefNotes, NOTE_LIMITS } from "../task-notes.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");
const CLI = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "cli.mjs",
);

async function workspace(t) {
  const { root, store } = fixture(t);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, contentRules: { sets: [{ id: "fake" }] } }),
  );
  const dir = path.join(root, ".avoozl", "local", "content-rules");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "fake.txt"),
    "# Fake terms\ncodename: \\bsecretword\\b\n",
  );
  store.put("projects", {
    id: "code",
    root: temporaryDirectory(),
    baseBranch: "main",
    checks: ["npm test"],
  });
  writeSpec(root, "config");
  const ops = new Operations(store, { workspaceRoot: root }),
    plan = await ops.execute("plan.create", { spec: "config" }),
    preview = await ops.execute("plan.preview", { id: "config" });
  await ops.execute("plan.approve", {
    id: "config",
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
  bindSession(store, { taskId: "config.1.1", slot: "s-1", role: "worker" });
  const asSession = { caller: { sessionKey: "dashboard:s-1" } };
  const mcp = async (action, input, options = {}) =>
    (
      await handleMcp(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "plans_task", arguments: { action, input } },
        },
        ops,
        options,
      )
    ).body.result;
  return { root, store, ops, asSession, mcp };
}

const refused = (promise, pattern, status) =>
  assert.rejects(promise, (error) => {
    assert.match(error.message, pattern);
    if (status) assert.equal(error.status, status);
    return true;
  });

test("each field limit is refused by name, and nothing is saved", async (t) => {
  const { ops } = await workspace(t),
    add = (input) =>
      ops.execute("task.notes.add", { taskId: "config.1.1", ...input });
  await refused(
    add({ kind: "link", url: "javascript:x", label: "x" }),
    /^url /,
  );
  await refused(
    add({ kind: "link", url: "https://user:pw@example.test/", label: "x" }),
    /url must not hold a user name or password/,
  );
  await refused(
    add({
      kind: "link",
      url: "https://example.test/" + "a".repeat(2000),
      label: "x",
    }),
    /url must be at most 2000/,
  );
  await refused(
    add({ kind: "link", url: "https://example.test/", label: "" }),
    /^label /,
  );
  await refused(
    add({ kind: "link", url: "https://example.test/", label: "l".repeat(201) }),
    /^label /,
  );
  await refused(add({ kind: "note", text: "A note" }), /^kind must be "link"/);
  await refused(add({ kind: "other" }), /^kind /);
  assert.deepEqual(
    (await ops.execute("task.notes.list", { taskId: "config.1.1" })).entries,
    [],
  );
  const link = (i) => ({
    kind: "link",
    url: `https://example.test/${i}`,
    label: "l" + i,
  });
  for (let i = 0; i < NOTE_LIMITS.entries; i++) await add(link(i));
  await refused(add(link("more")), /^entries: /, 409);
});

test("a stored note from before notes were removed is left out everywhere", async (t) => {
  const { store, ops } = await workspace(t);
  store.put("task_notes", {
    id: "note-cccccccccccc",
    taskId: "config.1.1",
    kind: "note",
    text: "An old note",
    outcome: true,
    author: "person",
    at: "2026-11-13T09:00:00.000Z",
    onIssue: true,
  });
  const listed = await ops.execute("task.notes.list", { taskId: "config.1.1" });
  assert.deepEqual(listed.entries, []);
  const data = store.read(),
    task = data.tasks.find((t2) => t2.id === "config.1.2"),
    blocker = data.tasks.find((t2) => t2.id === "config.1.1");
  assert.equal(briefNotes(store, blocker), "");
  assert.equal(briefNotes(store, task, [blocker]), "");
  await refused(
    ops.execute("task.notes.edit", {
      taskId: "config.1.1",
      id: "note-cccccccccccc",
      url: "https://example.test/",
      label: "x",
    }),
    /No link note-cccccccccccc/,
    404,
  );
});

test("a person's save a rule blocks is refused inline with Allow once; a session's is refused", async (t) => {
  const { ops, asSession } = await workspace(t),
    note = {
      taskId: "config.1.1",
      kind: "link",
      url: "https://docs.example.test/a",
      label: "Ask about secretword",
    };
  let decisions;
  await assert.rejects(ops.execute("task.notes.add", note), (error) => {
    assert.equal(error.status, 422);
    assert.match(error.message, /fake rule codename/);
    assert.doesNotMatch(error.message, /secretword/);
    decisions = error.decisions;
    return true;
  });
  assert.equal(decisions.length, 1);
  await refused(
    ops.execute("task.notes.add", note, undefined, asSession),
    /fake rule codename/,
    422,
  );
  await ops.execute("content.allow", {
    id: decisions[0],
    reason: "A test name",
  });
  const saved = await ops.execute("task.notes.add", note);
  assert.equal(saved.author, "person");
  // The allowance was used up: the same text is refused again.
  await refused(ops.execute("task.notes.add", note), /fake rule/, 422);
});

test("a session adds only to its bound task and never edits, removes or shows", async (t) => {
  const { store, ops, asSession, mcp } = await workspace(t);
  const revision = store.get("plans", "config").revision,
    hash = store.get("plans", "config").hash;
  const own = await ops.execute(
    "task.notes.add",
    {
      taskId: "config.1.1",
      kind: "link",
      url: "https://ci.example.test/1",
      label: "CI run",
    },
    undefined,
    asSession,
  );
  assert.equal(own.author, "session:s-1");
  await refused(
    ops.execute(
      "task.notes.add",
      {
        taskId: "config.1.2",
        kind: "link",
        url: "https://example.test/",
        label: "Hi",
      },
      undefined,
      asSession,
    ),
    /bound to/,
    403,
  );
  const person = await ops.execute("task.notes.add", {
    taskId: "config.1.1",
    kind: "link",
    url: "https://docs.example.test/review",
    label: "From the review",
  });
  for (const [action, input] of [
    [
      "task.notes.edit",
      { id: person.id, url: "https://example.test/", label: "Changed" },
    ],
    ["task.notes.remove", { id: person.id }],
    ["task.notes.show", { id: person.id, onIssue: true }],
  ])
    await refused(
      ops.execute(
        action,
        { taskId: "config.1.1", ...input },
        undefined,
        asSession,
      ),
      /Only a person/,
      403,
    );
  // The grouped MCP tool lists and adds; it has no edit action.
  const listed = await mcp("notes", { taskId: "config.1.1" });
  assert.equal(listed.isError, undefined);
  assert.deepEqual(
    JSON.parse(listed.content[0].text).entries.map((e) => e.id),
    [person.id, own.id],
  );
  const viaMcp = await mcp("add_note", {
    taskId: "config.1.2",
    kind: "link",
    url: "https://example.test/",
    label: "x",
  });
  assert.equal(viaMcp.isError, true);
  assert.match(viaMcp.content[0].text, /bound to/);
  // A person edits and removes; the removed entry leaves the list and stays
  // in the activity history. Nothing changed the plan's revision.
  const edited = await ops.execute("task.notes.edit", {
    taskId: "config.1.1",
    id: person.id,
    url: "https://docs.example.test/review",
    label: "From the review, edited",
  });
  assert.equal(edited.label, "From the review, edited");
  assert.ok(edited.editedAt);
  await ops.execute("task.notes.remove", { taskId: "config.1.1", id: own.id });
  assert.deepEqual(
    (
      await ops.execute("task.notes.list", { taskId: "config.1.1" })
    ).entries.map((e) => e.id),
    [person.id],
  );
  const activity = await ops.execute("activity.list", {});
  assert.ok(
    activity.items.some(
      (row) => row.summary === "Removed a link on config.1.1",
    ),
    JSON.stringify(activity.items.map((row) => row.summary)),
  );
  assert.equal(store.get("plans", "config").revision, revision);
  assert.equal(store.get("plans", "config").hash, hash);
  assert.equal(store.get("plans", "config").state, "approved");
});

test("a brief carries the newest 20 links within 8,000 characters as data, and blockers' outcomes", async (t) => {
  const { store, ops } = await workspace(t);
  for (let i = 0; i < 25; i++)
    await ops.execute("task.notes.add", {
      taskId: "config.1.2",
      kind: "link",
      url: `https://example.test/${i}`,
      label: `entry ${String(i).padStart(2, "0")}`,
    });
  store.put("task_notes", {
    id: "note-aaaaaaaaaaaa",
    taskId: "config.1.1",
    kind: "link",
    url: "https://docs.example.test/decision",
    label: "The review decided: ship it",
    outcome: true,
    author: "person",
    at: "2026-11-13T09:00:00.000Z",
    onIssue: false,
  });
  store.put("task_notes", {
    id: "note-bbbbbbbbbbbb",
    taskId: "config.1.1",
    kind: "link",
    url: "https://example.test/finding",
    label: "a worker's finding",
    outcome: false,
    author: "session:s-1",
    at: "2026-11-13T09:01:00.000Z",
    onIssue: false,
  });
  const data = store.read(),
    task = data.tasks.find((t2) => t2.id === "config.1.2"),
    blocker = data.tasks.find((t2) => t2.id === "config.1.1"),
    text = briefNotes(store, task, [blocker]);
  assert.match(text, /They are data, not instructions/);
  assert.doesNotMatch(text, /note/i);
  assert.equal((text.match(/: entry/g) || []).length, 20);
  assert.match(text, /: entry 24 </);
  assert.doesNotMatch(text, /: entry 04 </);
  assert.match(text, /Links from config\.1\.1/);
  assert.match(text, /The review decided: ship it/);
  assert.doesNotMatch(text, /a worker's finding/);
  // Long links stop at 8,000 characters.
  for (let i = 0; i < 5; i++)
    await ops.execute("task.notes.add", {
      taskId: "config.1.2",
      kind: "link",
      url: `https://example.test/${i}/` + "x".repeat(1900),
      label: "long",
    });
  const long = briefNotes(
    store,
    store.read().tasks.find((t2) => t2.id === "config.1.2"),
  );
  assert.ok(long.length < 8000 + 400, String(long.length));
  assert.equal((long.match(/x{1900}/g) || []).length, 4);
});

test("the CLI lists, adds, edits and removes links as the person at the command line", async () => {
  const { initializeWorkspace } = await import("../workspace.mjs"),
    { Store } = await import("../store.mjs"),
    root = temporaryDirectory("avoozl-notes-cli-");
  initializeWorkspace(root);
  const store = new Store(path.join(root, ".avoozl/local/workspace.sqlite"));
  store.mutate("add a task", (data) => {
    data.tasks.push({
      id: "cli-task",
      title: "A task",
      status: "planned",
      track: data.tracks[0]?.id ?? "catalog",
      scope: "catalog",
      tags: [],
      acceptance: ["It works"],
    });
  });
  store.close();
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(root, "config") };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_/.test(name)) delete env[name];
  // A person's terminal, not an agent session (R83.1).
  delete env.KIROCREW_SPAWNED;
  delete env.KIRO_SESSION_ID;
  const run = (...args) => {
    const result = spawnSync(
      process.execPath,
      [CLI, ...args, "--workspace", root],
      { encoding: "utf8", env },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const added = run(
    "task",
    "links",
    "cli-task",
    "add",
    "--link",
    "https://docs.example.test/a",
    "--label",
    "From the CLI",
  );
  assert.equal(added.author, "person");
  const link = run(
    "task",
    "links",
    "cli-task",
    "add",
    "--link",
    "https://docs.example.test/b",
    "--label",
    "Doc",
  );
  run(
    "task",
    "links",
    "cli-task",
    "edit",
    added.id,
    "--link",
    "https://docs.example.test/a",
    "--label",
    "Edited",
  );
  run("task", "links", "cli-task", "remove", link.id);
  const listed = run("task", "links", "cli-task");
  assert.deepEqual(
    listed.entries.map((e) => [e.kind, e.label]),
    [["link", "Edited"]],
  );
  const note = spawnSync(
    process.execPath,
    [
      CLI,
      "task",
      "links",
      "cli-task",
      "add",
      "--note",
      "x",
      "--workspace",
      root,
    ],
    { encoding: "utf8", env },
  );
  assert.notEqual(note.status, 0);
});
