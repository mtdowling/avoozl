// The landing step one claimed task takes (Workflow v1 rules 16 and 17).
//
//   mode      the repository's landing mode: direct, pr or off
//   pr        landing.pr in `pr` mode: draft (the default), ready or auto
//   checks    whether the checks passed on the exact head: true or false
//   baseMoved whether the base moved since the claim branch last took it
//   landed    the work is on the base already and its tick is missing (16.5)
//   base      the branch the task lands on: its integration branch or the
//             default branch
//   done      the branch that gets the tick when it is not the base (the
//             specs branch of another repository), else null
//   stopped   the task's spec is stopped (rule 10.1)
//
// Returns {action, base, tick, mergeBase, deleteClaimBranch} and
// `mergeGuard: "head-sha"` when the runner merges, {action: "none"} when
// the checks failed, or {action: "hold"} while the spec is stopped: no
// push and no landing until the stop clears (10.2). The landing code acts
// on it: direct-landing.mjs, pr-landing.mjs, and finishLanded below for
// landed work.
export function landingAction({
  mode,
  pr = "draft",
  checks,
  baseMoved = false,
  landed = false,
  base,
  done = null,
  stopped = false,
}: {
  mode?: "direct" | "pr" | "off" | string;
  pr?: string;
  checks?: boolean;
  baseMoved?: boolean;
  landed?: boolean;
  base: string;
  done?: string | null;
  stopped?: boolean;
}) {
  if (stopped) return { action: "hold" };
  // Landed work whose tick is missing is ticked on its done branch in its
  // own commit, then its claim branch goes (16.5).
  if (landed)
    return {
      action: "tick-landed-work",
      base: done ?? base,
      tick: "own-commit",
      mergeBase: false,
      deleteClaimBranch: true,
    };
  if (!checks) return { action: "none" };
  // The tick is in the work commit or on the claim branch before the checks
  // (16.2), so it lands with the work. A done branch other than the base
  // gets the tick in its own commit once the work lands.
  const step = {
    base,
    tick: done && done !== base ? "own-commit" : "same-commit",
    mergeBase: Boolean(baseMoved),
  };
  if (mode === "direct")
    return { action: "fast-forward-base", ...step, deleteClaimBranch: true };
  if (mode === "off")
    return { action: "push-claim-branch", ...step, deleteClaimBranch: false };
  if (pr === "auto")
    return {
      action: "open-and-merge-pull-request",
      ...step,
      deleteClaimBranch: true,
      mergeGuard: "head-sha",
    };
  // A person merges a draft or ready pull request; the claim branch stays
  // until it merges (14.6), and the merge is read like any landed work.
  return {
    action: pr === "ready" ? "open-pull-request" : "open-draft-pull-request",
    ...step,
    deleteClaimBranch: false,
  };
}
