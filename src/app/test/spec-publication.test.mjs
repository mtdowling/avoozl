import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { appendRecord, replayJournal } from "../spec-journal.mjs";
import {
  OWNERSHIP_LABEL,
  localJournalFile,
  publishSpec,
} from "../spec-publication.mjs";
import { planningIdentity } from "../github-marker.mjs";
import { fixture } from "./fixtures.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const REPOSITORY = "example/code";

async function workspace(t, { github = new FakeGitHub(), mode } = {}) {
  const { store } = fixture(t),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_testtesttesttest",
      github: mode
        ? { mode, repositories: { [REPOSITORY]: { baseBranch: "main" } } }
        : { mode: "local" },
    }),
  );
  const ops = new Operations(store, {
    github: mode ? github : null,
    operator: "Operator",
    workspaceRoot: root,
    driver: { settingsFile: path.join(temporaryDirectory(), "driver.json") },
  });
  store.put("projects", {
    id: "code",
    root,
    baseBranch: "main",
    worktreeRoot: "/tmp/code-worktrees",
    checks: [["npm", "test"]],
  });
  if (mode)
    await ops.execute("github.configure", {
      repository: REPOSITORY,
      projectId: "code",
      allowedActors: ["maintainer"],
    });
  writeSpec(root, "config");
  const plan = await ops.execute("plan.create", {
    spec: "config",
    prompt: "Load config",
    context: { projectId: "code" },
  });
  return { store, root, ops, github, plan };
}

const writes = (github) => ({
  created: github.created.length,
  updated: github.updated.length,
  labels: github.labels.length,
  comments: github.comments.length,
  subIssues: github.subIssues.length,
});

test("approval makes no GitHub write; Publish issue makes one labeled issue once", async (t) => {
  const w = await workspace(t, { mode: "single-repo" });
  const before = writes(w.github);
  w.store.setMeta(`spec-approval:${w.plan.id}:${w.plan.hash}`, {
    state: "merged",
    commit: "0123456789abcdef0123456789abcdef01234567",
    approvedBy: "octocat",
  });
  await w.ops.execute("plan.approve", {
    id: w.plan.id,
    expectedHash: w.plan.hash,
    expectedRevision: w.store.read().revision,
  });
  assert.equal(w.store.get("plans", w.plan.id).state, "approved");
  assert.deepEqual(writes(w.github), before);

  await assert.rejects(
    w.ops.execute("spec.publish", { planId: w.plan.id }, undefined, {
      mcp: true,
    }),
    /Only a person/,
  );
  const published = await w.ops.execute("spec.publish", { planId: w.plan.id });
  assert.equal(published.home, "github");
  assert.equal(published.existing, false);
  assert.equal(w.github.created.length, 1);
  assert.deepEqual(
    w.github.created[0].labels.map((label) => label.name),
    [OWNERSHIP_LABEL],
  );
  // No label edit after the create.
  assert.equal(w.github.labels.length, before.labels);
  const again = await w.ops.execute("spec.publish", { planId: w.plan.id });
  assert.equal(again.existing, true);
  assert.equal(again.number, published.number);
  assert.equal(w.github.created.length, 1);
});

test("an issue the workspace already holds for the spec keeps its ownership", async (t) => {
  const w = await workspace(t, { mode: "single-repo" });
  w.store.put("receipts", {
    id: `github-parent:plan:${w.plan.id}`,
    kind: "github-parent",
    level: "plan",
    parentId: w.plan.id,
    repository: REPOSITORY,
    number: 12,
  });
  const published = await w.ops.execute("spec.publish", { planId: w.plan.id });
  assert.deepEqual(
    { existing: published.existing, number: published.number },
    { existing: true, number: 12 },
  );
  assert.equal(w.github.created.length, 0);
});

test("a spec in an epic gets the epic issue and is made under it, both labeled", async (t) => {
  const w = await workspace(t, { mode: "single-repo" });
  w.store.mutate("Add an epic", (data) => {
    data.epics = [
      {
        id: "launch",
        title: "Launch",
        planId: "launch-plan",
        listed: [w.plan.id],
        plans: [w.plan.id],
      },
    ];
  });
  const published = await publishSpec(w.store, {
    github: w.github,
    workspaceRoot: w.root,
    identity: planningIdentity(w.root),
    planId: w.plan.id,
    actor: "Operator",
  });
  assert.equal(w.github.created.length, 2);
  for (const issue of w.github.created)
    assert.deepEqual(
      issue.labels.map((label) => label.name),
      [OWNERSHIP_LABEL],
    );
  const [epic, spec] = w.github.created;
  assert.equal(published.epicNumber, epic.number);
  assert.deepEqual(w.github.subIssues, [[epic.number, spec.id]]);
  assert.equal(
    w.store.get("receipts", "github-parent:epic:launch").number,
    epic.number,
  );
});

test("a workspace without GitHub keeps the journal in a local file", async (t) => {
  const w = await workspace(t);
  const published = await w.ops.execute("spec.publish", { planId: w.plan.id });
  assert.equal(published.home, "local");
  const { journal } = await publishSpec(w.store, {
    github: null,
    workspaceRoot: w.root,
    identity: planningIdentity(w.root),
    planId: w.plan.id,
    actor: "Operator",
  });
  await appendRecord(
    journal,
    {
      op: "op-1",
      kind: "approval",
      spec: "config",
      revision: "c".repeat(64),
    },
    { visibility: "private" },
  );
  const file = localJournalFile(w.root, w.plan.id);
  assert.equal(fs.existsSync(file), true);
  const result = await replayJournal(await journal.list(), {
    visibility: "private",
    permission: journal.permission,
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.held, false);
});
