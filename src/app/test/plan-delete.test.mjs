// Deleting a plan: a draft is only marked deleted; a plan with an approved
// revision is retired in one transaction, only by a person, and its spec
// folder leaves the working tree only when asked and clean.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

const task = (id, extra = {}) => ({
  id,
  title: id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Done."],
  ...extra,
});

function setup(t, plan) {
  const { root, store } = fixture(t);
  store.mutate("seed", (data) => {
    data.tasks.push(
      task("p.1", { planId: plan.id }),
      task("p.2", { planId: plan.id, status: "accepted" }),
      task("outside"),
    );
    data.edges.push({ from: "p.1", to: "outside", kind: "requires" });
  });
  store.transaction(() => store.put("plans", plan));
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

test("a draft is marked deleted and kept", async (t) => {
  const { store, ops } = setup(t, { id: "d1", title: "Draft", state: "draft" });
  const preview = await ops.execute("plan.delete.preview", { id: "d1" });
  assert.equal(preview.retire, false);
  const result = await ops.execute("plan.delete", { id: "d1" });
  assert.equal(result.retired, false);
  assert.ok(
    store.get("plans", "d1").deletedAt,
    "the row stays, marked deleted",
  );
});

test("an approved plan needs retire, archives open tasks and opens decisions", async (t) => {
  const { store, ops } = setup(t, {
    id: "a1",
    title: "Shared",
    state: "approved",
    mapping: { x: "p.1" },
  });
  const preview = await ops.execute("plan.delete.preview", { id: "a1" });
  assert.deepEqual(
    [
      preview.retire,
      preview.open,
      preview.running,
      preview.done,
      preview.dependents,
    ],
    [true, 1, 0, 1, 1],
  );
  await assert.rejects(
    ops.execute("plan.delete", { id: "a1" }),
    /retire: true/,
  );
  await assert.rejects(
    ops.execute("plan.delete", { id: "a1", retire: true }, undefined, {
      caller: "session-1",
    }),
    /Only a person deletes a plan/,
  );
  await assert.rejects(
    ops.execute("plan.delete", { id: "a1", retire: true }, undefined, {
      mcp: true,
    }),
    /Only a person/,
  );
  const result = await ops.execute("plan.delete", { id: "a1", retire: true });
  assert.deepEqual(
    [result.retired, result.archived, result.decisions],
    [true, 1, 1],
  );
  const data = store.read();
  const byId = (id) => data.tasks.find((x) => x.id === id);
  assert.ok(byId("p.1").archivedAt, "open task archived, row kept");
  assert.equal(byId("p.2").archivedAt, undefined, "done task untouched");
  assert.match(
    byId("outside").decision,
    /waits on p\.1, from the deleted plan Shared/,
  );
  assert.ok(store.get("plans", "a1").retiredAt);
});

test("the spec folder goes only when asked and clean, and is never committed", async (t) => {
  const { root, store, ops } = setup(t, {
    id: "s1",
    title: "Spec",
    state: "draft",
    spec: "demo",
  });
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "a@example.com");
  git("config", "user.name", "A");
  const folder = path.join(root, ".kiro", "specs", "demo");
  fs.mkdirSync(folder, { recursive: true });
  for (const file of ["requirements.md", "design.md", "tasks.md"])
    fs.writeFileSync(path.join(folder, file), `# ${file}\n`);
  fs.mkdirSync(path.join(folder, "avoozl"));
  fs.writeFileSync(path.join(folder, "avoozl", "manifest.json"), "{}\n");
  // Uncommitted: refused, nothing changes.
  await assert.rejects(
    ops.execute("plan.delete", { id: "s1", deleteSpecFolder: true }),
    /changes Git has not committed/,
  );
  assert.equal(store.get("plans", "s1").deletedAt, undefined);
  assert.ok(fs.existsSync(folder));
  git("add", ".");
  git("commit", "-qm", "spec");
  const head = git("rev-parse", "HEAD");
  const preview = await ops.execute("plan.delete.preview", { id: "s1" });
  assert.equal(preview.folder.path, folder);
  assert.equal(preview.folder.dirty, false);
  const result = await ops.execute("plan.delete", {
    id: "s1",
    deleteSpecFolder: true,
  });
  assert.equal(result.removedFolder, folder);
  assert.equal(fs.existsSync(folder), false);
  assert.equal(git("rev-parse", "HEAD"), head, "no commit");
});
