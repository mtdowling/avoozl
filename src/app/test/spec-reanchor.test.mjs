// Reanchor a held journal by a person's record (task 56.15, R102.26). The
// journal is the local file protocol in a temporary workspace.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import {
  appendRecord,
  localJournal,
  recordDigest,
  renderRecord,
  replayJournal,
} from "../spec-journal.mjs";
import { localJournalFile } from "../spec-publication.mjs";
import { revalidateSpecs } from "../spec-scheduler.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const OPTIONS = { visibility: "private" };

async function workspace(t) {
  const { store } = fixture(t),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_testtesttesttest",
      github: { mode: "local" },
    }),
  );
  const ops = new Operations(store, {
    operator: "Operator",
    workspaceRoot: root,
    driver: { settingsFile: path.join(temporaryDirectory(), "driver.json") },
  });
  store.put("repositories", { id: "code", root, baseBranch: "main" });
  writeSpec(root, "config");
  const plan = await ops.execute("plan.create", {
    spec: "config",
    prompt: "Load config",
    context: { repositoryId: "code" },
  });
  await ops.execute("spec.publish", { planId: plan.id });
  await ops.execute("spec.takeover", { planId: plan.id });
  const file = localJournalFile(root, plan.id),
    journal = localJournal(file, "Operator");
  for (const id of ["a", "b", "c"])
    await appendRecord(
      journal,
      {
        op: `control.${id}`,
        kind: "control",
        spec: plan.id,
        controls: [{ flag: "resume", id }],
      },
      OPTIONS,
    );
  const lines = () =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    save = (entries) =>
      fs.writeFileSync(
        file,
        entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
      ),
    replay = async () =>
      replayJournal(await journal.list(), {
        ...OPTIONS,
        permission: journal.permission,
      });
  return { store, root, ops, plan, journal, lines, save, replay };
}

const reanchor = (w, input, context) =>
  w.ops.execute(
    "spec.journal.reanchor",
    { planId: w.plan.id, ...input },
    undefined,
    context,
  );

test("a mutated record restores by a person's reanchor; the spec stays held until Resume", async (t) => {
  const w = await workspace(t);
  // Someone edits record 3 ("b"): record 4 no longer links to it.
  const entries = w.lines();
  entries[2].body = entries[2].body.replace('"id":"b"', '"id":"x"');
  w.save(entries);
  const held = await w.replay();
  assert.equal(held.held, true);
  assert.deepEqual(
    held.reasons.map((r) => [r.id, r.reason]),
    [[4, "mutated"]],
  );
  const before = fs.readFileSync(localJournalFile(w.root, w.plan.id), "utf8");

  // Agents, MCP, a stale tail and an unheld record are all refused.
  await assert.rejects(
    reanchor(w, { held: [4], tail: 4, apply: true }, { mcp: true }),
    /Only a person/,
  );
  await assert.rejects(
    reanchor(w, { held: [4], tail: 3, apply: true }),
    /last record is 4/,
  );
  await assert.rejects(
    reanchor(w, { held: [2], tail: 4, apply: true }),
    /did not hold on 2/,
  );
  // A preview writes nothing and says what replay would give.
  const preview = await reanchor(w, { held: [4], tail: 4 });
  assert.equal(preview.written, false);
  assert.equal(preview.after.held, false);
  assert.equal(
    fs.readFileSync(localJournalFile(w.root, w.plan.id), "utf8"),
    before,
  );

  const done = await reanchor(w, { held: [4], tail: 4, apply: true });
  assert.equal(done.written, true);
  assert.equal(done.heldUntilResume, true);
  const after = await w.replay();
  assert.equal(after.held, false);
  // The named record's contents are dropped; no comment was rewritten.
  assert.equal(
    after.records.some((r) => r.id === 4),
    false,
  );
  assert.equal(w.lines()[2].body, entries[2].body);
  // Still held for new work until a person's Resume.
  const stopped = await revalidateSpecs(w.store, {
    workspaceRoot: w.root,
    planIds: [w.plan.id],
  });
  assert.equal(stopped.reasons.get(w.plan.id), "stopped");
  await assert.rejects(
    w.ops.execute(
      "spec.journal.resume",
      { planId: w.plan.id, tail: 4 },
      undefined,
      { mcp: true },
    ),
    /Only a person/,
  );
  await w.ops.execute("spec.journal.resume", { planId: w.plan.id, tail: 4 });
  const resumed = await revalidateSpecs(w.store, {
    workspaceRoot: w.root,
    planIds: [w.plan.id],
  });
  assert.equal(resumed.plans.size, 0);
});

test("a deleted record restores; an unnamed hold stays held", async (t) => {
  const w = await workspace(t);
  // Delete record 3: record 4 points at nothing.
  w.save(w.lines().filter((entry) => entry.id !== 3));
  assert.deepEqual(
    (await w.replay()).reasons.map((r) => [r.id, r.reason]),
    [[4, "missing"]],
  );
  const done = await reanchor(w, { held: [4], tail: 4, apply: true });
  assert.equal(done.after.held, false);

  // Two problems, one named: the other still holds and no hold is written.
  const v = await workspace(t);
  const entries = v.lines();
  entries[1].body = entries[1].body.replace('"id":"a"', '"id":"y"');
  entries[2].body = entries[2].body.replace('"id":"b"', '"id":"z"');
  v.save(entries);
  const reasons = (await v.replay()).reasons.map((r) => r.id);
  assert.deepEqual(reasons, [3, 4]);
  const partial = await reanchor(v, { held: [3], tail: 4, apply: true });
  assert.equal(partial.after.held, true);
  assert.deepEqual(
    partial.after.reasons.map((r) => r.id),
    [4],
  );
  assert.equal(partial.heldUntilResume, undefined);
});

test("replay refuses a reanchor whose tail is not the record it reached", async (t) => {
  const w = await workspace(t);
  const entries = w.lines();
  entries[2].body = entries[2].body.replace('"id":"b"', '"id":"x"');
  w.save(entries);
  const replay = await w.replay(),
    forged = {
      v: 1,
      op: "reanchor.forged",
      kind: "reanchor",
      spec: w.plan.id,
      generation: replay.generation,
      held: [4],
      prev: { id: replay.tail.id, digest: "0".repeat(64) },
    };
  w.save([
    ...entries,
    { id: 99, body: renderRecord(forged, OPTIONS), author: "Operator" },
  ]);
  const after = await w.replay();
  assert.equal(after.held, true);
  assert.ok(after.reasons.some((r) => r.id === 4));
  assert.ok(after.reasons.some((r) => r.id === 99));
  assert.notEqual(recordDigest(forged), replay.tail.digest);
});
