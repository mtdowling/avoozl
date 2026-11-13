# Phase 3 completion and close-without-code: task 3.11

Recorded 2026-11-12 on branch `kirocrew-native`, code commit `aab92f0`.

## What changed

- The cron's tick (`workspace.tick` with a session roster) now runs a GitHub
  step: `reconcileGitHubCompletion` in `src/app/github-close.mjs`, then
  `completeParents`, then `closeGitHubParents`. It reads only repositories
  this machine is the active writer for. A GitHub error is reported in the
  tick result (`github.status`) and does not stop local work.
- Each GitHub leaf gets a cached verdict (`task.githubVerdict`), keyed by the
  issue's state, reason, close time and update time. A tick with no GitHub
  change writes nothing. A verdict held on checks is retried each tick.
- **Verified**: closed as completed, exactly one closer
  (`closedByPullRequestsReferences`), merged, in the leaf's code repository
  (the issue's repository, or in plans-repo mode the project's registered
  repository), on `baseBranch`, with every `requiredChecks` entry passing on
  the head SHA, read in the code repository. No branch-name matching.
- **Order**: closed with no merged closer, as completed or not planned. The
  newest `closed` event names the closer. If that is the project
  automation, the newest `project_v2_item_status_changed` event names the
  person who dragged the card. The closer passes `actorAllowed` from
  `github-policy.mjs`. Avoozl writes the marker `order`, keeps a
  `github-order:<task>` receipt, and dependents are released at every level.
- **Held**: a disallowed or unreadable closer, a conflicting closer (several,
  other repository, other base), failing checks, or a merged passing pull
  request whose issue is still open. The task gets a `github-completion:`
  decision and a decision notice. Avoozl never reopens or closes a leaf.
- **Reopen**: the verdict returns to open, the status is restored, and the
  marker `order` and receipt are removed. Dependents that have not started
  wait again.
- `completionReached` uses the verdict in place of the Phase 2 shortcut
  (any merged pull request). An order satisfies every level. A verified leaf
  satisfies every level except `released`.
- Dependents of an order get a note in the worker brief, and in the managed
  body section for Issue Radar leaves. In plans-repo mode the note names the
  blocker by task ID and title only.
- Avoozl closes a parent issue as completed once its children are done.

## Files

`src/app/github-close.mjs`, `src/app/github-completion.mjs`,
`src/app/tick.mjs`, `src/app/delivery.mjs`, `src/app/github-projection.mjs`,
`src/app/operations.mjs`, `src/work-model.mjs`,
`src/app/test/github-close.test.mjs` (new).

## Checks

- `npm test`: 708 of 708 passed (typecheck and build included).
- `git diff --check`: clean.
- Every GitHub call in the tests goes to a fake client.

## Not done here

- Reading the Status change actor from REST `project_v2_item_status_changed`
  events is Inferred. Proof P11 must confirm which source names the person.
- Events and timeline are read as one page of 100.
- A pull request that merges without touching its open issue is seen only
  when the issue next changes.
- The design's "accept" resolution of a held close (recording the owner as
  the order's actor) has no operation yet.
