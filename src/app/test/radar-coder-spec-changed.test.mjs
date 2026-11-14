// rc-2.5: Spec changed. Fake GitHub only. Nearby inputs checked: an edited
// task with an unclaimed issue, with a claimed issue and with no issue; an
// added task; a removed task with an unclaimed, a claimed, a closed and a
// shared (batch) issue; a preview that writes nothing; apply before the
// spec is approved again; apply twice; a manifest edit that leaves the title.
import assert from "node:assert/strict";
import test from "node:test";
import { applySpecChange, diffSpec, planSpecChange } from "../spec-changed.mjs";
import {
  BATCH_SPEC,
  COMMIT,
  approvedSpec,
  workspace,
} from "./radar-fixture.mjs";
import { writeSpec } from "./spec-fixture.mjs";

const edit = (spec, key, change) => {
  const manifest = JSON.parse(spec["avoozl/manifest.json"]);
  Object.assign(manifest.tasks[key], change);
  return { ...spec, "avoozl/manifest.json": JSON.stringify(manifest) };
};
const without = (spec, key) => {
  const manifest = JSON.parse(spec["avoozl/manifest.json"]);
  delete manifest.tasks[key];
  manifest.tasks[1].requires = manifest.tasks[1].requires.filter(
    (id) => id !== key,
  );
  return {
    "tasks.md": spec["tasks.md"]
      .split("\n")
      .filter((line) => !line.includes(` ${key} `))
      .join("\n"),
    "avoozl/manifest.json": JSON.stringify(manifest),
  };
};

test("diffSpec names edited, added and removed tasks", () => {
  const after = edit(BATCH_SPEC, "1.4", { acceptance: ["Changed."] }),
    rows = diffSpec("config", BATCH_SPEC, {
      ...after,
      "tasks.md": after["tasks.md"] + "  - [ ] 1.5 Fifth\n",
    });
  assert.deepEqual(
    rows.map((row) => [row.taskId, row.change]),
    [
      ["config.1.4", "edited"],
      ["config.1.5", "added"],
    ],
  );
  const removed = diffSpec("config", BATCH_SPEC, without(BATCH_SPEC, "1.3"));
  assert.deepEqual(
    removed.map((row) => [row.taskId, row.change]),
    [
      ["config.1", "edited"],
      ["config.1.3", "removed"],
    ],
  );
  assert.deepEqual(diffSpec("config", BATCH_SPEC, BATCH_SPEC), []);
});

test("each change maps to one action by the issue's state", () => {
  const issue = (extra) => ({
    repository: "example/code",
    number: 7,
    state: "open",
    claimed: false,
    shared: false,
    ...extra,
  });
  const action = (change, issues) => {
    const row = planSpecChange({
      name: "config",
      before: BATCH_SPEC,
      after:
        change === "removed"
          ? without(BATCH_SPEC, "1.3")
          : edit(BATCH_SPEC, "1.3", { acceptance: ["Changed."] }),
      issues: new Map(issues ? [["config.1.3", issue(issues)]] : []),
    }).find((entry) => entry.taskId === "config.1.3");
    return row.action;
  };
  assert.equal(action("edited", {}), "update");
  assert.equal(action("edited", { claimed: true }), "comment");
  assert.equal(action("edited", { state: "closed" }), "none");
  assert.equal(action("edited", null), "none");
  assert.equal(action("removed", {}), "close");
  assert.equal(action("removed", { claimed: true }), "comment");
  assert.equal(action("removed", { shared: true }), "comment");
  assert.equal(action("removed", { state: "closed" }), "none");
});

test("apply is refused until the spec is approved again", async () => {
  await assert.rejects(
    applySpecChange({}, { rows: [], approved: false }),
    /Approve the spec again/,
  );
});

async function scenario(t) {
  const context = await workspace(t, {
      mode: "single-repo",
      coder: "issue-radar",
    }),
    spec = await approvedSpec(context, { overrides: BATCH_SPEC });
  await context.ops.execute("github.project", { planId: spec.plan.id });
  return { ...context, ...spec };
}
const issueOf = (github, id) =>
  github.created.find((issue) => issue.body.includes(`"taskId":"${id}"`));

async function reapprove(context, overrides) {
  const { store, ops, root, plan } = context;
  writeSpec(root, "config", overrides);
  const current = store.get("plans", plan.id),
    saved = await ops.execute("plan.save", {
      id: plan.id,
      expectedHash: current.hash,
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
  return saved;
}

test("a spec edit writes nothing until applied; claimed issues are never edited", async (t) => {
  const context = await scenario(t),
    { github, ops, plan } = context,
    claimed = issueOf(github, "config.1.2"),
    removed = issueOf(github, "config.1.3"),
    edited = issueOf(github, "config.1.4"),
    claimedBody = claimed.body,
    editedBody = edited.body;
  claimed.labels.push({ name: "crew: in progress" });
  let next = edit(BATCH_SPEC, "1.4", { acceptance: ["Fourth is changed."] });
  next = edit(next, "1.2", { acceptance: ["Second is changed."] });
  next = {
    ...next,
    "avoozl/manifest.json": JSON.stringify({
      tasks: {
        ...(({ 1: top, ...rest }) => ({
          1: { ...top, requires: [...top.requires, "1.5"] },
          ...rest,
        }))(JSON.parse(without(next, "1.3")["avoozl/manifest.json"]).tasks),
        1.5: {
          kind: "leaf",
          summary: "Fifth",
          acceptance: ["Fifth works."],
          checks: ["npm test"],
          completion: "integrated",
        },
      },
    }),
    "tasks.md": without(next, "1.3")["tasks.md"].replace(
      "  - [ ] 1.4 Fourth",
      "  - [ ] 1.4 Fourth\n  - [ ] 1.5 Fifth",
    ),
  };
  await reapprove(context, next);
  const writes = () => [
    github.created.length,
    github.updated.length,
    github.comments.length,
  ];
  const before = writes(),
    preview = await ops.execute("spec.changed.preview", { planId: plan.id }),
    byTask = Object.fromEntries(preview.rows.map((r) => [r.taskId, r]));
  assert.deepEqual(writes(), before, "the preview writes nothing");
  assert.equal(preview.approved, true);
  assert.equal(byTask["config.1.4"].action, "update");
  assert.equal(byTask["config.1.2"].action, "comment");
  assert.equal(byTask["config.1.3"].action, "close");
  assert.equal(byTask["config.1.5"].action, "create");

  const result = await ops.execute("spec.changed.apply", { planId: plan.id });
  assert.deepEqual(
    result.done
      .filter((entry) => entry.taskId !== "config.1")
      .map((entry) => [entry.taskId, entry.action])
      .sort(),
    [
      ["config.1.2", "comment"],
      ["config.1.3", "close"],
      ["config.1.4", "update"],
      ["config.1.5", "create"],
    ],
  );
  assert.equal(claimed.body, claimedBody, "a claimed issue is not edited");
  assert.equal(github.comments.length, 1);
  assert.equal(github.comments[0].number, claimed.number);
  assert.equal(removed.state, "closed");
  assert.equal(removed.state_reason, "not_planned");
  assert.notEqual(edited.body, editedBody);
  assert.ok(issueOf(github, "config.1.5"), "the added task has an issue");

  await assert.rejects(
    ops.execute("spec.changed.apply", { planId: plan.id }),
    /already applied/,
  );
});

test("apply is refused while the new revision is a draft", async (t) => {
  const context = await scenario(t),
    { store, ops, root, plan } = context;
  writeSpec(root, "config", edit(BATCH_SPEC, "1.4", { acceptance: ["New."] }));
  await ops.execute("plan.save", {
    id: plan.id,
    expectedHash: store.get("plans", plan.id).hash,
  });
  const preview = await ops.execute("spec.changed.preview", {
    planId: plan.id,
  });
  assert.equal(preview.approved, false);
  assert.equal(
    preview.rows.find((row) => row.taskId === "config.1.4").action,
    "update",
  );
  await assert.rejects(
    ops.execute("spec.changed.apply", { planId: plan.id }),
    /Approve the spec again/,
  );
});

test("the projection preview offers batches and honors the ones asked for", async (t) => {
  const { ops, plan, github } = await (async () => {
      const context = await workspace(t, {
          mode: "single-repo",
          coder: "issue-radar",
        }),
        spec = await approvedSpec(context, {
          overrides: {
            ...BATCH_SPEC,
            "avoozl/manifest.json": JSON.stringify({
              tasks: Object.fromEntries(
                Object.entries(
                  JSON.parse(BATCH_SPEC["avoozl/manifest.json"]).tasks,
                ).map(([key, task]) => [
                  key,
                  task.kind === "leaf" ? { ...task, size: "small" } : task,
                ]),
              ),
            }),
          },
        });
      return { ...context, ...spec };
    })(),
    plain = await ops.execute("plan.issues.preview", { planId: plan.id }),
    batched = await ops.execute("plan.issues.preview", {
      planId: plan.id,
      batches: [["config.1.1", "config.1.2"]],
    }),
    creates = (preview) =>
      preview.writes.filter((write) => write.kind === "issue.create").length;
  assert.ok(Array.isArray(plain.suggestedBatches));
  assert.equal(creates(plain) - creates(batched), 1);
  assert.equal(github.created.length, 0, "a preview writes nothing");
});
