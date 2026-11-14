import assert from "node:assert/strict";
import test from "node:test";
import { STAGE_NAMES, flowFromEvents } from "../flow-github.mjs";

// rc-8.4: stage times from GitHub event times, checked by hand.
const MIN = 60_000;
const at = (minutes) =>
  new Date(Date.UTC(2026, 10, 14, 0, 0) + minutes * MIN).toISOString();
// Issue 1: ready 0, claimed 10, PR 40, green 90, merged 100.
//   Ready to Claim 10, Claim to PR 30, PR to green 50, green to merge 10, lead 100.
// Issue 2: ready 0, claimed 20, PR 80, green 100, merged 110.
//   Ready to Claim 20, Claim to PR 60, PR to green 20, green to merge 10, lead 110.
const events = [
  {
    number: 1,
    ready: at(0),
    claimed: at(10),
    pr: at(40),
    green: at(90),
    merged: at(100),
  },
  {
    number: 2,
    ready: at(0),
    claimed: at(20),
    pr: at(80),
    green: at(100),
    merged: at(110),
  },
];

test("each issue's stage times match the hand-computed minutes", () => {
  const { issues } = flowFromEvents(events);
  assert.deepEqual(STAGE_NAMES, [
    "Ready to Claim",
    "Claim to PR",
    "PR to green",
    "Green to merge",
  ]);
  assert.deepEqual(
    issues[0].stages.map((ms) => ms / MIN),
    [10, 30, 50, 10],
  );
  assert.deepEqual(
    issues[1].stages.map((ms) => ms / MIN),
    [20, 60, 20, 10],
  );
  assert.equal(issues[0].lead / MIN, 100);
  assert.equal(issues[1].lead / MIN, 110);
});

test("medians, lead time and flow efficiency", () => {
  const flow = flowFromEvents(events);
  // Medians of two values are their mean.
  assert.deepEqual(
    flow.median.map((ms) => ms / MIN),
    [15, 45, 35, 10],
  );
  assert.equal(flow.medianLead / MIN, 105);
  // Efficiency is Claim to PR over lead time: (30 + 60) / (100 + 110).
  assert.equal(flow.efficiency, 90 / 210);
  assert.equal(flow.count, 2);
});

test("an issue missing a time, or with times out of order, is left out and named", () => {
  const flow = flowFromEvents([
    ...events,
    {
      number: 3,
      ready: at(0),
      claimed: at(5),
      pr: null,
      green: null,
      merged: null,
    },
    {
      number: 4,
      ready: at(50),
      claimed: at(10),
      pr: at(20),
      green: at(30),
      merged: at(40),
    },
  ]);
  assert.equal(flow.count, 2);
  assert.deepEqual(
    flow.skipped.map((row) => row.number),
    [3, 4],
  );
});

test("no finished issue gives no numbers, not zeros", () => {
  const flow = flowFromEvents([]);
  assert.equal(flow.median, null);
  assert.equal(flow.medianLead, null);
  assert.equal(flow.efficiency, null);
});

test("the slowest median stage is the bottleneck", () => {
  assert.equal(flowFromEvents(events).bottleneck, "Claim to PR");
});
