// Source issue back-links (Requirement 92.8 and 92.10, design §4.27, task 44.6).
// A source issue reaches its spec only through writes Avoozl already makes:
// the intake status comment (github-intake.mjs) names the spec issue, and
// the spec journal's first generation record (driver-generations.mjs) names
// the source issue as owner/repo#N, so GitHub shows its own cross-reference.
//
// - Visibility. Each side's privacy comes from the stored repository row
//   (github-sync.mjs `private`); nothing here reads GitHub. An unknown side
//   links nothing.
// - The status comment names the spec issue where `mayLinkSpecIssue`
//   permits: the input issue is private, or the spec issue is public.
// - The journal names a source only when both sides have the same
//   visibility. A public journal never names a private repository, and a
//   private spec's reference never shows on a public Radar issue, even as a
//   cross-reference GitHub hides from outsiders.
// - No Radar API, grant or import: these are plain GitHub issue references.
import { specLinks } from "./scm-links.mjs";
import { mayLinkSpecIssue } from "./spec-approval.mjs";

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

// The source issues a spec's journal may name: the spec's Radar source
// issues (its link set's `sources`) with the same visibility as the spec
// issue, never the spec issue itself. `specPrivate` is the journal's
// visibility as read for the write.
export function journalSources(store, planId, { specPrivate } = {}) {
  const issue = store.get("receipts", `github-parent:plan:${planId}`);
  if (!issue?.repository || typeof specPrivate !== "boolean") return [];
  return (specLinks(store, planId)?.sources ?? [])
    .filter((source) => source.kind === "issue" && !same(source, issue))
    .filter((source) => {
      const sourcePrivate = storedPrivate(store, source.repository);
      return (
        mayLinkSpecIssue({
          pullPrivate: sourcePrivate,
          issuePrivate: specPrivate,
        }) &&
        mayLinkSpecIssue({
          pullPrivate: specPrivate,
          issuePrivate: sourcePrivate,
        })
      );
    })
    .map(({ repository, number }) => ({ repository, number }));
}
