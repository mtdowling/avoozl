// plan.review.view (R104.9-R104.11, R104.15): the spec files at a stored
// revision and the latest pass's findings with state, anchor, decisions and
// chat links. It reads the workspace database only.
import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { quoteHash } from "../review-findings.mjs";
import { fixture } from "./fixtures.mjs";

const quote = "The tick reads the folder once.";

function setup(t) {
  const { root, store } = fixture(t);
  store.put("plans", {
    id: "p1",
    title: "Demo",
    state: "draft",
    spec: "demo",
    hash: "h2",
    revision: 2,
    files: {
      "requirements.md": "# Requirements\n",
      "design.md": `# Design\n\nIntro.\n\n${quote}\n`,
      "tasks.md": "# Tasks\n",
    },
    history: [
      {
        revision: 1,
        hash: "h1",
        files: { "design.md": `# Design\n${quote}\n`, "tasks.md": "# Tasks\n" },
      },
    ],
  });
  const round = (id, pass, extra = {}) =>
    store.put("review_rounds", {
      id,
      spec: "demo",
      planId: "p1",
      revisionHash: "h1",
      pass,
      round: 1,
      state: "done",
      reviewerModel: "fake-reviewer",
      ...extra,
    });
  round("old", 1);
  round("r1", 2, { slot: "dashboard:reviewer" });
  store.put("session_bindings", {
    id: "dashboard:reviewer",
    slot: "dashboard:reviewer",
    role: "plan-review",
    taskId: "r1",
    status: "idle",
  });
  // The planner chat that answered is gone.
  store.put("receipts", {
    id: "plan-answer:r1",
    state: "done",
    slot: "dashboard:planner",
  });
  store.put("session_bindings", {
    id: "dashboard:planner",
    slot: "dashboard:planner",
    role: "plan-answer",
    taskId: "r1",
    status: "gone",
  });
  const finding = (id, roundId, extra = {}) =>
    store.put("review_threads", {
      id,
      source: "plan-review",
      planId: "p1",
      roundId,
      revisionHash: "h1",
      state: "open",
      kind: "gap",
      severity: "important",
      file: "design.md",
      line: 2,
      anchor: {
        file: "design.md",
        lineStart: 2,
        lineEnd: 2,
        quote,
        quoteHash: quoteHash(quote),
      },
      statement: "A statement.",
      evidence: "Some evidence.",
      ...extra,
    });
  finding("stale", "old");
  finding("moves", "r1", { severity: "blocking" });
  finding("gone", "r1", {
    severity: "suggestion",
    anchor: {
      file: "design.md",
      lineStart: 9,
      lineEnd: 9,
      quote: "Removed text.",
      quoteHash: quoteHash("Removed text."),
    },
    decisions: [
      {
        action: "reject",
        by: "Owner",
        at: "t",
        revisionHash: "h1",
        note: "No.",
      },
    ],
  });
  const writes = [];
  const ops = new Operations(store, {
    workspaceRoot: root,
    github: {
      available: () => false,
      request: (...args) => {
        writes.push(args);
        throw Error("Unexpected GitHub call");
      },
    },
  });
  return { store, ops, writes };
}

test("the view shows the latest pass at a revision with state, anchors and chat links", async (t) => {
  const { store, ops, writes } = setup(t),
    before = store.read().revision;
  const view = await ops.execute("plan.review.view", { planId: "p1" });
  assert.equal(view.revisionHash, "h2");
  assert.equal(view.current, true);
  assert.deepEqual(Object.keys(view.files), [
    "requirements.md",
    "design.md",
    "tasks.md",
  ]);
  assert.deepEqual(
    view.findings.map((f) => [f.id, f.severity, f.state, f.anchor]),
    [
      [
        "moves",
        "blocker",
        "for you",
        { file: "design.md", lineStart: 5, lineEnd: 5 },
      ],
      [
        "gone",
        "info",
        "rejected",
        {
          file: "design.md",
          lineStart: 9,
          lineEnd: 9,
          moved: true,
          revisionHash: "h1",
        },
      ],
    ],
  );
  assert.equal(view.findings[1].decisions[0].note, "No.");
  assert.deepEqual(view.bySeverity, { info: 1, warn: 0, blocker: 1 });
  assert.deepEqual(view.byState, { "for you": 1, rejected: 1 });
  assert.deepEqual(view.rounds, [
    {
      id: "r1",
      pass: 2,
      round: 1,
      state: "done",
      revisionHash: "h1",
      reviewerModel: "fake-reviewer",
      note: null,
      reviewChat: { href: "/chat?sid=reviewer", closed: false },
      plannerChat: { href: null, closed: true },
    },
  ]);
  // At the reviewed revision the stored lines stand.
  const older = await ops.execute("plan.review.view", {
    planId: "p1",
    revisionHash: "h1",
  });
  assert.deepEqual(Object.keys(older.files), ["design.md", "tasks.md"]);
  assert.equal(older.current, false);
  assert.deepEqual(older.findings[0].anchor, {
    file: "design.md",
    lineStart: 2,
    lineEnd: 2,
  });
  await assert.rejects(
    ops.execute("plan.review.view", { planId: "p1", revisionHash: "nope" }),
    /stored revisions/,
  );
  assert.equal(store.read().revision, before, "the view writes nothing");
  assert.deepEqual(writes, [], "no GitHub call");
});

test("a round with no chat opened has no link", async (t) => {
  const { store, ops } = setup(t);
  store.put("review_rounds", {
    ...store.get("review_rounds", "r1"),
    slot: null,
  });
  store.put("receipts", { id: "plan-answer:r1", state: "done" });
  const [round] = (await ops.execute("plan.review.view", { planId: "p1" }))
    .rounds;
  assert.equal(round.reviewChat, null);
  assert.equal(round.plannerChat, null);
});
