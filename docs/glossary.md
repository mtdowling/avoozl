# Glossary

One meaning for each word. If a word is not here, it has its ordinary meaning.

## claim, take, grant, accept

| Word | Means | Where you see it |
| ---- | ----- | ---------------- |
| claim | The record in a spec's plan issue that says which machine drives the spec. | Take over, Hand off, "no claim yet" |
| take | Hold one item so nothing else works on it: a person takes a ready task by hand, or an executor takes a queued request. | `avoozl take TASK`, `executor.*.take` |
| grant | The driver's permission for one worker to run one task of a shared spec. | `spec grants`, `workers.grantStaleAfter`, Release grant |
| accept | A worker machine starts the tasks it was granted. | `avoozl worker accept` |
| in progress | An Issue Radar crew is working on an issue. Radar's own label. | `crewLabels.inProgress` (`crew: in progress`) |
| statement | The one-sentence point of a review finding. | A finding's `statement` |
| principal | The signed identity a request carries to the app backend. | `principalAllows`, `verifyPrincipal` |

Old names still in code, to rename when the file next changes: the `approval-claim:`
receipts and `releaseClaims` in `src/app/approval-label.mjs` (a label Avoozl
wrote itself and now only removes), `claimedAt` and `claimToken` on executor
requests and crew rows, and the `claimed` row state in the Release queue.

## review

"Review" alone names nothing. Use the full name.

| Name | Means | Setting |
| ---- | ----- | ------- |
| plan review | A second model reads a draft spec and files findings. | `planReview` |
| plan review finding | One problem a plan review found: kind, severity, file, quote, statement, evidence. | |
| code review | Reviewer chats that read a task's commit before it merges, and the pull request's own approval count on GitHub. | `delivery.reviewers`, `pullRequestReviews` |
| review draft | A draft of a pull request review that Avoozl writes for you to submit. | `radar.reviewLabel`, `radar.draftedLabel` |
| spec approval reviewers | The GitHub logins asked to review a spec's approval pull request. | `github.specReviewers` |
| changed tasks | Tasks whose design text changed since they were approved. Needs you lists them as "N tasks in SPEC changed: check them". | |

## other words

- **driver**: the one machine that drives a spec. **worker**: a machine that runs granted tasks.
- **trust list**: the people or permission that may start work: `allowedActors`, `minimumPermission`. Set once, on the repository (Edit repository > GitHub).
- **base branch**: the branch work lands on. Set once, on the repository (Edit repository > Landing).
- **required checks**: GitHub check names a pull request must pass (`requiredChecks`). A repository's own check commands (`projects.<id>.checks`) are a different thing.
- **mode**: plans-repo, single-repo or local. It is worked out from repository roles and is never written.
