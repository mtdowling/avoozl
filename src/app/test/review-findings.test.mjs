import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { planReviewSummary } from "../plan-review-summary.mjs";
import {
  anchorAt,
  findingSeverity,
  findingState,
  quoteHash,
  quoteLines,
  recordFindingDecision,
} from "../review-findings.mjs";
import { createSpecPlan, readSpecFolder } from "../spec-plans.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";

const design = [
  "# Design",
  "",
  "The tick   reads the",
  "folder once.",
  "",
  "Another line.",
].join("\n");

function thread(extra = {}) {
  return {
    id: "f1",
    source: "plan-review",
    planId: "p",
    revisionHash: "h1",
    file: "design.md",
    line: 3,
    anchor: {
      file: "design.md",
      lineStart: 3,
      lineEnd: 4,
      quote: "The tick reads the folder once.",
      quoteHash: quoteHash("The tick reads the folder once."),
    },
    ...extra,
  };
}

test("old severities read as blocker, warn and info", () => {
  assert.deepEqual(
    ["blocking", "important", "suggestion", "question", "warn", "x"].map(
      findingSeverity,
    ),
    ["blocker", "warn", "info", "info", "warn", "info"],
  );
});

test("a quote is found with whitespace collapsed, and only when unique", () => {
  assert.equal(
    quoteHash("a  b\n c"),
    quoteHash("a b c"),
    "the hash ignores whitespace runs",
  );
  assert.deepEqual(quoteLines(design, "The tick reads the folder once."), {
    lineStart: 3,
    lineEnd: 4,
  });
  assert.deepEqual(quoteLines(design, "Another line."), {
    lineStart: 6,
    lineEnd: 6,
  });
  assert.equal(quoteLines(design, "not there"), null);
  assert.equal(quoteLines(design + "\nAnother line.", "Another line."), null);
  assert.equal(quoteLines(design, "   "), null);
});

test("an anchor survives edits, and moved, removed or duplicated text reads as moved", () => {
  const row = thread();
  assert.deepEqual(anchorAt(row, {}, "h1"), {
    file: "design.md",
    lineStart: 3,
    lineEnd: 4,
  });
  const edited = "# Design\n\nNew intro.\n\nThe tick reads the folder once.\n";
  assert.deepEqual(anchorAt(row, { "design.md": edited }, "h2"), {
    file: "design.md",
    lineStart: 5,
    lineEnd: 5,
  });
  for (const text of [
    "# Design\n\nThe tick reads it twice.\n",
    edited + edited,
    undefined,
  ])
    assert.equal(
      anchorAt(row, { "design.md": text }, "h2").moved,
      true,
      String(text),
    );
  assert.deepEqual(row.anchor.lineStart, 3, "the stored anchor is unchanged");
  // A row from before quote anchors shows only at its own revision.
  const old = { ...thread(), anchor: undefined };
  assert.deepEqual(anchorAt(old, {}, "h1"), {
    file: "design.md",
    lineStart: 3,
    lineEnd: 3,
  });
  assert.equal(anchorAt(old, { "design.md": design }, "h2").moved, true);
});

test("state comes from the person's decision, then the planner, then whether anything runs", () => {
  const hashes = new Set(["h1", "h2"]),
    state = (extra, busy = false) =>
      findingState(thread(extra), { hashes, busy });
  assert.equal(state({}, true), "open");
  assert.equal(state({}), "for you");
  const answered = { answer: { action: "answered", text: "ok", at: "t1" } };
  assert.equal(state(answered, true), "answered");
  assert.equal(state(answered), "for you");
  const fixed = { answer: { action: "fixed", revisionHash: "h2", at: "t1" } };
  assert.equal(state(fixed), "fixed");
  assert.equal(
    state({ answer: { action: "fixed", revisionHash: "gone", at: "t1" } }),
    "for you",
  );
  const accept = (at) => ({ action: "accept", at, revisionHash: "h1" });
  assert.equal(
    state({ ...answered, decisions: [accept("t2")] }, true),
    "accepted",
  );
  assert.equal(state({ ...answered, decisions: [accept("t2")] }), "for you");
  assert.equal(state({ ...fixed, decisions: [accept("t0")] }), "fixed");
  assert.equal(state({ ...fixed, decisions: [accept("t2")] }), "for you");
  for (const [action, name] of [
    ["reject", "rejected"],
    ["defer", "deferred"],
    ["resolve", "resolved"],
  ])
    assert.equal(state({ ...fixed, decisions: [{ action }] }), name);
  assert.equal(
    state({ decisions: [{ action: "reject" }, { action: "reopen" }] }),
    "for you",
  );
  assert.equal(
    state({ state: "closed", disposition: "deferred" }),
    "deferred",
    "rows closed before decisions keep their disposition",
  );
});

function setup(t, { reviewed = true } = {}) {
  const { root, store } = fixture(t);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, github: { mode: "local" } }),
  );
  writeSpec(root, "example");
  const plan = createSpecPlan(
    store,
    { id: "example" },
    readSpecFolder(root, "example"),
  );
  if (reviewed)
    store.put("review_rounds", {
      id: "round",
      spec: plan.spec,
      planId: plan.id,
      revisionHash: plan.hash,
      pass: 1,
      round: 1,
      state: "done",
      reviewerModel: "fake-reviewer",
    });
  const put = (id, severity, extra = {}) =>
    store.put("review_threads", {
      ...thread(),
      id,
      planId: plan.id,
      revisionHash: plan.hash,
      roundId: "round",
      state: "open",
      kind: "gap",
      severity,
      claim: "A claim.",
      evidence: "Some evidence.",
      ...extra,
    });
  return { store, plan, put };
}

test("decisions append with who and revision, and defer stores a follow-up only", (t) => {
  const { store, plan, put } = setup(t);
  put("f1", "important");
  assert.throws(
    () =>
      recordFindingDecision(store, {
        id: "f1",
        action: "reject",
        revisionHash: plan.hash,
      }),
    /reason/,
  );
  assert.throws(
    () =>
      recordFindingDecision(store, {
        id: "f1",
        action: "reopen",
        revisionHash: plan.hash,
      }),
    /not decided/,
  );
  const tasks = store.read().tasks.length;
  recordFindingDecision(store, {
    id: "f1",
    action: "accept",
    revisionHash: plan.hash,
    by: "Owner",
    at: "2026-11-16T01:00:00Z",
  });
  const deferred = recordFindingDecision(store, {
    id: "f1",
    action: "defer",
    revisionHash: plan.hash,
    note: "Later.",
    by: "Owner",
    at: "2026-11-16T02:00:00Z",
  });
  assert.deepEqual(
    deferred.decisions.map((d) => [d.action, d.by, d.revisionHash]),
    [
      ["accept", "Owner", plan.hash],
      ["defer", "Owner", plan.hash],
    ],
  );
  assert.equal(deferred.state, "closed");
  const followups = store.list("review_followups");
  assert.equal(followups.length, 1);
  assert.deepEqual(
    [followups[0].findingId, followups[0].spec, followups[0].note],
    ["f1", plan.spec, "Later."],
  );
  assert.equal(store.read().tasks.length, tasks, "defer makes no task");
  const reopened = recordFindingDecision(store, {
    id: "f1",
    action: "reopen",
    revisionHash: plan.hash,
  });
  assert.equal(reopened.state, "open");
  assert.equal(reopened.disposition, undefined);
});

test("the summary counts by severity and state and anchors open findings", (t) => {
  const { store, plan, put } = setup(t);
  put("blocker", "blocking");
  put("warn", "important", {
    answer: { action: "fixed", revisionHash: plan.hash, at: "t" },
  });
  put("info", "suggestion", {
    state: "closed",
    disposition: "rejected",
  });
  const before = store.read().revision,
    summary = planReviewSummary(store, plan.id);
  assert.deepEqual(summary.bySeverity, { info: 1, warn: 1, blocker: 1 });
  assert.deepEqual(summary.byState, { "for you": 1, fixed: 1, rejected: 1 });
  const open = Object.fromEntries(summary.open.map((f) => [f.id, f]));
  assert.equal(open.blocker.severity, "blocker");
  assert.equal(open.blocker.state, "for you");
  assert.equal(open.blocker.quote, "The tick reads the folder once.");
  assert.deepEqual(open.blocker.anchor, {
    file: "design.md",
    lineStart: 3,
    lineEnd: 4,
  });
  assert.equal(store.read().revision, before, "the summary writes nothing");
  const empty = setup(t, { reviewed: false });
  assert.deepEqual(planReviewSummary(empty.store, empty.plan.id).bySeverity, {
    info: 0,
    warn: 0,
    blocker: 0,
  });
});
