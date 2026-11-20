// Phase 34 parts the P45 proof does not reach (tasks 34.2, 34.4–34.6): the
// other correction sources, fix work from a GitHub
// Bug, and the manifest's investigate and ship fields. Every value is fake.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../api/operations.mjs";
import { Store } from "../store/store.mjs";
import { retryDelivery } from "../delivery/delivery.mjs";
import { revertCorrections, recordCorrection } from "../flow/corrections.mjs";
import { isFixWork } from "../flow/flow.mjs";
import { validateProposal } from "../specs/plans.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "app",
  ...extra,
});

function workspace(t) {
  const root = temporaryDirectory("avoozl-p34-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Pat");
  git(checkout, "config", "user.email", "pat@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize({
    ...snapshot(),
    tasks: [leaf("a"), leaf("b")],
    edges: [],
  });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, delivery: {} }),
  );
  const ops = new Operations(store, { workspaceRoot: root });
  return { root, checkout: fs.realpathSync.native(checkout), store, ops };
}

test("Send back with a reason, and a revert, are corrections", async (t) => {
  const w = workspace(t);
  w.store.put("session_bindings", {
    id: "s1",
    slot: "s1",
    taskId: "a",
    role: "worker",
    attempt: 1,
    source: "tick",
    boundAt: new Date().toISOString(),
  });
  w.store.put("task_deliveries", {
    id: "b",
    taskId: "b",
    state: "decision",
    attempts: [{ attempt: 1, outcome: "failed", cause: "x" }],
  });
  assert.throws(
    () =>
      retryDelivery(
        w.store,
        { taskId: "b", reason: "Keep the old API." },
        { mcp: true },
      ),
    (e) => e.status === 403,
  );
  retryDelivery(w.store, { taskId: "b", reason: "Keep the old API." });
  // An integrated agent commit, then a person reverts it on main.
  fs.writeFileSync(path.join(w.checkout, "a.txt"), "a\n");
  git(w.checkout, "add", ".");
  git(w.checkout, "commit", "-m", "a");
  const sha = git(w.checkout, "rev-parse", "HEAD");
  w.store.put("task_deliveries", {
    id: "a",
    taskId: "a",
    state: "integrated",
    commit: sha,
    integratedCommit: sha,
    attempts: [],
  });
  git(w.checkout, "revert", "--no-edit", sha);
  await revertCorrections(w.store);
  await revertCorrections(w.store);
  const rows = w.store
    .list("corrections")
    .map((c) => [c.taskId, c.kind, c.by])
    .sort();
  assert.deepEqual(rows, [
    ["a", "reverted", "Pat"],
    ["b", "sent-back", "dashboard"],
  ]);
  // A summary is cut to 300 characters; a secret is saved redacted.
  const long = recordCorrection(w.store, {
    key: "x1",
    taskId: "a",
    kind: "sent-back",
    summary: "y".repeat(400),
  });
  assert.equal(long.summary.length, 300);
  const secret = recordCorrection(w.store, {
    key: "x2",
    taskId: "a",
    kind: "sent-back",
    summary: "ghp_" + "b".repeat(36),
  });
  assert.equal(secret.redacted, true);
  assert.doesNotMatch(JSON.stringify(w.store.list("corrections")), /ghp_b/);
});

test("fix work and the investigate fact", () => {
  assert.equal(isFixWork(leaf("x", { github: { issueType: "Bug" } })), true);
  assert.equal(isFixWork(leaf("x", { type: "fix" })), true);
  assert.equal(isFixWork(leaf("x", { flowFix: { stop: "s" } })), true);
  assert.equal(isFixWork(leaf("x", { type: "feature" })), false);
  assert.throws(() => validateProposal({ ...leaf("x"), investigate: "yes" }));
  validateProposal({ ...leaf("x"), investigate: false });
});

test("a bugfix spec's type reaches each leaf", async () => {
  const { parseSpec } = await import("../specs/spec-plans.mjs");
  const { legacySpecFiles, withFacts } = await import("./spec-fixture.mjs");
  const files = legacySpecFiles(),
    manifest = JSON.parse(files["avoozl/manifest.json"]);
  manifest.tasks["1.1"].investigate = false;
  const bugfix = withFacts({
    ...files,
    "avoozl/manifest.json": JSON.stringify(manifest),
    "bugfix.md": "# Bug\n\nThe loader drops empty lines.\n",
  });
  delete bugfix["requirements.md"];
  const parsed = parseSpec({ name: "fix-loader", exists: true, files: bugfix });
  const leaves = parsed.proposals.filter((p) => p.kind === "leaf");
  assert.equal(leaves.length, 2, JSON.stringify(parsed.diagnostics));
  for (const p of leaves) assert.equal(p.specType, "bugfix");
  assert.equal(leaves.find((p) => p.specKey === "1.1").investigate, false);
});
