import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { bindContentRules } from "../../content/content-rules.ts";
import { fixture } from "../../test/fixtures.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { postReviewOutput } from "../review-output.ts";
import type { Store } from "../../store/store.ts";

const SHA = "a".repeat(40),
  START = "2026-11-01T00:00:00.000Z",
  LATER = "2026-11-02T00:00:00.000Z";

// A store with task `sample-task` in plan `config`, its spec issue #9 in
// example/code, and a GitHub that records each comment.
function setup(t: TestContext) {
  const { store } = fixture(t);
  store.mutate("Plan the task", (data) => {
    data.tasks[0].planId = "config";
  });
  store.put("receipts", {
    id: "github-parent:plan:config",
    kind: "github-parent",
    level: "plan",
    parentId: "config",
    repository: "example/code",
    number: 9,
  });
  const comments: { repository: string; number: number; body: string }[] = [],
    github = {
      createIssueComment: async (
        repository: string,
        number: number,
        body: string,
      ) => {
        comments.push({ repository, number, body });
        return { id: comments.length };
      },
    };
  return { store, github, comments };
}

const review = (
  store: Store,
  attempt: number,
  at: string,
  findings: (typeof FINDING)[] = [],
) =>
  store.put("session_bindings", {
    id: `review-${attempt}`,
    slot: `review-${attempt}`,
    taskId: "sample-task",
    role: "reviewer",
    attempt,
    report: {
      kind: "done",
      commit: SHA,
      text: "Two defects.",
      review: { verdict: "changes-requested", findings, closures: [] },
      at,
    },
  });

const FINDING = {
  id: "F1",
  kind: "defect",
  paths: ["src/config.mjs"],
  text: "An empty file throws instead of giving the defaults.",
};

test("the first pass posts nothing; a later review round is one spec issue comment, once", async (t) => {
  const { store, github, comments } = setup(t);
  review(store, 1, "2026-10-30T00:00:00.000Z");
  assert.deepEqual(
    await postReviewOutput(store, github, { now: Date.parse(START) }),
    [],
  );
  assert.equal(comments.length, 0, "older rounds are not posted");
  review(store, 2, LATER, [FINDING]);
  await postReviewOutput(store, github, { now: Date.parse(LATER) });
  assert.equal(comments.length, 1);
  const [comment] = comments;
  assert.deepEqual([comment.repository, comment.number], ["example/code", 9]);
  assert.match(
    comment.body,
    /^<!-- avoozl:review task=sample-task round=2 kind=reviewer -->/,
  );
  assert.match(comment.body, /aaaaaaaaaaaa .*\*\*changes-requested\*\*/);
  assert.match(comment.body, /- \*\*defect\*\* F1 \(`src\/config\.mjs`\)/);
  await postReviewOutput(store, github, { now: Date.parse(LATER) });
  assert.equal(comments.length, 1, "posted once");
});

test("a task with a pull request gets its output there", async (t) => {
  const { store, github, comments } = setup(t);
  store.setMeta("review-output.since", START);
  store.put("repositories", { id: "code", github: "example/code", root: "/x" });
  store.mutate("Name the repository", (data) => {
    data.tasks[0].repository = "code";
  });
  store.put("task_deliveries", {
    id: "sample-task",
    taskId: "sample-task",
    pr: 31,
  });
  review(store, 1, LATER);
  await postReviewOutput(store, github, { now: Date.parse(LATER) });
  assert.deepEqual(
    comments.map((c) => [c.repository, c.number]),
    [["example/code", 31]],
  );
});

test("a failing check run is posted with its command and output tail", async (t) => {
  const { store, github, comments } = setup(t);
  store.setMeta("review-output.since", START);
  store.put("flow_records", {
    id: "check-run:sample-task:1",
    kind: "check-run",
    taskId: "sample-task",
    attempt: 1,
    state: "finished",
    head: SHA,
    endedAt: LATER,
    checks: [
      { name: "lint", command: "npm run lint", exitCode: 0 },
      {
        name: "test",
        command: "npm test",
        exitCode: 1,
        tail: "not ok 3 - reads an empty file",
      },
    ],
  });
  await postReviewOutput(store, github, { now: Date.parse(LATER) });
  assert.equal(comments.length, 1);
  assert.match(comments[0].body, /\*\*1 failed\*\*/);
  assert.match(comments[0].body, /`npm test` exited 1/);
  assert.match(comments[0].body, /not ok 3 - reads an empty file/);
  assert.doesNotMatch(comments[0].body, /npm run lint/);
});

test("output the content rules refuse is held, not posted", async (t) => {
  const { store, github, comments } = setup(t),
    ws = temporaryDirectory("avoozl-review-output-");
  fs.mkdirSync(path.join(ws, ".avoozl", "local", "content-rules"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(ws, ".avoozl.json"),
    JSON.stringify({
      contentRules: { sets: [{ id: "private", boundaries: ["github"] }] },
    }),
  );
  fs.writeFileSync(
    path.join(ws, ".avoozl", "local", "content-rules", "private.txt"),
    "plan: made-up-private-plan\n",
  );
  bindContentRules(store, {
    workspaceRoot: ws,
    configFile: path.join(ws, "no-config.json"),
    machine: { hostname: "made-up-host", username: "madeupuser" },
  });
  store.setMeta("review-output.since", START);
  review(store, 1, LATER, [
    { ...FINDING, text: "It names made-up-private-plan." },
  ]);
  await postReviewOutput(store, github, { now: Date.parse(LATER) });
  assert.equal(comments.length, 0);
  assert.equal(
    store.get("receipts", "review-output:sample-task:1:reviewer")?.state,
    "held",
  );
});

test("a failed post is tried again on the next pass", async (t) => {
  const { store, github, comments } = setup(t);
  store.setMeta("review-output.since", START);
  review(store, 1, LATER);
  const post = github.createIssueComment;
  github.createIssueComment = async () => {
    throw new Error("GitHub is down");
  };
  assert.deepEqual(
    (await postReviewOutput(store, github, { now: Date.parse(LATER) })).map(
      (failed) => failed.error,
    ),
    ["GitHub is down"],
  );
  github.createIssueComment = post;
  await postReviewOutput(store, github, { now: Date.parse(LATER) });
  assert.equal(comments.length, 1);
});
