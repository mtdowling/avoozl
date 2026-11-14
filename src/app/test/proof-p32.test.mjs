// Proof P32: incoming items from a fake plugin source and a fake MCP caller
// (tasks.md Phase 14, design §4.12, §8.5, Requirement 50). An isolated
// temporary workspace in single-repo mode with repository o/app, the real
// `.avoozl.json` policy, the fake tracker plugin from the test tree as source
// `tickets` (its `poll` reads a JSON file this test edits), source `script`
// with `via: mcp`, a content rule set on the `intake` boundary with one fake
// term, and a fake GitHub for issues 1 and 2 that refuses every write. Ticks
// are `workspace.tick` with `cron: true`; the page's reads are the
// operations it calls; MCP calls go through the app's MCP handler.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { handleMcp } from "../mcp.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { blockerNotes } from "../github-close.mjs";
import { intakeTaskId, itemKey } from "../intake.mjs";
import { writePluginSettings } from "../plugins.mjs";
import { untriagedPath } from "../untriaged.mjs";
import { completionReached } from "../../work-model.mjs";
import { queryTasks, statusComplete } from "../../query.mjs";
import { scanPlugins } from "../../../scripts/release-scan.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const FIXTURE = path.join(import.meta.dirname, "fixtures", "plugins");
const REPO = "o/app",
  NOW = Date.parse("2026-11-12T12:00:00Z"),
  DAY = 86400000,
  at = (minutes) => new Date(NOW - 60 * 60000 + minutes * 60000).toISOString();

// The fake source's items. `trigger` is what the plugin reports: who made a
// rule true and that person's standing in the source's own system.
const ticket = (id, extra = {}) => ({
  id,
  kind: "ticket",
  link: `https://tickets.example.test/${id}`,
  title: `Ticket ${id}`,
  body: `Please fix ${id}.`,
  labels: [],
  author: "alice",
  assignees: [],
  state: "open",
  updatedAt: at(1),
  fields: { component: "export" },
  ...extra,
});
const by = (actor, permission, id) => ({
  actor,
  permission,
  eventId: `${id}:${actor}`,
  at: at(0),
});
const ITEMS = [
  ticket("T1", { labels: ["go"], trigger: by("bob", "write", "T1") }),
  ticket("T2", { labels: ["go"], trigger: by("eve", "read", "T2") }),
  ticket("T3"),
  ticket("T5", { labels: ["go"], trigger: by("bob", "write", "T5") }),
  ticket("T6", { labels: ["go"], trigger: by("bob", "write", "T6") }),
  ticket("R1", {
    kind: "review",
    labels: ["go"],
    trigger: by("bob", "write", "R1"),
  }),
];

const WRITE =
  /^(create|update|add|remove|delete|ensure|set|close|reopen|merge|post|lock|link|unlink|move|transfer)/;

// Issues 1 (go, labeled by an allowed actor) and 2 (no labels); every read
// answers, every write is recorded and refused.
function fakeGitHub() {
  const issue = (number, labels) => ({
    id: number,
    node_id: `I_${number}`,
    number,
    title: `Item ${number}`,
    body: "",
    state: "open",
    labels: labels.map((name) => ({ name })),
    assignees: [],
    user: { login: "alice" },
    html_url: `https://github.com/${REPO}/issues/${number}`,
    updated_at: at(0),
  });
  const node = (entry) => ({
    __typename: "Issue",
    number: entry.number,
    title: entry.title,
    url: entry.html_url,
    createdAt: at(0),
    author: { login: "alice" },
    labels: { nodes: entry.labels },
    assignees: { nodes: [] },
    comments: { totalCount: 0 },
  });
  const state = {
    issues: [issue(1, ["go"]), issue(2, [])],
    writes: [],
    searches: 0,
  };
  const known = {
    available: () => true,
    async graphql(query, variables) {
      if (/mutation/.test(query)) state.writes.push(["graphql"]);
      if (!/search\(query/.test(query)) return {};
      state.searches += 1;
      return {
        search: {
          issueCount: state.issues.length,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: state.issues.map(node),
        },
      };
    },
    async currentUser() {
      return { login: "owner" };
    },
    async permission() {
      return { permission: "admin" };
    },
    async repository() {
      return { id: 1, node_id: "R_1", full_name: REPO, default_branch: "main" };
    },
    async searchIssuesWithAnyLabel() {
      return structuredClone(state.issues.filter((i) => i.labels.length));
    },
    async issueEvents(_repository, number) {
      return number === 1
        ? [
            {
              id: 11,
              event: "labeled",
              label: { name: "go" },
              actor: { login: "owner" },
              created_at: at(0),
            },
          ]
        : [];
    },
    async issueTimeline() {
      return [];
    },
    async issue(_repository, number) {
      return structuredClone(state.issues.find((i) => i.number === number));
    },
  };
  return new Proxy(known, {
    get(target, name) {
      if (name === "state") return state;
      if (name in target) return target[name];
      if (typeof name !== "string" || name === "then") return undefined;
      return async (...args) => {
        if (WRITE.test(name)) {
          state.writes.push([name, args[0]]);
          throw new Error(`P32 fake GitHub refuses ${name}`);
        }
        return [];
      };
    },
  });
}

function workspace(t) {
  const { store } = fixture(t),
    root = temporaryDirectory("avoozl-p32-"),
    plugins = path.join(root, "plugins"),
    intakeFile = path.join(root, "tickets.json"),
    settingsFile = path.join(root, "machine", "plugins.json"),
    github = fakeGitHub();
  fs.cpSync(
    path.join(FIXTURE, "fake-tracker"),
    path.join(plugins, "fake-tracker"),
    {
      recursive: true,
    },
  );
  writePluginSettings(settingsFile, {
    plugins: [
      {
        id: "fake-tracker",
        path: path.join(plugins, "fake-tracker"),
        contract: 1,
        config: { stateFile: path.join(root, "records.json"), intakeFile },
      },
    ],
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_p32intakeitemsxxx",
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: {
            baseBranch: "main",
            // Plain issues are listed only for a repository Avoozl triages.
            coder: "worker",
            allowedActors: ["owner"],
            minimumPermission: "write",
            managedLabels: { managed: "avoozl:managed", ready: "avoozl:ready" },
            rules: [
              {
                id: "tickets-go",
                action: "deliver",
                match: "label:go source:tickets",
              },
              {
                id: "script-hold",
                action: "pause",
                match: "label:hold source:script",
              },
              {
                id: "script-go",
                action: "deliver",
                match: "label:go source:script",
              },
              { id: "go", action: "deliver", match: "label:go" },
            ],
            untriaged: {},
          },
        },
      },
      intake: {
        sources: {
          tickets: {
            via: "plugin:fake-tracker",
            repository: REPO,
            labelFields: ["component"],
            minimumPermission: "write",
          },
          script: { via: "mcp", repository: REPO },
        },
      },
      contentRules: { sets: [{ id: "intake-terms", boundaries: ["intake"] }] },
    }),
  );
  const terms = path.join(root, ".avoozl", "local", "content-rules");
  fs.mkdirSync(terms, { recursive: true });
  fs.writeFileSync(
    path.join(terms, "intake-terms.txt"),
    "# Fake terms for P32\ncodename: \\bzorblat\\b\n",
  );
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    checks: [],
  });
  store.put("github_repositories", {
    id: REPO,
    owner: "o",
    repo: "app",
    projectId: "code",
    activeMachine: machineIdentity(store).id,
  });
  const ops = new Operations(store, {
    github,
    workspaceRoot: root,
    pluginSettingsFile: settingsFile,
  });
  const items = {
    write: (list, extra = {}) =>
      fs.writeFileSync(intakeFile, JSON.stringify({ items: list, ...extra })),
    read: () => JSON.parse(fs.readFileSync(intakeFile, "utf8")).items,
    edit(id, change) {
      const list = items.read();
      Object.assign(
        list.find((item) => item.id === id),
        change,
      );
      items.write(list);
    },
  };
  items.write(ITEMS);
  const mcp = async (action, input) => {
    const reply = await handleMcp(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "plans_intake", arguments: { action, input } },
      },
      ops,
    );
    return reply.body.result;
  };
  return {
    store,
    root,
    github,
    ops,
    items,
    mcp,
    tick: () => ops.execute("workspace.tick", { sessions: [], cron: true }),
    view: () => ops.execute("untriaged.view", {}),
    task: (id) => ops.read().tasks.find((task) => task.id === id),
    row: (source, id) => store.get("incoming_items", itemKey(source, id)),
    dump: () =>
      JSON.stringify([
        store.list("incoming_items"),
        store.list("intake_sources"),
        // GitHub intake rewrites its own task each sync, as before.
        store.read().tasks.filter((task) => task.intake),
      ]),
  };
}

const leafOf = (id) => intakeTaskId("tickets", id);

test("P32: incoming items from a fake plugin source and a fake MCP caller", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const w = workspace(t);
  const listed = (await w.ops.execute("plugins.list", {})).plugins.find(
    (p) => p.id === "fake-tracker",
  );
  await w.ops.execute("plugin.approve", {
    id: "fake-tracker",
    hash: listed.hash,
  });

  // (1) One tick: T1, T5, T6 each one pinned local leaf in o/app; T2 (eve
  // reads only), T3 and R1 untriaged; GitHub issue 1 delivers, 2 untriaged.
  await w.tick();
  for (const id of ["T1", "T5", "T6"]) {
    const leaf = w.task(leafOf(id));
    assert.ok(leaf, `${id} has a leaf`);
    assert.equal(leaf.kind, "leaf");
    assert.equal(leaf.authority, "local");
    assert.equal(leaf.repository, "code");
    assert.equal(leaf.dispatch.ready, true, id);
    assert.equal(leaf.approvedSource.text, `Please fix ${id}.`);
    assert.equal(leaf.intake.source, "tickets");
    assert.equal(leaf.intake.actor, "bob");
    assert.equal(w.row("tickets", id).route.state, "delivered");
  }
  assert.equal(
    w.ops.read().tasks.filter((task) => task.intake?.source === "tickets")
      .length,
    3,
  );
  assert.equal(w.row("tickets", "T2").route.state, "untriaged");
  assert.match(
    w.row("tickets", "T2").route.reason,
    /eve needs write permission/,
  );
  assert.equal(w.row("tickets", "T3").route.state, "untriaged");
  assert.equal(w.row("tickets", "R1").route.state, "untriaged");
  assert.equal(w.task(leafOf("R1")), undefined, "a review never delivers");
  // labelFields add component:export before matching.
  const t1 = await w.ops.execute("intake.view", {
    source: "tickets",
    id: "T1",
  });
  assert.deepEqual(t1.labels, ["go"]);
  assert.deepEqual(t1.trigger, by("bob", "write", "T1"));
  const issue1 = w.ops.read().tasks.find((task) => task.github?.number === 1);
  // Issue 1 delivers as before: authorized, then classified by a planner.
  assert.equal(
    w.store.list("github_issues").find((row) => row.number === 1).state,
    "authorized",
  );
  assert.equal(issue1?.dispatch?.state, "classifying");
  assert.equal(w.row("github", `${REPO}#1`).record.source, "github");
  assert.equal(
    w.store.list("github_issues").find((row) => row.number === 1).item,
    itemKey("github", `${REPO}#1`),
  );
  let view = await w.view();
  const shown = (source) =>
    view.items
      .filter((item) => item.source === source)
      .map((item) => item.id)
      .sort();
  assert.deepEqual(shown("github"), [`${REPO}#2`]);
  assert.deepEqual(shown("tickets"), ["R1", "T2", "T3"]);

  // Local tasks d5 and d6 each require their item's leaf.
  w.ops.store.mutate("Seed d5 and d6", (data) => {
    for (const [id, from] of [
      ["d5", leafOf("T5")],
      ["d6", leafOf("T6")],
    ]) {
      data.tasks.push({
        id,
        title: id,
        scope: "runtime",
        status: "planned",
        epic: "inbox",
        track: "catalog",
        kind: "leaf",
        authority: "local",
        repository: "code",
        acceptance: [`${id} works`],
        checks: [],
      });
      data.edges.push({
        id: `${from}:requires:${id}`,
        from,
        to: id,
        kind: "requires",
      });
    }
  });

  // (2) Another tick with no change writes nothing to the intake tables.
  let before = w.dump();
  await w.tick();
  assert.equal(w.dump(), before);

  // (3) A failed poll keeps the cursor and the items and shows the error;
  // the rest of the tick runs. Restored, the next read duplicates nothing.
  const cursor = w.store.get("intake_sources", "source:tickets").cursor;
  w.items.write(ITEMS, { fail: "tracker is down" });
  const searches = w.github.state.searches;
  const failed = await w.tick();
  assert.ok(failed.observe, "the tick ran to the end");
  const errored = w.store.get("intake_sources", "source:tickets");
  assert.match(errored.error, /tracker is down/);
  assert.equal(errored.cursor, cursor);
  assert.equal(
    w.store.list("incoming_items").filter((r) => r.source === "tickets").length,
    6,
  );
  view = await w.view();
  assert.match(
    view.sources.find((s) => s.id === "tickets").error,
    /tracker is down/,
  );
  assert.ok(w.github.state.searches >= searches);
  w.items.write(ITEMS);
  await w.tick();
  assert.equal(w.store.get("intake_sources", "source:tickets").error, null);
  assert.equal(
    w.store.list("incoming_items").filter((r) => r.source === "tickets").length,
    6,
  );

  // (4) Through MCP: S1 is listed, not delivered (a claim meets no starting
  // rule); S2 is paused; the javascript: link is refused naming the field
  // while the others are stored; a replay is unchanged, an older one stale.
  const s = (id, extra = {}) => ({
    ...ticket(id),
    link: `https://script.example.test/${id}`,
    ...extra,
  });
  const S1 = s("S1", {
    labels: ["go"],
    author: "alice",
    trigger: {
      actor: "alice",
      permission: "admin",
      eventId: "S1:1",
      at: at(0),
    },
  });
  let reply = await w.mcp("submit_items", {
    source: "script",
    items: [
      S1,
      s("S2", { labels: ["hold"] }),
      s("S3", { link: "javascript:alert(1)" }),
    ],
  });
  assert.equal(reply.isError, undefined, JSON.stringify(reply));
  let results = reply.structuredContent.results;
  assert.deepEqual(
    results.map((r) => [r.id, r.result, r.route?.state ?? null]),
    [
      ["S1", "created", "untriaged"],
      ["S2", "created", "paused"],
      ["S3", "refused", null],
    ],
  );
  assert.match(results[2].reason, /item 2 link/);
  assert.equal(w.task(intakeTaskId("script", "S1")), undefined);
  assert.equal(w.row("script", "S1").claims.trigger.actor, "alice");
  assert.equal(
    w.row("script", "S1").record.trigger,
    null,
    "a claim is not a trigger",
  );
  reply = await w.mcp("submit_items", { source: "script", items: [S1] });
  assert.equal(reply.structuredContent.results[0].result, "unchanged");
  reply = await w.mcp("submit_items", {
    source: "script",
    items: [{ ...S1, title: "Older", updatedAt: at(-30) }],
  });
  assert.equal(reply.structuredContent.results[0].result, "stale");

  // (5) Submitting to the plugin source or to GitHub through MCP is refused.
  for (const source of ["tickets", "github"]) {
    reply = await w.mcp("submit_items", { source, items: [s("X1")] });
    assert.equal(reply.isError, true, source);
    assert.match(reply.content[0].text, /only an mcp source takes items/);
  }
  assert.equal(w.row("tickets", "X1"), null);
  assert.equal(w.row("github", "X1"), null);

  // (6) T4 carries the fake term: quarantined, with a decision that names
  // the set and rule and never the term.
  w.items.write([
    ...w.items.read(),
    ticket("T4", {
      labels: ["go"],
      body: "The zorblat export fails.",
      trigger: by("bob", "write", "T4"),
      updatedAt: at(2),
    }),
  ]);
  const ticked = await w.tick();
  assert.equal(w.row("tickets", "T4").route.state, "quarantined");
  assert.deepEqual(w.row("tickets", "T4").findings, [
    { set: "intake-terms", rule: "codename" },
  ]);
  assert.equal(w.task(leafOf("T4")), undefined);
  const decision = w.store
    .list("content_decisions")
    .find((d) => d.target === "intake:tickets/T4");
  assert.equal(decision.state, "open");
  assert.equal(decision.set, "intake-terms");
  assert.deepEqual(decision.rules, ["codename"]);
  assert.doesNotMatch(JSON.stringify(decision), /zorblat/);
  assert.doesNotMatch(JSON.stringify(ticked.notify), /zorblat/);
  assert.doesNotMatch(JSON.stringify(w.row("tickets", "T4").route), /zorblat/);

  // (7) The Intake tab lists items from github, tickets and script with
  // their source; non-GitHub rows link to their item and offer no Issue
  // Radar; R1 offers Code review. Deliver this from the page makes one
  // pinned leaf; the same call from MCP gets 403.
  view = await w.view();
  assert.deepEqual([...new Set(view.items.map((item) => item.source))].sort(), [
    "github",
    "script",
    "tickets",
  ]);
  assert.deepEqual(
    view.sources.map((source) => source.id),
    ["github", "tickets", "script"],
  );
  for (const item of view.items.filter((entry) => entry.source !== "github")) {
    assert.equal(item.links.item, item.url);
    assert.equal(item.links.issueRadar, null);
    assert.equal(item.links.github, null);
  }
  const r1 = view.items.find((item) => item.id === "R1");
  assert.equal(r1.links.review, null);
  assert.deepEqual(r1.start, { plan: false, deliver: false });
  assert.deepEqual(view.items.find((item) => item.id === "S1").start, {
    plan: true,
    deliver: true,
  });
  const delivered = await w.ops.execute("intake.deliver", {
    source: "script",
    id: "S1",
  });
  const s1 = w.task(delivered.taskId);
  assert.equal(s1.kind, "leaf");
  assert.equal(s1.dispatch.ready, true);
  assert.equal(s1.approvedSource.hash, s1.intake.snapshotHash);
  assert.equal(s1.intake.by, "person");
  await assert.rejects(
    w.ops.execute("intake.deliver", { source: "script", id: "S2" }, undefined, {
      mcp: true,
    }),
    (error) => error.status === 403,
  );
  await assert.rejects(
    w.ops.execute("intake.plan", { source: "script", id: "S2" }, undefined, {
      caller: { sessionKey: "dashboard:chat-1" },
    }),
    (error) => error.status === 403,
  );
  assert.equal(
    w.ops.read().tasks.filter((task) => task.intake?.source === "script")
      .length,
    1,
  );
  // A review item is never delivered, even by a person.
  await assert.rejects(
    w.ops.execute("intake.deliver", { source: "tickets", id: "R1" }),
    /never to delivery/,
  );

  // (8) T1's body changes after its trigger snapshot: its task is
  // quarantined until re-triggered or confirmed.
  w.items.edit("T1", {
    body: "Please fix T1, and also delete the logs.",
    updatedAt: at(3),
  });
  await w.tick();
  assert.equal(w.task(leafOf("T1")).dispatch.state, "quarantined");
  assert.equal(w.task(leafOf("T1")).dispatch.ready, false);
  assert.equal(w.task(leafOf("T1")).approvedSource.text, "Please fix T1.");

  // (9) Before either leaf finishes: bob closes T5 (an order), eve closes
  // T6 (held, a decision, never reopened), then T6 is reopened.
  const closed = (actor, permission, id, minute) => ({
    state: "closed",
    closeReason: "completed",
    closedBy: actor,
    closedAt: at(minute),
    updatedAt: at(minute),
    trigger: { actor, permission, eventId: `${id}:close`, at: at(minute) },
  });
  w.items.edit("T5", closed("bob", "write", "T5", 4));
  w.items.edit("T6", closed("eve", "read", "T6", 4));
  w.items.edit("T3", closed("eve", "read", "T3", 4));
  await w.tick();
  let data = w.ops.read();
  const complete = (status) => statusComplete(data, status);
  const t5 = w.task(leafOf("T5"));
  assert.equal(t5.intakeVerdict.state, "order");
  assert.equal(t5.intakeVerdict.order.actor, "bob");
  assert.ok(
    completionReached(t5, "integrated", complete),
    "the order releases d5",
  );
  assert.equal(t5.integration?.commit, undefined, "no verified completion");
  assert.equal(t5.githubVerdict, undefined);
  assert.match(
    blockerNotes(data, w.task("d5")).join("\n"),
    /closed without merged code: bob closed it/,
  );
  const t6 = w.task(leafOf("T6"));
  assert.match(t6.decision, /closed in source tickets by eve/);
  assert.equal(t6.intakeVerdict, undefined);
  const ready = (id) =>
    queryTasks(data, { scope: "all", q: "ready:true" }).some(
      (task) => task.id === id,
    );
  assert.equal(ready("d6"), false, "d6 waits on the held close");
  assert.equal(
    w.items.read().find((i) => i.id === "T6").state,
    "closed",
    "Avoozl did not reopen T6",
  );
  w.items.edit("T6", {
    state: "open",
    closedBy: null,
    closedAt: null,
    updatedAt: at(5),
  });
  await w.tick();
  assert.equal(
    w.task(leafOf("T6")).decision,
    undefined,
    "the reopen lifts the hold",
  );
  assert.equal(w.task(leafOf("T6")).intakeHold, undefined);

  // (10) Past 30 days, the closed item no task holds is gone; T5 stays.
  t.mock.timers.tick(31 * DAY);
  await w.tick();
  assert.equal(w.row("tickets", "T3"), null);
  assert.ok(w.row("tickets", "T5"));

  // (11) GitHub as in P31: the Untriaged read keeps its items in SQLite, and
  // untriaged.json is not written. No GitHub write at any step.
  assert.equal(fs.existsSync(untriagedPath(w.store)), false);
  assert.deepEqual(
    w.store.get("intake_sources", `github:${REPO}`).keys,
    [1, 2],
  );
  assert.deepEqual(w.github.state.writes, []);
  data = w.ops.read();
  assert.ok(data.tasks.some((task) => task.github?.number === 1));
  // The release scan covers the fixtures and finds nothing.
  assert.deepEqual(scanPlugins().findings, []);
});
