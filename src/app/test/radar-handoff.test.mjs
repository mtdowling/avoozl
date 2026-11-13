// Send to Issue Radar and working beside crews (design §8.5, §6.4,
// Requirement 52). An isolated temporary workspace, a fake GitHub that
// records every label write, and fake Issue Radar crew answers. Nothing
// here reaches GitHub or Kiro Crew.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { principalAllows } from "../app-backend.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { matchingRules, normalizeGitHubPolicy } from "../github-policy.mjs";
import {
  issueRadarReader,
  labelProblem,
  readCrews,
} from "../radar-handoff.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const REPO = "o/app";
const CLAIM = "crew: in progress",
  HUMAN = "crew: needs human";

const issue = (number, labels = []) => ({
  __typename: "Issue",
  number,
  title: `Item ${number}`,
  url: `https://github.com/${REPO}/issues/${number}`,
  createdAt: "2026-11-12T10:00:00Z",
  author: { login: "alice" },
  labels: { nodes: labels.map((name) => ({ name })) },
  assignees: { nodes: [] },
  comments: { totalCount: 0 },
});
const pull = (number) => ({
  ...issue(number),
  __typename: "PullRequest",
  url: `https://github.com/${REPO}/pull/${number}`,
  isDraft: false,
  closingIssuesReferences: { nodes: [] },
  commits: { nodes: [] },
});

function fakeGitHub(items) {
  const github = {
    items,
    login: "owner",
    permissions: new Map([
      ["owner", "admin"],
      ["eve", "read"],
    ]),
    labelWrites: [],
    failOn: new Set(),
    available: () => true,
    async graphql(_query, variables) {
      return {
        search: {
          issueCount: github.items.length,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: structuredClone(github.items),
        },
        q: variables.q,
      };
    },
    async currentUser() {
      return { login: github.login };
    },
    async permission(_repository, actor) {
      return { permission: github.permissions.get(actor) || "none" };
    },
    async addLabels(repository, number, labels) {
      if (github.failOn.has(number)) throw Error("GitHub said no");
      github.labelWrites.push([repository, number, ...labels]);
      const found = github.items.find((entry) => entry.number === number);
      for (const name of labels) found.labels.nodes.push({ name });
      return [];
    },
  };
  return github;
}

// Issue Radar's `GET /crews` answer for o/app.
const CREWS = {
  crews: [
    { id: "c1", name: "Andromeda", labels: ["radar"], status: "idle" },
    { id: "c2", name: "Bode", labels: [], status: "working" },
    { name: "no id, dropped" },
  ],
  settings: { needs_human_label: HUMAN },
  counts: { on_duty: 2 },
};

function workspace(
  t,
  { reader = async () => ({ status: 200, body: CREWS }), contentRules } = {},
) {
  const { store } = fixture(t),
    root = temporaryDirectory(),
    github = fakeGitHub([
      issue(1),
      issue(2, ["go"]),
      issue(3, [CLAIM]),
      issue(4, ["zz"]),
      issue(5),
      pull(6),
      issue(7, [HUMAN]),
    ]);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_0123456789abcdef",
      ...(contentRules ? { contentRules } : {}),
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: {
            baseBranch: "main",
            coder: "issue-radar",
            managedLabels: { managed: "avoozl:managed", ready: "avoozl:ready" },
            rules: [{ id: "go", action: "deliver", match: "label:go" }],
          },
        },
      },
    }),
  );
  if (contentRules) {
    const dir = path.join(root, ".avoozl", "local", "content-rules");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "fake-terms.txt"),
      "codename: \\bzorblat\\b\n",
    );
  }
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
      crewReader: reader,
    }),
    view = () => ops.execute("untriaged.view", {}),
    send = (input, context) =>
      ops.execute("untriaged.handoff", input, undefined, context);
  return { store, github, ops, view, send };
}

const numbers = (rows) => rows.map((row) => row.number);

test("crews come from Issue Radar with their scope; an empty scope is flagged", async (t) => {
  const { ops } = workspace(t);
  const read = await ops.execute("untriaged.crews", { repository: REPO });
  assert.equal(read.available, true);
  assert.deepEqual(
    read.crews.map((crew) => [
      crew.id,
      crew.name,
      crew.labels,
      crew.emptyScope,
    ]),
    [
      ["c1", "Andromeda", ["radar"], false],
      ["c2", "Bode", [], true],
    ],
  );
  assert.equal(read.needsHumanLabel, HUMAN);
  await assert.rejects(
    ops.execute("untriaged.crews", { repository: "x/y" }),
    /not a registered/,
  );
});

test("without a grant the crews read says why and the label is typed", async () => {
  const refused = await readCrews(
    async () => ({
      status: 403,
      body: { error: "app token not permitted for this endpoint" },
    }),
    REPO,
  );
  assert.equal(refused.available, false);
  assert.match(refused.reason, /does not let Avoozl read/);
  assert.match((await readCrews(null, REPO)).reason, /only inside Kiro Crew/);
  assert.match(
    (
      await readCrews(
        async () => ({
          status: 403,
          body: { error: "issue-radar is disabled" },
        }),
        REPO,
      )
    ).reason,
    /turned off/,
  );
  assert.match(
    (
      await readCrews(
        async () => ({ status: 404, body: { code: "repo_not_connected" } }),
        REPO,
      )
    ).reason,
    /not connected in Issue Radar/,
  );
  // No gateway origin in the environment: no reader at all.
  assert.equal(issueRadarReader({}), null);
});

test("the gateway reader calls Issue Radar's crew list with the app token", async () => {
  const { createHmac } = await import("node:crypto");
  const origin = "http://127.0.0.1:9",
    secret = "s3cret",
    calls = [];
  const reader = issueRadarReader(
    {
      KIROCREW_GATEWAY_ORIGIN: origin,
      KIROCREW_PROXY_SECRET: secret,
      KIROCREW_GATEWAY_ORIGIN_PROOF: createHmac("sha256", secret)
        .update(origin)
        .digest("hex"),
    },
    async (url, init) => {
      calls.push([url, init.method]);
      if (url.endsWith("/token"))
        return new Response(JSON.stringify({ token: "t" }));
      return new Response(JSON.stringify(CREWS));
    },
  );
  const answer = await reader(REPO);
  assert.equal(answer.status, 200);
  assert.deepEqual(calls[1], [
    `${origin}/api/apps/issue-radar/crews?owner=o&repo=app&token=t`,
    "GET",
  ]);
});

test("claimed and needs-human issues are With Issue Radar, not Untriaged", async (t) => {
  const { ops, view } = workspace(t);
  const list = await ops.execute("untriaged.view", { refresh: true });
  assert.deepEqual(numbers(list.items), [1, 4, 5, 6]);
  assert.deepEqual(numbers(list.withRadar), [7, 3]);
  const [human, claimed] = list.withRadar;
  assert.deepEqual(
    [human.needsHuman, human.claimed, human.handoff],
    [true, false, null],
  );
  assert.deepEqual([claimed.needsHuman, claimed.claimed], [false, true]);
  assert.equal(list.repositories[0].withRadar, 2);
  assert.equal((await view()).total, 4);
});

test("preview names the label and items and writes nothing; an empty scope warns", async (t) => {
  const { github, ops, send } = workspace(t);
  await ops.execute("untriaged.view", { refresh: true });
  const preview = await send({
    items: [
      { repository: REPO, number: 1 },
      { repository: REPO, number: 5 },
    ],
    crew: { id: "c1" },
    preview: true,
  });
  assert.equal(preview.label, "radar");
  assert.deepEqual(numbers(preview.items), [1, 5]);
  assert.deepEqual(preview.warnings, []);
  assert.equal(preview.written, false);
  const empty = await send({
    items: [{ repository: REPO, number: 1 }],
    crew: { id: "c2" },
    preview: true,
  });
  assert.equal(empty.label, null);
  assert.match(
    empty.warnings[0],
    /Bode has an empty scope, so it takes every open issue/,
  );
  // Without confirm nothing is written either.
  await assert.rejects(
    send({ items: [{ repository: REPO, number: 1 }], crew: { id: "c1" } }),
    /Confirm/,
  );
  assert.deepEqual(github.labelWrites, []);
});

test("confirm adds the crew's label, records receipts, and moves the issues", async (t) => {
  const { store, github, ops, view, send } = workspace(t);
  await ops.execute("untriaged.view", { refresh: true });
  github.failOn.add(5);
  const result = await send({
    items: [
      { repository: REPO, number: 1 },
      { repository: REPO, number: 5 },
    ],
    crew: { id: "c1", name: "ignored: Issue Radar's name wins" },
    confirm: true,
  });
  assert.deepEqual(github.labelWrites, [[REPO, 1, "radar"]]);
  assert.deepEqual(result.results, [
    { number: 1, ok: true },
    { number: 5, ok: false, error: "GitHub said no" },
  ]);
  assert.deepEqual([result.sent, result.failed, result.actor], [1, 1, "owner"]);
  const receipt = store.get("receipts", "radar-handoff:o/app#1");
  assert.deepEqual(
    [receipt.label, receipt.crew, receipt.actor],
    ["radar", { id: "c1", name: "Andromeda" }, "owner"],
  );
  const after = await view();
  assert.deepEqual(numbers(after.items), [4, 5, 6]);
  const sent = after.withRadar.find((row) => row.number === 1);
  assert.equal(sent.handoff.crew.name, "Andromeda");
  assert.equal(sent.claimed, false);
  // Sending it again is refused: it is no longer untriaged.
  await assert.rejects(
    send({
      items: [{ repository: REPO, number: 1 }],
      crew: { id: "c1" },
      confirm: true,
    }),
    /not in o\/app's Untriaged list/,
  );
});

test("an empty-scope crew gets the issue with no label written", async (t) => {
  const { store, github, ops, view, send } = workspace(t);
  await ops.execute("untriaged.view", { refresh: true });
  const result = await send({
    items: [{ repository: REPO, number: 4 }],
    crew: { id: "c2" },
    confirm: true,
  });
  assert.equal(result.sent, 1);
  assert.deepEqual(github.labelWrites, []);
  assert.equal(store.get("receipts", "radar-handoff:o/app#4").label, null);
  assert.ok(numbers((await view()).withRadar).includes(4));
});

test("a typed label works when crews can't be read, and bad labels are refused", async (t) => {
  const { github, ops, send } = workspace(t, {
    reader: async () => ({
      status: 403,
      body: { error: "app token not permitted" },
    }),
  });
  await ops.execute("untriaged.view", { refresh: true });
  const one = [{ repository: REPO, number: 1 }];
  for (const [label, pattern] of [
    ["", /Name the label/],
    ["crew: mine", /skips every issue that has a "crew:" label/],
    ["avoozl:ready", /label Avoozl manages/],
    ["Go", /starts Avoozl's rule go/],
    ["x".repeat(51), /at most 50/],
  ])
    await assert.rejects(
      send({ items: one, label, crew: { id: "c1" }, confirm: true }),
      pattern,
    );
  await assert.rejects(
    send({
      items: [{ repository: REPO, number: 6 }],
      label: "radar",
      confirm: true,
    }),
    /pull request/,
  );
  await assert.rejects(
    send({
      items: [{ repository: REPO, number: 2 }],
      label: "radar",
      confirm: true,
    }),
    /not in o\/app's Untriaged/,
  );
  await assert.rejects(
    send({
      items: [
        { repository: REPO, number: 1 },
        { repository: "x/y", number: 1 },
      ],
      label: "radar",
      confirm: true,
    }),
    /one repository at a time/,
  );
  const result = await send({
    items: one,
    label: "radar",
    crew: { id: "c1", name: "Andromeda" },
    confirm: true,
  });
  assert.equal(result.sent, 1);
  assert.deepEqual(github.labelWrites, [[REPO, 1, "radar"]]);
});

test("a crew label is refused as a hand-off label", () => {
  const settings = normalizeGitHubPolicy({
    mode: "single-repo",
    repositories: { [REPO]: { baseBranch: "main" } },
  }).repositories[REPO];
  assert.match(labelProblem(settings, HUMAN), /skips every issue/);
  const custom = normalizeGitHubPolicy({
    mode: "single-repo",
    repositories: {
      [REPO]: {
        baseBranch: "main",
        crewLabels: { claim: "bot busy", needsHuman: "help" },
      },
    },
  }).repositories[REPO];
  assert.match(labelProblem(custom, "help"), /Issue Radar writes itself/);
});

test("Who counts and content rules guard the write; only a person may send", async (t) => {
  const { github, ops, send } = workspace(t, {
    contentRules: { sets: [{ id: "fake-terms", boundaries: ["github"] }] },
  });
  await ops.execute("untriaged.view", { refresh: true });
  const one = [{ repository: REPO, number: 1 }];
  github.login = "eve";
  await assert.rejects(
    send({ items: one, label: "radar", confirm: true }),
    /does not let eve hand off work: eve needs write/,
  );
  github.login = "owner";
  await assert.rejects(
    send({ items: one, label: "zorblat", confirm: true }),
    (error) => error.status === 422,
  );
  await assert.rejects(
    send(
      { items: one, label: "radar", confirm: true },
      { caller: { sessionKey: "dashboard:x" } },
    ),
    /Only a person/,
  );
  await assert.rejects(
    send({ items: one, label: "radar", confirm: true }, { mcp: true }),
    /Only a person/,
  );
  assert.deepEqual(github.labelWrites, []);
  // The app backend lets only an owner session call it.
  assert.equal(
    principalAllows({ kind: "owner-session" }, "untriaged.handoff"),
    true,
  );
  assert.equal(
    principalAllows({ kind: "app-token" }, "untriaged.handoff"),
    false,
  );
  assert.equal(
    principalAllows({ kind: "agent-tool" }, "untriaged.handoff"),
    false,
  );
  assert.equal(principalAllows({ kind: "app-token" }, "untriaged.crews"), true);
});

test("a needs-human issue with Issue Radar shows under Needs you with its link", async (t) => {
  const { ops } = workspace(t);
  await ops.execute("untriaged.view", { refresh: true });
  const view = await ops.execute("conflicts.view", {});
  const item = view.items.find((entry) => entry.id === "radar:o/app#7");
  assert.deepEqual(
    [item.kind, item.reason, item.taskId, item.authority, item.issue.url],
    [
      "needs-human",
      "crew",
      null,
      "github",
      `https://github.com/${REPO}/issues/7`,
    ],
  );
  assert.match(item.detail, /added "crew: needs human"\. Answer it on GitHub/);
  assert.equal(view.items.filter((entry) => entry.reason === "crew").length, 1);
});

test("crew label events never make a trigger rule true, and a rule may not name one", () => {
  const policy = normalizeGitHubPolicy({
    mode: "single-repo",
    repositories: {
      [REPO]: {
        baseBranch: "main",
        rules: [
          {
            id: "free",
            action: "deliver",
            match: `label:go -label:"${CLAIM}"`,
          },
        ],
      },
    },
  });
  const settings = policy.repositories[REPO],
    event = (kind, name, at) => ({
      event: kind,
      label: { name },
      actor: { login: "owner" },
      created_at: at,
      id: at,
    });
  // The crew took its claim off last; the person's `go` stays the trigger.
  const [match] = matchingRules(settings, { labels: [{ name: "go" }] }, [
    event("labeled", "go", "2026-11-12T10:00:00Z"),
    event("labeled", CLAIM, "2026-11-12T10:01:00Z"),
    event("unlabeled", CLAIM, "2026-11-12T10:02:00Z"),
  ]);
  assert.equal(match.eventId, "2026-11-12T10:00:00Z");
  // Only crew events: nothing made the rule true.
  const [none] = matchingRules(settings, { labels: [{ name: "go" }] }, [
    event("unlabeled", CLAIM, "2026-11-12T10:02:00Z"),
  ]);
  assert.equal(none.eventId, "");
  for (const label of [CLAIM, HUMAN])
    assert.throws(
      () =>
        normalizeGitHubPolicy({
          mode: "single-repo",
          repositories: {
            [REPO]: {
              baseBranch: "main",
              rules: [
                { id: "bad", action: "deliver", match: `label:"${label}"` },
              ],
            },
          },
        }),
      /uses Issue Radar's label .* as a trigger/,
    );
});
