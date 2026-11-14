// rc-14.2: the coder adapter. Fake GitHub only.
import assert from "node:assert/strict";
import test from "node:test";
import {
  adapterFor,
  issueRadarAdapter,
  registerCoderAdapter,
  usesMergePath,
} from "../coder-adapter.mjs";

const issue = (labels = [], state = "open") => ({
  number: 7,
  state,
  labels: labels.map((name) => ({ name })),
});

test("handOver adds the ready label once", async () => {
  const added = [],
    github = { addLabels: async (...args) => added.push(args) },
    call = (i) =>
      issueRadarAdapter.handOver({
        github,
        config: "cfg",
        issue: i,
        label: "ready",
      });
  assert.equal(await call(issue()), true);
  assert.equal(await call(issue(["ready"])), false);
  assert.deepEqual(added, [["cfg", 7, ["ready"]]]);
});

test("readState reads the issue, the claim and the pull request", () => {
  const read = (input) => issueRadarAdapter.readState(input).state;
  assert.equal(read({ issue: issue() }), "handed-over");
  assert.equal(read({ issue: issue(), claimed: true }), "claimed");
  assert.equal(read({ issue: issue([], "closed") }), "closed");
  assert.equal(
    read({ issue: issue(), pulls: [{ state: "open", number: 1 }] }),
    "pr-open",
  );
  assert.equal(
    read({
      issue: issue(),
      pulls: [{ state: "closed", merged: true }, { state: "open" }],
    }),
    "merged",
  );
});

test("done is true only for a merged pull request", () => {
  const done = (input) =>
    issueRadarAdapter.countsAsDone(issueRadarAdapter.readState(input));
  assert.equal(done({ issue: issue([], "closed") }), false);
  assert.equal(done({ issue: issue(), pulls: [{ state: "open" }] }), false);
  assert.equal(done({ issue: issue(), pulls: [{ state: "closed" }] }), false);
  assert.equal(done({ issue: issue(), pulls: [{ merged_at: "t" }] }), true);
  assert.equal(issueRadarAdapter.countsAsDone(null), false);
});

test("a fake third adapter plugs in without changing callers", async () => {
  const calls = [],
    restore = registerCoderAdapter("remote", {
      usesMergePath: false,
      handOver: async (input) => calls.push(input.issue.number),
      readState: () => ({ state: "filed" }),
      countsAsDone: () => false,
    });
  try {
    await adapterFor("remote").handOver({ issue: issue() });
    assert.deepEqual(calls, [7]);
    assert.equal(usesMergePath("remote"), false);
    assert.equal(usesMergePath("issue-radar"), true);
  } finally {
    restore();
  }
  assert.equal(usesMergePath("remote"), false);
});
