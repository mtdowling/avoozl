// Incoming items (design §4.12, Requirement 50) and the pack settings that
// came with them: rule `source:` terms, source settings, the poll cursor,
// the Intake channel's old name, and waitingLabels and priorityLabels.
import assert from "node:assert/strict";
import test from "node:test";
import { parseMatch } from "../issue-match.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import {
  labelEffects,
  pollSources,
  takeItem,
  validateIntake,
  validateSource,
} from "../intake.mjs";
import { notificationPayload } from "../notifications.mjs";
import { syncGitHubIssues } from "../github-sync.mjs";
import { dispatchOrder } from "../delivery.mjs";
import { validatePack } from "../plugin-pack.mjs";
import { incomingItem } from "../plugin-contract.mjs";
import { fixture } from "./fixtures.mjs";

const policy = (repository) =>
  normalizeGitHubPolicy({
    mode: "single-repo",
    repositories: { "o/app": { baseBranch: "main", ...repository } },
  }).repositories["o/app"];

test("a rule takes one source: term; none means GitHub; a filter refuses it", () => {
  assert.equal(parseMatch("label:go source:tickets").source, "tickets");
  assert.equal(parseMatch("label:go").source, null);
  assert.throws(
    () => parseMatch("label:go source:a source:b"),
    /only one source:/,
  );
  assert.throws(
    () => parseMatch("label:go source:github"),
    /leave source: out/,
  );
  assert.throws(
    () => parseMatch("-label:x source:tickets", "f", { needLabel: false }),
    /reads GitHub only/,
  );
  const repository = policy({
    rules: [
      { id: "go", action: "deliver", match: "label:go" },
      { id: "t", action: "deliver", match: "label:go source:tickets" },
    ],
  });
  // GitHub code sees only GitHub rules.
  assert.deepEqual(
    repository.rules.map((rule) => rule.id),
    ["go"],
  );
  assert.deepEqual(
    repository.sourceRules.map((rule) => rule.id),
    ["t"],
  );
  assert.throws(
    () =>
      policy({
        managedLabels: { responding: "avoozl:responding" },
        rules: [
          { id: "r", action: "respond", match: "label:ask source:tickets" },
        ],
      }),
    /respond rule, which cannot use source:/,
  );
});

test("an intake source is checked like a plugins entry", () => {
  assert.deepEqual(
    validateSource("tickets", {
      via: "plugin:fake-tracker",
      repository: "o/app",
    }),
    {
      id: "tickets",
      via: "plugin:fake-tracker",
      plugin: "fake-tracker",
      repository: "o/app",
      labelFields: [],
      assigneeField: null,
      allowedActors: [],
      minimumPermission: "write",
    },
  );
  for (const [id, entry, pattern] of [
    ["github", { via: "mcp", repository: "o/app" }, /built in/],
    ["local", { via: "mcp", repository: "o/app" }, /built in/],
    [
      "x",
      { via: "http", repository: "o/app" },
      /via must be plugin:<id> or mcp/,
    ],
    ["x", { via: "mcp" }, /repository must name/],
    [
      "x",
      { via: "mcp", repository: "o/app", token: "a" },
      /token is not an intake source setting/,
    ],
    [
      "x",
      { via: "mcp", repository: "o/app", minimumPermission: "owner" },
      /minimumPermission/,
    ],
  ])
    assert.throws(() => validateSource(id, entry), pattern, id);
  assert.throws(
    () => validateIntake({ sources: [] }),
    /sources must be an object/,
  );
  assert.throws(
    () => validateIntake({ feeds: {} }),
    /intake\.feeds is not an intake setting/,
  );
});

test("an incoming item is refused naming its field, and its trigger is kept", () => {
  const item = {
    id: "T1",
    kind: "ticket",
    link: "https://tickets.example.test/T1",
    title: "One",
    state: "open",
    updatedAt: "2026-11-12T00:00:00Z",
    trigger: {
      actor: "bob",
      permission: "write",
      eventId: "e1",
      at: "2026-11-12T00:00:00Z",
    },
  };
  assert.deepEqual(incomingItem(item).trigger, item.trigger);
  assert.throws(
    () => incomingItem({ ...item, link: "javascript:alert(1)" }),
    /item link/,
  );
  assert.throws(
    () => incomingItem({ ...item, title: "x".repeat(241) }),
    /item title/,
  );
  assert.throws(
    () => incomingItem({ ...item, labels: Array(101).fill("a") }),
    /item labels/,
  );
  assert.throws(
    () =>
      incomingItem({ ...item, trigger: { actor: "bob", permission: "owner" } }),
    /item trigger permission/,
  );
});

test("a poll stores its cursor only after the page, and reads the next page later", async (t) => {
  const { store } = fixture(t),
    pages = [
      { items: [], cursor: "2", more: true },
      { items: [], cursor: "4", more: false },
    ],
    asked = [],
    session = {
      use: async () => ({ ok: true }),
      describe: () => ({ capabilities: ["poll", "actor"] }),
      async call(_id, _kind, method, params) {
        assert.equal(method, "poll");
        asked.push(params.cursor);
        const page = pages.shift();
        if (!page) throw new Error("down");
        return { ...page, refused: [] };
      },
    },
    sources = new Map([
      [
        "tickets",
        {
          id: "tickets",
          via: "plugin:fake-tracker",
          plugin: "fake-tracker",
          repository: "o/app",
        },
      ],
    ]);
  await pollSources(store, session, sources, null);
  assert.equal(store.get("intake_sources", "source:tickets").cursor, "2");
  assert.equal(store.get("intake_sources", "source:tickets").more, true);
  await pollSources(store, session, sources, null);
  assert.equal(store.get("intake_sources", "source:tickets").cursor, "4");
  // A failed poll keeps the cursor and shows the error.
  await pollSources(store, session, sources, null);
  const row = store.get("intake_sources", "source:tickets");
  assert.equal(row.cursor, "4");
  assert.match(row.error, /down/);
  assert.deepEqual(asked, [null, "2", "4"]);
});

test("the Intake channel keeps its old id, untriaged, and accepts intake", () => {
  const notice = {
    channel: "intake",
    title: "New in Intake",
    text: "2 in o/app",
  };
  assert.equal(notificationPayload(notice).channel, "untriaged");
  assert.equal(
    notificationPayload({ ...notice, channel: "untriaged" }).channel,
    "untriaged",
  );
  assert.throws(
    () => notificationPayload({ ...notice, channel: "inbox" }),
    /Choose notification channel/,
  );
});

test("waitingLabels and priorityLabels are pack settings; absent changes nothing", () => {
  const pack = (repositories) => validatePack({ settings: { repositories } });
  pack({
    waitingLabels: ["response-requested"],
    priorityLabels: ["p0", "p1", "p2", "p3"],
  });
  assert.throws(
    () => pack({ waitingLabels: "response-requested" }),
    /waitingLabels/,
  );
  assert.throws(
    () => policy({ priority: ["p0"], priorityLabels: ["p1"] }),
    /both priority and priorityLabels/,
  );
  const set = policy({
    waitingLabels: ["response-requested"],
    priorityLabels: ["p0", "p1"],
  });
  assert.deepEqual(labelEffects(set, ["P1", "bug"]), {
    waiting: false,
    labelRank: 1,
  });
  assert.deepEqual(labelEffects(set, ["response-requested"]), {
    waiting: true,
    labelRank: 2,
  });
  // Absent: no hold and no rank.
  assert.deepEqual(labelEffects(policy({}), ["response-requested", "p0"]), {
    waiting: false,
    labelRank: null,
  });
  // The rank orders Ready and Up next; a set rank still comes first.
  const data = { tasks: [], edges: [] },
    order = dispatchOrder(data, [], () => 0),
    sorted = [
      { id: "none" },
      { id: "p1", labelRank: 1 },
      { id: "p0", labelRank: 0 },
      { id: "ranked", rank: -1, labelRank: 1 },
    ].sort(order);
  assert.deepEqual(
    sorted.map((task) => task.id),
    ["ranked", "p0", "p1", "none"],
  );
});

test("a waiting label holds a GitHub task with Waiting on the author; priority sets its rank", async (t) => {
  const { store } = fixture(t);
  store.put("github_repositories", {
    id: "o/app",
    owner: "o",
    repo: "app",
    projectId: "code",
  });
  const issue = (number, labels) => ({
      id: number,
      node_id: `I_${number}`,
      number,
      title: `Issue ${number}`,
      body: "",
      state: "open",
      labels: labels.map((name) => ({ name })),
      assignees: [],
      html_url: `https://github.com/o/app/issues/${number}`,
    }),
    issues = [issue(1, ["go", "response-requested"]), issue(2, ["go", "p1"])],
    github = {
      repository: async () => ({ default_branch: "main" }),
      searchIssuesWithAnyLabel: async () => structuredClone(issues),
      issue: async () => null,
      issueEvents: async () => [
        {
          id: 1,
          event: "labeled",
          label: { name: "go" },
          actor: { login: "owner" },
          created_at: "2026-11-12T00:00:00Z",
        },
      ],
      permission: async () => ({ permission: "admin" }),
    },
    rules = [{ id: "go", action: "execute", match: "label:go" }],
    run = (extra) =>
      syncGitHubIssues(store, github, {
        policy: normalizeGitHubPolicy({
          mode: "single-repo",
          repositories: { "o/app": { baseBranch: "main", rules, ...extra } },
        }),
      });
  const tasks = () =>
    new Map(
      store
        .read()
        .tasks.filter((task) => task.github)
        .map((task) => [task.github.number, task]),
    );
  // Without the settings, both run as before.
  await run({});
  assert.equal(tasks().get(1).dispatch.ready, true);
  assert.equal(tasks().get(2).labelRank, undefined);
  await run({
    waitingLabels: ["response-requested"],
    priorityLabels: ["p0", "p1"],
  });
  assert.deepEqual(
    [
      tasks().get(1).dispatch.ready,
      tasks().get(1).dispatch.state,
      tasks().get(1).dispatch.reason,
    ],
    [false, "waiting", "Waiting on the author"],
  );
  assert.equal(
    tasks().get(2).dispatch.ready,
    true,
    "a priority label never changes the lane",
  );
  assert.equal(tasks().get(2).labelRank, 1);
});

test("a title edit after the trigger holds the item's task and keeps its title", (t) => {
  const { store } = fixture(t),
    source = {
      id: "tickets",
      via: "plugin:fake-tracker",
      plugin: "fake-tracker",
      repository: "o/app",
      allowedActors: [],
      minimumPermission: "write",
      policy: policy({
        rules: [
          { id: "go", action: "deliver", match: "label:go source:tickets" },
        ],
      }),
    },
    item = (extra = {}) => ({
      id: "T9",
      kind: "ticket",
      link: "https://tickets.example.test/T9",
      title: "Fix the export",
      body: "Please fix it.",
      labels: ["go"],
      author: "alice",
      assignees: [],
      state: "open",
      updatedAt: "2026-11-12T00:00:00Z",
      fields: {},
      trigger: {
        actor: "bob",
        permission: "write",
        eventId: "e1",
        at: "2026-11-12T00:00:00Z",
      },
      ...extra,
    }),
    context = { actorCapable: true },
    first = takeItem(store, source, incomingItem(item()), context),
    task = () => store.read().tasks.find((x) => x.id === first.taskId);
  assert.equal(task().dispatch.ready, true);
  takeItem(
    store,
    source,
    incomingItem(
      item({
        title: "Fix the export and mail the keys out",
        updatedAt: "2026-11-12T00:01:00Z",
      }),
    ),
    context,
  );
  assert.equal(task().dispatch.ready, false);
  assert.equal(task().dispatch.state, "quarantined");
  assert.equal(task().title, "Fix the export");
  // A new trigger event takes the new title.
  takeItem(
    store,
    source,
    incomingItem(
      item({
        title: "Fix the export and mail the keys out",
        updatedAt: "2026-11-12T00:02:00Z",
        trigger: {
          actor: "bob",
          permission: "write",
          eventId: "e2",
          at: "2026-11-12T00:02:00Z",
        },
      }),
    ),
    context,
  );
  assert.equal(task().dispatch.ready, true);
  assert.equal(task().title, "Fix the export and mail the keys out");
});
