// @ts-nocheck: typing debt
// The closed list of stage names a span or a point may carry (OT1.5).
export const STAGES = Object.freeze([
  "queued",
  "coding",
  "tests",
  "commands",
  // Declared checks Avoozl ran itself.
  "checks",
  "ci-wait",
  "review",
  "rework",
  "merge",
  "waiting",
]);
