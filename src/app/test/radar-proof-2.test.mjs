// Proof 2 (rc-p2): spec to issues in both modes. Run on a fake GitHub in an
// isolated temporary workspace; no real repository is written.
import assert from "node:assert/strict";
import test from "node:test";
import { writeSpec } from "./spec-fixture.mjs";
import {
  COMMIT,
  approvedSpec,
  mergeAndClose,
  workspace,
} from "./radar-fixture.mjs";

const leaf = (summary, extra = {}) => ({
  kind: "leaf",
  summary,
  acceptance: [summary + " works."],
  checks: ["npm test"],
  completion: "integrated",
  ...extra,
});
// Eight tasks: the package 1 and leaves 1.1 to 1.7. Leaves 1.1, 1.2 and 1.3
// are small and ready in one phase; 1.4 needs 1.1; the rest are larger.
const manifest = (changes = {}) => ({
  tasks: {
    1: {
      kind: "package",
      summary: "The goal.",
      requires: ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7"],
      acceptance: ["All work."],
    },
    1.1: leaf("First", { size: "small" }),
    1.2: leaf("Second", { size: "small" }),
    1.3: leaf("Third", { size: "small" }),
    1.4: leaf("Fourth", { requires: ["1.1"] }),
    1.5: leaf("Fifth", {}),
    1.6: leaf("Sixth", {}),
    1.7: leaf("Seventh", {}),
    ...changes,
  },
});
const spec = (changes) => ({
  "tasks.md": [
    "# Tasks",
    "",
    "- [ ] 1 Goal",
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => `  - [ ] 1.${n} Task ${n}`),
    "",
  ].join("\n"),
  "avoozl/manifest.json": JSON.stringify(manifest(changes)),
});
const BATCH = ["config.1.1", "config.1.2", "config.1.3"];
const managed = (issue) =>
  JSON.parse(issue.body.match(/<!-- avoozl-task\n(.*)\n-->/)[1]);
const issueOf = (github, id) =>
  github.created.find((issue) => managed(issue).taskId === id);
const taskOf = (store, id) => store.read().tasks.find((task) => task.id === id);

for (const mode of ["single-repo", "plans-repo"])
  test(`Proof 2 (${mode}): spec to issues, one batch, one merge, spec edit`, async (t) => {
    const context = await workspace(t, { mode, coder: "issue-radar" }),
      { github, store, ops, root } = context,
      { plan } = await approvedSpec(context, { overrides: spec() });
    // Preview: suggests the batch of three; nothing is written.
    const preview = await ops.execute("plan.issues.preview", {
      planId: plan.id,
    });
    assert.deepEqual(preview.suggestedBatches, [BATCH]);
    assert.equal(github.created.length, 0);
    // Confirm.
    await ops.execute("github.project", { planId: plan.id, batches: [BATCH] });
    const repositories = new Set(github.created.map((i) => i.repository));
    assert.deepEqual([...repositories], ["example/code"]);
    // The spec's own issue, the package, one batch issue and four more.
    assert.equal(github.created.length, 7);
    const batch = github.created.find((issue) => managed(issue).members);
    assert.deepEqual(managed(batch).members, BATCH);
    // Sub-issues: the five task issues sit under the package.
    const parent = issueOf(github, "config.1");
    assert.equal(
      github.subIssues.filter(([number]) => number === parent.number).length,
      5,
    );
    // Blocked-by: 1.4 is blocked by the batch issue.
    const four = issueOf(github, "config.1.4");
    assert.deepEqual(
      [
        ...(
          github.blockers.get(`example/code#${four.number}`) ?? new Map()
        ).keys(),
      ],
      [batch.id],
    );
    // One merge closes all three batched tasks.
    mergeAndClose(github, batch);
    await ops.execute("workspace.tick", { sessions: [] });
    for (const id of BATCH)
      assert.equal(taskOf(store, id).githubVerdict?.state, "verified", id);
    // Edit the spec: 1.5 (unclaimed) changes, 1.6 (claimed) changes.
    const claimed = issueOf(github, "config.1.6"),
      claimedBody = claimed.body,
      unclaimed = issueOf(github, "config.1.5"),
      unclaimedBody = unclaimed.body,
      untouched = issueOf(github, "config.1.7").body;
    claimed.labels.push({ name: "crew: in progress" });
    writeSpec(
      root,
      "config",
      spec({
        1.5: leaf("Fifth", { acceptance: ["Fifth changed."] }),
        1.6: leaf("Sixth", { acceptance: ["Sixth changed."] }),
      }),
    );
    const saved = await ops.execute("plan.save", {
      id: plan.id,
      expectedHash: store.get("plans", plan.id).hash,
    });
    await ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: saved.hash,
      expectedRevision: store.read().revision,
    });
    store.setMeta(`spec-approval:${plan.id}:${saved.hash}`, {
      state: "merged",
      commit: COMMIT,
      approvedBy: "octocat",
    });
    const writes = () => [github.created.length, github.updated.length];
    const before = writes(),
      changed = await ops.execute("spec.changed.preview", { planId: plan.id });
    assert.deepEqual(writes(), before, "the preview writes nothing");
    const actions = Object.fromEntries(
      changed.rows.map((row) => [row.taskId, row.action]),
    );
    assert.equal(actions["config.1.5"], "update");
    assert.equal(actions["config.1.6"], "comment");
    await ops.execute("spec.changed.apply", { planId: plan.id });
    assert.equal(github.comments.length, 1);
    assert.equal(github.comments[0].number, claimed.number);
  });
