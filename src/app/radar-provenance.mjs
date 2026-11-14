// The provenance marker a projected issue carries for `coder: issue-radar`
// (radar-coder D5.1, RC2.10). The values come from the spec plan and the
// merged approval pull request (spec-approval.mjs): the spec name, the
// approval commit and the approver. A task ID list is added per issue.
import { approvalState } from "./spec-approval.mjs";
import { renderProvenance } from "./github-provenance.mjs";
import { integrationBranchOf } from "./integration-branch.mjs";

// True when the repository's `coder` is `issue-radar`, in either mode.
export function issueRadarCoder(identity, repository) {
  const wanted = String(repository || "").toLowerCase(),
    entry = Object.entries(identity?.repositories || {}).find(
      ([id]) => id.toLowerCase() === wanted,
    );
  return entry?.[1]?.coder === "issue-radar";
}

// Returns `(taskIds) => line` for one plan and repository, or null when the
// repository is not a radar repository, the plan is not a spec plan, or the
// approval pull request has not merged. With no marker, `verify-issue`
// refuses the issue, so an early projection fails closed (shortcut: the
// preview and its preflight, rc-2.6, say so before a write).
// `plans` is the plans repository name an issue may show, or null.
export function provenanceWriter(store, { identity, plan, config, plans }) {
  if (!issueRadarCoder(identity, config.id) || !plan.spec) return null;
  const approval = approvalState(store, plan.id, plan.hash);
  if (approval?.state !== "merged") return null;
  // The epic's integration branch is the base of every task pull request
  // (RC16.2): named in the marker and in one visible line.
  const base = integrationBranchOf(store, plan);
  return (tasks) =>
    renderProvenance({
      spec: plan.spec,
      tasks,
      commit: approval.commit,
      approvedBy: approval.approvedBy,
      ...(plans ? { plans } : {}),
      ...(base ? { base } : {}),
    }) +
    (base
      ? `\nBase branch: \`${base}\`. Open the pull request against it.`
      : "");
}
