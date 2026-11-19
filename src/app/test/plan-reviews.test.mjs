import assert from "node:assert/strict";
import test from "node:test";
import { digest } from "../../model.mjs";
import { Operations } from "../operations.mjs";
import { createReviewThreads } from "../plan-reviews.mjs";
import { fixture, waitFor } from "./fixtures.mjs";

function plan(store) {
  const text =
    "# Durable planning\n\n## Decision\n\nUse an exact durable receipt.\n\n## Proposed work\n";
  const value = {
    id: "plan-review",
    kind: "plan",
    title: "Durable planning",
    prompt: "Review a durable plan",
    text,
    hash: digest(text),
    revision: 1,
    state: "draft",
    context: {},
    history: [],
    createdAt: "2026-11-10T00:00:00Z",
    updatedAt: "2026-11-10T00:00:00Z",
  };
  store.put("plans", value);
  return value;
}

test("review comments bind exact unique text, reanchor, reply, and apply suggestions", async (t) => {
  const { store } = fixture(t),
    original = plan(store),
    ops = new Operations(store, { operator: "Maintainer" });
  const submitted = await ops.execute("plan.review.submit", {
    planId: original.id,
    revisionHash: original.hash,
    comments: [
      {
        quote: "Use an exact durable receipt.",
        severity: "important",
        comment: "Name the receipt fields so recovery can verify authority.",
        suggestion:
          "Use a durable receipt containing the actor, revision hash, and timestamp.",
      },
    ],
  });
  const thread = submitted.threads[0];
  assert.equal(thread.lineStart, 5);
  const duplicate = await ops.execute("plan.review.submit", {
    planId: original.id,
    revisionHash: original.hash,
    comments: [
      {
        quote: thread.quote,
        severity: "important",
        comment: thread.comment,
        suggestion: thread.suggestion,
      },
    ],
  });
  assert.equal(duplicate.threads[0].existing, true);
  await ops.execute("plan.review.reply", {
    id: thread.id,
    text: "Agreed; applying this.",
  });
  const applied = await ops.execute("plan.review.apply", {
    id: thread.id,
    expectedHash: original.hash,
  });
  assert.match(applied.plan.text, /actor, revision hash, and timestamp/);
  assert.equal(applied.thread.disposition, "accepted");

  const reviews = await ops.execute("plan.review.list", {
    planId: original.id,
  });
  assert.equal(reviews.items[0].stale, true);
  assert.equal(reviews.items[0].replies[0].author, "Maintainer");
});
