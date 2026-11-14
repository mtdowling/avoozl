// The scope statement shown in the README, Set up and the quick goal modal.
// Guidance only: nothing reads it to refuse a goal or a plan.
export const SCOPE_STATEMENT =
  "Avoozl is for epics: approved goals that need many changes in a set order. Maintenance, triage and one-off pull request handling belong to Issue Radar crews or to your team's coder. Avoozl can hand each task of an epic to any coder.";
export const SCOPE_RULE =
  "If the work fits in one pull request, it is not an Avoozl job. If it needs a plan with an order, it is.";

// RC13.3: a proposal with one task and no edge fits one pull request.
// The hint offers an action; nothing is refused.
export function onePullRequestHint(proposal) {
  if (proposal.tasks.length !== 1 || proposal.edges.length) return null;
  return {
    text: "This fits one pull request. A crew or your coder can take it without a plan.",
    action: "Plan it anyway",
  };
}
