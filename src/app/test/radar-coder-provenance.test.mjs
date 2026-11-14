// rc-3.6: projection writes the provenance marker for `coder: issue-radar`.
// Fake GitHub only. Nearby inputs checked: single-repo and plans-repo modes;
// coder worker (no marker); no merged approval and a text plan (no marker);
// an invalid and a content-blocked approver; a repeat projection; the marker's
// place after the managed marker; `verify-issue` over the written issue.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { approvalChanges } from "../spec-approval.mjs";
import { parseProvenance } from "../github-provenance.mjs";
import { Operations } from "../operations.mjs";
import { verifyIssue } from "../verify-issue.mjs";
import { fixture } from "./fixtures.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { specFiles, writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const NAMESPACE = "avz_testtesttesttest";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const MARKER_LINE = /^<!-- avoozl v=1 .* -->$/m;

async function workspace(t, { mode, coder, blockTerm }) {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      github: {
        mode,
        ...(mode === "plans-repo"
          ? { planningRepository: "example/planning" }
          : {}),
        repositories: {
          "example/code": { baseBranch: "main", ...(coder ? { coder } : {}) },
        },
      },
      ...(blockTerm ? { contentRules: { sets: [{ id: "names" }] } } : {}),
    }),
  );
  if (blockTerm) {
    const dir = path.join(root, ".avoozl", "local", "content-rules");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "names.txt"), `name: ${blockTerm}\n`);
  }
  const ops = new Operations(store, {
    github,
    operator: "Operator",
    workspaceRoot: root,
  });
  for (const id of ["planning", "code"])
    store.put("projects", {
      id,
      root,
      ...(id === "planning" ? { planning: true } : {}),
      baseBranch: "main",
      worktreeRoot: `/tmp/${id}-worktrees`,
      checks: [["npm", "test"]],
    });
  for (const id of mode === "plans-repo" ? ["planning", "code"] : ["code"])
    await ops.execute("github.configure", {
      repository: `example/${id}`,
      projectId: id,
      allowedActors: ["maintainer"],
    });
  return { store, github, ops, root };
}

// An approved spec plan. `approval` records the merged approval pull request
// the way `reconcileApproval` does; null leaves it unrecorded.
async function approvedSpec(
  { store, ops, root },
  { approval = { commit: COMMIT, approvedBy: "octocat" } } = {},
) {
  writeSpec(root, "config");
  const plan = await ops.execute("plan.create", {
    spec: "config",
    prompt: "Load config",
    context: { projectId: "code" },
  });
  const approved = await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  if (approval)
    store.setMeta(`spec-approval:${plan.id}:${plan.hash}`, {
      state: "merged",
      ...approval,
    });
  return { plan, approved };
}

const leaves = (github) =>
  github.created.filter((issue) => /"kind":"leaf"/.test(issue.body));
const markersOf = (issue) => [
  ...issue.body.matchAll(/<!-- avoozl v=1 .* -->/g),
];

// A reader over the fake: the created issue, the approver and author with
// write access, and the approved spec files at the recorded commit.
function reader(github, issue, repository = "example/code") {
  const base = `repos/${repository}/contents/.kiro/specs/config`,
    approved = approvalChanges({ spec: "config", files: specFiles() }),
    table = new Map([
      [
        `repos/example/code/issues/${issue.number}`,
        { body: { body: issue.body, user: { login: "maintainer" } } },
      ],
      [`repos/${repository}`, { body: { default_branch: "main" } }],
      [
        `repos/${repository}/compare/main...${COMMIT}`,
        { body: { status: "identical" } },
      ],
    ]);
  for (const login of ["octocat", "maintainer"])
    for (const repo of new Set(["example/code", repository]))
      table.set(`repos/${repo}/collaborators/${login}/permission`, {
        body: { permission: "write" },
      });
  for (const [file, text] of Object.entries(approved))
    table.set(`${base}/${file.split("/").slice(3).join("/")}?ref=${COMMIT}`, {
      text,
    });
  table.set(`${base}/avoozl/manifest.json?ref=${COMMIT}`, {
    text: specFiles()["avoozl/manifest.json"],
  });
  return async (apiPath) => {
    const hit = table.get(apiPath);
    if (!hit) return { status: 404, headers: {}, text: "{}" };
    return {
      status: 200,
      headers: {},
      text: hit.text ?? JSON.stringify(hit.body),
    };
  };
}

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
