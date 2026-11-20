# Glossary

Each word here has one meaning, and a word that is not listed has its ordinary
meaning. Words that look alike are set apart below.

## Take, principal

| Word | Means | Where you see it |
| ---- | ----- | ---------------- |
| take | Hold one item so nothing else works on it: a person takes a ready task by hand, or an executor takes a queued request. | `avoozl take TASK`, `executor.*.take` |
| principal | The signed identity a request carries to the app backend. | `principalAllows`, `verifyPrincipal` |

## Review

"Review" alone names nothing, so use the full name.

| Name | Means | Setting |
| ---- | ----- | ------- |
| spec review | An agent with the `avoozl-spec-review` skill reads a draft spec and posts findings. It edits nothing. | |
| code review | Reviewer chats that read a task's commit before it merges, and the pull request's own approval count on GitHub. | `delivery.reviewers`, `pullRequestReviews` |
| changed tasks | Tasks whose design text changed since they were approved. Needs you lists them as "N tasks in SPEC changed: check them". | |

## Other terms

- **driver**: the one machine that drives a spec. **worker**: a machine that
  runs granted tasks.
- **trust list**: the people or permission whose reviews and discussions count:
  `allowedActors`, `minimumPermission`. Set once, on the repository (Edit
  repository > GitHub).
- **base branch**: the branch work lands on. Set once, on the repository (Edit
  repository > Landing).
- **lane**: one long-lived worker or reviewer session on a machine, reused
  task after task (`lanes.local`, `lanes.reviewers`). A lane is not a
  worktree: each task still works in its own worktree
  ([Lanes](delivery.md#lanes)).
- **required checks**: GitHub check names a pull request must pass
  (`requiredChecks`). A repository's own check commands (`projects.<id>.checks`)
  are a different thing.
- **OTLP**: the OpenTelemetry protocol, the JSON body a backend or collector
  takes at `/v1/traces` and `/v1/metrics` ([Telemetry](telemetry.md)).
- **exporter**: where recorded timing goes. The SQLite exporter writes
  Avoozl's own tables; the OTLP exporter sends to an endpoint.
- **mode**: plans-repo, single-repo or local. It is worked out from repository
  roles and is never written.
