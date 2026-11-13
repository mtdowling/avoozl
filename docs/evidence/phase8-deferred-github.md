# Task 8.2: deferred GitHub features

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 8,
task 8.2 [R27.13]: stacked pull requests on an open blocker, Discussions
answering, comment-mention steering, each behind its own proof.

- Recorded: 2026-11-12, Node v26, macOS.
- Avoozl: `kirocrew-native` at `d0f6b36` plus this task's commits.

## Gate

R22.4 is **not** met: ten GitHub proofs (P7, P8, P10, P11, P14, P16, P17,
P18, P24, P25) are still skipped for lack of a scratch organization. The owner
waived the gate for building only. So every feature here is **off by
default**, has its own repository setting, and was proved against a fake
GitHub, with one small live read and write on the owner's private test
repository. Nothing here runs unless a repository entry in `.avoozl.json`
turns it on.

## Settings

All three sit on a `github.repositories.<owner/repo>` entry and are validated
by `normalizeGitHubPolicy` (`src/app/github-policy.mjs`). The Settings view
has no field for them yet (see "UI gap").

| Setting                                 | Default      | Turns on                                 | Also needs                                                                                 |
| --------------------------------------- | ------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `stackedPullRequests: true`             | `false`      | Stacked pull requests on an open blocker | A plans-repo leaf, or a single-repo `coder: worker` leaf                                   |
| `commentSteering: {"mention": "@name"}` | absent (off) | Comment-mention steering                 | `allowedActors` or `minimumPermission`                                                     |
| `discussions: {"categories": ["Q&A"]}`  | absent (off) | Discussions answering                    | `allowedActors` or `minimumPermission`; Discussions on in the repository; a local checkout |

## How each works

**Stacked pull requests** (`src/app/github-linked-branches.mjs`,
`src/app/delivery.mjs`, `src/query.mjs`). A linked-branch leaf whose only
unmet `requires` or `sequence` blocker is a linked-branch leaf in the same code
repository, with its own branch, no open decision, and an open pull request
from that branch, gets its linked branch cut from the blocker's branch head.
The record keeps `stackedOn`, `stackedAt` (that head) and `finalBase`.
Readiness treats that one edge as met for the runner only (`readyLeaves`
passes `stacked` to `queryTasks`). Labels, the Project and `ready:true`
queries still show the leaf waiting, so GitHub-facing readiness does not
change. The brief opens the pull request against the blocker's branch,
forbids auto-merge and merging while it targets it, and after the blocker
merges has the worker `git rebase --onto origin/<base> <stackedAt>`, push,
`gh pr edit --base <base>`, and only then turn on auto-merge. A blocker whose
pull request closes unmerged makes the worker report blocked. Completion is
unchanged: GitHub closes the issue only on a merge into the default branch.

**Discussions answering** (`src/app/github-respond.mjs`,
`GitHubClient.listDiscussions`, `addDiscussionComment`). In the tick's respond
step, each open, unanswered, unlocked discussion in a named category, written
by an actor the policy allows (the trigger-actor check, R10.4), gets one
response per snapshot of its title and body. The responder agent and
`plans_post_reply` are the same as for `respond` rules: same screen for
secrets and machine paths, at most one reply, posting marked before the call.
No label is added. An edited discussion ends an unbound response and opens a
new one.

**Comment-mention steering** (`src/app/github-steering.mjs`, tick step after
the crew labels). For each live worker session the tick opened on a GitHub
leaf in a repository with steering on, the step reads the issue's comments.
A comment made after the session was bound that names the mention as a whole
`@name`, by an allowed actor, goes to that session once as a tick message,
fenced as data, with a line that the brief's rules still hold. A receipt
(`github-steer:<slot>:<comment id>`) is written before it is sent. Comments by
anyone else leave nothing behind (R10.5). A comment that names the planning
repository is not sent, and opens one decision. Avoozl writes nothing to
GitHub in this step.

## Proofs

None of these is in `tasks.md`; see "Spec gaps". Each is a `node:test` file.

| Proof                    | File                                           | Result       |
| ------------------------ | ---------------------------------------------- | ------------ |
| Stacked pull requests    | `src/app/test/proof-stacked-prs.test.mjs`      | pass, 3 of 3 |
| Discussions answering    | `src/app/test/proof-discussions.test.mjs`      | pass, 4 of 4 |
| Comment-mention steering | `src/app/test/proof-comment-steering.test.mjs` | pass, 5 of 5 |

Stacked pull requests:

1. Setting unset or `false`: an open blocker pull request stacks nothing.
2. Setting on: nothing stacks with no pull request, a closed one, or a blocker
   with a decision. With an open one, the dependent's branch is cut from the
   blocker's head (`stackedOn a`, `stackedAt` = that head, `finalBase main`),
   it is dispatched in the same tick with the stacked brief, a leaf with two
   unmet blockers does not stack, `ready:true` still excludes it, a bound
   worker is not dispatched again, the blocker completes first, and the
   dependent completes only on its own merge. Only branches were written.
3. Crew Mode: `runner.next` lists the stacked leaf as ready with the stacked
   brief.

Discussions answering:

1. No setting: discussions are never read.
2. On: of six discussions, only the one in a named category, by an allowed
   author, open, unlocked and unanswered, gets a responder. The dispatch
   repeats until bound, then stops. A reply naming a machine path is refused
   (422) and nothing posts; a clean one posts once on the discussion; a second
   is refused (409). No issue comment, no label. A later tick opens nothing
   for the same snapshot.
3. An edit before binding ends the old response and opens one for the new
   text.
4. Validation: needs allowed actors; at least one category; no unknown keys.

Comment-mention steering:

1. No setting: comments are never read.
2. On: of five comments, only the allowed actor's new mention reaches the
   worker, once, fenced (a fence inside the comment is outfenced). A longer
   name, no mention, a stranger, and a comment older than the binding are
   ignored; the stranger leaves no receipt. Nothing written to GitHub.
3. A mention that names the planning repository is not relayed and opens one
   decision, reported once.
4. A closed session is not steered.
5. Whole-name matching, and validation.

## Live check

On the owner's private test repository `mtdowling/avoozl-e2e-code-20261111`
only, signed in with `gh` as `mtdowling`. Script and output:
`$TMPDIR/kc-p8b-live/live.mjs`, `live-output.json`.

| Step                                                      | Result                                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Turn on Discussions (`gh repo edit --enable-discussions`) | on; GitHub created its six default categories, `Q&A` answerable                                                                      |
| Create one discussion in `Q&A` (`createDiscussion`)       | #16                                                                                                                                  |
| `GitHubClient.listDiscussions`                            | 1 discussion; every field the step reads present (`closed`, `locked`, `isAnswered`, `category`, `author`)                            |
| `GitHubClient.addDiscussionComment`                       | comment `DC_kwDOVqvda84BKrP3`; `isAnswered` stays `false` afterwards, so the snapshot's response record is what stops a second reply |
| `GitHubClient.branchHead` on a non-default branch         | `avoozl/issue-1-uppercase-formatting` -> `fd2ccc3b…`, the input a stacked branch is cut from                                         |
| `GitHubClient.branchPullRequests` on it                   | one pull request, `MERGED`, base `main` (read only)                                                                                  |
| `GitHubClient.listIssueComments` on issue #9              | `id` number, `user.login`, `created_at`, `body` strings: the fields steering reads                                                   |
| Clean up                                                  | discussion deleted (`deleteDiscussion`), Discussions turned off again; `has_discussions` false, `totalCount` 0                       |

Writes: one setting turned on and back off, one discussion and one comment,
both deleted. Not run live: creating a stacked linked branch and a stacked
pull request (createLinkedBranch is already live-proved for plain branches in
`github-linked-branch-probe.md`; the stacked path only changes which branch's
head it passes), and a real comment relayed to a real session.

## UI gap

`kirocrew-app/ui` is being rebuilt in another task, so no UI file changed.
Settings > repository needs three fields: a `stackedPullRequests` switch, a
`commentSteering.mention` text field, and a `discussions.categories` list.
Until then they are set in `.avoozl.json`. `kirocrew-app/ui/src/settings-api.ts`
mirrors the repository keys and will need the same three.

## Spec gaps

- `tasks.md` says each feature is "behind its own proof" but defines no proof
  for them. The three proofs above are named here only; the spec owner may
  want P28–P30 (or other IDs) with setup, action and expected results taken
  from this receipt.
- R27.13 names "steering a running crew". Avoozl cannot message an Issue
  Radar crew or a Crew Mode conductor's worker (the cron reaches only sessions
  it opened, and MC-5 is missing, see `phase8-crew-mode-mc5.md`), so steering
  covers only tick-opened worker sessions.
- Discussions have no label events an app can read, so the trigger is the
  author, checked like a trigger actor, rather than a label rule.
