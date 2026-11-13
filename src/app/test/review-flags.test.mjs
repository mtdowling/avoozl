// A document edit sends a task back for review only when the task's own
// section changed, and review shows once per plan, not once per task.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { blocks, digest, sectionText } from "../../model.mjs";
import { syncPlans } from "../../catalog.mjs";
import { reconcileSource } from "../source-sync.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

const BEFORE = `# Plan

Intro with [a link](old/place.md).

## Work

- [ ] Alpha task, see [notes](todo/notes.md)
  Details in \`todo/alpha.md\`.
- [ ] Beta task in [the plan](todo/plan.md)
  Beta does the thing.
- [ ] Gamma task
  Gamma as first written.
- [x] Delta task
  Delta as first written.
`;

const AFTER = `# Plan

Intro, rewritten, with [a link](.kiro/specs/place/design.md).

## Work

- [ ] Alpha task, see [notes](.kiro/specs/notes/design.md)
  Details in \`.kiro/specs/alpha/design.md\`.
- [ ] Beta task in [the plan](.kiro/specs/plan/design.md)
  Beta  does the thing.
- [ ] Gamma task
  Gamma now also does more.
- [x] Delta task
  Delta changed too.
`;

const task = (id, extra = {}) => ({
  id,
  title: id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  ...extra,
});

// Tasks tied to plan.md's sections as it reads in BEFORE, plus one that only
// cites the document.
function seed(store, root) {
  fs.writeFileSync(path.join(root, "plan.md"), BEFORE);
  reconcileSource(store, root, "plan.md");
  const sections = blocks(BEFORE),
    ref = (n) => ({
      document: "plan.md",
      key: sections[n].key,
      lineStart: sections[n].lineStart,
      lineEnd: sections[n].lineEnd,
      hash: digest(sections[n].context),
      checked: sections[n].checked,
    });
  store.mutate("Seed", (data) => {
    data.statuses.push({ id: "recorded", label: "Recorded", complete: false });
    data.tasks.push(
      task("alpha", { source: ref(0) }),
      task("beta", { source: ref(1) }),
      task("gamma", { source: ref(2) }),
      task("delta", { source: ref(3), status: "recorded" }),
      task("cites", { contextDocuments: ["plan.md"] }),
      // A plan's own reference: plan approval reviews it, not indexing.
      task("owned", {
        planId: "p",
        source: { document: "plan.md", key: "owned", lineStart: 1, lineEnd: 4 },
      }),
    );
  });
}

const flags = (store) =>
  Object.fromEntries(
    store
      .read()
      .tasks.filter((t) => t.id !== "sample-task")
      .map((t) => [t.id, Boolean(t.needsReview)]),
  );

test("section text ignores link targets, plan paths, the checkbox and spacing", () => {
  assert.equal(
    sectionText("- [ ] Do [it](todo/a.md) per `todo/a.md#x`\n  now"),
    sectionText(
      "- [x] Do [it](.kiro/specs/a/design.md) per `.kiro/specs/a/design.md`  now",
    ),
  );
  assert.notEqual(sectionText("- [ ] Do it"), sectionText("- [ ] Do it twice"));
  assert.notEqual(
    sectionText("- [ ] Edit src/a.mjs"),
    sectionText("- [ ] Edit src/b.mjs"),
  );
});

test("re-indexing flags only tasks whose own section changed", (t) => {
  const { root, store } = fixture(t);
  seed(store, root);
  fs.writeFileSync(path.join(root, "plan.md"), AFTER);
  assert.equal(reconcileSource(store, root, "plan.md").changed, true);
  assert.deepEqual(flags(store), {
    alpha: false,
    beta: false,
    gamma: true,
    delta: false,
    cites: false,
    owned: false,
  });
  // Beta's checkbox line changed only in a link, so its key moved with it.
  const beta = store.read().tasks.find((x) => x.id === "beta");
  assert.equal(beta.source.removed, false);
  assert.equal(beta.source.key, blocks(AFTER)[1].key);
  assert.equal(beta.source.lineStart, blocks(AFTER)[1].lineStart);
});

test("removing a document flags tasks it holds, not tasks that only cite it", (t) => {
  const { root, store } = fixture(t);
  seed(store, root);
  fs.rmSync(path.join(root, "plan.md"));
  reconcileSource(store, root, "plan.md");
  assert.deepEqual(flags(store), {
    alpha: true,
    beta: true,
    gamma: true,
    delta: false,
    cites: false,
    owned: true,
  });
});

test("an in-app document edit flags only changed sections", async (t) => {
  const { root, store } = fixture(t);
  seed(store, root);
  const ops = new Operations(store, { workspaceRoot: root }),
    doc = store.read().documents["plan.md"];
  await ops.execute(
    "document.update",
    { id: "plan.md", text: AFTER, expectedHash: doc.hash },
    store.read().revision,
  );
  assert.deepEqual(flags(store), {
    alpha: false,
    beta: false,
    gamma: true,
    delta: false,
    cites: false,
    owned: false,
  });
});

test("catalog sync flags only changed sections", (t) => {
  const { root } = fixture(t);
  const data = { documents: {}, tasks: [], statuses: [] };
  fs.writeFileSync(path.join(root, "plan.md"), BEFORE);
  syncPlans(data, root, { initial: true });
  data.tasks.find((x) => x.title.startsWith("Delta")).status = "recorded";
  fs.writeFileSync(path.join(root, "plan.md"), AFTER);
  syncPlans(data, root);
  assert.deepEqual(
    data.tasks.map((x) => [x.title.split(" ")[0], x.needsReview]),
    [
      ["Alpha", false],
      ["Beta", false],
      ["Gamma", true],
      ["Delta", false],
    ],
  );
});

test("review shows once per plan, with a badge, and not as needs-you", async (t) => {
  const { root, store } = fixture(t);
  store.mutate("Seed", (data) => {
    data.statuses.push({ id: "recorded", label: "Recorded", complete: false });
    data.documents[".kiro/specs/b/design.md"] = {
      id: ".kiro/specs/b/design.md",
      path: ".kiro/specs/b/design.md",
      text: "",
      hash: digest(""),
    };
    data.tasks.push(
      task("a1", { planId: "plan-a", needsReview: true }),
      task("a2", { planId: "plan-a", needsReview: true }),
      task("b1", {
        needsReview: true,
        source: { document: ".kiro/specs/b/design.md", key: "k" },
      }),
      task("old", { planId: "plan-a", needsReview: true, status: "recorded" }),
      task("stuck", { status: "blocked" }),
    );
  });
  store.put("plans", { id: "plan-a", title: "Plan A", state: "approved" });
  const ops = new Operations(store, { workspaceRoot: root });
  const graph = await ops.execute("graph.view", {}),
    node = (id) => graph.tasks.find((x) => x.id === id);
  assert.deepEqual(
    ["a1", "b1", "old", "stuck"].map((id) => [
      id,
      node(id).state,
      node(id).review,
    ]),
    [
      ["a1", "waiting", true],
      ["b1", "waiting", true],
      ["old", "waiting", false],
      ["stuck", "needs-you", false],
    ],
  );
  const items = (await ops.execute("conflicts.view", {})).items;
  assert.deepEqual(
    items.map((item) => [item.kind, item.taskId, item.tasks?.map((x) => x.id)]),
    [
      ["needs-human", "stuck", undefined],
      ["review", null, ["a1", "a2"]],
      ["review", null, ["b1"]],
    ],
  );
  assert.equal(
    items[1].title,
    "Review 2 tasks in Plan A: their design text changed",
  );
  assert.equal(items[2].title, "Review 1 task in b: their design text changed");
  // Mark reviewed settles a whole group in one call.
  const result = await ops.execute(
    "conflicts.settle",
    {
      action: "reviewed",
      items: items[1].tasks.map((x) => ({ taskId: x.id })),
    },
    store.read().revision,
  );
  assert.equal(result.settled.length, 2);
  assert.deepEqual(
    (await ops.execute("conflicts.view", {})).items.map(
      (item) => item.id ?? item.taskId,
    ),
    ["stuck", "review:spec:b"],
  );
});
