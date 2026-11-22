import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../../api/operations.ts";
import { fixture } from "../../test/fixtures.ts";
import { writeSpec } from "../../test/spec-fixture.ts";

interface Plan {
  id: string;
  hash: string;
  files: Record<string, string>;
  review: {
    status: string;
    openCount: number;
    commentSnapshot: string;
    latestRequest: { current: boolean } | null;
    activeRequest: { current: boolean; disposition: string } | null;
    comments: {
      id: string;
      file: string;
      lineStart: number | null;
      body: string;
      state: string;
      current: boolean;
    }[];
  };
}

test("spec review comments block approval and survive a changes request", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root });
  writeSpec(root, "config");
  const plan = await ops.execute<Plan>("plan.create", { spec: "config" });
  const comment = await ops.execute<{ id: string }>("plan.review.comment", {
    id: plan.id,
    expectedHash: plan.hash,
    file: "design.md",
    lineStart: 1,
    body: "Define the retry boundary before implementation.",
  });
  const reviewed = await ops.execute<Plan>("plan.get", { id: plan.id });
  assert.equal(reviewed.review.openCount, 1);
  assert.deepEqual(
    reviewed.review.comments.map((item) => [
      item.id,
      item.file,
      item.lineStart,
      item.state,
      item.current,
    ]),
    [[comment.id, "design.md", 1, "open", true]],
  );
  await assert.rejects(
    ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: store.read().revision,
    }),
    /unresolved review comment blocks approval/,
  );
  const request = await ops.execute<{
    disposition: string;
    revisionHash: string;
    commentIds: string[];
    commentSnapshot: string;
  }>("plan.review.requestChanges", {
    id: plan.id,
    expectedHash: plan.hash,
  });
  assert.equal(request.disposition, "changes-requested");
  assert.equal(request.revisionHash, plan.hash);
  assert.deepEqual(request.commentIds, [comment.id]);
  assert.equal(request.commentSnapshot, reviewed.review.commentSnapshot);

  await ops.execute("plan.review.resolve", {
    commentId: comment.id,
    resolution: "The revised design now names the retry boundary.",
  });
  const unchanged = await ops.execute<Plan>("plan.get", { id: plan.id });
  assert.equal(unchanged.review.openCount, 0);
  assert.equal(unchanged.review.status, "changes-requested");
  assert.equal(
    unchanged.review.activeRequest?.disposition,
    "changes-requested",
  );
  await assert.rejects(
    ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: store.read().revision,
    }),
    /revision has requested changes/,
  );

  writeSpec(root, "config", {
    "design.md":
      "# Design\n\nA loader, then a validator with an explicit retry boundary.\n",
  });
  const revised = await ops.execute<Plan>("plan.save", {
    id: plan.id,
    expectedHash: plan.hash,
  });
  const ready = await ops.execute<Plan>("plan.get", { id: plan.id });
  assert.equal(ready.review.status, "open");
  assert.equal(ready.review.latestRequest?.current, false);
  assert.equal(ready.review.activeRequest, null);
  const preview = await ops.execute<{
    expectedRevision: number;
  }>("plan.preview", { id: plan.id });
  const receipt = await ops.execute<{
    review: { commentSnapshot: string; commentIds: string[] };
  }>("plan.approve", {
    id: plan.id,
    expectedHash: revised.hash,
    expectedRevision: preview.expectedRevision,
  });
  assert.deepEqual(receipt.review.commentIds, [comment.id]);
  assert.equal(receipt.review.commentSnapshot, ready.review.commentSnapshot);
  await assert.rejects(
    ops.execute("plan.review.comment", {
      id: plan.id,
      expectedHash: revised.hash,
      file: "design.md",
      body: "Late finding.",
    }),
    /already approved/,
  );
});

test("a hold needs a reason and prevents approval", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root });
  writeSpec(root, "config");
  const plan = await ops.execute<Plan>("plan.create", { spec: "config" });
  await assert.rejects(
    ops.execute("plan.review.hold", {
      id: plan.id,
      expectedHash: plan.hash,
    }),
    /Explain why/,
  );
  await ops.execute("plan.review.hold", {
    id: plan.id,
    expectedHash: plan.hash,
    reason: "The architecture decision is still open.",
  });
  await assert.rejects(
    ops.execute("plan.review.requestChanges", {
      id: plan.id,
      expectedHash: plan.hash,
      reason: "Revise it.",
    }),
    /Resume this held review/,
  );
  const comment = await ops.execute<{ id: string }>("plan.review.comment", {
    id: plan.id,
    expectedHash: plan.hash,
    file: "design.md",
    body: "Retain the hold while this note is addressed.",
  });
  await ops.execute("plan.review.resolve", {
    commentId: comment.id,
    resolution: "The note is addressed, but the architecture decision is open.",
  });
  await assert.rejects(
    ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: store.read().revision,
    }),
    /review is held/,
  );
  writeSpec(root, "config", {
    "design.md": "# Design\n\nThe architecture decision is documented.\n",
  });
  const revised = await ops.execute<Plan>("plan.save", {
    id: plan.id,
    expectedHash: plan.hash,
  });
  const held = await ops.execute<Plan>("plan.get", { id: plan.id });
  assert.equal(held.review.status, "held");
  assert.equal(held.review.activeRequest?.disposition, "held");
  await ops.execute("plan.review.resume", {
    id: plan.id,
    expectedHash: revised.hash,
  });
  const review = await ops.execute<Plan>("plan.get", { id: plan.id });
  assert.equal(review.review.status, "open");
  assert.equal(review.review.activeRequest, null);
});
