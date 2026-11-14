// rc-2.4: a batch issue keeps each task ID separate and closes them together.
// Fake GitHub only. Nearby inputs checked: single-repo and plans-repo modes;
// unticked and ticked checklist boxes; a pull request that merges and one
// that never does; a reopened batch issue; a member marked done by hand; a
// batch of one; a repeat projection and the tick's re-projection; members
// with an edge between them, with an outside blocker, already projected on
// their own, unknown, repeated, over the cap; a repository with the default
// coder; a dependent of a member.
import assert from "node:assert/strict";
import test from "node:test";
import { planningIdentity } from "../github-marker.mjs";
import { parseProvenance } from "../github-provenance.mjs";
import { refreshProjectedReadiness } from "../github-projection.mjs";
import { verifyIssue } from "../verify-issue.mjs";
import {
  BATCH,
  BATCH_SPEC,
  approvedSpec,
  mergeAndClose,
  reader,
  workspace,
} from "./radar-fixture.mjs";

const ISSUE = /<!-- avoozl-task\n(.*)\n-->/;
const managed = (issue) => JSON.parse(issue.body.match(ISSUE)[1]);
const batchIssue = (github) =>
  github.created.find((issue) => managed(issue).members);
const taskOf = (store, id) => store.read().tasks.find((task) => task.id === id);

async function projected(t, mode = "single-repo", options = {}) {
  const context = await workspace(t, { mode, coder: "issue-radar" }),
    spec = await approvedSpec(context, { overrides: BATCH_SPEC });
  await context.ops.execute("github.project", {
    planId: spec.plan.id,
    batches: [BATCH],
    ...options,
  });
  return { ...context, ...spec, issue: batchIssue(context.github) };
}

for (const mode of ["single-repo", "plans-repo"])
  test(`${mode}: three tasks share one batch issue with one marker and a checklist`, async (t) => {
    const { github, store, issue } = await projected(t, mode);
    assert.ok(issue, "a batch issue was written");
    assert.deepEqual(managed(issue).members, BATCH);
    assert.equal(managed(issue).taskId, BATCH[0]);
    // No second issue for a member; the fourth task and the package have one.
    for (const id of BATCH.slice(1))
      assert.equal(
        github.created.some((other) => managed(other).taskId === id),
        false,
      );
    const parsed = parseProvenance(issue.body);
    assert.equal(parsed.problem, null);
    assert.deepEqual(parsed.marker.tasks, BATCH);
    const result = await verifyIssue("example/code#" + issue.number, {
      read: reader(github, issue, "example/code", BATCH_SPEC),
    });
    assert.deepEqual(
      result.checks.filter((check) => check.status !== "ok"),
      [],
    );
    // One checklist line per member, outside the managed section.
    const [outside] = issue.body.split("<!-- avoozl:managed:start -->");
    for (const id of BATCH)
      assert.match(outside, new RegExp(`- \\[ \\] ${id.replace(".", "\\.")}`));
    // Each member keeps its own node, acceptance and the shared issue.
    for (const id of BATCH) {
      const task = taskOf(store, id);
      assert.equal(task.github.number, issue.number);
      assert.deepEqual(task.github.batch, { lead: BATCH[0], members: BATCH });
      assert.ok(task.acceptance.length > 0);
    }
    assert.equal(new Set(BATCH.map((id) => taskOf(store, id).id)).size, 3);
  });

test("a dependent of a member is blocked by the batch issue once", async (t) => {
  const { github, issue } = await projected(t),
    dependent = github.created.find(
      (other) => managed(other).taskId === "config.1.4",
    );
  const blockers = [
    ...(
      github.blockers.get(`example/code#${dependent.number}`) || new Map()
    ).keys(),
  ];
  assert.deepEqual(blockers, [issue.id]);
});

for (const mode of ["single-repo", "plans-repo"])
  test(`${mode}: the merged closing pull request completes every member, with the boxes unticked`, async (t) => {
    const { github, store, ops, issue } = await projected(t, mode);
    assert.doesNotMatch(issue.body, /- \[x\]/i);
    mergeAndClose(github, issue);
    await ops.execute("workspace.tick", { sessions: [] });
    for (const id of BATCH) {
      const task = taskOf(store, id);
      assert.equal(task.githubVerdict?.state, "verified", id);
      assert.equal(
        store.read().statuses.find((s) => s.id === task.status).complete,
        true,
        id,
      );
    }
    // The fake answers every issue with the same pull request, so the open
    // dependent is held, never verified.
    assert.notEqual(
      taskOf(store, "config.1.4").githubVerdict?.state,
      "verified",
    );
  });

test("ticked boxes on an open batch issue change nothing", async (t) => {
  const { github, store, ops, plan, issue } = await projected(t),
    snapshot = () =>
      JSON.stringify(
        BATCH.map((id) => [
          taskOf(store, id).status,
          taskOf(store, id).github.number,
          taskOf(store, id).githubVerdict?.state ?? "open",
        ]),
      ),
    before = snapshot();
  issue.body = issue.body.replaceAll("- [ ] config", "- [x] config");
  github.updated.length = 0;
  await ops.execute("workspace.tick", { sessions: [] });
  await ops.execute("github.project", { planId: plan.id, batches: [BATCH] });
  assert.equal(snapshot(), before);
  assert.equal(github.updated.length, 0, "the boxes raise no body write");
  assert.deepEqual(taskOf(store, BATCH[0]).projectionConflicts ?? [], []);
});

test("a pull request that never merges completes nothing", async (t) => {
  const { github, store, ops, issue } = await projected(t);
  mergeAndClose(github, issue);
  const [pull] = await github.closingPullRequests();
  Object.assign(pull, { merged: false, mergedAt: null, state: "OPEN" });
  Object.assign(issue, { state: "open", state_reason: null });
  await ops.execute("workspace.tick", { sessions: [] });
  for (const id of BATCH)
    assert.notEqual(taskOf(store, id).githubVerdict?.state, "verified");
});

test("reopening the batch issue reopens every member", async (t) => {
  const { github, store, ops, issue } = await projected(t);
  mergeAndClose(github, issue);
  await ops.execute("workspace.tick", { sessions: [] });
  Object.assign(issue, { state: "open", state_reason: null });
  Object.assign(issue, { updated_at: "2026-11-12T11:00:00Z" });
  await ops.execute("workspace.tick", { sessions: [] });
  for (const id of BATCH)
    assert.notEqual(taskOf(store, id).githubVerdict?.state, "verified", id);
});

test("a member marked done by hand leaves the others open", async (t) => {
  const { store, ops } = await projected(t),
    complete = store.read().statuses.find((status) => status.complete).id;
  store.mutate("Hand done", (data) => {
    data.tasks.find((task) => task.id === BATCH[1]).status = complete;
  });
  await ops.execute("workspace.tick", { sessions: [] });
  assert.equal(taskOf(store, BATCH[1]).status, complete);
  for (const id of [BATCH[0], BATCH[2]])
    assert.notEqual(taskOf(store, id).status, complete, id);
});

test("a batch of one stays a plain issue", async (t) => {
  const context = await workspace(t, {
      mode: "single-repo",
      coder: "issue-radar",
    }),
    { github, ops } = context,
    { plan } = await approvedSpec(context, { overrides: BATCH_SPEC });
  await ops.execute("github.project", {
    planId: plan.id,
    batches: [[BATCH[0]]],
  });
  assert.equal(batchIssue(github), undefined);
  assert.ok(github.created.some((issue) => managed(issue).taskId === BATCH[0]));
});

test("a repeat projection and the tick's re-projection keep the batch and write nothing", async (t) => {
  const { github, store, ops, plan, issue } = await projected(t),
    created = github.created.length;
  github.updated.length = 0;
  await ops.execute("github.project", { planId: plan.id, batches: [BATCH] });
  // The tick projects with no batches input; the stored batch is kept.
  const result = await refreshProjectedReadiness(store, github, {
    identity: planningIdentity(ops.workspaceRoot),
    forcePlans: new Set([plan.id]),
  });
  assert.deepEqual(result.errors, []);
  assert.equal(github.created.length, created);
  assert.equal(github.updated.length, 0);
  assert.deepEqual(managed(batchIssue(github)).members, BATCH);
  assert.equal(taskOf(store, BATCH[2]).github.number, issue.number);
});

test("the Graph shows the batch node with its members", async (t) => {
  const { ops, issue } = await projected(t),
    view = await ops.execute("graph.view", {});
  assert.deepEqual(view.batches, [
    {
      id: `example/code#${issue.number}`,
      repository: "example/code",
      number: issue.number,
      url: issue.html_url,
      lead: BATCH[0],
      members: BATCH,
    },
  ]);
  for (const id of BATCH)
    assert.equal(
      view.tasks.find((task) => task.id === id).batch,
      `example/code#${issue.number}`,
    );
  assert.equal(view.tasks.find((task) => task.id === "config.1.4").batch, null);
});

async function refused(t, batches, pattern, { coder = "issue-radar" } = {}) {
  const context = await workspace(t, { mode: "single-repo", coder }),
    { github, ops } = context,
    { plan } = await approvedSpec(context, { overrides: BATCH_SPEC });
  await assert.rejects(
    ops.execute("github.project", { planId: plan.id, batches }),
    (error) => error.status === 409 && pattern.test(error.message),
  );
  assert.equal(
    github.created.some((issue) => /"taskId":"config\.1\./.test(issue.body)),
    false,
    "no task issue is written",
  );
}

test("a batch is refused for the default coder", (t) =>
  refused(t, [BATCH], /issue-radar/, { coder: "worker" }));
test("a batch with an edge between members is refused", (t) =>
  refused(t, [["config.1.1", "config.1.4"]], /edge/));
test("a member with an open blocker outside the batch is refused", (t) =>
  refused(t, [["config.1.2", "config.1.4"]], /blocker/));
test("an unknown task ID is refused", (t) =>
  refused(t, [["config.1.1", "config.9.9"]], /config\.9\.9/));
test("a task in two batches is refused", (t) =>
  refused(t, [BATCH, ["config.1.3", "config.1.2"]], /more than one batch/));
test("more than five members are refused", (t) =>
  refused(
    t,
    [["a", "b", "c", "d", "e", "f"].map((id) => "config.1." + id)],
    /at most 5/,
  ));

test("a member that already has its own issue is refused", async (t) => {
  const context = await workspace(t, {
      mode: "single-repo",
      coder: "issue-radar",
    }),
    { github, ops } = context,
    { plan } = await approvedSpec(context, { overrides: BATCH_SPEC });
  await ops.execute("github.project", { planId: plan.id });
  const created = github.created.length;
  await assert.rejects(
    ops.execute("github.project", { planId: plan.id, batches: [BATCH] }),
    (error) => error.status === 409 && /already has/.test(error.message),
  );
  assert.equal(github.created.length, created);
});
