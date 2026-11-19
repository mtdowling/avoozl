import test from "node:test";
import assert from "node:assert/strict";
import {
  applyProposals,
  broadScope,
  partialEvidence,
  runEvidence,
} from "../migration-reconcile.mjs";

const data = () => ({
  statuses: [
    { id: "implemented", complete: true },
    { id: "partial", complete: false },
    { id: "planned", complete: false },
  ],
  epics: [
    { id: "W1", title: "Core" },
    { id: "doc:plan.md", title: "plan.md", scope: "catalog" },
  ],
  tasks: [
    {
      id: "part",
      epic: "W1",
      status: "partial",
      title: "Collector",
      summary:
        "Landed at abcdef1234; draft 99999999ab on codex/gc-lane, shift 2147483648.",
      source: { document: "plan.md", lineStart: 2, lineEnd: 3 },
      activity: {
        state: "paused",
        branch: "codex/gc-lane",
        summary: "see /Users/someone/x",
      },
    },
    { id: "broad", epic: "W1", status: "planned", title: "Snapshots" },
    { id: "done", epic: "W1", status: "implemented", title: "Done" },
    {
      id: "watched",
      epic: "W1",
      status: "implemented",
      title: "Watched",
      activity: { state: "finished", summary: "Committed abcdef1234" },
    },
    { id: "entry", epic: "doc:plan.md", status: "planned", title: "x" },
  ],
  edges: [],
});
const lines = ["# Plan", "- [ ] collector open", "- [x] marking done"];
const mapping = {
  entries: [
    { id: "e1", task: "part", result: "acceptance" },
    { id: "e2", task: "broad", result: "context" },
  ],
};
const commitRefs = (sha) => (sha === "abcdef1234" ? ["main"] : null);

test("partial evidence names commits, branches, source items and entries", () => {
  const [row, ...rest] = partialEvidence(data(), {
    mapping,
    readDocument: () => lines,
    commitRefs,
    branchExists: () => false,
    branchPrefixes: ["codex/"],
  });
  assert.equal(rest.length, 0);
  assert.equal(row.id, "part");
  assert.deepEqual(row.commits, [
    { sha: "abcdef1234", resolved: true, refs: ["main"] },
    { sha: "99999999ab", resolved: false, refs: [] },
  ]);
  assert.deepEqual(row.branches, [{ name: "codex/gc-lane", exists: false }]);
  assert.deepEqual(
    { open: row.source.open, done: row.source.done },
    { open: 1, done: 1 },
  );
  assert.deepEqual(row.entries, [{ id: "e1", result: "acceptance" }]);
  assert.equal(row.activity.summary, "see ~/x");
});

test("broad scope keeps unfinished packages that are not partial", () => {
  const kinds = {
    tasks: [
      { id: "part", epic: "W1", status: "partial", kind: "package" },
      {
        id: "broad",
        epic: "W1",
        status: "planned",
        kind: "package",
        reason: "r",
      },
      { id: "done", epic: "W1", status: "implemented", kind: "leaf" },
    ],
  };
  const rows = broadScope(data(), kinds, { mapping });
  assert.deepEqual(
    rows.map((r) => [r.id, r.entries.map((e) => e.id)]),
    [["broad", ["e2"]]],
  );
});

test("proposals cover every task once and leaves are new and bounded", () => {
  const scope = [{ id: "part", epic: "W1", entries: [{ id: "e1" }] }];
  const verdicts = ["complete-pending-acceptance", "partial", "stale"];
  const good = applyProposals(
    scope,
    [
      {
        task: "part",
        verdict: "partial",
        reason: "open items remain",
        leaves: [
          {
            slug: "minor-gc",
            title: "Minor GC",
            acceptance: ["passes"],
            entries: ["e1"],
          },
        ],
      },
    ],
    { verdicts, existingIds: ["part"] },
  );
  assert.deepEqual(good.errors, []);
  assert.equal(good.leaves[0].id, "part.minor-gc");
  assert.equal(good.leaves[0].parentId, "part");
  assert.equal(good.leaves[0].kind, "leaf");
  assert.equal(good.rows[0].proposal, true);

  const bad = applyProposals(
    scope,
    [
      {
        task: "part",
        verdict: "partial",
        reason: "",
        leaves: [{ slug: "Bad Slug", acceptance: [], entries: ["e9"] }],
      },
      { task: "part", verdict: "stale", reason: "x" },
      { task: "nope", verdict: "stale", reason: "x" },
    ],
    { verdicts, existingIds: ["part"] },
  );
  for (const want of [
    "part: reason is required",
    "part.Bad Slug: slug must be lowercase words joined by -",
    "part.Bad Slug: title is required",
    "part.Bad Slug: acceptance is required",
    "part.Bad Slug: entry e9 is not mapped to part",
    "part: more than one proposal",
    "nope: not in scope",
  ])
    assert.ok(bad.errors.includes(want), want);

  const missing = applyProposals(scope, [], { verdicts });
  assert.deepEqual(missing.errors, ["part: no proposal"]);
  const taken = applyProposals(
    scope,
    [{ task: "part", verdict: "complete-pending-acceptance", reason: "r" }],
    { verdicts },
  );
  assert.deepEqual(taken.errors, [
    "part: complete-pending-acceptance needs acceptance",
  ]);
  const dup = applyProposals(
    scope,
    [
      {
        task: "part",
        verdict: "partial",
        reason: "r",
        leaves: [{ slug: "a", title: "A", acceptance: ["x"] }],
      },
    ],
    { verdicts, existingIds: ["part.a"] },
  );
  assert.deepEqual(dup.errors, ["part.a: ID already used"]);
});

test("run evidence keeps open runs with messages, deliveries and archive marks", () => {
  const runs = [
    {
      id: "r1",
      taskId: "watched",
      state: "observing",
      external: true,
      worktree: "/Users/someone/wt",
    },
    {
      id: "r2",
      taskId: "conversation:r2",
      state: "interrupted",
      provider: "codex",
    },
    { id: "r3", taskId: "done", state: "completed" },
  ];
  const events = [
    {
      runId: "r2",
      kind: "message",
      at: "t1",
      text: "found /Users/someone/plan.md (http://127.0.0.1:5000/?v=1)",
    },
    { runId: "r2", kind: "message.delta", at: "t2", text: "f" },
    { runId: "r2", kind: "turn.completed", at: "t3", state: "interrupted" },
  ];
  const rows = runEvidence(data(), {
    runs,
    events,
    deliveries: [{ runId: "r2", state: "accepted", text: "archive them" }],
    archived: { r1: "2026-01-01T00:00:00Z" },
    commitRefs,
    present: { r1: { worktree: false, transcript: false } },
  });
  assert.deepEqual(
    rows.map((r) => r.id),
    ["r1", "r2"],
  );
  const [watched, chat] = rows;
  assert.equal(watched.worktree, "~/wt");
  assert.equal(watched.transcriptPresent, false);
  assert.equal(watched.archivedAt, "2026-01-01T00:00:00Z");
  assert.deepEqual(watched.commits, [
    { sha: "abcdef1234", resolved: true, refs: ["main"] },
  ]);
  assert.deepEqual(chat.messages, [
    { at: "t1", text: "found ~/plan.md (<local app>)" },
  ]);
  assert.equal(chat.endedAs, "interrupted");
  assert.equal(chat.deliveries[0].text, "archive them");
});
