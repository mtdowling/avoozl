// What a fake GitHub answers for an integration branch and main. `fresh`:
// commits on main the branch lacks. `own`: commits on the branch main lacks.
// `mainFiles` / `branchFiles`: files each side changed. `conflict`: the merge
// cannot be made.
export interface BranchSides {
  fresh: number;
  own: number;
  conflict: boolean;
  mainFiles: string[];
  branchFiles: string[];
}
export type Merge = { base: string; head: string };

// compareCommits' reply between `base` and `head`.
export function compared(
  s: BranchSides,
  branch: string,
  base: string,
  head: string,
) {
  const fromMain = base === branch && head === "main";
  return {
    ahead_by: fromMain ? s.fresh : s.own,
    behind_by: fromMain ? s.own : s.fresh,
    files: (fromMain ? s.mainFiles : s.branchFiles).map((filename) => ({
      filename,
    })),
  };
}

// Record a mergeBranch call; a conflict refuses it as GitHub does.
export function recordMerge(merges: Merge[], s: BranchSides, input: Merge) {
  merges.push(input);
  if (s.conflict) throw Object.assign(Error("Merge conflict"), { status: 409 });
}
