// Code review chat (design §8.5): the Code review button queues one Kiro
// Crew chat seeded to review one pull request.
// An isolated temporary workspace and a fake GitHub that records every
// call; nothing here reaches GitHub or Kiro Crew.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { principalAllows } from "../app-backend.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { reviewSeed } from "../pr-review.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const REPO = "o/app",
  SHA = "a".repeat(40);

const pull = (number, closes = []) => ({
  __typename: "PullRequest",
  number,
  title: `Change ${number}`,
  url: `https://github.com/${REPO}/pull/${number}`,
  createdAt: "2026-11-12T10:00:00Z",
  isDraft: false,
  headRefOid: SHA,
  author: { login: "alice" },
  labels: { nodes: [] },
  assignees: { nodes: [] },
  comments: { totalCount: 0 },
  closingIssuesReferences: {
    nodes: closes.map((n) => ({
      number: n,
      repository: { nameWithOwner: REPO },
    })),
  },
  commits: { nodes: [] },
});

// Every call is logged; only the untriaged search answers.
function fakeGitHub(items) {
  const calls = [];
  return new Proxy(
    {
      calls,
      available: () => true,
      async graphql(query, variables) {
        calls.push(["graphql", /mutation/.test(query) ? "write" : "read"]);
        return {
          search: {
            issueCount: items.length,
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: structuredClone(items),
          },
          q: variables.q,
        };
      },
    },
    {
      get(target, name) {
        if (name in target) return target[name];
        return async (...args) => {
          calls.push([String(name), args]);
          throw Error(`unexpected GitHub call ${String(name)}`);
        };
      },
    },
  );
}

function workspace(t, { contentRules = null } = {}) {
  const { store } = fixture(t),
    root = temporaryDirectory(),
    home = temporaryDirectory("avoozl-home-"),
    github = fakeGitHub([pull(6), pull(8, [3])]);
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
            managedLabels: { managed: "avoozl:managed", ready: "avoozl:ready" },
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
      "codename: \\bChange 6\\b\n",
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
  });
  return { store, github, ops, home };
}

const review = (ops, number, context) =>
  ops.execute("review.chat", { repository: REPO, number }, undefined, context);
const row = async (ops, number) =>
  (await ops.execute("untriaged.view", {})).items.find(
    (item) => item.number === number,
  );
// What GitHub saw past the untriaged search read.
const githubWrites = (github) =>
  github.calls.filter((call) => !(call[0] === "graphql" && call[1] === "read"));

test("Code review queues one seeded chat, the tick opens it, and the row shows Attach", async (t) => {
  // Nearby inputs: a second click while queued, a click while open, a click
  // after the chat closed, the head SHA, a pull request with no task.
  const { store, github, ops, home } = workspace(t);
  await ops.execute("untriaged.view", { refresh: true });
  const first = await review(ops, 6);
  assert.equal(first.created, true);
  assert.equal(first.state, "queued");
  assert.equal((await row(ops, 6)).reviewChat.state, "queued");
  assert.equal((await review(ops, 6)).created, false, "queued once");

  const tick = await ops.execute("workspace.tick", { sessions: [] }),
    open = tick.dispatch.filter((d) => d.role === "pr-review");
  assert.equal(open.length, 1);
  assert.equal(open[0].title, "Code review: o/app#6");
  assert.equal(open[0].project, false, "opens without a checkout");
  assert.equal(open[0].agent, "avoozl-code-review", "read-only reviewer");
  const seed = open[0].brief;
  for (const part of [
    "Review one pull request: https://github.com/o/app/pull/6",
    "- Repository: o/app",
    "- Number: #6",
    `- Head commit: ${SHA}`,
    "Title:\n```text\nChange 6\n```",
    "- Author: alice",
    "Do a careful single-pull-request review",
    "Post nothing to GitHub",
  ])
    assert.ok(seed.includes(part), part);
  assert.ok(!seed.includes("Avoozl task:"), "no task, no task line");

  await ops.execute("session.bind", {
    taskId: open[0].task,
    slot: "dashboard:chat-9",
    role: "pr-review",
    attempt: open[0].attempt,
    title: open[0].title,
    source: "tick",
  });
  const shown = (await row(ops, 6)).reviewChat;
  assert.equal(shown.state, "open");
  assert.equal(shown.link, "/chat?sid=chat-9");
  const again = await ops.execute("workspace.tick", {
    sessions: [{ target: "dashboard:chat-9", status: "idle" }],
  });
  assert.ok(!again.dispatch.some((d) => d.role === "pr-review"), "opened once");
  assert.equal((await review(ops, 6)).created, false, "an open chat is reused");

  // A closed chat: the next click asks for a new one.
  await ops.execute("session.status", {
    slot: "dashboard:chat-9",
    status: "closed",
  });
  const next = await review(ops, 6);
  assert.equal(next.created, true);
  assert.equal(next.attempt, 2);
  assert.deepEqual(
    githubWrites(github),
    [],
    "the review chat posts nothing to GitHub",
  );
  assert.equal(
    store.list("receipts").filter((r) => r.kind === "pr-review").length,
    1,
  );
});

test("the seed asks for a careful single review; a task adds its spec section", async (t) => {
  // Nearby inputs: a seed given a task with a source.
  const { store, ops } = workspace(t);
  await ops.execute("untriaged.view", { refresh: true });
  const chat = await review(ops, 8);
  const seed = store.get("receipts", chat.id).seed;
  assert.match(seed, /Do a careful single-pull-request review/);
  assert.match(seed, /Post nothing to GitHub/);
  const linked = reviewSeed({
    repository: REPO,
    pull: { url: "u", number: 8, title: "T", author: "a", headSha: SHA },
    task: {
      id: "t1",
      title: "Do it",
      source: { document: ".kiro/specs/demo/tasks.md", key: "2.1" },
    },
  });
  assert.match(
    linked,
    /- Avoozl task: t1 Do it\n- Spec section: \.kiro\/specs\/demo\/tasks\.md § 2\.1/,
  );
});

test("content rules run on the seed; only a person starts a review; bad input is refused", async (t) => {
  // Nearby inputs: a seed that matches a block rule, an agent session, MCP,
  // an unknown repository, a pull request not in the list, an issue number.
  const { store, ops } = workspace(t, {
    contentRules: { sets: [{ id: "fake-terms", boundaries: ["brief"] }] },
  });
  await ops.execute("untriaged.view", { refresh: true });
  await assert.rejects(review(ops, 6), (error) => error.status === 422);
  assert.equal(
    store.list("receipts").filter((r) => r.kind === "pr-review").length,
    0,
  );
  assert.equal((await review(ops, 8)).created, true, "a clean seed is queued");
  await assert.rejects(
    review(ops, 8, { caller: { sessionKey: "dashboard:x" } }),
    /Only a person/,
  );
  await assert.rejects(review(ops, 8, { mcp: true }), /Only a person/);
  await assert.rejects(
    ops.execute("review.chat", { repository: "o/other", number: 8 }),
    /not a registered repository/,
  );
  await assert.rejects(review(ops, 99), /not in o\/app's Untriaged list/);
  await assert.rejects(
    ops.execute("review.chat", { repository: REPO, number: "8" }),
    /by its number/,
  );
  assert.equal(principalAllows({ kind: "owner-session" }, "review.chat"), true);
  assert.equal(principalAllows({ kind: "app-token" }, "review.chat"), false);
});

test("the seed without a head commit asks the chat to name it", () => {
  const seed = reviewSeed({
    repository: REPO,
    pull: {
      url: "https://github.com/o/app/pull/1",
      number: 1,
      title: "T",
      author: null,
    },
  });
  assert.match(seed, /- Head commit: unknown/);
  assert.match(seed, /- Author: unknown/);
  assert.match(seed, /Review the current head commit and name it\./);
});
