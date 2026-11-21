// Check reads for a pull request's head commit, for the integration head
// (integration-head.mjs).
const FINE = new Set(["success", "neutral", "skipped"]);

// One check as the head reads it.
export interface HeadCheck {
  name: string;
  done: boolean;
  ok: boolean;
}

// The GitHub reads this needs.
export interface CheckReader {
  checkRuns(
    repository: string,
    sha: string,
  ): Promise<{ name: string; status: string; conclusion: string }[] | null>;
  commitStatus(
    repository: string,
    sha: string,
  ): Promise<{ statuses?: { context: string; state: string }[] } | null>;
}

// Every check run and commit status on the head commit, as {name, ok, done}.
export async function checksOf(
  github: CheckReader,
  repository: string,
  sha: string,
): Promise<HeadCheck[]> {
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

export const green = (checks: HeadCheck[], required: string[]) =>
  checks.length > 0 &&
  checks.every((check) => check.ok) &&
  required.every((name) => checks.some((check) => check.name === name));
