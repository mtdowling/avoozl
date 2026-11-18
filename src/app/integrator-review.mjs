// Review pull requests for batch branches (landing-trains lt-8.1, LT1.6, D3).
// A queued task has no pull request until a person asks with
// `avoozl landing review TASK`; this is the only code that opens one, and the
// tick and the integrator never call it.
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
