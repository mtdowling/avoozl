// The spec issue's assignee says who works on a spec (Requirement 116,
// design §4.44). The record is per spec: a spec has one driver, and the
// driver's own Avoozl knows the tasks it runs. Take over assigns this
// machine's login when nobody is assigned; Hand off and Release remove it.
// Each write adds or removes only this login, and the issue is read back,
// because GitHub ignores an assignee change from a token without push access.
import { fail } from "../store/store.mjs";
import { asJob } from "../github/github-jobs.mjs";

const same = (a, b) =>
  String(a || "").toLowerCase() === String(b || "").toLowerCase();

export const assigneesOf = (issue) =>
  (issue?.assignees || [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.login))
    .filter(Boolean);

const has = (logins, login) => logins.some((name) => same(name, login));

// Assigns `login` on the spec issue when nobody is assigned, and returns the
// assignees GitHub kept. Refuses, writing nothing, when someone else is.
// Two people who press at once may both end up assigned; the caller's later
// read sees two and every machine reads only.
export async function assignSpecIssue(client, repository, number, login) {
  const github = asJob("spec-issues", client);
  const current = assigneesOf(await github.issue(repository, number));
  if (current.length === 1 && same(current[0], login)) return current;
  if (current.length)
    fail(
      current.length === 1
        ? `Taken by ${current[0]}: spec issue #${number} is assigned to them. Nothing changed.`
        : `Spec issue #${number} has ${current.length} assignees (${current.join(", ")}). Remove all but one on GitHub first. Nothing changed.`,
      409,
    );
  await github.addAssignees(repository, number, [login]);
  const kept = assigneesOf(await github.issue(repository, number));
  if (!has(kept, login))
    fail(
      `GitHub did not assign ${login} on spec issue #${number}: this token likely has no push access. Nothing else changed.`,
      409,
    );
  return kept;
}

// Removes `login` from the spec issue and returns who is still assigned.
export async function unassignSpecIssue(client, repository, number, login) {
  const github = asJob("spec-issues", client);
  await github.removeAssignees(repository, number, [login]);
  const kept = assigneesOf(await github.issue(repository, number));
  if (has(kept, login))
    fail(
      `GitHub kept ${login} assigned on spec issue #${number}: this token likely has no push access.`,
      409,
    );
  return kept;
}
