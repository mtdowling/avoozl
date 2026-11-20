// Workflow v1 rules that decide from git state or from one described action
// (docs/github-workflow.md sections 12, 13 and 20). The workflow kit calls
// them. A commit graph is `{commit: [parents]}`.

// Whether `from` is `to` or one of its ancestors.
export function reachable(graph, from, to) {
  const seen = new Set(),
    todo = [to];
  while (todo.length) {
    const at = todo.pop();
    if (at === from) return true;
    if (seen.has(at)) continue;
    seen.add(at);
    todo.push(...(graph[at] ?? []));
  }
  return false;
}

// Rule 13.6: a claim holds landed work when its head differs from the start
// commit its lease records and is in the base, or its pull request merged
// with a head that differs from that start. A fresh claim's head is its
// start, which is already in the base, so it holds none.
export function landedWork({ graph, start, head, baseHead, pull = null }) {
  if (head !== start && reachable(graph, head, baseHead)) return true;
  return Boolean(pull?.merged) && pull.head !== start;
}

// Rule 12.3: GitHub moves a branch only forward, so a push is accepted when
// the branch's head is the pushed commit or one of its ancestors.
export const pushAccepted = (graph, branchHead, pushed) =>
  reachable(graph, branchHead, pushed);

// Rule 12.8: the task text the lease recorded, its title and acceptance
// bullets, against the approved text now. A runner lands only an unchanged
// task.
export const taskRevision = (recorded, current) =>
  JSON.stringify([recorded.title, recorded.acceptance]) ===
  JSON.stringify([current.title, current.acceptance])
    ? "land"
    : "redo-or-stop";

// Section 20: the rule an action breaks, or null when it breaks none.
export function runnerLimit(action, { login }) {
  switch (action.kind) {
    case "push-base":
      return action.checks === "pass" ? null : "20.1";
    case "merge-pull-request":
      if (action.specText) return "20.6";
      return action.draft ? "20.2" : null;
    case "mark-ready":
    case "arm-auto-merge":
      return action.draft ? "20.2" : null;
    case "act-on-label":
      return action.addedByWriter ? null : "20.3";
    case "force-push":
    case "rebase":
      return action.kind === "rebase" && !action.shared ? null : "20.4";
    case "delete-branch":
      return action.createdByRunner && action.afterLanding ? null : "20.5";
    case "push-specs-text":
    case "change-approvers":
      return "20.6";
    case "run-spec":
      return action.assignees?.length === 1 && action.assignees[0] === login
        ? null
        : "20.7";
    case "follow-text":
      return action.approverReply ? null : "20.8";
    case "run-command":
      return action.repositoryCheck ? null : "20.9";
    case "write-public":
      return action.private ? "20.10" : null;
    default:
      return null;
  }
}
