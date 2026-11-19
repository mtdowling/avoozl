import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  OUTCOME_KINDS,
  isComplete,
  releases,
  taskDefinition,
  taskOutcome,
} from "../task-outcomes.mjs";
import { specHash } from "../spec-plans.mjs";
import { fixture } from "./fixtures.mjs";
import { specFiles } from "./spec-fixture.mjs";

const entry = {
  kind: "leaf",
  summary: "Read the config file.",
  acceptance: ["A missing file yields defaults."],
  checks: ["npm test"],
};
const definition = taskDefinition(entry);
const at = { spec: "config", task: "1.1", revision: "rev-2", definition };
const outcome = (kind, extra = {}) => ({
  spec: "config",
  task: "1.1",
  revision: "rev-2",
  definition,
  kind,
  commit: "c0ffee",
  evidence: { checks: ["npm test"] },
  ...extra,
});

test("the definition digest ignores key order and sees any change", () => {
  const reordered = Object.fromEntries(Object.entries(entry).reverse());
  assert.equal(taskDefinition(reordered), definition);
  assert.notEqual(
    taskDefinition({ ...entry, checks: ["npm test", "git diff --check"] }),
    definition,
  );
});

test("every outcome kind gives its state on the current definition", () => {
  const expected = {
    landed: "complete",
    done: "complete",
    skipped: "complete",
    "landed-unverified": "unverified",
    refused: "refused",
    reopened: "reopened",
  };
  assert.deepEqual(Object.keys(expected).sort(), [...OUTCOME_KINDS].sort());
  for (const [kind, state] of Object.entries(expected)) {
    const result = taskOutcome([outcome(kind)], at);
    assert.equal(result.state, state, kind);
    assert.equal(isComplete(result), state === "complete", kind);
  }
  assert.equal(taskOutcome([], at).state, "open");
});

test("only the latest valid outcome counts", () => {
  assert.equal(
    taskOutcome([outcome("done"), outcome("reopened")], at).state,
    "reopened",
  );
  assert.equal(
    taskOutcome([outcome("refused"), outcome("skipped")], at).state,
    "complete",
  );
  // A landed record with no evidence, or another task's record, is not valid.
  const ignored = [
    outcome("landed", { evidence: undefined }),
    outcome("refused", { task: "1.2" }),
    outcome("bogus"),
  ];
  assert.equal(
    taskOutcome([outcome("reopened"), ...ignored], at).state,
    "reopened",
  );
  assert.equal(taskOutcome(ignored, at).state, "open");
});

test("an outcome on a changed definition or older revision is stale", () => {
  const changed = taskDefinition({ ...entry, summary: "Read it twice." });
  assert.equal(
    taskOutcome([outcome("done")], { ...at, definition: changed }).state,
    "stale",
  );
  const older = outcome("landed", { revision: "rev-1" });
  assert.equal(taskOutcome([older], at).state, "stale");
  // The approval's explicit list carries an unchanged definition.
  const carried = [{ task: "1.1", definition }];
  assert.equal(taskOutcome([older], { ...at, carried }).state, "complete");
  // A carry-forward never accepts a changed definition.
  assert.equal(
    taskOutcome([older], { ...at, definition: changed, carried }).state,
    "stale",
  );
  assert.equal(
    taskOutcome([older], {
      ...at,
      definition: changed,
      carried: [{ task: "1.1", definition: changed }],
    }).state,
    "stale",
  );
});

test("verified branch work releases only same-spec successors with the code", () => {
  const complete = taskOutcome([outcome("done")], at),
    open = taskOutcome([], at),
    verified = {
      state: "verified",
      commit: "abc123",
      available: { app: ["abc123"], lib: [] },
    };
  // Accepted outcomes release successors in any spec.
  assert.equal(releases({ outcome: complete }), true);
  // A checkpoint or a checkmark alone releases nothing.
  for (const branch of [null, { state: "checkpoint", commit: "abc123" }])
    assert.equal(
      releases({ outcome: open, branch, sameSpec: true, repositories: [] }),
      false,
    );
  assert.equal(
    releases({
      outcome: open,
      branch: verified,
      sameSpec: true,
      repositories: ["app"],
    }),
    true,
  );
  // The exact prerequisite commit must be present in every repository.
  assert.equal(
    releases({
      outcome: open,
      branch: verified,
      sameSpec: true,
      repositories: ["app", "lib"],
    }),
    false,
  );
  // Another spec waits for an accepted outcome.
  assert.equal(
    releases({ outcome: open, branch: verified, repositories: ["app"] }),
    false,
  );
  for (const kind of ["refused", "reopened", "landed-unverified"])
    assert.equal(
      releases({
        outcome: taskOutcome([outcome(kind)], at),
        branch: verified,
        repositories: ["app"],
      }),
      false,
    );
});

test("branch checkmarks stay outside the revision hash", () => {
  const files = specFiles(),
    checked = {
      ...files,
      "tasks.md": files["tasks.md"].replace("[ ] 1.1", "[x] 1.1"),
    };
  assert.notEqual(checked["tasks.md"], files["tasks.md"]);
  assert.equal(specHash(checked), specHash(files));
});
