# Radar-coder Proof 27, live: a crew pull request with a source conflict

Receipt for task `rc-p27`.

- Recorded: 2026-11-15 19:05 to 20:20 UTC, Linux, Kiro Crew 0.12.2.4 harness
  (own home `/tmp/avoozl-live-p27`, port 5699), Avoozl from `main` at
  `0e27646` plus the two fixes below.
- GitHub: private scratch repository `mtdowling/avoozl-scratch-p27` (a tiny
  Node package; `main` requires one status named `ci`, which nothing reports
  until the owner posts it).
- Crew: `p27-crew` on `avoozl-crew`, label scope `ready`, auto-resolve off.
  Settings were the defaults: `conflicts.onSourceConflict` `fix`,
  `conflicts.maxAttempts` 1, `merge.method` `squash`.
- Verdict: **PARTIAL.** The fix, the arm, the comment and the landing passed.
  Two defects stopped the first two tries and are fixed in this PR. The planted
  drop was run on the check only, not through a resolver chat.

## Setup

1. Spec `duo` (two leaves, `d-1` sum and `d-2` max, each ends with an export
   line appended to `src/index.js`), approved through approval PR #7, projected
   to issues #9 and #10 with `ready`. Issue #9 passes `verify-issue` (5 of 5).
   A first spec (`pair`) was approved with no approval pull request, because
   the plan had been created before the workspace had a mode; its issues had
   no marker, the crew refused them, and they were closed and the plan retired.
2. The crew built #9 as PR #11 (19:22, branch `crew/p27-crew/issue-9`,
   auto-merge armed). It will not start #10 while its PR is open.
3. The conflict was planted by merging PR #12 to `main` (`export const version
   = '1.0.0';` at the end of `src/index.js`) with the owner's admin bypass.
   PR #11 read CONFLICTING.

## Observation

| Step | Result |
| --- | --- |
| Two reads, same head | PR #11 seen at 19:37 and again at 19:40 (`sat` true) |
| First judge (19:40) | asked "a person committed to it": **defect 1** |
| After fix 1 (19:42) | receipt `conflict-fix:...#11@020fc65:1` queued |
| Dispatch | dropped by the tick: "asked for a force push": **defect 2** |
| After fix 2 and a new receipt | tick dispatched; the folder had no project directory, so the cron skipped it (harness note, see below) |
| Resolver chat (20:10) | `avoozl:conflict-fix mtdowling/avoozl-scratch-p27#11`; the first `git` call waited for approval and was declined after 3 minutes; chat set to trust and told to continue |
| Resolver work | worktree on the PR branch, `git merge origin/main`, kept both lines, ran the tests by file, committed the merge |
| `plans_conflict_check` | ok true, 1 file (`src/index.js`), nothing dropped |
| Push | one plain push, merge commit `088d0d0`; its first parent is the old head `020fc65`, second parent is main `3ee9063`; no force push |
| `plans_conflict_report` | ok true; receipt `fixed` at 20:14:03, steps `arm`, `unlabel`, `comment` |
| PR #11 after | labels none; one comment from Avoozl: "Avoozl merged `main` into this branch to fix a source conflict: 088d0d06..." with `src/index.js`: "Kept both export lines: sum, then version."; auto-merge SQUASH |
| Lost-change check | `src/index.js` on the branch holds `sum` and `version` |
| Landing | the owner posted `ci` success on `088d0d0`; PR #11 merged 20:17:28 as one commit `cb32dcc` "Add sum helper (#11)", one parent |
| Planted drop | a real merge in a scratch clone that kept the branch's line and dropped main's: `dropCheck` returned ok false and `missing: export const mainOnly = 2;` |

## Defects found, fixed in this PR

- **A crew commit with no GitHub login counted as a person.** GitHub gave
  `author: null` for the crew's commit (the machine's git email is not linked
  to the account), and `humanAfterCrew` treated a missing login as another
  login. Every such PR got "a person committed to it" and no fix. A commit
  with no login now counts as the crew's when its message has a `Crew: `
  trailer line; one without it still counts as a person. Test added.
- **The resolver brief asked for a force push, by its own wording.** Step 7
  said "never --force or --force-with-lease", and the tick's force-push guard
  matches those words, so it dropped the brief and no chat ever opened. The
  step now says "never a force push, with or without a lease", and the test
  checks the brief against `asksForcePush` (it asserted the old wording).

## Found, not fixed here

- The tick sets no tool approval mode for the resolver chat, so an unattended
  one declines its first `git` call after 3 minutes. The harness approved it by
  hand. Whether a conflict fix should send `mode` (as runners do) is the
  owner's decision.
- Not run live: a resolver that drops a line on its own (the check ran alone),
  and the one Waiting on you row plus no push for it. Both have fake-GitHub
  tests.
- Re-arm: GitHub kept the crew's earlier auto-merge (SQUASH) across the push,
  so the arm step found it armed. The squash method itself was observed.

## Harness

`docs/live-proof-harness.md` now says a tick folder needs a project directory
and how to approve a conflict-fix chat.

## Scratch things to delete (owner)

- Repository `mtdowling/avoozl-scratch-p27` (private).
- GitHub Project "Avoozl" (number 3, owner `mtdowling`), made by the setup
  command during this proof.
- Local: `/tmp/avoozl-live-p27`, `/tmp/avoozl-live-p27-ws`, `/tmp/p27-repo`,
  `/tmp/p27-drop`, `/tmp/p27-wt-issue9`.
