// Review pull requests for batch branches (landing-trains lt-8.1, LT1.6, D3).
// A queued task has no pull request until a person asks with
// `avoozl landing review TASK`; this is the only code that opens one, and the
// tick and the integrator never call it.
import { guardGitHub, screenReply } from "./content-rules.mjs";
import { fail } from "./store.mjs";
import { taskRepository } from "../work-model.mjs";

const TABLE = "landing_queue";

const lines = (value) =>
  [value ?? []].flat().filter((line) => typeof line === "string" && line);

// Opens the review pull request for `taskId`'s batch branch, or returns the
// one it already has. The number is kept on the queue entry as `reviewPr`.
export async function reviewBranch(store, { github, taskId }) {
  const task = store.read().tasks.find((t) => t.id === taskId);
  if (!task) fail(`Task ${taskId ?? ""} was not found.`, 404);
  const project = store.get("projects", taskRepository(task) ?? "");
  if (project?.landing !== "train")
    fail(`${task.id} is in a repository that does not land in trains.`, 409);
  if (!project.repository)
    fail(
      `${task.id}: this repository has no GitHub name to open a pull request on.`,
      409,
    );
  const entry = store
    .list(TABLE)
    .find(
      (e) =>
        e.projectId === project.id &&
        e.branch &&
        ["queued", "in-train"].includes(e.state) &&
        e.tasks?.some((t) => t.task === task.id),
    );
  if (!entry)
    fail(
      `${task.id} is not waiting in the landing queue. Queue its branch first.`,
      409,
    );
  if (entry.reviewPr)
    return { number: entry.reviewPr, created: false, branch: entry.branch };
  if (typeof github?.createPullRequest !== "function")
    fail("A pull request needs GitHub access.", 409);
  const body = [
    `Review copy of the queued branch \`${entry.branch}\`. It lands through the integrator train and this pull request is closed with a note when it does.`,
    ...(lines(task.acceptance).length
      ? ["", "Acceptance:", ...lines(task.acceptance).map((l) => `- ${l}`)]
      : []),
  ].join("\n");
  const pull = await github.createPullRequest(project.repository, {
    title: task.title,
    head: entry.branch,
    base: entry.base,
    body,
  });
  store.put(TABLE, { ...store.get(TABLE, entry.id), reviewPr: pull.number });
  return { number: pull.number, created: true, branch: entry.branch };
}

const fill = (template, values) =>
  template.replace(/\{(\w+)\}/g, (all, name) => values[name] ?? all);

// After the trunk push: one comment on each open review pull request of a
// landed member, then close it (LT9.2, LT9.3, D10.4). The batch branch is
// never moved for it, so GitHub shows the pull request closed, not merged.
// A pull request a person closed gets nothing. The text is filled from the
// train record only and must pass the privacy screen and the content rules
// (`guardGitHub`) before it is written; a blocked comment is not posted but
// the pull request is still closed. A GitHub failure is returned as a note,
// never thrown: landing has already happened.
// shortcut: {train} is the train's ID as text, not a link to the Landing
// queue page, which has no per-train URL yet.
export async function closeReviewPulls(
  store,
  { github, repository, entries, trainId, trunkCommit, validated, template },
) {
  const notes = [],
    guarded = guardGitHub(github, store),
    commitUrl = `https://github.com/${repository}/commit/${trunkCommit}`;
  for (const [index, entry] of entries.entries()) {
    const number = store.get(TABLE, entry.id)?.reviewPr;
    if (!number) continue;
    try {
      const pull = await github.pullRequest(repository, number);
      if (pull?.state !== "open") continue;
      const text = fill(template, {
        train: `\`${trainId}\``,
        position: String(index + 1),
        count: String(entries.length),
        trunkCommit: `[${trunkCommit.slice(0, 12)}](${commitUrl})`,
        checks: validated
          ? "the cheap checks and full validation passed"
          : "the cheap checks passed; full validation is still to finish",
      });
      if (screenReply(text).length)
        notes.push(`#${number}: comment held by the privacy screen`);
      else
        await guarded
          .createIssueComment(repository, number, text)
          .catch((error) => {
            if (!error.contentBlocked) throw error;
            notes.push(`#${number}: comment blocked by the content rules`);
          });
      await github.closePullRequest(repository, number);
    } catch (error) {
      notes.push(`#${number}: ${error.message}`);
    }
  }
  return notes;
}
