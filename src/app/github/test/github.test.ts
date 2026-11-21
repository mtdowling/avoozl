import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { Operations } from "../../api/operations.ts";
import { fixture } from "../../test/fixtures.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { FakeGitHub, type FakeIssue } from "../../test/fake-github.ts";
import type { Store } from "../../store/store.ts";
import type { PlanDraft } from "../../test/view-shapes.ts";

const NAMESPACE = "avz_testtesttesttest";

// The planning workspace's .avoozl.json, which owns the marker namespace.
function planningRoot(
  root: string,
  value: Record<string, unknown> = { version: 1, namespace: NAMESPACE },
) {
  fs.writeFileSync(path.join(root, ".avoozl.json"), JSON.stringify(value));
  return root;
}

function configure(
  store: Store,
  github: FakeGitHub,
  root = temporaryDirectory(),
) {
  store.put("repositories", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    worktreeRoot: "/tmp/worktrees",
    checks: [["npm", "test"]],
  });
  const ops = new Operations(store, {
    github,
    operator: "Operator",
    workspaceRoot: planningRoot(root),
  });
  return ops
    .execute("github.configure", {
      repository: "example/code",
      repositoryId: "code",
      provider: "openhands",
      autoStart: true,
      allowedActors: ["maintainer"],
    })
    .then(() => ops);
}

function readyIssue(body = "## Acceptance criteria\n\n- [ ] It works") {
  return {
    id: 1,
    node_id: "issue-node-1",
    number: 7,
    title: "Implement the GitHub path",
    body,
    html_url: "https://example.test/example/code/issues/7",
    assignees: [{ login: "worker" }],
    labels: [{ name: "avoozl:ready" }],
  };
}

function markerOf(issue: FakeIssue) {
  const marker = issue.body.match(/<!-- avoozl-task\n(.*)\n-->/);
  assert.ok(marker, "the issue has a task marker");
  return JSON.parse(marker[1]);
}

async function twoRepositoryPlan(
  t: TestContext,
  avoozlJson?: Record<string, unknown>,
) {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    ops = new Operations(store, {
      github,
      operator: "Operator",
      workspaceRoot: planningRoot(temporaryDirectory(), avoozlJson),
    });
  for (const id of ["planning", "code"])
    store.put("repositories", {
      id,
      root: `/tmp/${id}`,
      baseBranch: "main",
      worktreeRoot: `/tmp/${id}-worktrees`,
      checks: [["npm", "test"]],
    });
  for (const id of ["planning", "code"])
    await ops.execute("github.configure", {
      repository: `example/${id}`,
      repositoryId: id,
    });
  return { store, github, ops };
}

async function approve(
  ops: Operations,
  store: Store,
  id: string,
  tasks: Record<string, unknown>[],
) {
  const plan = await ops.execute<PlanDraft>("plan.create", {
    id,
    prompt: "Repository " + id,
    text:
      `# ${id}\n\n` +
      tasks
        .map((task) => "```task\n" + JSON.stringify(task) + "\n```\n")
        .join("\n"),
  });
  const approved = await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  return { plan, approved };
}

async function projectedWorkspace(
  t: TestContext,
  tasks: Record<string, unknown>[],
  policy = {},
) {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    root = temporaryDirectory(),
    ops = await configure(store, github, root);
  planningRoot(root, { version: 1, namespace: NAMESPACE, ...policy });
  const { plan, approved } = await approve(ops, store, "projection", tasks);
  return { store, github, ops, plan, approved, root };
}

const leaf = (id: string, extra = {}) => ({
  id,
  title: "Task " + id,
  summary: "Summary " + id,
  acceptance: [id + " passes"],
  repositoryId: "code",
  ...extra,
});

function issueFor(github: FakeGitHub, taskId: string) {
  return github.created.find((issue) => markerOf(issue).taskId === taskId);
}

function labelsOf(issue: FakeIssue | undefined) {
  return (issue?.labels || []).map((label) => label.name);
}
