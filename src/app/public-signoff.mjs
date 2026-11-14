// The public sign-off gate (RC10.1, design D12). Release and arming do not run
// for a repository that is public, or whose visibility was not read, until the
// sign-off of "Crews on public repositories" (Requirement 85) is complete.
// The sign-off is read from the workspace meta key `publicSignoff`
// ({"owner/repo": {complete: true}}); the owner-only `radar.signoff` operation
// writes it.
export const PUBLIC_HELD =
  "This repository is public, or its visibility could not be read, and its public sign-off is not complete, so nothing is released.";

// null when release may run, else the sentence that says why not.
export function publicHold(store, repositoryId) {
  const visibility = store.get("github_repositories", repositoryId)?.private;
  if (visibility === true) return null;
  return store.getMeta("publicSignoff")?.[repositoryId]?.complete === true
    ? null
    : PUBLIC_HELD;
}
