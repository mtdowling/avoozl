// Flow from GitHub event times (RC8.5, design D10). One input row per merged
// issue: the times GitHub holds for it, never a claim marker's `updated=`.
//   ready   the ready label was added
//   claimed the claim comment was posted
//   pr      the pull request was opened
//   green   the pull request's last required check passed
//   merged  the pull request merged
// Times are ISO strings. Pure: it reads nothing and writes nothing.
export const STAGE_NAMES = Object.freeze([
  "Ready to Claim",
  "Claim to PR",
  "PR to green",
  "Green to merge",
]);
const POINTS = ["ready", "claimed", "pr", "green", "merged"];

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

// A row with a missing or unordered time is skipped and named, not guessed.
export function flowFromEvents(rows) {
  const issues = [],
    skipped = [];
  for (const row of rows) {
    const times = POINTS.map((point) => Date.parse(row[point] ?? ""));
    if (times.some(Number.isNaN) || times.some((t, i) => i && t < times[i - 1]))
      skipped.push({ number: row.number });
    else
      issues.push({
        number: row.number,
        stages: STAGE_NAMES.map((_, i) => times[i + 1] - times[i]),
        lead: times[4] - times[0],
      });
  }
  const median_ = STAGE_NAMES.map((_, i) =>
      median(issues.map((x) => x.stages[i])),
    ),
    lead = issues.reduce((sum, x) => sum + x.lead, 0);
  return {
    count: issues.length,
    issues,
    skipped,
    median: issues.length ? median_ : null,
    medianLead: median(issues.map((x) => x.lead)),
    // Time a crew spent building (Claim to PR) over time from ready to merge.
    efficiency: lead
      ? issues.reduce((sum, x) => sum + x.stages[1], 0) / lead
      : null,
    bottleneck: issues.length
      ? STAGE_NAMES[median_.indexOf(Math.max(...median_))]
      : null,
  };
}
