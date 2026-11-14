// The source issue of a Radar-coded plan (radar-coder RC1.4, RC1.6, RC1.7,
// design D3). A plan started with Plan this records the issue it came from
// in `context.newPlan.source`. When the plan is projected, that issue is the
// parent of the projected issues instead of a new plan issue, and Avoozl
// writes nothing else to it except, when `radar.clearPlanLabel` is on, the
// removal of the planning label. The claim, needs-human and ready labels are
// never written here: a person clears needs-human, and a crew with an empty
// label scope must not take the parent.
import { RADAR_DEFAULTS } from "./github-policy.mjs";

// A receipt for an issue Avoozl planned: the source of a spec.
export const SOURCE_KIND = "radar-source";

const lower = (value) => String(value ?? "").toLowerCase();
const labelNames = (issue) =>
  (issue?.labels || []).map((label) =>
    typeof label === "string" ? label : label?.name,
  );

// The source of `plan`, or null when it has none or the repository is not
// Radar-coded.
// shortcut: plans-repo mode projects into the planning repository and
// GitHub links sub-issues only inside the plans repository there, so the
// source is not the parent in that mode; rc-2.1 moves projection into the
// code repository and lifts this.
export function planSource(plan, identity) {
  const source = plan?.context?.newPlan?.source;
  if (
    !source ||
    typeof source.repository !== "string" ||
    !Number.isInteger(source.number) ||
    identity?.mode !== "single-repo" ||
    identity.repositories?.[source.repository]?.coder !== "issue-radar"
  )
    return null;
  return source;
}

// The parent record the sub-issue links use, or null with a note.
export async function sourceParent({ store, github, plan, identity, notes }) {
  const source = planSource(plan, identity);
  if (!source) return null;
  const config = store.get("github_repositories", source.repository);
  if (!config) {
    notes.add(
      `${source.repository} is not registered; ${plan.id} has no parent.`,
    );
    return null;
  }
  const issue = await github.issue(config, source.number);
  if (!issue || issue.state === "closed") {
    notes.add(
      `The source issue ${source.repository}#${source.number} is closed or missing; ${plan.id} has no parent.`,
    );
    return null;
  }
  return {
    taskId: `source.${source.number}`,
    config,
    issue,
    source,
    parents: [
      {
        level: "source",
        id: `${source.repository}#${source.number}`,
        number: source.number,
        repository: config.id,
      },
    ],
  };
}

// After the links are in: remember the source (so Intake does not list it
// again, and Needs you can ask the person to clear needs-human), and remove
// the planning label when the repository asks for it. Idempotent.
export async function finishSource({ store, github, plan, identity, parent }) {
  const { config, issue, source } = parent,
    id = `${SOURCE_KIND}:${lower(source.repository)}#${source.number}`,
    stored = store.get("receipts", id);
  if (stored?.planId !== plan.id)
    store.put("receipts", {
      id,
      kind: SOURCE_KIND,
      planId: plan.id,
      repository: source.repository,
      number: source.number,
      projectedAt: new Date().toISOString(),
    });
  const settings = identity.repositories[source.repository],
    planLabel = settings.radar?.planLabel ?? RADAR_DEFAULTS.planLabel;
  if (
    settings.radar?.clearPlanLabel === true &&
    labelNames(issue).some((name) => lower(name) === lower(planLabel))
  )
    await github.removeLabel(config, source.number, planLabel);
}
