import test from "node:test";
import assert from "node:assert/strict";
import {
  mapChecklistEntries,
  migrationBaseline,
  migrationKinds,
} from "../migration-prep.mjs";
import { blocks } from "../../model.mjs";

const data = () => ({
  statuses: [
    { id: "implemented", complete: true },
    { id: "partial", complete: false },
    { id: "planned", complete: false },
    { id: "review", complete: false },
  ],
  epics: [
    { id: "W1", title: "Core execution" },
    { id: "W2", title: "Objects and collector" },
    { id: "inbox", title: "Inbox", scope: "catalog" },
    { id: "doc:plan.md", title: "plan.md", scope: "catalog" },
  ],
  tasks: [
    {
      id: "done-a",
      epic: "W1",
      kind: "task",
      status: "implemented",
      title: "Coroutine resume",
      summary: "Landed at abcdef1234.",
      evidence: ["evidence/a.json"],
    },
    {
      id: "parent",
      epic: "W1",
      kind: "task",
      status: "planned",
      title: "Workers",
    },
    {
      id: "child",
      epic: "W1",
      kind: "task",
      status: "planned",
      parentId: "parent",
      title: "Worker channels",
      acceptance: ["channels pass"],
    },
    {
      id: "part",
      epic: "W2",
      kind: "task",
      status: "partial",
      title: "Generational collector",
      acceptance: ["x"],
    },
    {
      id: "broad",
      epic: "W2",
      kind: "task",
      status: "planned",
      title: "Collector stress",
    },
    {
      id: "rev",
      epic: "W2",
      kind: "task",
      status: "review",
      title: "Frozen tables",
    },
    {
      id: "m1",
      epic: "W1",
      kind: "milestone",
      status: "planned",
      title: "Flip",
    },
    {
      id: "other",
      epic: "inbox",
      kind: "task",
      status: "planned",
      title: "Unrelated",
    },
    {
      id: "e1",
      epic: "doc:plan.md",
      kind: "task",
      status: "planned",
      title: "e1",
      source: { document: "plan.md", lineStart: 3, lineEnd: 3, checked: false },
    },
    {
      id: "e2",
      epic: "doc:plan.md",
      kind: "task",
      status: "planned",
      title: "e2",
      source: { document: "plan.md", lineStart: 4, lineEnd: 4, checked: false },
    },
  ],
  edges: [
    {
      id: "done-a:requires:child",
      from: "done-a",
      to: "child",
      kind: "requires",
    },
    { id: "broad:supports:part", from: "broad", to: "part", kind: "supports" },
    {
      id: "done-a:requires:other",
      from: "done-a",
      to: "other",
      kind: "requires",
    },
  ],
});

test("kinds keep IDs and edges and follow the stated rules", () => {
  const d = data();
  const k = migrationKinds(d);
  assert.deepEqual(
    k.epics.map((e) => [e.id, e.kind]),
    [
      ["W1", "epic"],
      ["W2", "epic"],
    ],
  );
  assert.deepEqual(Object.fromEntries(k.tasks.map((t) => [t.id, t.kind])), {
    "done-a": "leaf",
    parent: "package",
    child: "leaf",
    part: "package",
    broad: "package",
    rev: "leaf",
    m1: "milestone",
  });
  assert.deepEqual(
    k.edges.map((e) => [e.id, e.kind]),
    [
      ["done-a:requires:child", "requires"],
      ["broad:supports:part", "supports"],
    ],
  );
  assert.deepEqual(d, data());
});

test("baseline holds finished tasks with evidence and met edges", () => {
  const b = migrationBaseline(data(), undefined, {
    evidence: [{ id: "r1", taskId: "done-a" }],
    runs: [{ id: "run1", taskId: "done-a", state: "completed" }],
  });
  assert.deepEqual(
    b.tasks.map((t) => t.id),
    ["done-a"],
  );
  const [t] = b.tasks;
  assert.deepEqual(
    [t.evidence, t.receipts, t.runs, t.commits],
    [
      ["evidence/a.json"],
      ["r1"],
      [{ id: "run1", state: "completed" }],
      ["abcdef1234"],
    ],
  );
  assert.match(t.bodyHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    b.metEdges.map((e) => e.id),
    ["done-a:requires:child"],
  );
});

test("checklist entries map to the closest task or stay unmatched", () => {
  const doc = [
    "# Plan",
    "## Collector",
    "- [ ] Generational collector with remembered sets",
    "- [ ] Paint the bikeshed purple",
  ];
  const m = mapChecklistEntries(data(), {
    entryEpics: ["doc:plan.md"],
    readDocument: () => doc,
  });
  const byId = Object.fromEntries(m.entries.map((e) => [e.id, e]));
  assert.equal(byId.e1.result, "acceptance");
  assert.equal(byId.e1.task, "part");
  assert.equal(byId.e1.section, "Collector");
  assert.equal(byId.e2.result, "unmatched");
  assert.equal(byId.e2.task, null);
  assert.equal(m.entries.length, 2);
});

test("checklist entries are found by key when the document moved", () => {
  const old = [
    "# Plan",
    "## Collector",
    "- [ ] Generational collector with remembered sets",
  ];
  const [b] = blocks(old.join("\n"));
  const doc = [
    "# Plan",
    "Intro added later.",
    "",
    "## Collector",
    "- [ ] Paint the bikeshed purple",
    old[2],
  ];
  const d = data();
  const e1 = d.tasks.find((t) => t.id === "e1");
  e1.source = {
    document: "plan.md",
    key: b.key,
    lineStart: 3,
    lineEnd: 3,
    checked: false,
  };
  const e2 = d.tasks.find((t) => t.id === "e2");
  e2.title = "Frozen tables";
  e2.source = {
    document: "plan.md",
    key: "gone",
    lineStart: 6,
    lineEnd: 6,
    checked: false,
  };
  const m = mapChecklistEntries(d, {
    entryEpics: ["doc:plan.md"],
    readDocument: () => doc,
  });
  const byId = Object.fromEntries(m.entries.map((e) => [e.id, e]));
  assert.equal(byId.e1.lineStart, 6);
  assert.equal(byId.e1.located, true);
  assert.equal(byId.e1.task, "part");
  // Line 6 now holds e1's text; a removed entry must not borrow it.
  assert.equal(byId.e2.located, false);
  assert.equal(byId.e2.text, "Frozen tables");
  assert.equal(byId.e2.candidates[0].task, "rev");
});
