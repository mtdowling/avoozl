// Proof 4 (rc-p4): release honors N, scopes, phases and the stop. Run on a
// fake GitHub in an isolated temporary workspace; no real issue is labeled.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CLAIM,
  READY,
  labelsOf,
  leaf,
  setup,
} from "./radar-coder-release-fixture.mjs";

const DOCS = "docs-ready";

test("Proof 4: never more than N ready per scope, phase 2 waits, a stop clears unclaimed labels only", async (t) => {
  // Two crews: the `ready` scope and the `docs-ready` scope, N=1 each.
  // Phase 1: code-a, code-b, docs-a, docs-b. Phase 2: code-c, docs-c.
  const w = await setup(
    t,
    { release: { capacity: 1, scopes: [{ label: DOCS, capacity: 1 }] } },
    [
      leaf("code-a"),
      leaf("code-b"),
      leaf("docs-a", { scope: DOCS }),
      leaf("docs-b", { scope: DOCS }),
      leaf("code-c"),
      leaf("docs-c", { scope: DOCS }),
    ],
  );
  const [codeA, codeB, docsA, docsB, codeC, docsC] = w.approved.taskIds;
  w.store.mutate("Phases", (data) => {
    for (const [id, phase] of [
      [codeA, "p1"],
      [codeB, "p1"],
      [docsA, "p1"],
      [docsB, "p1"],
      [codeC, "p2"],
      [docsC, "p2"],
    ])
      data.tasks.find((task) => task.id === id).phase = {
        id: phase,
        title: phase,
      };
  });
  const has = (id, label) => labelsOf(w.issueOf(id)).includes(label);
  // Counts open issues holding a scope's label, claimed or not.
  const open = (label) =>
    w.approved.taskIds.filter(
      (id) => has(id, label) && w.issueOf(id).state !== "closed",
    );
  const bounded = () => {
    assert.ok(open(READY).length <= 1, "ready scope over N");
    assert.ok(open(DOCS).length <= 1, "docs scope over N");
  };
  const merge = (id) => {
    Object.assign(w.issueOf(id), {
      state: "closed",
      state_reason: "completed",
    });
    w.store.mutate("Merged", (data) => {
      const task = data.tasks.find((entry) => entry.id === id);
      task.githubVerdict = { state: "verified" };
      task.status = "accepted";
    });
  };
  const claim = (id) => w.issueOf(id).labels.push({ name: CLAIM });
  const comments = (id) =>
    w.github.comments.filter((c) => c.number === w.issueOf(id).number).length;

  // Tick 1: one per scope, in graph order; phase 2 holds nothing.
  await w.tick();
  bounded();
  assert.deepEqual([has(codeA, READY), has(docsA, DOCS)], [true, true]);
  assert.deepEqual(
    [codeB, docsB, codeC, docsC].map((id) => has(id, READY) || has(id, DOCS)),
    [false, false, false, false],
  );
  // Crews claim; the claims keep their slots, so nothing more is released.
  claim(codeA);
  claim(docsA);
  for (let i = 0; i < 3; i += 1) await w.tick();
  bounded();
  assert.equal(has(codeB, READY) || has(docsB, DOCS), false);
  // Each crew merges its pull request; the next of phase 1 is released.
  merge(codeA);
  merge(docsA);
  await w.tick();
  bounded();
  assert.deepEqual([has(codeB, READY), has(docsB, DOCS)], [true, true]);
  assert.equal(has(codeC, READY) || has(docsC, DOCS), false, "phase 2 waits");
  // Phase 1 is whole once both merge; phase 2 is then released, N each.
  claim(codeB);
  claim(docsB);
  merge(codeB);
  merge(docsB);
  await w.tick();
  bounded();
  assert.deepEqual([has(codeC, READY), has(docsC, DOCS)], [true, true]);
  // A crew claims code-c; docs-c stays unclaimed. Stop the line.
  claim(codeC);
  const claimedLabels = labelsOf(w.issueOf(codeC)),
    { stop } = await w.ops.execute("flow.stop", {
      scope: "all",
      reason: "bad base",
    });
  for (let i = 0; i < 3; i += 1) await w.tick();
  assert.equal(has(docsC, DOCS), false, "the unclaimed ready label is cleared");
  assert.deepEqual(
    labelsOf(w.issueOf(codeC)),
    claimedLabels,
    "the claimed issue is untouched",
  );
  assert.equal(comments(codeC), 1, "one comment on the claimed issue");
  assert.equal(comments(docsC), 0);
  // Resume, then reopen a closed issue: phase 1 is not whole, so phase 2's
  // unclaimed issue is held again and the claimed one keeps its labels.
  await w.ops.execute("flow.resume", { stopId: stop.id });
  await w.tick();
  assert.equal(has(docsC, DOCS), true, "resume releases again");
  Object.assign(w.issueOf(codeA), { state: "open", state_reason: null });
  w.store.mutate("Reopen", (data) => {
    const task = data.tasks.find((entry) => entry.id === codeA);
    task.githubVerdict = { state: "open" };
    task.status = "planned";
  });
  await w.tick();
  assert.equal(
    has(docsC, DOCS),
    false,
    "the reopened task holds phase 2 again",
  );
  assert.deepEqual(labelsOf(w.issueOf(codeC)), claimedLabels);
});
