# Glossary

Each word here has one meaning, and a word that is not listed has its ordinary
meaning. Words that look alike are set apart below, such as `take` and `accept`
in these commands:

```sh
avoozl take TASK
avoozl worker accept
```

## Claim, take, grant, accept

| Word | Means | Where you see it |
| ---- | ----- | ---------------- |
| claim | The record that says which machine drives a spec: a marker on the spec's issue, or a row in the workspace database in Local only mode. | Take over, Hand off, "no claim yet" |
| take | Hold one item so nothing else works on it: a person takes a ready task by hand, or an executor takes a queued request. | `avoozl take TASK`, `executor.*.take` |
| grant | The driver's permission for one worker to run one task of a shared spec. | `spec grants`, `workers.grantStaleAfter`, Release grant |
| accept | A worker machine starts the tasks it was granted. | `avoozl worker accept` |
| statement | The one-sentence point of a review finding. | A finding's `statement` |
| principal | The signed identity a request carries to the app backend. | `principalAllows`, `verifyPrincipal` |

## Review

"Review" alone names nothing, so use the full name.

| Name | Means | Setting |
| ---- | ----- | ------- |
| plan review | A second model reads a draft spec and files findings. | `planReview` |
| plan review finding | One problem a plan review found: kind, severity, file, quote, statement, evidence. | |
| code review | Reviewer chats that read a task's commit before it merges, and the pull request's own approval count on GitHub. | `delivery.reviewers`, `pullRequestReviews` |
| triage review | The triage agent's comment review of someone else's pull request: full, or partial past the size limit, and it says which. | `triage.fullReviewMaxLines`, `triage.reviews` |
| spec approval reviewers | The GitHub logins asked to review a spec's approval pull request. | `github.specReviewers` |
| changed tasks | Tasks whose design text changed since they were approved. Needs you lists them as "N tasks in SPEC changed: check them". | |

## Other terms

- **driver**: the one machine that drives a spec. **worker**: a machine that
  runs granted tasks.
- **trust list**: the people or permission whose reviews and discussions count:
  `allowedActors`, `minimumPermission`. Set once, on the repository (Edit
  repository > GitHub).
- **base branch**: the branch work lands on. Set once, on the repository (Edit
  repository > Landing).
- **required checks**: GitHub check names a pull request must pass
  (`requiredChecks`). A repository's own check commands (`projects.<id>.checks`)
  are a different thing.
- **mode**: plans-repo, single-repo or local. It is worked out from repository
  roles and is never written.
