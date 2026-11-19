// Check reads for a pull request's head commit, for the integration head
// (integration-head.mjs).
const FINE = new Set(["success", "neutral", "skipped"]);

// Every check run and commit status on the head commit, as {name, ok, done}.
export async function checksOf(github, repository, sha) {
  const [runs, status] = await Promise.all([
    github.checkRuns(repository, sha),
    github.commitStatus(repository, sha),
  ]);
  return [
    ...(runs || []).map((run) => ({
      name: run.name,
      done: run.status === "completed",
      ok: run.status === "completed" && FINE.has(run.conclusion),
    })),
    ...(status?.statuses || []).map((entry) => ({
      name: entry.context,
      done: entry.state !== "pending",
      ok: entry.state === "success",
    })),
  ];
}

export const green = (checks, required) =>
  checks.length > 0 &&
  checks.every((check) => check.ok) &&
  required.every((name) => checks.some((check) => check.name === name));
