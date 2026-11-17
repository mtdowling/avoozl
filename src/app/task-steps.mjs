// A task's steps from Avoozl's own stored records (Requirement 106, design
// 4.35). Reads no GitHub: the plan's approval, flow spans, the delivery view
// item (session bindings, delivery records, evidence, integration) and build
// observations are all passed in.
//   Spec approved ─ Ready ─ Started (attempt N) ─ [Attempt N failed] ─ Checks
//   ─ Landed ─ Builds ─ Integrated
import { phaseGroups, receiptLine } from "./build-receipt-read.mjs";

const first = (times) => times.filter(Boolean).sort()[0] ?? null,
  last = (times) => times.filter(Boolean).sort().at(-1) ?? null,
  short = (commit) => (commit ? String(commit).slice(0, 12) : null);

// States: done (has a time), now (the step in progress), later, and skipped
// (a later step happened without it).
export function taskSteps({
  approval = null,
  spans = [],
  delivery = null,
  builds = [],
} = {}) {
  const sessions = delivery?.sessions ?? [],
    records = delivery?.deliveries ?? [],
    attempts = records.flatMap((record) => record.attempts ?? []),
    exits = (delivery?.evidence ?? []).filter((e) =>
      Number.isInteger(e.exitCode),
    ),
    failedChecks = exits.filter((e) => e.exitCode !== 0).length,
    landed = records.find((record) =>
      ["done", "verified", "integrated"].includes(record.state),
    ),
    integration = delivery?.integration ?? null,
    steps = [
      {
        key: "spec",
        label: "Spec approved",
        at: approval?.at ?? null,
        by: approval?.approvedBy ?? null,
      },
      {
        key: "ready",
        label: "Ready",
        at: first(
          spans.filter((s) => s.stage === "queued").map((s) => s.startedAt),
        ),
      },
    ],
    numbers = [
      ...new Set([
        ...sessions.map((s) => s.attempt),
        ...attempts.map((a) => a.attempt),
      ]),
    ].sort((a, b) => a - b);
  for (const number of numbers) {
    const bound = sessions.filter((s) => s.attempt === number),
      model = bound.find((s) => s.model)?.model;
    steps.push({
      key: `started-${number}`,
      label: `Started (attempt ${number})`,
      at: first(bound.map((s) => s.boundAt)),
      detail: [...new Set(bound.map((s) => s.role))].join(", ") || null,
      ...(model ? { by: model } : {}),
    });
    const ended = attempts.find((a) => a.attempt === number);
    if (ended && ended.outcome !== "done")
      steps.push({
        key: `failed-${number}`,
        label: `Attempt ${number} ${ended.outcome === "failed" ? "failed" : `ended: ${ended.outcome}`}`,
        at: ended.at ?? null,
        failed: true,
        ...(ended.lastReport ? { detail: String(ended.lastReport) } : {}),
      });
  }
  if (!numbers.length)
    steps.push({ key: "started", label: "Started", at: null });
  steps.push(
    {
      key: "checks",
      label: "Checks",
      at: last(exits.map((e) => e.at)),
      detail: exits.length
        ? failedChecks
          ? `${failedChecks} of ${exits.length} failed`
          : `${exits.length} passed`
        : "No checks recorded",
    },
    {
      key: "landed",
      label: "Landed",
      at: landed
        ? (last(
            attempts.filter((a) => a.outcome === "done").map((a) => a.at),
          ) ??
          landed.updatedAt ??
          null)
        : null,
      detail: landed?.commit ? `Commit ${short(landed.commit)}` : null,
    },
  );
  if (builds.length)
    steps.push({
      key: "builds",
      label: "Builds",
      at: last(builds.map((b) => b.at)),
      detail: receiptLine(builds),
      builds: phaseGroups(builds),
    });
  steps.push({
    key: "integrated",
    label: "Integrated",
    at: integration?.at ?? null,
    detail: integration?.commit ? `Commit ${short(integration.commit)}` : null,
  });
  const lastDone = steps.findLastIndex((step) => step.at);
  let next = true;
  for (const [index, step] of steps.entries()) {
    if (step.at) step.state = "done";
    else if (index < lastDone) step.state = "skipped";
    else if (next) {
      step.state = "now";
      next = false;
    } else step.state = "later";
  }
  return steps;
}
