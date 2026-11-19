// A mirror with forwarding off completes a task on its mirror merge (RC24.6):
// nothing is forwarded, so no public merge record will ever be written.
// Forward "auto" and "nudge" still wait for the public merge. Fake GitHub only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { reconcileGitHubCompletion } from "../github-close.mjs";
import { planningIdentity } from "../github-marker.mjs";
import { readGitHubPolicy } from "../github-policy.mjs";
import { linkedBranchName } from "../github-plans-repo.mjs";
import { refreshProjectedReadiness } from "../github-projection.mjs";
import { queryTasks } from "../../query.mjs";
import { COMMIT, workspace } from "./radar-fixture.mjs";
import { specFiles, withFacts } from "./spec-fixture.mjs";

const REPO = "example/code";
const PLANS = "avoozl-plans";

const files = (title, requires) =>
  withFacts({
    ...specFiles(),
    "tasks.md": `# Tasks\n\n- [ ] 1 Goal\n  - [ ] 1.1 ${title}\n`,
    "avoozl/manifest.json": JSON.stringify({
      tasks: {
        1: {
          kind: "package",
          summary: "Goal.",
          requires: ["1.1"],
          acceptance: ["Done."],
        },
        1.1: {
          kind: "leaf",
          repository: "code",
          route: "github",
          summary: title,
          ...(requires ? { requires: [requires] } : {}),
          acceptance: ["It works."],
          checks: ["npm test"],
          completion: "merged-pr",
        },
      },
    }),
  });

// The policy key is the mirror itself: issues and pull requests live there.
async function setup(t, forward) {
  const context = await workspace(t, {
      mode: "single-repo",
    }),
    file = path.join(context.root, ".avoozl.json"),
    policy = JSON.parse(fs.readFileSync(file, "utf8"));
  policy.github.repositories[REPO].mirror = {
    source: "example/upstream",
    mirror: REPO,
    forward,
    plansBranch: PLANS,
    ...(forward === "auto" ? { trustedPersons: ["maintainer"] } : {}),
  };
  fs.writeFileSync(file, JSON.stringify(policy));
  return context;
}

async function approve({ store, ops, github }, name, title, requires) {
  for (const [file, text] of Object.entries(files(title, requires)))
    github.files.set(`${PLANS}:.kiro/specs/${name}/${file}`, text);
  await ops.refreshPrivateSpecs();
  const plan = await ops.execute("plan.create", {
    spec: name,
    prompt: name,
    context: { projectId: "code" },
  });
  store.setMeta(`spec-approval:${plan.id}:${plan.hash}`, {
    state: "merged",
    commit: COMMIT,
    approvedBy: "octocat",
    ref: PLANS,
  });
  await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  await ops.execute("github.project", { planId: plan.id });
  return plan;
}

// The owner task's issue closed by a merged "Closes #N" pull request.
function mergeOwner(github) {
  const issue = github.created.find((item) =>
      item.body.includes('"taskId":"owner.1.1"'),
    ),
    pull = {
      number: 50,
      url: `https://example.test/${REPO}/pull/50`,
      state: "MERGED",
      title: "Build the owner step",
      body: `Closes #${issue.number}`,
      merged: true,
      mergedAt: "2026-11-15T10:04:00Z",
      headRefName: "issue-radar/owner",
      headRefOid: "a".repeat(40),
      baseRefName: "main",
      repository: { nameWithOwner: REPO },
      commits: [],
    };
  github.checkRuns = async () => [];
  github.commitStatus = async () => ({ state: "success" });
  github.issueLinks = async (_repository, number) => ({
    nodeId: `issue-${number}`,
    linkedBranches: [],
    openBlockedBy: 0,
    totalBlockedBy: 0,
  });
  github.closingPullRequests = async (_repository, number) =>
    number === issue.number ? [pull] : [];
  github.branchPullRequests = async (_repository, branch) =>
    branch === linkedBranchName("owner.1.1") ? [pull] : [];
  Object.assign(issue, {
    state: "closed",
    state_reason: "completed",
    closed_at: "2026-11-15T10:05:00Z",
    updated_at: "2026-11-15T10:05:00Z",
  });
  github.events.set(issue.number, [
    {
      event: "closed",
      actor: { login: "maintainer" },
      state_reason: "completed",
      created_at: "2026-11-15T10:05:00Z",
    },
  ]);
}

async function run(t, forward) {
  const context = await setup(t, forward);
  await approve(context, "owner", "Build the owner step");
  await approve(context, "consumer", "Build the consumer step", "owner.1.1");
  mergeOwner(context.github);
  await reconcileGitHubCompletion(context.store, context.github, {
    policy: readGitHubPolicy(context.root),
  });
  // The tick projects changed readiness next, which sets `dispatch.ready`.
  await refreshProjectedReadiness(context.store, context.github, {
    identity: planningIdentity(context.root),
  });
  const state = context.store.read();
  return {
    owner: state.tasks.find((task) => task.id === "owner.1.1"),
    ready: queryTasks(state, { scope: "all", q: "ready:true" }).map(
      (task) => task.id,
    ),
  };
}

test("forward off: a merged Closes #N completes the task and releases its dependent", async (t) => {
  const { owner, ready } = await run(t, "off");
  assert.equal(owner.githubVerdict.state, "verified");
  assert.ok(ready.includes("consumer.1.1"), ready.join(","));
});

for (const forward of ["nudge", "auto"])
  test(`forward ${forward}: a mirror merge still waits for the public merge`, async (t) => {
    const { owner, ready } = await run(t, forward);
    assert.equal(owner.githubVerdict.state, "open");
    assert.equal(owner.githubVerdict.retry, true);
    assert.ok(!ready.includes("consumer.1.1"), ready.join(","));
  });
