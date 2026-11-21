// @ts-nocheck: typing debt
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fixture, markdown, recordedRun, validateRun } from "./fixtures.ts";
import { Operations } from "../api/operations.ts";
import { git, integrateRun } from "../git/git.ts";
import { operatorName } from "../settings/config.ts";

test("the operator falls back from configuration to git to the OS user", (t) => {
  const { root } = fixture(t);
  assert.equal(
    operatorName({ configured: "  Named operator  " }),
    "Named operator",
  );
  assert.equal(operatorName({ configured: "x".repeat(400) }).length, 200);
  // No configured name and no repository: still attributable.
  const resolved = operatorName({ workspaceRoot: path.join(root, "absent") });
  assert.equal(typeof resolved, "string");
  assert(resolved.length > 0);
});

test("acceptance derives its evidence from a validated run and requires none without one", async (t) => {
  const { store, root } = fixture(t),
    repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "Fixture"]);
  await git(repo, ["config", "user.email", "fixture@example.invalid"]);
  fs.writeFileSync(path.join(repo, "check.mjs"), "process.exit(0)");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Prepare fixture"]);
  const ops = new Operations(store);
  await ops.execute("repository.configure", {
    id: "fixture",
    root: repo,
    checks: [[process.execPath, "check.mjs"]],
  });
  // Acceptance before any validation requires nothing and states nothing.
  const component = await ops.execute("task.accept", {
    id: "sample-task",
    componentOnly: true,
  });
  assert.equal(component.acceptanceEvidence.evidence, "");
  assert.equal(component.status, "implemented");
  const run = await recordedRun(store, {
    id: "run-accept",
    repositoryId: "fixture",
  });
  fs.writeFileSync(path.join(run.worktree, "result.txt"), "done");
  await git(run.worktree, ["add", "."]);
  await git(run.worktree, ["commit", "-m", "Complete fixture"]);
  const validation = await validateRun(store, run);
  assert.equal(validation.passed, true);
  await integrateRun(store, { id: run.id, expectedCommit: validation.commit });
  const landed = store.read().tasks[0].integration.commit;
  const accepted = await ops.execute("task.accept", { id: "sample-task" });
  assert.equal(accepted.status, "accepted");
  assert.match(
    accepted.acceptanceEvidence.evidence,
    new RegExp(`^1 configured check passed at commit ${landed.slice(0, 12)}: `),
  );
  assert.match(accepted.acceptanceEvidence.evidence, /check\.mjs$/);
  // A caller's own statement still wins.
  const restated = await ops.execute("task.accept", {
    id: "sample-task",
    evidence: "Verified the behavior by hand against the landed commit.",
  });
  assert.equal(
    restated.acceptanceEvidence.evidence,
    "Verified the behavior by hand against the landed commit.",
  );
});
