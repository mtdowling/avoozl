// The public pull request after a forward (RC24.6, RC24.11, design D29.7).
// Each tick reads every open public pull request of a record: a merge makes
// the task done, a close without a merge returns the item to Waiting on you,
// and review comments are copied to the mirror once.
//
// shortcut: reads one pull request at a time, three calls at most per open
// record per tick. Upgrade to a conditional (ETag) read at many records.
import { noteInstances } from "./mirror-forward-run.mjs";

const marker = (id) => `<!-- avoozl-review-copy ${id} -->`;

// True when the task has no mirror, or its public pull request merged (or it
// was never forwarded because no record exists for a task a person closed).
export function publicMergeReached(store, task, repo) {
  const mirror = repo?.mirror;
  if (!mirror) return true;
  const records = store
    .list("mirror_forward")
    .filter(
      (record) => record.taskId === task.id && record.mirror === mirror.mirror,
    );
  return records.some((record) => record.state === "public_merged");
}

async function copyComments(store, github, record, mirror) {
  const done = new Set(record.copiedComments ?? []);
  const fresh = (
    await github.listPullRequestReviewComments(mirror.source, record.publicPr)
  ).filter((comment) => !done.has(String(comment.id)));
  if (!fresh.length) return record;
  let next = { ...record, copiedComments: [...done] };
  for (const comment of fresh) {
    noteInstances(store, comment.body);
    const text = `${marker(comment.id)}\n@${comment.user?.login ?? "someone"} commented on the public pull request:\n\n${comment.body ?? ""}`;
    // The mirror pull request is merged, so one follow-up issue holds them.
    if (!next.followUpIssue) {
      const issue = await github.createIssue(mirror.mirror, {
        title: `Review comments on the public pull request for mirror #${record.mirrorPr}`,
        body: text,
      });
      next.followUpIssue = issue.number;
    } else {
      await github.createIssueComment(mirror.mirror, next.followUpIssue, text);
    }
    next.copiedComments.push(String(comment.id));
    // Saved after each copy so a failure later never repeats one.
    store.put("mirror_forward", next);
  }
  return next;
}

// The tick step. Returns {errors}.
export async function mirrorPublicPollStep(
  store,
  github,
  { policy, now = new Date().toISOString() } = {},
) {
  const errors = [];
  for (const start of store.list("mirror_forward")) {
    const mirror = policy?.repositories?.[start.repository]?.mirror;
    if (!mirror || !github || start.state !== "public_open" || !start.publicPr)
      continue;
    try {
      let record = start;
      const pull = await github.pullRequest(mirror.source, record.publicPr);
      noteInstances(store, pull?.body);
      record = await copyComments(store, github, record, mirror);
      if (pull?.merged_at) {
        record = {
          ...record,
          state: "public_merged",
          publicMergedAt: pull.merged_at,
          reason: "Merged in the public repository.",
        };
      } else if (pull?.state === "closed") {
        const closer = (await github.issue(mirror.source, record.publicPr))
          ?.closed_by?.login;
        record = {
          ...record,
          state: "closed_unmerged",
          reason: `The public pull request #${record.publicPr} was closed without a merge by ${closer ?? "someone"} at ${pull.closed_at ?? now}. Avoozl will not reopen or push again until you press Forward.`,
        };
      }
      store.put("mirror_forward", record);
    } catch (error) {
      errors.push(
        `Public pull request #${start.publicPr} could not be read: ${error.message}`,
      );
    }
  }
  return { errors };
}
