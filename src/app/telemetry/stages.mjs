// The closed list of stage names a span or a point may carry (OT1.5).
export const STAGES = Object.freeze([
  "queued",
  // Findings before code, and the falsifier checking them.
  "investigate",
  "falsify",
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
