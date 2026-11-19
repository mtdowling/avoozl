// rc-2.5: Spec changed. Fake GitHub only. Nearby inputs checked: an edited
// task with an unclaimed issue, with a claimed issue and with no issue; an
// added task; a removed task with an unclaimed, a claimed, a closed and a
// shared (batch) issue; a preview that writes nothing; apply before the
// spec is approved again; apply twice; a manifest edit that leaves the title.
import assert from "node:assert/strict";
import test from "node:test";
import { diffSpec as diffFolded } from "../spec-changed.mjs";
import {
  BATCH_SPEC,
  COMMIT,
  approvedSpec,
  workspace,
} from "../../test/projection-fixture.mjs";
import { withFacts, writeSpec } from "../../test/spec-fixture.mjs";

// These cases describe facts as manifest objects; the reader sees Facts.
const diffSpec = (name, before, after) =>
  diffFolded(name, withFacts(before), withFacts(after));

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

async function scenario(t) {
  const context = await workspace(t, {
      mode: "single-repo",
    }),
    spec = await approvedSpec(context, { overrides: BATCH_SPEC });
  await context.ops.execute("github.repository", { planId: spec.plan.id });
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
