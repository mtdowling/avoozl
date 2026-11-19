// rc-4.1: release capacity per repository and per scope: the pure engine and
// the settings checks. The ready-label release to Issue Radar crews went with
// Who codes (R91.6).
import assert from "node:assert/strict";
import test from "node:test";
import {
  capacityOf,
  planRelease,
  releaseFor,
  scopeLabelOf,
} from "../radar-coder-release.mjs";
import { CLAIM, READY, leaf, setup } from "./radar-coder-release-fixture.mjs";

const five = () => ["a", "b", "c", "d", "e"].map((id) => leaf("leaf-" + id));

// Live run of Proof 4: a crew claimed an issue and opened its pull request;
// the task then left the ready queue (in review), and its slot was given to
// the next task while the claimed issue still held the label.
test("bad release settings are refused", async (t) => {
  for (const [release, message] of [
    [{ capacity: -1 }, /release\.capacity must be a whole number/],
    [{ capacity: 101 }, /release\.capacity must be a whole number/],
    [{ scopes: [{ label: READY }] }, /cannot use ready/],
    [{ scopes: [{ label: "a" }, { label: "A" }] }, /repeats A/],
    [{ scopes: [{ label: CLAIM }] }, /cannot use crew: in progress/],
    [{ extra: 1 }, /extra/],
  ])
    await assert.rejects(setup(t, { release }, five()), message);
});

test("planRelease: claimed holders keep their label even above the cap", () => {
  const keep = planRelease({
    candidates: [
      { id: "x", label: "r", holds: true, claimed: true },
      { id: "y", label: "r", holds: true, claimed: true },
      { id: "z", label: "r", holds: true, claimed: false },
      { id: "n", label: "r", holds: false, claimed: false },
    ],
    capacity: () => 1,
  });
  assert.deepEqual([...keep].sort(), ["x", "y"]);
  assert.equal(
    scopeLabelOf({ releaseScope: "S" }, { scopes: [{ label: "s" }] }, "r"),
    "s",
  );
  assert.equal(capacityOf({ capacity: 3, scopes: [] }, "r", "r"), 3);
});

test("releaseFor: defaults and fallbacks", () => {
  assert.equal(releaseFor({}).capacity, Infinity);
  // An old file's `coder` and the retired `concurrency` key are ignored.
  assert.equal(releaseFor({}).capacity, Infinity);
  assert.equal(releaseFor({ concurrency: 3 }).capacity, Infinity);
  assert.deepEqual(
    releaseFor({ release: { capacity: 4, scopes: [{ label: "d" }] } }),
    {
      capacity: 4,
      mode: "automatic",
      ranking: { enabled: true, agingHours: 12 },
      scopes: [{ label: "d", capacity: 4 }],
    },
  );
});
