# Glossary

One meaning for each word. If a word is not here, it has its ordinary meaning.

## claim, take, grant, accept

| Word | Means | Where you see it |
| ---- | ----- | ---------------- |
| claim | The record in a spec's plan issue that says which machine drives the spec. | Take over, Hand off, "no claim yet" |
| take | Hold one item so nothing else works on it: a person takes a ready task by hand, or an executor takes a queued request. | `avoozl take TASK`, `executor.*.take` |
| grant | The driver's permission for one worker to run one task of a shared spec. | `spec grants`, `workers.grantStaleAfter`, Release grant |
| accept | A worker machine starts the tasks it was granted. | `avoozl worker accept` |
| statement | The one-sentence point of a review finding. | A finding's `statement` |
| principal | The signed identity a request carries to the app backend. | `principalAllows`, `verifyPrincipal` |

Old names still in code, to rename when the file next changes: `claimedAt`
and `claimToken` on executor requests, and the `claimed` row state in the
Release queue.

## review

"Review" alone names nothing. Use the full name.

| Name | Means | Setting |
| ---- | ----- | ------- |
| plan review | A second model reads a draft spec and files findings. | `planReview` |
| plan review finding | One problem a plan review found: kind, severity, file, quote, statement, evidence. | |
| code review | Reviewer chats that read a task's commit before it merges, and the pull request's own approval count on GitHub. | `delivery.reviewers`, `pullRequestReviews` |
| triage review | The triage agent's comment review of someone else's pull request: full, or partial past the size limit, and it says which. | `triage.fullReviewMaxLines`, `triage.reviews` |
| spec approval reviewers | The GitHub logins asked to review a spec's approval pull request. | `github.specReviewers` |
| changed tasks | Tasks whose design text changed since they were approved. Needs you lists them as "N tasks in SPEC changed: check them". | |

## other words

- **driver**: the one machine that drives a spec. **worker**: a machine that runs granted tasks.
- **trust list**: the people or permission whose reviews and discussions count: `allowedActors`, `minimumPermission`. Set once, on the repository (Edit repository > GitHub).
- **base branch**: the branch work lands on. Set once, on the repository (Edit repository > Landing).
- **required checks**: GitHub check names a pull request must pass (`requiredChecks`). A repository's own check commands (`projects.<id>.checks`) are a different thing.
- **mode**: plans-repo, single-repo or local. It is worked out from repository roles and is never written.
