// Source issue back-links (Requirement 92.8 and 92.10, design §4.27, task 44.6).
// A source issue reaches its spec only through a write Avoozl already makes:
// the intake status comment (github-intake.mjs) names the spec issue, so
// GitHub shows its own cross-reference.
//
// - Visibility. Each side's privacy comes from the stored repository row
//   (github-sync.mjs `private`); nothing here reads GitHub. An unknown side
//   links nothing.
// - The status comment names the spec issue where `mayLinkSpecIssue`
//   permits: the input issue is private, or the spec issue is public.
// - No Radar API, grant or import: these are plain GitHub issue references.

// Whether a pull request or issue may name the spec issue (R102.7,
// R102.12): never a private issue from a public one. Unknown visibility
// links nothing.
export function mayLinkSpecIssue({ pullPrivate, issuePrivate }) {
  if (typeof pullPrivate !== "boolean" || typeof issuePrivate !== "boolean")
    return false;
  return pullPrivate || !issuePrivate;
}

const lower = (value) => String(value ?? "").toLowerCase();
const same = (a, b) =>
  lower(a?.repository) === lower(b?.repository) && a?.number === b?.number;

// A repository's stored privacy: true, false, or null when unread.
export function storedPrivate(store, repository) {
  const row = store
    .list("github_repositories")
    .find((entry) => lower(entry.id) === lower(repository));
  return typeof row?.private === "boolean" ? row.private : null;
}

export const reference = ({ repository, number }) => `${repository}#${number}`;

// The published spec issue the status comment on `input` may name, or
// null: a live spec plan that came from `input`, whose spec issue is not
// `input` itself and whose visibility permits.
export function intakeSpecIssue(store, input) {
  const inputPrivate = storedPrivate(store, input.repository);
  for (const plan of store.list("plans")) {
    if (plan.deletedAt || !plan.spec) continue;
    if (!same(plan.context?.newPlan?.source, input)) continue;
    const issue = store.get("receipts", `github-parent:plan:${plan.id}`);
    if (!issue?.repository || !Number.isInteger(issue.number)) continue;
    if (same(issue, input)) continue;
    if (
      mayLinkSpecIssue({
        pullPrivate: inputPrivate,
        issuePrivate: storedPrivate(store, issue.repository),
      })
    )
      return { repository: issue.repository, number: issue.number };
  }
  return null;
}
