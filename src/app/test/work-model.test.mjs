import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { lintPlan } from "../plan-quality.mjs";
import { queryTasks, validate } from "../../model.mjs";
import {
  taskAuthority,
  taskCompletion,
  taskKind,
  taskRoute,
} from "../../work-model.mjs";
import { fixture, workspaceFixture } from "./fixtures.mjs";

const ready = (data, options = {}) =>
  queryTasks(data, { scope: "all", q: "ready:true", ...options }).map(
    (task) => task.id,
  );
const block = (fields) => "```task\n" + JSON.stringify(fields) + "\n```\n";
const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  summary: "Change " + id + ".",
  acceptance: [id + " is observable."],
  checks: ["npm test"],
  ...extra,
});
const lint = (text, projects = []) =>
  lintPlan({ text, plan: { context: {} }, data: { projects, tasks: [] } });
const codes = (result) => result.diagnostics.map((item) => item.code);

test("legacy rows read with work-model defaults and are not rewritten", (t) => {
  const { store } = workspaceFixture(t, "mixed"),
    before = store.db.prepare("SELECT body FROM entities ORDER BY id").all(),
    data = store.read(),
    local = data.tasks.find((task) => task.id === "local-a"),
    github = data.tasks.find((task) => task.id === "github-a");
  assert.deepEqual(
    [taskKind(local), taskAuthority(local), taskRoute(local)],
    ["leaf", "local", "local"],
  );
  assert.equal(taskCompletion(local), "integrated");
  assert.deepEqual(
    [taskAuthority(github), taskRoute(github), taskCompletion(github)],
    ["github", "github", "merged-pr"],
  );
  assert.equal(taskKind({ kind: "milestone" }), "leaf");
  assert.deepEqual(validate(data), []);
  assert.deepEqual(ready(data), ["local-a"]);
  assert.deepEqual(
    store.db.prepare("SELECT body FROM entities ORDER BY id").all(),
    before,
  );
});

test("validation rejects unknown work-model values and edge conditions", (t) => {
  const data = structuredClone(fixture(t).store.read());
  data.tasks[0].kind = "story";
  data.tasks[0].route = "email";
  data.tasks[0].completion = "shipped";
  data.edges.push({
    from: "sample-task",
    to: "sample-task-2",
    kind: "supports",
    condition: "integrated",
  });
  const errors = validate(data).join("\n");
  assert.match(errors, /Unknown kind sample-task/);
  assert.match(errors, /Unknown route sample-task/);
  assert.match(errors, /Unknown completion sample-task/);
  assert.match(errors, /Only requires edges name a condition/);
});

test("only leaves are ready; epics and packages complete from children", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  await ops.execute("task.update", { id: "sample-task", kind: "package" });
  assert.deepEqual(ready(store.read()), []);
  await ops.execute("task.update", { id: "sample-task", kind: "leaf" });
  assert.deepEqual(ready(store.read()), ["sample-task"]);
});

test("an open decision blocks readiness", (t) => {
  const data = structuredClone(fixture(t).store.read());
  data.tasks[0].decision = "decision-1";
  assert.deepEqual(ready(data), []);
});

test("a requires condition waits for its completion level", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  await ops.execute("task.update", {
    id: "next-task",
    create: true,
    title: "Use the fixture",
    requires: [{ task: "sample-task", condition: "integrated" }],
  });
  let data = store.read();
  assert.equal(data.edges[0].condition, "integrated");
  assert.deepEqual(ready(data), ["sample-task"]);
  data = structuredClone(data);
  data.tasks[0].integration = { commit: "abc1234" };
  assert.deepEqual(ready(data).sort(), ["next-task", "sample-task"]);
  // Without a condition the dependency's own completion (its status) applies.
  data = structuredClone(data);
  delete data.edges[0].condition;
  assert.deepEqual(ready(data), ["sample-task"]);
  await assert.rejects(
    ops.execute("task.update", {
      id: "next-task",
      requires: [{ task: "sample-task", condition: "shipped" }],
    }),
    /known completion/,
  );
});

test("a leaf on an unregistered repository is not ready", (t) => {
  const data = structuredClone(fixture(t).store.read());
  data.tasks[0].repository = "elsewhere";
  assert.deepEqual(ready(data, { repositories: ["code"] }), []);
  assert.deepEqual(ready(data, { repositories: ["elsewhere"] }), [
    "sample-task",
  ]);
});

test("task.update writes work-model fields but never authority", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    task = await ops.execute("task.update", {
      id: "sample-task",
      route: "plugin:remote",
      completion: "released",
      repository: "code",
      checks: ["unit"],
    });
  assert.deepEqual(
    [task.route, task.completion, task.repository, task.checks],
    ["plugin:remote", "released", "code", ["unit"]],
  );
  await assert.rejects(
    ops.execute("task.update", { id: "sample-task", authority: "github" }),
    /only through projection/,
  );
  await assert.rejects(
    ops.execute("task.update", { id: "sample-task", kind: "story" }),
    /Unknown kind/,
  );
});

test("direct edits of GitHub-owned rows are refused and routed to projection", async (t) => {
  const { store } = workspaceFixture(t, "mixed"),
    ops = new Operations(store),
    revision = store.read().revision;
  for (const [name, input] of [
    ["task.update", { id: "github-a", title: "Renamed" }],
    ["task.archive", { id: "github-a" }],
    ["task.accept", { id: "github-a", componentOnly: true }],
    [
      "task.merge",
      { targetId: "local-a", duplicateIds: ["github-b"], reason: "Same." },
    ],
  ])
    await assert.rejects(ops.execute(name, input), (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.route, "projection");
      assert.match(error.message, /example\/fixture#10[12]/);
      return true;
    });
  assert.equal(store.read().revision, revision);
  const local = await ops.execute("task.update", {
    id: "local-a",
    title: "Renamed",
  });
  assert.equal(local.title, "Renamed");
});

test("plan blocks carry work-model fields and edge conditions into approval", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    text =
      "# Model\n\n" +
      block({ id: "parent", title: "Parent", kind: "package", summary: "All." }) +
      block(leaf("base", { completion: "released" })) +
      block(
        leaf("user", {
          requires: [{ task: "base", condition: "integrated" }],
        }),
      ),
    plan = await ops.execute("plan.create", { prompt: "Model.", text }),
    preview = await ops.execute("plan.preview", { id: plan.id });
  assert.equal(preview.quality.canApprove, true);
  const receipt = await ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: preview.expectedRevision,
    }),
    data = store.read(),
    byLocal = (id) =>
      data.tasks.find((task) => task.id === receipt.mapping[id]);
  assert.equal(byLocal("parent").kind, "package");
  assert.equal(byLocal("base").completion, "released");
  assert.deepEqual(byLocal("base").checks, ["npm test"]);
  assert.equal(
    data.edges.find((edge) => edge.to === receipt.mapping.user).condition,
    "integrated",
  );
  const owned = lint(block(leaf("owned", { authority: "github" })));
  assert.match(
    owned.diagnostics[0].message,
    /becomes github through projection/,
  );
  const local = lint(block(leaf("kept", { authority: "local" })));
  assert.equal(local.diagnostics.length, 0);
});

test("validation reports a repeated task ID at its line", () => {
  const text = "# Plan\n\n" + block(leaf("same")) + "\n" + block(leaf("same"));
  const found = lint(text).diagnostics.find(
    (item) => item.code === "task.duplicate-id",
  );
  assert.equal(found.severity, "error");
  assert.equal(found.lineStart, 7);
  assert.match(found.message, /already used at line 3/);
});

test("a leaf names exactly one repository", () => {
  const two = lint(block(leaf("alpha", { repository: "x", projectId: "y" })), [
    { id: "x", checks: [["t"]] },
    { id: "y", checks: [["t"]] },
  ]);
  assert.ok(codes(two).includes("leaf.repository"));
  const none = lint(block(leaf("alpha")), [
    { id: "x", checks: [["t"]] },
    { id: "y", checks: [["t"]] },
  ]);
  assert.ok(codes(none).includes("leaf.repository"));
  assert.equal(lint(block(leaf("alpha")), [{ id: "x" }]).canApprove, true);
});

test("a leaf needs checks unless it is answered", () => {
  const bare = leaf("alpha", { checks: undefined }),
    result = lint(block(bare), [{ id: "x", checks: [] }]),
    diagnostic = result.diagnostics.find((item) => item.code === "leaf.checks");
  assert.equal(diagnostic.lineStart, 1);
  assert.equal(
    lint(block(bare), [{ id: "x", checks: [["npm", "test"]] }]).canApprove,
    true,
  );
  assert.equal(
    lint(block({ ...bare, completion: "answered" })).canApprove,
    true,
  );
  assert.equal(
    lint(block({ id: "parent-pkg", title: "Parent", kind: "package" }))
      .canApprove,
    true,
  );
});

test("a leaf's completion must be observable on its route", () => {
  assert.ok(
    codes(lint(block(leaf("alpha", { completion: "merged-pr" })))).includes(
      "leaf.completion",
    ),
  );
  assert.equal(
    lint(block(leaf("alpha", { completion: "merged-pr", route: "github" })))
      .canApprove,
    true,
  );
});
