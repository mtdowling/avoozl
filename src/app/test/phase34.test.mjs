// Phase 34 parts the P45 proof does not reach (tasks 34.2, 34.4–34.6): the
// other correction sources, the evidence export, fix work from a GitHub
// Bug, and the manifest's investigate and ship fields. Every value is fake.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { pickAgain, retryDelivery, shipMode } from "../delivery.mjs";
import { revertCorrections, recordCorrection } from "../corrections.mjs";
import {
  addEvidence,
  exportEvidence,
  importEvidence,
  taskEvidence,
} from "../evidence.mjs";
import { isFixWork } from "../flow.mjs";
import { validateProposal } from "../plans.mjs";
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
  store.importSnapshot({
    ...snapshot(),
    tasks: [leaf("a"), leaf("b")],
    edges: [],
  });
  store.put("projects", {
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

test("Pick again and Send back with a reason, and a revert, are corrections", async (t) => {
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
  pickAgain(w.store, { taskId: "a" });
  assert.equal(w.store.list("corrections").length, 0, "no reason, none");
  pickAgain(w.store, { taskId: "a", reason: "Wrong model for UI work." });
  pickAgain(w.store, { taskId: "a", reason: "Wrong model for UI work." });
  assert.throws(() =>
    pickAgain(w.store, { taskId: "a", reason: "x".repeat(301) }),
  );
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
    ["a", "pick-again", null],
    ["a", "reverted", "Pat"],
    ["b", "sent-back", "dashboard"],
  ]);
  // The decision is in b's evidence bundle.
  const entries = taskEvidence(w.store, { taskId: "b" }).entries;
  assert.match(entries[0].text, /Sent back by a person: Keep the old API\./);
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

test("the driver export carries the bundles and a take-over restores them", (t) => {
  const w = workspace(t);
  addEvidence(w.store, "a", {
    kind: "check",
    source: "t",
    text: "npm test: exit 1",
  });
  const exported = exportEvidence(w.store, ["a", "b"]);
  assert.deepEqual(Object.keys(exported), ["a"]);
  const other = workspace(t);
  importEvidence(other.store, exported);
  assert.equal(
    taskEvidence(other.store, { taskId: "a" }).entries[0].text,
    "npm test: exit 1",
  );
});

test("fix work, and the manifest's investigate and ship fields", () => {
  assert.equal(isFixWork(leaf("x", { github: { issueType: "Bug" } })), true);
  assert.equal(isFixWork(leaf("x", { type: "fix" })), true);
  assert.equal(isFixWork(leaf("x", { flowFix: { stop: "s" } })), true);
  assert.equal(isFixWork(leaf("x", { type: "feature" })), false);
  for (const bad of [{ investigate: "yes" }, { ship: "auto" }, { specShip: 1 }])
    assert.throws(() => validateProposal({ ...leaf("x"), ...bad }));
  validateProposal({ ...leaf("x"), investigate: false, ship: "manual" });
  const policy = {
    ship: "manual",
    repositories: { lib: { ship: "auto-merge" } },
  };
  assert.equal(shipMode(policy, leaf("x")), "manual");
  assert.equal(
    shipMode(policy, leaf("x", { repository: "lib" })),
    "auto-merge",
  );
  assert.equal(
    shipMode(policy, leaf("x", { repository: "lib", specShip: "manual" })),
    "manual",
  );
  assert.equal(
    shipMode(policy, leaf("x", { specShip: "manual", ship: "auto-merge" })),
    "auto-merge",
  );
  assert.equal(shipMode(null, leaf("x")), "auto-merge");
});

test("a spec's ship mode and a bugfix spec's type reach each leaf", async () => {
  const { parseSpec } = await import("../spec-plans.mjs");
  const { specFiles } = await import("./spec-fixture.mjs");
  const files = specFiles(),
    manifest = JSON.parse(files["avoozl/manifest.json"]);
  manifest.ship = "manual";
  manifest.tasks["1.1"].investigate = false;
  const bugfix = {
    ...files,
    "avoozl/manifest.json": JSON.stringify(manifest),
    "bugfix.md": "# Bug\n\nThe loader drops empty lines.\n",
  };
  delete bugfix["requirements.md"];
  const parsed = parseSpec({ name: "fix-loader", exists: true, files: bugfix });
  const leaves = parsed.proposals.filter((p) => p.kind === "leaf");
  assert.equal(leaves.length, 2, JSON.stringify(parsed.diagnostics));
  for (const p of leaves) {
    assert.equal(p.specShip, "manual");
    assert.equal(p.specType, "bugfix");
  }
  assert.equal(leaves.find((p) => p.specKey === "1.1").investigate, false);
  manifest.ship = "sometimes";
  const bad = parseSpec({
    name: "fix-loader",
    exists: true,
    files: { ...bugfix, "avoozl/manifest.json": JSON.stringify(manifest) },
  });
  assert.ok(bad.diagnostics.some((d) => /ship must be/.test(d.message)));
});
