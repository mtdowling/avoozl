// Proof 18 (rc-p18): approve on the issue. Run on a fake GitHub in an isolated
// temporary workspace; nothing is written to a real issue.
import assert from "node:assert/strict";
import test from "node:test";
import { APPROVAL, proofWorkspace } from "./radar-proof-approval-fixture.mjs";

test("Proof 18: a label, an Avoozl approval and a stranger's label each end in one honest record", async (t) => {
  const w = proofWorkspace(t, { 7: "one", 8: "two", 9: "three" });
  await w.configure();
  const [one, two, three] = [
    await w.draft(7),
    await w.draft(8),
    await w.draft(9),
  ];

  // 1. An allowed person labels issue 7: approved, nothing written back.
  w.github.labeledBy(7, "owner");
  // 2. Plan two is approved in Avoozl: label and one marker comment go back.
  await w.approve(two);
  // 3. A stranger labels issue 9.
  w.github.labeledBy(9, "stranger");
  for (let round = 0; round < 3; round += 1) await w.tick();

  const planIds = w
    .approvals()
    .map((a) => a.planId)
    .sort();
  assert.deepEqual(
    planIds,
    [one.id, two.id].sort(),
    "one record for each approved plan",
  );
  assert.equal(w.approvals().filter((a) => a.planId === three.id).length, 0);

  // Issue 7: the label is the person's own; Avoozl added no comment.
  assert.ok(w.github.labelNames(7).includes(APPROVAL));
  assert.equal(w.github.commentsOn(7, /avoozl-approval/).length, 0);
  // Issue 8: the label and exactly one marker comment, with no spec text.
  assert.ok(w.github.labelNames(8).includes(APPROVAL));
  const markers = w.github.commentsOn(8, /<!-- avoozl-approval /);
  assert.equal(markers.length, 1);
  assert.match(markers[0].body, /approver=Owner spec=\.kiro\/specs\/two /);
  assert.doesNotMatch(markers[0].body, /Load configuration/);
  // Issue 9: the stranger's label is removed, with one row naming the person.
  assert.equal(w.github.labelNames(9).includes(APPROVAL), false);
  const rows = await w.rows();
  assert.equal(rows.length, 1);
  assert.match(rows[0].title, /stranger/);

  // The issue and the record agree: every approved issue has the label, and a
  // label on an issue without a record never survives.
  for (const number of [7, 8, 9]) {
    const approved = w
      .approvals()
      .some((a) => a.planId === { 7: one, 8: two, 9: three }[number].id);
    assert.equal(
      w.github.labelNames(number).includes(APPROVAL),
      approved,
      `issue ${number}`,
    );
  }
});
