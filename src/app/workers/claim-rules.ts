// Workflow v1 rules that decide from git state or from one described action
// (docs/github-workflow.md sections 15, 16 and 20). The workflow kit calls
// them. A commit graph is `{commit: [parents]}`.

// A commit graph: each commit to its parents.
type Graph = Record<string, string[]>;

// One action a runner describes, by kind, with the facts its rule reads.
export interface Action {
  kind: string;
  checks?: string;
  specText?: boolean;
  draft?: boolean;
  addedByWriter?: boolean;
  shared?: boolean;
  own?: boolean;
  landed?: boolean;
  released?: boolean;
  withOwnClaimBranch?: boolean;
  createdByRunner?: boolean;
  assignees?: string[];
  approverReply?: boolean;
  repositoryCheck?: boolean;
  private?: boolean;
}

// The task text a lease records and the approved text now.
export interface TaskText {
  title?: unknown;
  acceptance?: unknown;
}

// Whether `from` is `to` or one of its ancestors.
export function reachable(graph: Graph, from: string, to: string) {
  const seen = new Set<string>(),
    todo = [to];
  while (todo.length) {
    const at = todo.pop() as string;
    if (at === from) return true;
    if (seen.has(at)) continue;
    seen.add(at);
    todo.push(...(graph[at] ?? []));
  }
  return false;
}

// Rule 16.5: whether a pull request merged with the checked commit as its
// head. A merge of any other head landed something else.
export const mergedChecked = (
  pull: { merged?: boolean; head?: string } | null | undefined,
  checked: string,
) => Boolean(pull?.merged) && pull?.head === checked;

// Rule 16.5: a claim holds landed work when `head`, the checked work commit,
// differs from the start commit its lease records and either the base holds
// it or its pull request merged with it as the head. A fresh claim's head is
// its start, which is already in the base, so it holds none.
export function landedWork({
  graph,
  start,
  head,
  baseHead,
  pull = null,
}: {
  graph: Graph;
  start: string;
  head: string;
  baseHead: string;
  pull?: { merged?: boolean; head?: string } | null;
}) {
  if (head === start) return false;
  return reachable(graph, head, baseHead) || mergedChecked(pull, head);
}

// Rule 15.3: GitHub moves a branch only forward, so a push is accepted when
// the branch's head is the pushed commit or one of its ancestors.
export const pushAccepted = (
  graph: Graph,
  branchHead: string,
  pushed: string,
) => reachable(graph, branchHead, pushed);

// Rule 15.10: the task text the lease recorded, its title and acceptance
// bullets, against the approved text now. A runner lands only an unchanged
// task.
export const taskRevision = (recorded: TaskText, current: TaskText) =>
  JSON.stringify([recorded.title, recorded.acceptance]) ===
  JSON.stringify([current.title, current.acceptance])
    ? "land"
    : "redo-or-stop";

// Section 20: the rule an action breaks, or null when it breaks none.
export function runnerLimit(action: Action, { login }: { login: string }) {
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
      return action.own && (action.landed || action.released) ? null : "20.5";
    case "delete-lease":
      return action.withOwnClaimBranch || action.createdByRunner
        ? null
        : "20.5";
    case "push-specs-text":
    case "change-approvers":
      return "20.6";
    case "run-spec":
      return action.assignees?.length === 1 && action.assignees[0] === login
        ? null
        : "20.7";
    // An approver's reply may answer a pending action the runner named;
    // comment text never changes a task, runs a command or lands work.
    // shortcut: `follow-text` is `answer-pending-action` until the kit case
    // limit-20-8 moves to the split kinds.
    case "follow-text":
    case "answer-pending-action":
      return action.approverReply ? null : "20.8";
    case "follow-comment-text":
      return "20.8";
    case "run-command":
      return action.repositoryCheck ? null : "20.9";
    case "write-public":
      return action.private ? "20.10" : null;
    default:
      return null;
  }
}
