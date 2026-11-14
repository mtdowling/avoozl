// Proof 19 (rc-p19): the parent is not taken by a crew. Run on a fake GitHub.
// The crew here is a stand-in poll that applies Radar's published claim rule
// (label scope, and a live claim marker holds an issue off). It is not a real
// Radar crew: the live run is pending the owner.
import assert from "node:assert/strict";
import test from "node:test";
import { liveClaim } from "../radar-claims.mjs";
import {
  CLAIM,
  READY,
  REPO,
  proofWorkspace,
} from "./radar-proof-approval-fixture.mjs";

const names = (issue) => (issue.labels || []).map((l) => l.name);
// What a crew with label scope `ready` would take now.
const polled = (w) =>
  w.github.created
    .filter(
      (issue) =>
        issue.state === "open" &&
        names(issue).includes(READY) &&
        !names(issue).includes(CLAIM) &&
        !liveClaim(w.github.comments.filter((c) => c.number === issue.number)),
    )
    .map((issue) => issue.number);

test("Proof 19: after approval the crew takes released sub-issues and never the parent", async (t) => {
  const PARENT = 7,
    w = proofWorkspace(t, { [PARENT]: "loader" });
  await w.configure();
  const plan = await w.draft(PARENT);
  // The parent carries the crew's own label, so a poll would take it now.
  w.github.addLabels(REPO, PARENT, [READY]);
  assert.deepEqual(polled(w), [PARENT]);

  // Approve, then let the crew poll after approval.
  await w.approve(plan);
  w.store.setMeta(`spec-approval:${plan.id}:${plan.hash}`, {
    state: "merged",
    commit: "0123456789abcdef0123456789abcdef01234567",
    approvedBy: "owner",
  });
  assert.deepEqual(polled(w), [], "the claim holds the parent off");

  // First release: the sub-issues are ready, the parent is still not taken.
  await w.ops.execute("github.project", { planId: plan.id });
  await w.tick();
  const taken = polled(w);
  assert.ok(taken.length >= 1, "a released sub-issue is takeable");
  assert.ok(!taken.includes(PARENT), "the parent is never takeable");
  for (const number of taken)
    assert.ok(
      w.github.created
        .find((i) => i.number === number)
        .body.includes("avoozl-task"),
      "only task issues",
    );
});
