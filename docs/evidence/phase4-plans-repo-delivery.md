# Phase 4 plans-repo delivery, leak screen and completion: tasks 4.7–4.9

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 4.

- Implementation commit: `f44bf0e` ("Deliver plans-repo leaves through linked branches with a leak screen")
- Base: `kirocrew-native` at `c708d77` (rebased; first built on `687d63b`)
- Recorded: 2026-11-12, Node v26.13.0, macOS

## Proof P25 is unproven

The owner skipped proof P25 (an organization-owned planning repository closed
through a linked branch) because no test organization exists. Task 4.7 is
built as specified on the same-owner user-repository probe (F51, F52) only.
Whether GitHub closes the planning issue, and keeps its name off the pull
request, inside an organization with rulesets and base protection is still
not known. If it does not close there, the merged-but-open decision below is
what the owner sees.

## Checks

| Check                                                                                                                                                                                                                                                                   | Result                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `npm test` at `f44bf0e` (typecheck, build including `build:kirocrew-app`, all tests)                                                                                                                                                                                    | exit 0; 798 tests, 798 pass (after the rebase; 781 of 781 before it), 0 fail                                                |
| New tests, `src/app/test/plans-repo-delivery.test.mjs`                                                                                                                                                                                                                  | 10 of 10 pass                                                                                                               |
| New client test in `src/app/test/github-client-graph.test.mjs`                                                                                                                                                                                                          | pass                                                                                                                        |
| `git diff --check`                                                                                                                                                                                                                                                      | clean                                                                                                                       |
| Live read-only check of the new GraphQL reads against `mtdowling/avoozl-e2e-code-20261111` (`branchHead` on `main` and on a missing branch, `branchPullRequests` on `avoozl/e2e-completion-1794425005542`, `closingPullRequests` on issue 7 with the added text fields) | all three queries accepted; head oid 40 hex, missing branch 409, pull request #8 read with title, body and 1 commit message |

No live write was made. `npm test` rebuilds `canvas-app/extension.js` with
different output; that file was restored and is not part of the change.

## What landed

| Task                      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.7 dispatch              | `readyLeaves` takes the GitHub policy. In plans-repo mode a GitHub leaf whose issue is in the planning repository is ready only once its linked branch is recorded (`github_linked_branches`, a new SQLite table). The tick's GitHub step, after completion and parent closes, runs `ensureLinkedBranches` (`src/app/github-linked-branches.mjs`) for the ready plans-repo leaves within capacity: it reuses a linked branch `avoozl/<task-id>` in the code repository that the planning issue already lists, or calls `createLinkedBranch` with the issue's node ID, the code repository's ID, and the head of `baseBranch` (`branchHead`). Dispatch runs after that step, so the brief goes out in the same tick, never before the branch exists |
| 4.7 brief                 | `plansRepoBrief` sends only the task's ID, title, acceptance and checks (no summary, no issue number, URL or repository). Its steps: fetch `avoozl/<task-id>` and work in a worktree on it, push to it, open one pull request against `baseBranch` with no closing keyword and no issue link, `gh pr merge --auto`, fix checks and review until merge, fetch the base, then report the merge commit. The Crew Mode `next` view shows the same brief, lists a plans-repo leaf as waiting `linked branch` until it exists, and shows a branch failure under `needsYou`. `claim` prepares no local worktree for it. A plans-repo leaf gets no verifier session                                                                                        |
| 4.7 screen before sending | The branch name and the full brief are screened before the branch is made. A hit records the cause, opens one decision per distinct cause, and the leaf is not dispatched. `planReadyDispatches` screens the brief again and drops it on a hit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 4.8 leak screen           | `findPlanningLeak` and `pullRequestLeak` (`src/app/github-plans-repo.mjs`). Each tick, for every dispatched open plans-repo leaf, and for any closed one being judged, completion reads the closing pull requests and the pull requests on `avoozl/<task-id>` (`branchPullRequests`: title, body, first 100 commit messages) and screens them. A hit is a held verdict (`leak: true`, retried every tick) that opens decision `github-completion:<task>`, blocks completion even after merge and close, and messages the tick's live worker to edit the text. When the text is clean the next tick clears the decision and judges completion as usual                                                                                              |
| 4.9 completion            | When GitHub closes the planning issue through the linked branch, the 3.11 verdict (one merged closer in the code repository, on `baseBranch`, required checks passing on its head) completes the leaf, and the dependent's linked branch and brief go out in the same tick. Avoozl writes no leaf issue state and no Status. A merged, passing pull request on the linked branch while the planning issue stays open opens a decision. A close without code follows 3.11: an allowed closer is an order and the dependent's brief names the blocker by task ID and title only; any other closer holds with a decision and nothing is reopened                                                                                                      |
| Fix                       | `stable()` in `github-close.mjs` now compares verdicts in canonical key order, and a re-read that changes nothing no longer writes the verdict key. Before, a stored verdict and a fresh one with the same content but different key order read as a change, so a retried verdict rewrote the workspace each tick                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Leak inputs tested

Each of these names `example/plans` and is caught (unit matrix; the starred
ones also run end to end through a tick on a pull request or the task's own
text):

| Input                                                                                                               | Form reported             |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `Port example/plans timers` (\*, as a task title in mixed case `Example/Plans`)                                     | owner/name                |
| `Fixes example/plans#3` (\*, as `EXAMPLE/PLANS#1` in a PR title)                                                    | owner/name#               |
| `https://github.com/example/plans/issues/3` (\*, PR body)                                                           | URL                       |
| `EXAMPLE/PLANS`, `https://GitHub.com/Example/Plans`                                                                 | owner/name, URL           |
| `example%2Fplans` (\*, PR body and task acceptance), `example%252Fplans`, `%65xample/plans`                         | owner/name                |
| `example&#47;plans`, `example\/plans`                                                                               | owner/name                |
| `example/\nplans` (_, PR body), `example/pla\n  ns`, `example \n/ plans#4` (_, as a task check `example/\nplans#2`) | owner/name or owner/name# |
| `example/\u200bplans` (zero-width space)                                                                            | owner/name                |
| `git@github.com:example/plans.git`                                                                                  | owner/name                |
| `Refs example/plans#1` in a commit message (\*)                                                                     | owner/name#               |

Not caught, by design: `example/code#3`, `example/plans-v2`,
`my-example/plans`, `the plans repository`, `example/`, the empty string.
A name hyphenated at a line break (`pla-\nns`) is not caught, because the
hyphen is not part of the name.

## Correctness bar, with tests

| Claim                                                                                                   | Test in `plans-repo-delivery.test.mjs`                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The brief and everything written to the code repository never name the planning repository              | "the tick creates the linked branch before the brief…" (brief screened, no summary, no `issues/1` or `#1`, no GitHub write but the branches); "a leaf whose own text names the planning repository is never dispatched"; the Crew Mode test screens the `next` brief |
| A planted leak in a PR title, body or commit message opens a decision and blocks completion until fixed | "a planted leak…" runs five plantings, each held while open, still held after merge and close, released the tick after the text is fixed                                                                                                                             |
| A merged passing PR whose planning issue stayed open opens a decision                                   | "a merged, passing pull request whose planning issue stayed open…"                                                                                                                                                                                                   |
| Dependents release in the same tick as the close                                                        | "GitHub's close through the linked branch…" (`a-next` gets its branch and brief in the tick that saw the close)                                                                                                                                                      |
| Close without code follows 3.11                                                                         | "a planning issue closed without code follows 3.11…"                                                                                                                                                                                                                 |
| Reuse and idempotence                                                                                   | "an existing linked branch is reused, and a second tick creates nothing" (second tick changes no revision)                                                                                                                                                           |

## Limits

- shortcut: `branchPullRequests` reads the newest 10 pull requests on the
  branch and 100 commits each; a longer history needs paging.
- shortcut: a branch named `avoozl/<task-id>` that exists but is no longer
  linked (the issue closed and reopened, F52) makes `createLinkedBranch` fail;
  that is a decision, not a guessed reuse.
- A leak in a commit message that already merged cannot be edited away; the
  decision stays open until a person resolves it.
- Notifications to the planning repository's watchers were not checked (F52).
