// Arming GitHub auto-merge on a crew pull request with the repository's merge
// method (RC28.7): `SQUASH` lands one commit per pull request, titled and
// described by the pull request itself; `MERGE` lands a merge commit. Both the
// arm step (RC5.2) and the conflict fix (RC28.2) arm through here.
export function armCrewPull(github, config, pull, method) {
  return github.armAutoMerge(
    config,
    pull.node_id,
    method,
    method === "SQUASH"
      ? {
          headline: `${String(pull.title ?? "").slice(0, 250)} (#${pull.number})`,
          body: String(pull.body ?? ""),
        }
      : {},
  );
}
