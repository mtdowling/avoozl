import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fixture } from "./fixtures.mjs";
import { RunManager } from "../manager.mjs";
import { Operations } from "../operations.mjs";
import { git } from "../git.mjs";
import { reconcileSource } from "../source-sync.mjs";

test("authorized batches integrate prerequisites before dispatching dependent work", async (t) => {
  const { store, root } = fixture(t),
    repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "Fixture"]);
  await git(repo, ["config", "user.email", "fixture@example.invalid"]);
  fs.writeFileSync(path.join(repo, "check.mjs"), "process.exit(0)");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Prepare fixture"]);
  store.mutate("Prepare dependency fixture", (data) => {
    data.statuses.find((s) => s.id === "implemented").complete = true;
    data.tasks.push({
      ...data.tasks[0],
      id: "dependent-task",
      title: "Dependent task",
    });
    data.edges.push({
      id: "dependency",
      from: "sample-task",
      to: "dependent-task",
      kind: "requires",
    });
  });
  const dispatch = [];
  let manager;
  const factory = ({ emit }) => ({
    async start(options) {
      dispatch.push(options);
      emit("session", { providerSessionId: "session-" + dispatch.length });
      emit("state", { state: "running" });
      return this;
    },
    async close() {},
  });
  manager = new RunManager(store, {
    factories: { codex: factory, claude: factory },
  });
  const ops = new Operations(store, { manager });
  t.after(() => manager.close());
  await ops.execute("project.configure", {
    id: "fixture",
    root: repo,
    checks: [[process.execPath, "check.mjs"]],
  });
  const batch = await ops.execute("batch.start", {
    taskIds: ["sample-task", "dependent-task"],
    projectId: "fixture",
    providers: ["codex", "claude"],
    parallelism: 2,
    autoIntegrate: true,
  });
  assert.equal(dispatch.length, 1);
  const first = store.get("runs", batch.runIds[0]);
  fs.writeFileSync(path.join(first.worktree, "foundation.txt"), "foundation");
  await git(first.worktree, ["add", "."]);
  await git(first.worktree, ["commit", "-m", "Build foundation"]);
  manager.receive(first.id, "turn.completed", { state: "completed" });
  for (let n = 0; n < 100 && dispatch.length < 2; n++) await delay(15);
  assert.equal(dispatch.length, 2);
  const updated = store.get("batches", batch.id),
    second = store.get("runs", updated.runIds[1]);
  assert.equal(second.provider, "claude");
  assert.equal(
    fs.readFileSync(path.join(second.worktree, "foundation.txt"), "utf8"),
    "foundation",
  );
  assert.equal(store.get("runs", first.id).state, "integrated");
  await ops.execute("batch.control", { id: batch.id, action: "pause" });
  assert.equal(store.get("batches", batch.id).state, "paused");
});
test("new Markdown is draft context, and edits flag existing tasks without resetting status", (t) => {
  const { root, store } = fixture(t),
    file = path.join(root, "draft.md");
  fs.writeFileSync(file, "# Draft\n\n- [ ] This is an unapproved proposal\n");
  const before = store.read().tasks.length;
  reconcileSource(store, root, "draft.md");
  assert.equal(store.read().tasks.length, before);
  assert.equal(store.read().documents["draft.md"].lifecycle, "draft");
  store.mutate("Link context", (data) => {
    data.tasks[0].status = "partial";
    data.tasks[0].contextDocuments = ["draft.md"];
  });
  fs.writeFileSync(file, "# Draft\n\nChanged design\n");
  reconcileSource(store, root, "draft.md");
  assert.equal(store.read().tasks[0].status, "partial");
  assert.equal(store.read().tasks[0].needsReview, true);
});
