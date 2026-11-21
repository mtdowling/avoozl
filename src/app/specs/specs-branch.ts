// The branch a workspace's spec folders live on: `specs.branch` in
// `.avoozl.json` (validateSpecs in layered-config.mjs checks it). Unset means
// the spec repository's base branch. Avoozl reads `.kiro/specs/` there, an
// approval is an allowed author's commit there, and ticks are read and
// written there. Code still lands on each code repository's own base branch.
import { loadLayeredConfig } from "../settings/layered-config.ts";
import type { Store } from "../store/store.ts";

// The workspace's `specs.branch`, or null when unset or unreadable.
export function specsBranchSetting(
  workspaceRoot: string | null | undefined,
): string | null {
  if (!workspaceRoot) return null;
  try {
    return loadLayeredConfig({ workspaceRoot }).config.specs?.branch ?? null;
  } catch {
    return null;
  }
}

// The branch specs live on for the checkout at `root`: the setting, else
// that repository's base branch, else main.
export function specsBranch(
  store: Store,
  workspaceRoot: string | null | undefined,
  root: string,
): string {
  return (
    specsBranchSetting(workspaceRoot) ??
    (store
      .list<{ id: string; root?: string; baseBranch?: string }>("repositories")
      .find((entry) => entry.root === root)?.baseBranch ||
      "main")
  );
}
