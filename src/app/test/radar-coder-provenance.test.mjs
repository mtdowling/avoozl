// rc-3.6: projection writes the provenance marker for `coder: issue-radar`.
// Fake GitHub only. Nearby inputs checked: single-repo and plans-repo modes;
// coder worker (no marker); no merged approval and a text plan (no marker);
// an invalid and a content-blocked approver; a repeat projection; the marker's
// place after the managed marker; `verify-issue` over the written issue.
import assert from "node:assert/strict";
import test from "node:test";
import { parseProvenance } from "../github-provenance.mjs";
import { verifyIssue } from "../verify-issue.mjs";
import {
  COMMIT,
  MARKER_LINE,
  approvedSpec,
  leaves,
  markersOf,
  reader,
  workspace,
} from "./radar-fixture.mjs";

for (const mode of ["single-repo", "plans-repo"])
  test(`${mode}: every task issue carries a provenance marker after the managed marker that verify-issue accepts`, async (t) => {
    const context = await workspace(t, { mode, coder: "issue-radar" }),
      { github, ops } = context,
      { plan, approved } = await approvedSpec(context);
    await ops.execute("github.project", { planId: plan.id });
    const issues = github.created.filter((issue) =>
      approved.taskIds.some((id) => issue.body.includes(`"taskId":"${id}"`)),
    );
    assert.equal(issues.length, approved.taskIds.length);
    for (const issue of issues) {
      assert.equal(markersOf(issue).length, 1);
      const parsed = parseProvenance(issue.body),
        taskId = JSON.parse(
          issue.body.match(/<!-- avoozl-task\n(.*)\n-->/)[1],
        ).taskId;
      assert.equal(parsed.problem, null);
      assert.deepEqual(parsed.marker.tasks, [taskId]);
      assert.equal(parsed.marker.spec, "config");
      assert.equal(parsed.marker.commit, COMMIT);
      assert.equal(parsed.marker.approvedBy, "octocat");
      // After the managed marker, before the managed section.
      const at = (text) => issue.body.indexOf(text);
      assert.ok(at("<!-- avoozl-task") < at("<!-- avoozl v=1"));
      assert.ok(at("<!-- avoozl v=1") < at("<!-- avoozl:managed:start -->"));
      const result = await verifyIssue("example/code#" + issue.number, {
        read: reader(github, issue),
      });
      assert.deepEqual(
        result.checks.filter((check) => check.status !== "ok"),
        [],
      );
      assert.equal(result.ok, true);
    }
  });

test("a repeat projection keeps one marker and writes no new issue", async (t) => {
  const context = await workspace(t, {
      mode: "single-repo",
      coder: "issue-radar",
    }),
    { github, ops } = context,
    { plan } = await approvedSpec(context);
  await ops.execute("github.project", { planId: plan.id });
  const before = github.created.map((issue) => issue.body);
  await ops.execute("github.project", { planId: plan.id });
  assert.equal(github.created.length, before.length);
  assert.deepEqual(
    github.created.map((issue) => issue.body),
    before,
  );
});

test("the default coder writes no provenance marker", async (t) => {
  const context = await workspace(t, { mode: "single-repo" }),
    { github, ops } = context,
    { plan } = await approvedSpec(context, { approval: null });
  await ops.execute("github.project", { planId: plan.id });
  assert.ok(github.created.length > 0);
  for (const issue of github.created)
    assert.doesNotMatch(issue.body, MARKER_LINE);
});

// Until the approval pull request is recorded as merged there is no commit
// to pin, so no marker is written and `verify-issue` refuses the issue.
test("a radar issue projected before the approval merged has no marker", async (t) => {
  const context = await workspace(t, {
      mode: "single-repo",
      coder: "issue-radar",
    }),
    { github, ops } = context,
    { plan } = await approvedSpec(context, { approval: null });
  await ops.execute("github.project", { planId: plan.id });
  assert.ok(leaves(github).length > 0);
  for (const issue of github.created)
    assert.doesNotMatch(issue.body, MARKER_LINE);
  const [issue] = leaves(github),
    result = await verifyIssue("example/code#" + issue.number, {
      read: reader(github, issue),
    });
  assert.equal(result.ok, false);
  assert.equal(result.checks[0].name, "marker");
  assert.equal(result.checks[0].status, "fail");
});

test("an approver that is not a login is refused and nothing is written", async (t) => {
  const context = await workspace(t, {
      mode: "single-repo",
      coder: "issue-radar",
    }),
    { github, ops } = context,
    { plan } = await approvedSpec(context, {
      approval: { commit: COMMIT, approvedBy: "/home/me/secret" },
    });
  await assert.rejects(ops.execute("github.project", { planId: plan.id }), {
    status: 422,
  });
  assert.equal(
    github.created.some((issue) => /"taskId":"config\./.test(issue.body)),
    false,
  );
});

test("a content rule that names a value in the marker blocks the issue", async (t) => {
  const context = await workspace(t, {
      mode: "single-repo",
      coder: "issue-radar",
      blockTerm: "hiddenname",
    }),
    { github, ops } = context,
    { plan } = await approvedSpec(context, {
      approval: { commit: COMMIT, approvedBy: "hiddenname" },
    });
  await ops.execute("github.project", { planId: plan.id });
  assert.equal(
    github.created.some((issue) => /hiddenname/.test(issue.body)),
    false,
  );
  assert.equal(
    github.created.some((issue) => /"taskId":"config\.1\.1"/.test(issue.body)),
    false,
  );
});

test("a plain text plan writes no marker for a radar repository", async (t) => {
  const { github, ops, store } = await workspace(t, {
    mode: "single-repo",
    coder: "issue-radar",
  });
  const plan = await ops.execute("plan.create", {
    id: "text",
    prompt: "Text plan",
    text:
      "# text\n\n```task\n" +
      JSON.stringify({
        id: "text-leaf",
        title: "Leaf",
        acceptance: ["Passes"],
        projectId: "code",
      }) +
      "\n```\n",
  });
  await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  await ops.execute("github.project", { planId: plan.id });
  assert.ok(github.created.length > 0);
  for (const issue of github.created)
    assert.doesNotMatch(issue.body, MARKER_LINE);
});
