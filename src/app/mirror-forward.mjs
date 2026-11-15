// The record of each crew pull request merged into a private mirror (RC24.5,
// RC24.14, design D29.4). One `mirror_forward` record per merge commit, kept in
// SQLite. This file only records and shows; forwarding is a later task.
//
// shortcut: the closed pull requests are listed in full on each tick. Upgrade
// to a sorted, bounded read when a mirror has thousands of closed pull requests.
// shortcut: a merge that happened before this machine first saw the mirror is
// not recorded; a person forwards that one by hand.
import { parseRepository } from "./github.mjs";

const META = "mirrorForwardSince";

// Records, oldest merge first.
export function mirrorForwards(store) {
  return store
    .list("mirror_forward")
    .sort(
      (a, b) =>
        String(a.mirrorMergedAt).localeCompare(String(b.mirrorMergedAt)) ||
        a.mirrorPr - b.mirrorPr,
    );
}

// The tick step. Returns {errors}. An unreadable mirror is reported once per
// message and costs nothing else.
export async function mirrorForwardStep(
  store,
  github,
  { policy, now = Date.now(), publicBranches = () => [] } = {},
) {
  const errors = [],
    since = { ...(store.getMeta(META) ?? {}) };
  let changed = false;
  for (const [repository, entry] of Object.entries(
    policy?.repositories || {},
  )) {
    const mirror = entry.mirror;
    if (!mirror || !github) continue;
    if (!since[mirror.mirror]) {
      since[mirror.mirror] = new Date(now).toISOString();
      changed = true;
    }
    try {
      const defaultBase = (
          await github.repository(parseRepository(mirror.mirror))
        )?.default_branch,
        // Merges into the mirror's copy of a public branch forward too
        // (RC26.3), as a change against that branch.
        bases = [defaultBase, ...publicBranches(repository, mirror)].filter(
          (name, index, all) => name && all.indexOf(name) === index,
        );
      for (const base of bases) {
        const pulls = await github.listPullRequests(mirror.mirror, {
          state: "closed",
          base,
        });
        for (const pull of pulls) {
          const sha = pull.merge_commit_sha;
          if (
            !pull.merged_at ||
            !sha ||
            pull.base?.ref !== base ||
            pull.merged_at < since[mirror.mirror] ||
            store.get("mirror_forward", sha)
          )
            continue;
          const detail = await github.pullRequest(mirror.mirror, pull.number),
            head = String(pull.head?.ref ?? ""),
            prefix = mirror.branchPrefix ?? "";
          store.put("mirror_forward", {
            id: sha,
            repository,
            mirror: mirror.mirror,
            mirrorPr: pull.number,
            taskId:
              prefix && head.startsWith(prefix)
                ? head.slice(prefix.length)
                : null,
            approver: detail?.merged_by?.login ?? null,
            // The branch it merged into: a public branch's copy, or the default.
            ...(base === defaultBase ? {} : { base }),
            state: "to_forward",
            reason: "Merged in the mirror, not forwarded yet.",
            mirrorMergedAt: pull.merged_at,
            forwardedAt: null,
            publicPrAt: null,
            publicMergedAt: null,
            forwardBranch: null,
            publicPr: null,
          });
        }
      }
    } catch (error) {
      errors.push(
        `${mirror.mirror} merged pull requests could not be read: ${error.message}`,
      );
    }
  }
  if (changed) store.setMeta(META, since);
  return { errors };
}

// Needs you: one row per record still to forward, for a repository whose
// `forward` is nudge. A blocked record keeps its row with the reason.
export function mirrorForwardRows(store, policy) {
  return mirrorForwards(store)
    .filter((record) => {
      const mirror = policy?.repositories?.[record.repository]?.mirror;
      if (
        !mirror ||
        mirror.forward === "off" ||
        !["to_forward", "blocked", "closed_unmerged"].includes(record.state)
      )
        return false;
      // `auto` shows a row only for a blocked or closed record.
      return record.state !== "to_forward" || mirror.forward === "nudge";
    })
    .map((record) => ({
      kind: "needs-human",
      reason: "forward",
      id: `mirror-forward:${record.id}`,
      taskId: record.taskId,
      authority: "github",
      link: record.batch
        ? `https://github.com/${record.mirror}/tree/${record.batch.branch}`
        : `https://github.com/${record.mirror}/pull/${record.mirrorPr}`,
      forwardId: record.id,
      title: record.batch
        ? `Forward epic ${record.title}`
        : `Forward mirror pull request #${record.mirrorPr}`,
      detail: record.reason,
      openedAt: record.mirrorMergedAt,
    }));
}

// The Trace times of one record, matched by the mirror pull request number.
export function mirrorRecordFor(store, mirror, pullNumber) {
  return (
    mirrorForwards(store).find(
      (record) => record.mirror === mirror && record.mirrorPr === pullNumber,
    ) ?? null
  );
}
