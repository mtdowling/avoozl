# Proof P52: ten tasks land through pull requests on a repository with a required check

Date: 2026-11-17. Requirements: R87, R89 (design §4.26). Result: **PASS**,
after two repairs the first live run found (PRs #413 and #418).

## Setup

- Code: `038bb546`, which is `main` at the time plus PRs #409 (42.7), #413 and
  #418, merged locally. All three have since merged to `main` unchanged.
- Private scratch repository `mtdowling/avoozl-scratch-p52b`. It started with
  two commits: the README and `.github/workflows/ci.yml`. That workflow has
  one job, `build`, which fails when a file named `FAIL` exists.
- Isolated workspace under `/private/tmp`, made with `avoozl init`, with its
  own `XDG_CONFIG_HOME`, `delivery.runner` set to `crew-mode` and concurrency
  10. No real workspace, gateway or Kiro Crew home was read or written.
- Seeded with a script, as `scripts/live-proofs/lib.mjs` seeds live proofs:
  one project `scratch` over a clone of the repository, one spec plan `p52`
  with ten ready leaves `p52-t01` to `p52-t10` (each adds `p52-tNN.txt`), and
  one argv check that each such file holds its task ID. The seed then ran the
  person steps in process: `spec.publish` (a local journal) and
  `spec.takeover` (generation 1).

## Setup command

Person steps ran with `--as-person`, as in the earlier live proofs.

| Run | Command | Result |
| --- | --- | --- |
| 1 | `avoozl setup mtdowling/avoozl-scratch-p52b --project scratch --checks build` | preview: 4 access lines, `landing: pr`, ruleset, merge methods and `AVOOZL_LANDING` to change; nothing written |
| 2 | same with `--yes` | wrote the `avoozl-required-check` ruleset (`main` requires `build`), merge commits only, `AVOOZL_LANDING=pr`, and the project's `landing: pr` |
| 3 | same with `--yes`, right after run 2 | rewrote merge methods only (see Noted) |
| 4 | same with `--yes`, a minute later | `Nothing to change`, nothing written |
| 5 | same with `--yes`, after all ten landed | `Nothing to change`, nothing written |

After the run the repository has one ruleset, with one
`required_status_checks` rule naming `build`.

## Run

The workers were driven by hand. For each task: `avoozl claim TASK --slot
w-TASK`, a commit in its worktree, and `avoozl report TASK --slot w-TASK
--kind done --commit SHA`, the way a conductor relays a chat's report.
`p52-t05` also added `FAIL`. Then each round ran what Kiro Crew runs each
minute: one `workspace.tick` with `cron: true` and one `drainCheckRuns`.
There were 48 rounds, 20 seconds apart.

- Rounds 1-2: all ten verified, pushed to `avoozl/p52-tNN` and queued.
- One pull request at a time: the queue head's PR opened, waited for `build`
  on its exact head, got `avoozl/verify`, then merged with the head guard.
  After each merge the local `main` moved forward from the remote. Every
  queued task whose base had moved was withdrawn, had `main` merged in, was
  verified again and queued again.
- Base moved from outside: while PR #2 (`p52-t09`) waited at `43121afd`,
  `build` passed. Then PR #3, made outside Avoozl, merged into `main`. The next
  round withdrew `p52-t09` and merged `main` into it. It was verified and
  pushed again as `52243d2e`. `build` ran again on that head and passed. Only
  then did PR #2 merge.
- Failed check: PR #7 (`p52-t05`) failed `build` at `f99d1e69`. Round 28
  sent this to slot `w-p52-t05`:

  ```
  Avoozl task p52-t05: a required check failed on the pull request at f99d1e69dd9b (round 1 of 2).
  Fix the cause in your worktree, run the checks, commit, and report done again with the new commit SHA. Do not push, rebase or force push.
  ```

  The delivery went back to `running`. The same slot removed `FAIL`,
  committed and reported done again. The report was taken. The task was
  verified, and `build` passed on `d9c8eacb`. The base moved once more, so
  `build` also passed on the merged-forward head `e2fe2bb5`, and then PR #7
  merged.

## Result

From one GraphQL read of every PR's commits, check runs and force-push
events:

| PR | Task | Merged (UTC) | Head | `build` on head | Force pushes |
| --- | --- | --- | --- | --- | --- |
| #1 | p52-t10 | 16:07:28 | 49d29c23 | success 16:06:32 | 0 |
| #2 | p52-t09 | 16:13:36 | 52243d2e | success 16:13:19 (before it, 43121afd success) | 0 |
| #4 | p52-t08 | 16:16:09 | f83d022d | success 16:15:11 | 0 |
| #5 | p52-t07 | 16:18:53 | d5ab7319 | success 16:17:41 | 0 |
| #6 | p52-t06 | 16:21:25 | e94f42d6 | success 16:20:18 | 0 |
| #8 | p52-t04 | 16:25:14 | 9fce2b9f | success 16:24:19 | 0 |
| #7 | p52-t05 | 16:26:44 | e2fe2bb5 | success 16:26:17 (before it, f99d1e69 failure, d9c8eacb success) | 0 |
| #9 | p52-t03 | 16:28:58 | 74293b92 | success 16:27:56 | 0 |
| #10 | p52-t02 | 16:31:05 | 86074bcd | success 16:30:04 | 0 |
| #11 | p52-t01 | 16:33:01 | 2fd608c2 | success 16:32:08 | 0 |

- All ten merged one at a time. In each case `build` passed on the exact
  merged head before the merge.
- No merge happened on an unchecked head. No ruleset rule was added twice.
  No PR had a force push. `pushHead` pushes `commit:refs/heads/branch` with
  no force flag.
- The `p52` journal has 21 records: one generation, 10 intents and 10
  outcomes.
- All ten deliveries are `integrated` at their merge commits. Scratch `main`
  holds `p52-t01.txt` through `p52-t10.txt` and `outside.txt`.

## Repairs

The first live run was on `mtdowling/avoozl-scratch-p52`, with the code from
PRs #398, #405 and #409. It found two bugs. Each was fixed in its own PR,
and the proof was then run again from the start on the new repository.

- PR #413: with a local journal, pr landing passed the workspace operator
  name to `pullSteps` as the GitHub login. `landingRights` then found no
  permission, so the queue only watched and never merged. GitHub rights now
  use the signed-in login.
- PR #418: when landing sent a task back to its chat (a failed check, or a
  conflict through `sendConflictBack`), the chat's binding kept its final done
  report. The next report was refused with "This attempt already reported
  done.", so the task stuck in `running`. `reopenAttempt` now sets the report
  and the attempt aside, so the same chat's next done counts.

## Noted, not fixed

- Run 3 of setup came right after run 2. It read the repository's old merge
  settings and wrote them again. The values were the same, and run 4 changed
  nothing. GitHub served a stale read just after the write.
- Every landing withdraws and re-verifies every queued task whose base moved.
  With ten tasks and one outside move that was about 50 extra merges and
  verifications, and the run took about 30 minutes. A later change could
  merge the base only into the queue head.
- The failure message says "the pull request" without its number, because a
  failed queue entry does not keep the PR number.
- A sent-back message stays in the tick's outbox until a consumer takes it,
  so each later CLI round lists it again. Kiro Crew's cron takes it once.
- The first run hit one GitHub 500 in a tick. Avoozl reported it once, and
  the next round went on.
- Round 1 sent a `Spend unknown` notice for each task, as in P62.
- The workers and the landing were live, but the worker chats were stand-ins
  driven by hand. No Kiro Crew chat was opened.
