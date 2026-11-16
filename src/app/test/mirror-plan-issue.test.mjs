// The plan issue of a repository with a private mirror (RC24.3, design
// D29.3). Found in the live run of Proof 23: with a driver bound, the plan
// issue that holds the driver's claim was created on the public source.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { throughClient } from "./crew-label-client.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const SOURCE = "example/code",
  MIRROR = "example/code-private";

test("with a driver bound, the plan issue and every task issue go to the mirror", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    { requests, labelEdits } = throughClient(github),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_testtesttesttest",
      github: {
        mode: "single-repo",
        repositories: {
          [SOURCE]: {
            baseBranch: "main",
            coder: "issue-radar",
            mirror: { source: SOURCE, mirror: MIRROR },
          },
        },
      },
    }),
  );
  const ops = new Operations(store, {
    github,
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
  await ops.execute("github.configure", {
    repository: SOURCE,
    projectId: "code",
    allowedActors: ["maintainer"],
  });
  writeSpec(root, "config");
  const plan = await ops.execute("plan.create", {
    spec: "config",
    prompt: "Load config",
    context: { projectId: "code" },
  });
  store.setMeta(`spec-approval:${plan.id}:${plan.hash}`, {
    state: "merged",
    commit: "0123456789abcdef0123456789abcdef01234567",
    approvedBy: "octocat",
  });
  await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  await ops.execute("github.project", { planId: plan.id });

  assert.ok(github.created.length > 0);
  assert.deepEqual(
    [...new Set(github.created.map((issue) => issue.repository))],
    [MIRROR],
  );
  const plans = github.created.filter((issue) =>
    issue.body.includes(`"taskId":"plan.${plan.id}"`),
  );
  assert.equal(plans.length, 1, "one plan issue");
  // A second projection finds the same plan issue and makes no new one.
  const before = github.created.length;
  await ops.execute("github.project", { planId: plan.id });
  assert.equal(github.created.length, before);
  // The plan issue and each task issue carry crew:avoozl in their create
  // request, in both of its forms, and no label edit follows (R103.2).
  assert.equal(requests.length, github.created.length);
  assert.deepEqual(
    [...new Set(requests.map((request) => request.form))].sort(),
    ["graphql", "rest"],
  );
  assert.ok(
    requests.every((request) => request.labels.includes("crew:avoozl")),
  );
  assert.deepEqual(
    labelEdits.filter((edit) => JSON.stringify(edit).includes("crew:avoozl")),
    [],
  );
});
