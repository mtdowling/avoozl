// An approval carries across a pure move from avoozl/manifest.json to Facts
// bullets (Requirement 111.6, design §4.40): the same prose and parsed tasks
// keep the approval with a receipt that names the hash it came from. Any
// one-character change leaves a draft for a normal approval.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../api/operations.mjs";
import { fixture } from "./fixtures.mjs";
import { legacyHash } from "./legacy-facts.mjs";
import { legacySpecFiles, writeSpec } from "./spec-fixture.mjs";

// A workspace whose spec was approved before the conversion: its stored
// plan and receipt hold the old layout and the old hash, as a database
// from before Requirement 111 does. The folder on disk is converted.
async function approvedBefore(t) {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root }),
    directory = writeSpec(root, "config"),
    plan = await ops.execute("plan.create", { spec: "config" }),
    preview = await ops.execute("plan.preview", { id: "config" });
  await ops.execute("plan.approve", {
    id: "config",
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
    approvedBy: "owner",
  });
  const old = legacySpecFiles(),
    oldHash = legacyHash(old),
    stored = store.get("plans", "config"),
    receipt = store.get("approvals", stored.approvalId);
  // Receipts are append-only; this stands in for one written back then.
  store.db
    .prepare("UPDATE approvals SET hash = ?, body = ? WHERE id = ?")
    .run(
      oldHash,
      JSON.stringify({ ...receipt, hash: oldHash, files: old }),
      receipt.id,
    );
  store.put("plans", {
    ...stored,
    hash: oldHash,
    files: old,
    text: old["tasks.md"],
  });
  return { root, store, ops, directory, oldHash };
}

const save = (ops, oldHash) =>
  ops.execute("plan.save", { id: "config", expectedHash: oldHash });

test("the same content in the Facts layout keeps its approval", async (t) => {
  const { store, ops, oldHash } = await approvedBefore(t),
    before = store.list("approvals").length;
  const saved = await save(ops, oldHash);
  assert.equal(saved.state, "approved");
  assert.notEqual(saved.hash, oldHash);
  const receipts = store.list("approvals").filter((a) => a.planId === "config");
  assert.equal(receipts.length, before + 1);
  const carried = receipts.find((a) => a.hash === saved.hash);
  assert.equal(carried.carriedFrom, oldHash);
  assert.equal(carried.approvedBy, "owner");
  assert.equal(saved.approvalId, carried.id);
  // Issues keep the hash they were projected at.
  assert.equal(store.get("plans", "config").issueHash, oldHash);
  const tasks = store.read().tasks.filter((task) => task.planId === "config");
  assert.ok(tasks.length === 3 && tasks.every((task) => !task.needsReview));
  // The spec page lists it with the hash it came from.
  const got = await ops.execute("plan.get", { id: "config" });
  assert.equal(
    got.approvals.find((a) => a.hash === saved.hash).carriedFrom,
    oldHash,
  );
});

for (const [what, file, from, to] of [
  ["prose", "design.md", "A loader, then", "A loader. then"],
  ["after", "tasks.md", "      - after: 1.1", "      - after: 1"],
  [
    "summary",
    "tasks.md",
    "    - Report unknown keys.",
    "    - Report unknown key.",
  ],
  ["done", "tasks.md", "reported with its path.", "reported with its path!"],
])
  test(`a one-character change in ${what} needs a normal approval`, async (t) => {
    const { store, ops, directory, oldHash } = await approvedBefore(t),
      target = path.join(directory, file),
      text = fs.readFileSync(target, "utf8");
    assert.ok(text.includes(from), `${file} has ${from}`);
    fs.writeFileSync(target, text.replace(from, to));
    const before = store.list("approvals").length,
      saved = await save(ops, oldHash);
    assert.equal(saved.state, "draft");
    assert.equal(store.list("approvals").length, before);
    assert.equal(
      store.list("approvals").some((a) => a.carriedFrom),
      false,
    );
  });
