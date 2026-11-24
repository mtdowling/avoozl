import assert from "node:assert/strict";
import test from "node:test";
import { landedWork, mergedChecked, runnerLimit } from "../claim-rules.ts";

// Start S on base B; the claim's checked commit W and another commit X,
// neither on the base.
const graph = { S: [], B: ["S"], W: ["S"], X: ["W"] };
const landed = (head: string, pull: { merged?: boolean; head?: string }) =>
  landedWork({ graph, start: "S", head, baseHead: "B", pull });

test("a merged pull request lands work only with the checked head (16.5)", () => {
  assert.equal(landed("W", { merged: true, head: "W" }), true);
  assert.equal(landed("W", { merged: true, head: "X" }), false);
  assert.equal(landed("W", { merged: false, head: "W" }), false);
  assert.equal(landed("S", { merged: true, head: "S" }), false);
  assert.equal(mergedChecked(null, "W"), false);
});

test("checked work on the base is landed without a pull request (16.5)", () => {
  assert.equal(
    landedWork({ graph, start: "S", head: "W", baseHead: "X" }),
    true,
  );
});

test("only an approver may answer a pending action; comment text never acts (20.8)", () => {
  const limit = (kind: string, approverReply: boolean) =>
    runnerLimit({ kind, approverReply }, { login: "acme-alice" });
  assert.equal(limit("answer-pending-action", true), null);
  assert.equal(limit("answer-pending-action", false), "20.8");
  assert.equal(limit("follow-comment-text", true), "20.8");
  assert.equal(limit("follow-comment-text", false), "20.8");
});
