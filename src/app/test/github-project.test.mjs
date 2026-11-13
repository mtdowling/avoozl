// Task 3.15: GitHub Project sync (design §6.7). Fake GitHub only. Each test
// names the nearby inputs it checks.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { digest } from "../../model.mjs";
import { renderMarker, parseMarker } from "../github-marker.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import {
  computeWaves,
  pausedTaskIds,
  syncProject,
} from "../github-project.mjs";
import { Operations } from "../operations.mjs";
import { avoozlStates, conflictsView, deliveryView } from "../page-views.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const NAMESPACE = "avz_aaaaaaaaaaaaaaaa",
  REPO = "example/app",
  PROJECT_NODE = "PVT_project";

const task = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  ...extra,
});

// The P16 Wave graph: epic A holds a1 and a2, epic B holds b1, b2 and b3;
// a2 requires a1; b2 requires a2 and b1; b3 follows b2; a1 supports b3.
function graph() {
  const tasks = [
      task("A", { kind: "epic", acceptance: undefined }),
      task("B", { kind: "epic", acceptance: undefined }),
      task("a1", { parent: "A", milestone: "one" }),
      task("a2", { parent: "A", milestone: "two", iteration: "Sprint 1" }),
      task("b1", { parent: "B", milestone: "one" }),
      task("b2", { parent: "B", milestone: "one" }),
      task("b3", { parent: "B", milestone: "one" }),
    ],
    edges = [
      { id: "a1:requires:a2", from: "a1", to: "a2", kind: "requires" },
      { id: "a2:requires:b2", from: "a2", to: "b2", kind: "requires" },
      { id: "b1:requires:b2", from: "b1", to: "b2", kind: "requires" },
      { id: "b2:sequence:b3", from: "b2", to: "b3", kind: "sequence" },
      { id: "a1:supports:b3", from: "a1", to: "b3", kind: "supports" },
    ];
  for (const [index, entry] of tasks.entries()) {
    if (entry.acceptance === undefined) delete entry.acceptance;
    entry.authority = "github";
    entry.github = {
      repository: REPO,
      number: index + 1,
      nodeId: "I_" + entry.id,
    };
  }
  return { tasks, edges };
}

const marker = (taskId) =>
  renderMarker({
    version: 2,
    taskId,
    namespace: NAMESPACE,
    kind: "leaf",
    source: { commit: null, manifest: digest("manifest") },
    applied: {
      title: digest("t"),
      body: digest("b"),
      labels: [],
      blockers: [],
    },
  });

const option = (id, name) => ({ id, name: { raw: name, html: name } });
const FIELDS = [
  {
    id: 1,
    name: "Status",
    data_type: "single_select",
    options: [
      option("s-todo", "Todo"),
      option("s-progress", "In progress"),
      option("s-done", "Done"),
      option("s-deferred", "Deferred"),
    ],
  },
  {
    id: 2,
    name: "Release",
    data_type: "single_select",
    options: [option("r-one", "one"), option("r-two", "two")],
  },
  { id: 3, name: "Wave", data_type: "number" },
  {
    id: 4,
    name: "Iteration",
    data_type: "iteration",
    configuration: {
      iterations: [{ id: "it-1", title: { raw: "Sprint 1" } }],
    },
  },
  {
    id: 5,
    name: "Avoozl state",
    data_type: "single_select",
    options: [
      ["Ready", "v-ready"],
      ["Running", "v-running"],
      ["Reviewing", "v-reviewing"],
      ["Needs you", "v-needs"],
      ["Blocked or waiting", "v-waiting"],
      ["Done", "v-done"],
      ["Deferred", "v-deferred"],
    ].map(([name, id]) => option(id, name)),
  },
];

// A fake GitHub that keeps Project items and issue bodies in memory and
// records every write.
function fakeGitHub({
  tasks,
  permissions = { owner: "admin", helper: "write" },
}) {
  const writes = [],
    items = [],
    moves = {},
    issues = new Map(
      tasks.map((entry) => [
        `${REPO}#${entry.github.number}`,
        {
          number: entry.github.number,
          node_id: entry.github.nodeId,
          body: marker(entry.id) + "\nbody",
        },
      ]),
    );
  let nextItem = 100,
    scopes = "project, repo";
  const setField = (item, id, value) => {
    const field = FIELDS.find((entry) => entry.id === id),
      shown =
        value === null
          ? null
          : field.data_type === "number"
            ? value
            : field.data_type === "iteration"
              ? field.configuration.iterations.find((i) => i.id === value)
              : field.options.find((o) => o.id === value);
    item.fields = item.fields.filter((entry) => entry.id !== id);
    item.fields.push({
      id,
      name: field.name,
      data_type: field.data_type,
      value: shown,
    });
  };
  const github = {
    writes,
    items,
    moves,
    issues,
    set scopes(value) {
      scopes = value;
    },
    // A person or automation edits a card.
    edit(taskId, fieldId, value) {
      const item = items.find(
        (entry) => entry.content.node_id === "I_" + taskId,
      );
      setField(item, fieldId, value);
    },
    async projectV2() {
      return {
        id: 7,
        node_id: PROJECT_NODE,
        number: 7,
        base: "/orgs/example/projectsV2/7",
        scopes,
      };
    },
    async projectFields() {
      return structuredClone(FIELDS);
    },
    async projectItems() {
      return structuredClone(items);
    },
    async addProjectItem(_, { number }) {
      writes.push(["add", number]);
      const issue = issues.get(`${REPO}#${number}`),
        item = {
          id: nextItem++,
          content_type: "Issue",
          content: { node_id: issue.node_id, number },
          fields: [],
        };
      items.push(item);
      return structuredClone(item);
    },
    async updateProjectItem(_, id, fields) {
      writes.push(["fields", id, fields]);
      const item = items.find((entry) => entry.id === id);
      for (const update of fields) setField(item, update.id, update.value);
      return {};
    },
    async projectStatusChanges(nodeId) {
      return moves[nodeId] || [];
    },
    async permission(_, login) {
      return { permission: permissions[login] || "none" };
    },
    async issue(_, number) {
      return structuredClone(issues.get(`${REPO}#${number}`));
    },
    async updateIssue(_, number, { body }) {
      writes.push(["body", number]);
      issues.get(`${REPO}#${number}`).body = body;
      return structuredClone(issues.get(`${REPO}#${number}`));
    },
  };
  return github;
}

const policy = normalizeGitHubPolicy({
  mode: "single-repo",
  project: {
    owner: "example",
    number: 7,
    fields: { iteration: "Iteration" },
  },
  repositories: {
    [REPO]: {
      baseBranch: "main",
      allowedActors: ["owner"],
      minimumPermission: "write",
    },
  },
});

function setup(t, { tasks, edges } = graph()) {
  const root = temporaryDirectory("avoozl-project-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks, edges });
  return { root, store, github: fakeGitHub({ tasks }) };
}

const sync = (store, github, extra = {}) =>
  syncProject(store, github, { policy, ...extra });

const value = (github, taskId, fieldId) => {
  const item = github.items.find(
      (entry) => entry.content.node_id === "I_" + taskId,
    ),
    shown = item?.fields.find((entry) => entry.id === fieldId)?.value;
  return shown?.name?.raw ?? shown?.title?.raw ?? shown ?? null;
};

const receipts = (store) =>
  JSON.stringify(
    store.list("receipts").sort((a, b) => a.id.localeCompare(b.id)),
  );

test("Wave is 1 plus the highest blocker's wave, from blocking edges only", () => {
  // Nearby inputs: a supports edge, a done task, a removed edge.
  const data = graph(),
    waves = computeWaves(data);
  assert.deepEqual(
    ["a1", "b1", "a2", "b2", "b3", "A"].map((id) => waves.get(id)),
    [1, 1, 2, 3, 4, 1],
  );
  data.tasks.find((entry) => entry.id === "a1").status = "accepted";
  assert.deepEqual(computeWaves(data), waves, "finishing a task moves no wave");
  data.edges = data.edges.filter((edge) => edge.id !== "a1:requires:a2");
  const after = computeWaves(data);
  assert.deepEqual(
    ["a2", "b2", "b3"].map((id) => after.get(id)),
    [1, 2, 3],
  );
  data.edges.push({
    id: "b3:requires:a1",
    from: "b3",
    to: "a1",
    kind: "requires",
  });
  data.edges.push({
    id: "a1:requires:b1",
    from: "a1",
    to: "b1",
    kind: "requires",
  });
  data.edges.push({
    id: "b1:requires:b3",
    from: "b1",
    to: "b3",
    kind: "requires",
  });
  assert.throws(() => computeWaves(data), /cycle/);
});

test("sync adds items and sets Release, Wave and Iteration, never Status; a second pass writes nothing", async (t) => {
  // Nearby inputs: parents with children in two milestones, one iteration, a
  // second pass, a Status set by the Item added workflow.
  const { store, github } = setup(t),
    first = await sync(store, github);
  assert.equal(first.status, "synced");
  assert.deepEqual(first.problems, []);
  assert.equal(github.items.length, 7);
  for (const [, , fields] of github.writes.filter((w) => w[0] === "fields"))
    assert.ok(
      fields.every((field) => field.id !== 1),
      "no Status write",
    );
  assert.equal(value(github, "a1", 2), "one");
  assert.equal(value(github, "a2", 2), "two");
  assert.equal(
    value(github, "A", 2),
    "two",
    "a parent takes its children's latest",
  );
  assert.equal(value(github, "B", 2), "one");
  assert.equal(value(github, "b3", 3), 4);
  assert.equal(value(github, "a2", 4), "Sprint 1");
  assert.equal(value(github, "a1", 4), null, "Iteration only where named");
  const recorded = parseMarker(github.issues.get(`${REPO}#4`).body);
  assert.deepEqual(recorded.applied.project, {
    Release: "two",
    Wave: 2,
    Iteration: "Sprint 1",
  });
  assert.equal(
    store.read().tasks.find((entry) => entry.id === "a2").github.bodyHash,
    digest(github.issues.get(`${REPO}#4`).body),
  );

  // The Item added workflow sets Todo; Avoozl reads it and writes nothing.
  for (const entry of graph().tasks) github.edit(entry.id, 1, "s-todo");
  await sync(store, github);
  const writes = github.writes.length,
    revision = store.read().revision,
    before = receipts(store),
    second = await sync(store, github);
  assert.deepEqual(second.writes, []);
  assert.equal(github.writes.length, writes);
  assert.equal(store.read().revision, revision);
  assert.equal(receipts(store), before);
});

test("a Wave edit is written back with a notification, and an edge change writes only changed waves", async (t) => {
  // Nearby inputs: a hand-set 9, an edge removal, the tick after it.
  const { store, github } = setup(t);
  await sync(store, github);
  github.edit("b3", 3, 9);
  const reverted = await sync(store, github);
  assert.equal(value(github, "b3", 3), 4);
  assert.equal(reverted.notify.length, 1);
  assert.match(reverted.notify[0].text, /set Wave on b3 to 9/);

  const data = structuredClone(store.read());
  data.edges = data.edges.filter((edge) => edge.id !== "a1:requires:a2");
  store.commit(data, "Remove an edge");
  const moved = await sync(store, github);
  assert.deepEqual(
    moved.writes
      .filter((w) => w.write === "fields")
      .map((w) => w.taskId)
      .sort(),
    ["a2", "b2", "b3"],
  );
  assert.deepEqual(moved.notify, [], "Avoozl's own recompute is no edit");
  assert.deepEqual(
    ["a2", "b2", "b3"].map((id) => value(github, id, 3)),
    [1, 2, 3],
  );
  assert.deepEqual((await sync(store, github)).writes, []);
});

test("a person's Release is kept, drives the parent, and drafts a plan change", async (t) => {
  // Nearby inputs: the parent rule, an approved manifest that agrees later,
  // a manifest move of a task whose field still holds Avoozl's value.
  const { store, github } = setup(t);
  await sync(store, github);
  github.edit("b3", 2, "r-two");
  await sync(store, github);
  await sync(store, github);
  assert.equal(value(github, "b3", 2), "two", "kept on later ticks");
  assert.equal(value(github, "B", 2), "two", "the parent follows it");
  let record = store.get("receipts", "project-item:b3");
  assert.deepEqual(record.releaseDraft, {
    planId: null,
    specKey: null,
    from: "one",
    to: "two",
  });
  assert.match(
    deliveryView(store, store.read())
      .items.find((item) => item.id === "b3")
      .project.notes.join(" "),
    /drafted for review/,
  );

  const data = structuredClone(store.read());
  data.tasks.find((entry) => entry.id === "b3").milestone = "two";
  data.tasks.find((entry) => entry.id === "b1").milestone = "two";
  store.commit(data, "Approve the move");
  await sync(store, github);
  record = store.get("receipts", "project-item:b3");
  assert.equal(
    record.releaseDraft,
    null,
    "the agreeing manifest closes the draft",
  );
  assert.equal(record.applied.Release, "two");
  assert.equal(
    value(github, "b1", 2),
    "two",
    "a manifest move rewrites Avoozl's value",
  );
});

test("Deferred by an allowed actor pauses; leaving resumes; others are ignored and shown", async (t) => {
  // Nearby inputs: a disallowed account with write access, an unreadable
  // actor, the automation account, a repeated tick, the move out.
  const { store, github } = setup(t);
  await sync(store, github);
  const move = (taskId, actor, status, previousStatus) =>
    (github.moves["I_" + taskId] ||= []).push({
      actor,
      at: "2026-11-12T08:00:00Z",
      status,
      previousStatus,
      projectId: PROJECT_NODE,
    });

  github.edit("a1", 1, "s-deferred");
  move("a1", "owner", "Deferred", "Todo");
  github.edit("b1", 1, "s-deferred");
  move("b1", "helper", "Deferred", "Todo");
  github.edit("b2", 1, "s-deferred");
  move("b2", null, "Deferred", "Todo");
  const writes = github.writes.length,
    paused = await sync(store, github);
  assert.deepEqual([...pausedTaskIds(store)], ["a1"]);
  assert.equal(paused.notify.length, 1);
  assert.match(paused.notify[0].text, /owner moved a1 to Deferred/);
  assert.equal(github.writes.length, writes, "no card is reverted");
  const notes = (id) =>
    deliveryView(store, store.read())
      .items.find((item) => item.id === id)
      .project.notes.join(" ");
  assert.match(notes("b1"), /does not allow \(helper\)/);
  assert.match(notes("b2"), /does not allow \(unknown\)/);
  assert.match(notes("a1"), /Paused/);
  assert.deepEqual((await sync(store, github)).notify, [], "notified once");

  // The automation moving it out is no order; the owner's move is.
  github.edit("a1", 1, "s-todo");
  move("a1", "github-project-automation", "Todo", "Deferred");
  await sync(store, github);
  assert.deepEqual([...pausedTaskIds(store)], ["a1"]);
  assert.match(notes("a1"), /Still paused/);
  github.edit("a1", 1, "s-deferred");
  move("a1", "owner", "Deferred", "Todo");
  await sync(store, github);
  github.edit("a1", 1, "s-progress");
  move("a1", "owner", "In progress", "Deferred");
  const before = github.writes.length;
  await sync(store, github);
  assert.deepEqual([...pausedTaskIds(store)], []);
  assert.equal(github.writes.length, before, "resuming writes nothing");
  assert.equal(
    value(github, "a1", 1),
    "In progress",
    "the person's column stays",
  );
  assert.match(
    notes("a1"),
    /Board Status is In progress; Avoozl's state is Todo/,
  );

  // A paused GitHub task is held from dispatch.
  github.edit("b3", 1, "s-deferred");
  move("b3", "owner", "Deferred", "Todo");
  await sync(store, github);
  assert.ok(pausedTaskIds(store).has("b3"));
});

test("without the project scope Project sync reports unavailable and changes nothing", async (t) => {
  // Nearby inputs: a classic token without project, a failing Project read.
  const { store, github } = setup(t);
  github.scopes = "repo, read:org";
  const result = await sync(store, github);
  assert.equal(result.status, "unavailable");
  assert.equal(result.fix, "gh auth refresh -s project");
  assert.deepEqual(github.writes, []);
  github.scopes = null;
  github.projectV2 = async () => {
    const error = Error("Not Found");
    error.status = 404;
    throw error;
  };
  assert.equal((await sync(store, github)).status, "unavailable");
  assert.deepEqual(
    (await syncProject(store, github, { policy: {} })).status,
    "off",
  );
});

test("the tick runs Project sync after completion and queues the pause notice", async (t) => {
  // Nearby inputs: a tick without a roster (no sync), a tick with one.
  const { root, store, github } = setup(t);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      github: {
        mode: "single-repo",
        project: { owner: "example", number: 7 },
        repositories: {
          [REPO]: { baseBranch: "main", allowedActors: ["owner"] },
        },
      },
    }),
  );
  const ops = new Operations(store, { workspaceRoot: root, github });
  const quiet = await ops.execute("workspace.tick", {});
  assert.equal(quiet.project, undefined, "only the cron syncs the board");
  const first = await ops.execute("workspace.tick", { sessions: [] });
  assert.equal(first.project?.status, "synced", JSON.stringify(first.project));
  assert.equal(github.items.length, 7);
  github.edit("a1", 1, "s-deferred");
  (github.moves.I_a1 ||= []).push({
    actor: "owner",
    at: "2026-11-12T08:00:00Z",
    status: "Deferred",
    previousStatus: "Todo",
    projectId: PROJECT_NODE,
  });
  const second = await ops.execute("workspace.tick", { sessions: [] });
  assert.ok(second.notify.some((notice) => notice.task === "a1"));
  assert.deepEqual([...pausedTaskIds(store)], ["a1"]);
});

test("the client finds a user Project, follows cursor pages, and writes fields", async () => {
  // Nearby inputs: an organization 404, a Link header with `after`, the
  // GraphQL status-move shape.
  const { GitHubClient } = await import("../github.mjs"),
    requests = [],
    github = new GitHubClient({
      token: "test-token",
      apiUrl: "https://api.example.test",
      fetch: async (url, options) => {
        const target = new URL(url),
          request = {
            method: options.method,
            url: target.pathname + target.search,
            body: options.body ? JSON.parse(options.body) : undefined,
          };
        requests.push(request);
        if (target.pathname.startsWith("/orgs/"))
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
          });
        if (target.pathname === "/graphql")
          return Response.json({
            data: {
              node: {
                timelineItems: {
                  nodes: [
                    {
                      actor: { login: "owner" },
                      createdAt: "2026-11-12T08:00:00Z",
                      status: "Deferred",
                      previousStatus: "Todo",
                      project: { id: PROJECT_NODE },
                    },
                  ],
                },
              },
            },
          });
        if (target.pathname.endsWith("/items") && options.method === "GET") {
          const later = target.searchParams.get("after") === "c2";
          return new Response(JSON.stringify([{ id: later ? 2 : 1 }]), {
            headers: later
              ? {}
              : {
                  link: '<https://api.example.test/users/me/projectsV2/3/items?after=c2>; rel="next"',
                },
          });
        }
        return new Response(JSON.stringify({ id: 3, node_id: "PVT_3" }), {
          headers: { "x-oauth-scopes": "project, repo" },
        });
      },
    });
  const project = await github.projectV2({ owner: "me", number: 3 });
  assert.equal(project.base, "/users/me/projectsV2/3");
  assert.equal(project.scopes, "project, repo");
  assert.deepEqual(
    (await github.projectItems(project, [5, 6])).map((item) => item.id),
    [1, 2],
  );
  await github.updateProjectItem(project, 9, [{ id: 5, value: 2 }]);
  await github.addProjectItem(project, { owner: "o", repo: "r", number: 4 });
  assert.deepEqual(await github.projectStatusChanges("I_1"), [
    {
      actor: "owner",
      at: "2026-11-12T08:00:00Z",
      status: "Deferred",
      previousStatus: "Todo",
      projectId: PROJECT_NODE,
    },
  ]);
  assert.deepEqual(
    requests
      .filter((r) => r.method !== "GET" && r.url !== "/graphql")
      .map((r) => [r.method, r.url, r.body]),
    [
      [
        "PATCH",
        "/users/me/projectsV2/3/items/9",
        { fields: [{ id: 5, value: 2 }] },
      ],
      [
        "POST",
        "/users/me/projectsV2/3/items",
        { type: "Issue", owner: "o", repo: "r", number: 4 },
      ],
    ],
  );
  assert.ok(requests.some((r) => r.url.includes("fields=5%2C6")));
});

test("a manifest entry may name its milestone and iteration as text", async () => {
  // Nearby inputs: a number where text belongs.
  const { validateProposal } = await import("../plans.mjs"),
    entry = {
      title: "T",
      acceptance: ["Works."],
      milestone: "one",
      iteration: "Sprint 1",
    };
  assert.equal(validateProposal({ ...entry }).milestone, "one");
  assert.throws(
    () => validateProposal({ ...entry, iteration: 2 }),
    /iteration must be text/,
  );
});

test("P28 (4): a Release value a rules plugin set blocks is not written and opens a decision", async (t) => {
  // Nearby inputs: the other items still sync; the set comes from a rules
  // plugin's memory, as loadRulePlugins leaves it.
  const { bindContentRules, contentBinding } = await import(
    "../content-rules.mjs"
  );
  const data = graph();
  data.tasks.find((entry) => entry.id === "a2").milestone = "Project X launch";
  const { root, store, github } = setup(t, data);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      plugins: [{ id: "fake-rules", path: "plugins/fake-rules", contract: 1 }],
      contentRules: {
        sets: [{ id: "fake-plugin-set", plugin: "fake-rules" }],
      },
    }),
  );
  bindContentRules(store, {
    workspaceRoot: root,
    configFile: path.join(root, "config", "config.json"),
  });
  contentBinding(store).plugins.set("fake-rules", {
    loadedAt: Date.now(),
    sets: new Map([
      [
        "fake-plugin-set",
        {
          id: "fake-plugin-set",
          version: "1.0.0",
          rules: [{ id: "project", source: "\\bproject[- ]?x\\b" }],
        },
      ],
    ]),
  });
  await sync(store, github);
  assert.equal(value(github, "a2", 2), null, "no Release write for a2");
  assert.equal(value(github, "a1", 2), "one", "the other items sync");
  const decisions = store
    .list("content_decisions")
    .filter((d) => d.state === "open");
  assert.ok(decisions.length >= 1);
  for (const decision of decisions)
    assert.deepEqual(
      [decision.set, decision.rules, decision.boundary],
      ["fake-plugin-set", ["project"], "github"],
    );
  assert.ok(decisions.some((d) => d.target === "project-item:a2"));
  assert.equal(decisions[0].findings[0].version, "1.0.0");
});

// Avoozl state (§6.7): Avoozl's Delivery lane on the board, written only
// when it changes; a person's edit is written back once and recorded.
const statePolicy = normalizeGitHubPolicy({
  ...policy,
  project: {
    ...policy.project,
    fields: { ...policy.project.fields, avoozlState: "Avoozl state" },
  },
});
const stateWrites = (github) =>
  github.writes.filter(
    (w) => w[0] === "fields" && w[2].some((field) => field.id === 5),
  ).length;

test("Avoozl state follows the Delivery lane, is written only on change, and never touches Status", async (t) => {
  // Nearby inputs: a second pass, a status change, a blank field name, a
  // card paused this pass, Status edits by the board's workflows.
  const { store, github } = setup(t),
    names = new Map([
      ["ready", "Ready"],
      ["waiting", "Blocked or waiting"],
      ["deferred", "Deferred"],
      ["done", "Done"],
      ["needs-you", "Needs you"],
    ]);
  // Blank: Avoozl skips the field.
  await sync(store, github);
  assert.equal(stateWrites(github), 0, "blank skips Avoozl state");

  const first = await sync(store, github, { policy: statePolicy });
  assert.deepEqual(first.problems, []);
  const lanes = avoozlStates(store, store.read());
  for (const entry of graph().tasks)
    assert.equal(value(github, entry.id, 5), names.get(lanes.get(entry.id)));
  assert.equal(value(github, "a1", 5), "Ready");
  assert.equal(value(github, "a2", 5), "Blocked or waiting");
  const written = stateWrites(github);
  assert.equal((await sync(store, github, { policy: statePolicy })).writes.length, 0);
  assert.equal(stateWrites(github), written, "unchanged writes nothing");

  // The plan moves a2 to needs-you: one write, for that card only.
  const data = structuredClone(store.read());
  data.tasks.find((entry) => entry.id === "a2").status = "blocked";
  store.commit(data, "Block a2");
  const moved = await sync(store, github, { policy: statePolicy });
  assert.deepEqual(
    moved.writes.map((w) => w.taskId),
    ["a2"],
  );
  assert.equal(value(github, "a2", 5), "Needs you");
  assert.deepEqual(moved.notify, [], "Avoozl's own change is no edit");

  // A Deferred drag by an allowed actor shows Deferred in the same pass.
  github.edit("b1", 1, "s-deferred");
  (github.moves.I_b1 ||= []).push({
    actor: "owner",
    at: "2026-11-12T08:00:00Z",
    status: "Deferred",
    previousStatus: "Todo",
    projectId: PROJECT_NODE,
  });
  await sync(store, github, { policy: statePolicy });
  assert.equal(value(github, "b1", 5), "Deferred");

  for (const [, , fields] of github.writes.filter((w) => w[0] === "fields"))
    assert.ok(
      fields.every((field) => field.id !== 1),
      "Avoozl never writes Status",
    );
});

test("a person's Avoozl state edit is written back once and recorded as a conflict", async (t) => {
  // Nearby inputs: the pass after the revert, a second edit, the state
  // moving on its own, an empty value.
  const { store, github } = setup(t);
  await sync(store, github, { policy: statePolicy });
  github.edit("a1", 5, "v-done");
  const reverted = await sync(store, github, { policy: statePolicy });
  assert.equal(value(github, "a1", 5), "Ready");
  assert.equal(reverted.notify.length, 1);
  assert.match(
    reverted.notify[0].text,
    /set Avoozl state on a1 to Done\. Avoozl fills Avoozl state from its own state and wrote Ready back\./,
  );
  const conflict = () =>
    conflictsView(store, store.read()).items.filter(
      (item) => item.field === "Avoozl state",
    );
  assert.equal(conflict().length, 1);
  assert.equal(conflict()[0].kind, "github-conflict");
  assert.equal(conflict()[0].taskId, "a1");
  assert.equal(conflict()[0].actual, "Done");
  assert.deepEqual(conflict()[0].choices, []);

  // Once: the next pass writes and notifies nothing, and the record stays.
  const writes = github.writes.length,
    after = await sync(store, github, { policy: statePolicy });
  assert.equal(github.writes.length, writes);
  assert.deepEqual(after.notify, []);
  assert.equal(conflict().length, 1);

  // Clearing the value is an edit too.
  github.edit("a1", 5, null);
  assert.equal(
    (await sync(store, github, { policy: statePolicy })).notify.length,
    1,
  );
  assert.equal(conflict()[0].actual, null);

  // The state moving on its own clears the record.
  const data = structuredClone(store.read());
  data.tasks.find((entry) => entry.id === "a1").status = "accepted";
  store.commit(data, "Finish a1");
  await sync(store, github, { policy: statePolicy });
  assert.equal(value(github, "a1", 5), "Done");
  assert.deepEqual(conflict(), []);
});

test("Avoozl state may not name the Status field, and a missing option is reported", async (t) => {
  // Nearby inputs: the Status field named twice, an option deleted on GitHub.
  const { store, github } = setup(t),
    onStatus = normalizeGitHubPolicy({
      ...policy,
      project: { ...policy.project, fields: { avoozlState: "Status" } },
    });
  const refused = await sync(store, github, { policy: onStatus });
  assert.ok(refused.problems.some((p) => /cannot use the Status field/.test(p)));
  for (const [, , fields] of github.writes.filter((w) => w[0] === "fields"))
    assert.ok(fields.every((field) => field.id !== 1), "no Status write");

  const real = github.projectFields;
  github.projectFields = async () =>
    (await real()).map((field) =>
      field.id === 5
        ? {
            ...field,
            options: field.options.filter(
              (entry) => entry.name.raw !== "Blocked or waiting",
            ),
          }
        : field,
    );
  const missing = await sync(store, github, { policy: statePolicy });
  assert.ok(
    missing.problems.includes(
      "Avoozl state option Blocked or waiting is missing; run Set up GitHub to add it.",
    ),
  );
});

test("a board with Ready reads it as the first column; an older one keeps Todo", async (t) => {
  // Nearby inputs: a Ready board, a Todo board, an explicit statusValues.
  const { store, github } = setup(t);
  await sync(store, github);
  github.edit("a1", 1, "s-progress");
  await sync(store, github);
  assert.match(
    deliveryView(store, store.read())
      .items.find((item) => item.id === "a1")
      .project.notes.join(" "),
    /Avoozl's state is Todo/,
  );
  const real = github.projectFields;
  github.projectFields = async () =>
    (await real()).map((field) =>
      field.id === 1
        ? {
            ...field,
            options: field.options.map((entry) =>
              entry.id === "s-todo" ? option("s-todo", "Ready") : entry,
            ),
          }
        : field,
    );
  github.edit("a1", 1, "s-done");
  await sync(store, github);
  github.edit("a1", 1, "s-progress");
  await sync(store, github);
  assert.match(
    deliveryView(store, store.read())
      .items.find((item) => item.id === "a1")
      .project.notes.join(" "),
    /Avoozl's state is Ready/,
  );
});
