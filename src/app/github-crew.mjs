// Issue Radar's labels on Avoozl leaves (design §6.4, R17.3, R27.11).
// Avoozl reads the crew's claim and needs-human labels and never writes
// them. A claimed leaf without the ready label is stale claimed work; a
// leaf with the needs-human label needs a person. Either one holds an open
// decision on the task, which keeps it and its dependents from readiness,
// until GitHub no longer shows it. The only GitHub write is the managed
// `stale` label, when the policy names one.
import { readGitHubPolicy } from "./github-policy.mjs";

const KINDS = {
  "needs-human": {
    title: (task) => `${task.id} needs a person`,
    text: (number, label) =>
      `Issue #${number} has the Issue Radar label "${label}". Its dependents wait until the label is removed.`,
  },
  "stale-claim": {
    title: (task) => `${task.id} has stale claimed work`,
    text: (number, label, ready) =>
      `Issue #${number} has the Issue Radar claim "${label}" but not the ready label "${ready}". Avoozl does not cancel the crew. Its dependents wait until the claim is released or the leaf is ready again.`,
  },
};

const labelNames = (issue) =>
  (issue?.labels || [])
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter(Boolean);
const has = (issue, label) =>
  labelNames(issue).some(
    (name) => name.toLocaleLowerCase() === label.toLocaleLowerCase(),
  );
export const crewDecision = (kind, taskId) => `crew-${kind}:${taskId}`;
const isCrewDecision = (value) => String(value || "").startsWith("crew-");

// Holds GitHub shows now in one repository: issue number -> {kind, label}.
// Two list reads per repository, filtered by label, so a quiet tick is cheap.
async function observe(github, config, repository) {
  const { claim, needsHuman } = repository.crewLabels,
    ready = repository.managedLabels.ready || null,
    [human, claimed] = await Promise.all([
      github.listIssues(config, { state: "all", label: needsHuman }),
      github.listIssues(config, { state: "open", label: claim }),
    ]),
    holds = new Map();
  for (const issue of human)
    if (has(issue, needsHuman))
      holds.set(issue.number, { kind: "needs-human", label: needsHuman });
  // Without a ready label there is no readiness for a claim to outlive.
  if (ready)
    for (const issue of claimed)
      if (
        !holds.has(issue.number) &&
        has(issue, claim) &&
        !has(issue, ready) &&
        issue.state === "open"
      )
        holds.set(issue.number, {
          kind: "stale-claim",
          label: claim,
          addStale: !has(issue, repository.managedLabels.stale || claim),
        });
  return { holds, ready };
}

// The tick's crew step, for single-repo repositories Issue Radar codes and
// this machine writes. Idempotent: a tick that sees what the last one saw
// writes nothing and raises nothing, so each hold is one decision.
export async function reconcileCrewLabels(store, github, { policy }) {
  const notify = [];
  if (policy?.mode !== "single-repo") return { notify };
  const machine = store.getMeta("machineIdentity")?.id;
  if (!machine) return { notify };
  for (const [id, repository] of Object.entries(policy.repositories || {})) {
    if (repository.coder !== "issue-radar") continue;
    const config = store.get("github_repositories", id);
    if (!config || config.activeMachine !== machine) continue;
    const tasks = store
      .read()
      .tasks.filter(
        (task) => task.github?.repository === id && task.github.number,
      );
    if (!tasks.length) continue;
    const { holds, ready } = await observe(github, config, repository),
      staleLabel = repository.managedLabels.stale || null;
    for (const task of tasks) {
      const number = task.github.number,
        hold = holds.get(number) || null,
        previous = task.crewHold || null,
        decision = hold ? crewDecision(hold.kind, task.id) : null;
      if (hold?.kind === "stale-claim" && staleLabel && hold.addStale)
        await github.addLabels(config, number, [staleLabel]);
      if (previous?.kind === "stale-claim" && hold?.kind !== "stale-claim")
        if (staleLabel) await github.removeLabel(config, number, staleLabel);
      // Another decision (a held completion) stays in place; this hold
      // takes the field once it is free, on a later tick.
      const nextDecision = hold
          ? !task.decision || isCrewDecision(task.decision)
            ? decision
            : task.decision
          : isCrewDecision(task.decision)
            ? null
            : (task.decision ?? null),
        opened = hold && previous?.kind !== hold.kind;
      if (
        !opened &&
        Boolean(hold) === Boolean(previous) &&
        nextDecision === (task.decision ?? null)
      )
        continue;
      store.mutate(
        hold
          ? `Crew hold ${hold.kind} for ${task.id}`
          : `Crew hold settled for ${task.id}`,
        (draft) => {
          const row = draft.tasks.find((candidate) => candidate.id === task.id);
          if (hold)
            row.crewHold = opened
              ? {
                  kind: hold.kind,
                  label: hold.label,
                  number,
                  at: new Date().toISOString(),
                }
              : row.crewHold;
          else delete row.crewHold;
          row.decision = nextDecision;
        },
      );
      if (opened)
        notify.push({
          channel: "decision",
          title: KINDS[hold.kind].title(task),
          text: KINDS[hold.kind].text(number, hold.label, ready),
          resume: "Settle it on GitHub; the next tick reads it.",
        });
    }
  }
  return { notify };
}

// The tick's wrapper: a failure is reported, not thrown, so other work
// keeps moving.
export async function crewStep(store, github, workspaceRoot) {
  try {
    const { notify } = await reconcileCrewLabels(store, github, {
      policy: readGitHubPolicy(workspaceRoot),
    });
    return { status: "ok", notify };
  } catch (error) {
    return { status: "error", error: error.message, notify: [] };
  }
}
