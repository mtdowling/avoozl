# Radar-coder Proof 23: two scratch repositories (live)

Receipt for task `rc-p23` in `.kiro/specs/radar-coder/tasks.md`.

- Recorded: 2026-11-15, 05:48 to 06:12 UTC, Linux, real GitHub.
- Avoozl: `main` at `f0e6c40`, plus the fixes of #218, run in the throwaway
  Kiro Crew harness (`scripts/live-harness/harness.sh`, its own home and port
  5693). Owner steps were sent to Avoozl's command route as the harness's
  dashboard owner. The tick was the app's own `avoozl-tick` cron, fired with
  `kirocrew cron trigger`.
- Verdict: **PASS live, after two fixes (#218).** The run before the fixes
  wrote one issue to the source and never completed a mirror task.

## Scratch repositories (for the owner to delete)

| Repository                    | Role                                  | Visibility |
| ----------------------------- | ------------------------------------- | ---------- |
| `mtdowling/avoozl-scratch-m1` | Source (public-visibility stand-in)   | private    |
| `mtdowling/avoozl-scratch-m2` | Mirror, made by Avoozl's Create setup | private    |

The source is private so nothing leaves the account. Avoozl treats it as the
public side: every write except a forward must go to the mirror.

## Setup

1. Created `avoozl-scratch-m1` with a README, then merged one seed pull request.
2. New workspace, project `m1` on a clone of the source, repository entry
   `coder: issue-radar`, `allowedActors: [mtdowling]`.
3. **Create setup, dry run** (`mirror.create`, no `confirm`): seven lines,
   six ticked (`mirror`, `seed`, `plans-branch`, `labels`, `auto-merge`,
   `setting`), `branch-rule` unticked (no CI check named). Nothing was written.
   The CLI dry run (`avoozl mirror create ... --source ...`) gave the same hash.
4. **Apply** with that hash and the six lines: all six `done`.
5. Checked on GitHub: `avoozl-scratch-m2` is private; its `main` head equals
   the source's; `avoozl-plans` exists and GitHub answers "No common ancestor"
   between `main` and `avoozl-plans`; auto-merge is on.
6. **Adopt existing setup, dry run** on the result: 0 writes. On the second
   workspace it showed one write (`setting`), applied, then 0.

## Action and observation

| Step                                                  | What happened                                                                                                             | Result           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Approve spec `p23c` (two leaves, 1.2 waits on 1.1)    | Approval pull request on the source, merged by the person                                                                 | ok               |
| Sync                                                  | Next tick fast-forwarded the mirror's `main` to the approval merge                                                        | ok               |
| Project                                               | Plan issue #5 and task issues #6 to #8 in the mirror; 0 new issues on the source                                          | ok (after fix 1) |
| Crew pull request                                     | Branch `avoozl/p23c.1.1`, mirror PR #9 `Closes #7`, squash merged                                                         | ok               |
| Track                                                 | One `mirror_forward` record for the merge commit, `to_forward`, one row                                                   | ok               |
| Forward screen (`mirror.forward.review`)              | Diff of `src/greet.mjs` only, title `Add a greeting`, body `Contributed by @mtdowling.`, target `avoozl-scratch-m1:main`  | ok               |
| Forward, nudge (`mirror.forward` with the shown hash) | Public PR #5 on the source: one commit, one parent, author `mtdowling`, one file                                          | ok               |
| Press Forward again                                   | Same record, no second pull request                                                                                       | ok               |
| Merge public PR #5                                    | Record `public_merged`; next tick `p23c.1.1` verified and accepted; `p23c.1.2` no longer waits on it                      | ok (after fix 2) |
| Plant a term                                          | Content rule `name: zorbleflax`; mirror PR #10 adds a file holding it; merged                                             |                  |
| Track and scan                                        | Record `blocked`: "The leak scan blocked this forward (names/name). Nothing was pushed." Forward again: same block        | ok               |
| Check the source                                      | No branch `avoozl/p23c.1.2`, no pull request, the term in no ref or commit message (bare clone, `git grep` on every head) | ok               |

Waiting on you held one row for the blocked forward.

## Fixes found by this run (#218)

1. **The plan issue went to the source.** With a driver bound (the real
   app), `planIssueConfig` returned the source's config, so the plan issue
   that holds the driver's claim was created on `avoozl-scratch-m1` (#3,
   closed by hand as not planned). The fake GitHub tests bind no driver, so
   they missed it. Fixed: the plan issue uses the mirror.
2. **A mirror task never completed.** `writerRepositories` listed only the
   source's ID, and the task issues carry the mirror's ID, so completion was
   never read. Fixed, and the verdict now reads the source's policy entry, so
   it waits for the public merge (RC24.6). The existing test placed the issues
   on the source; it now also runs with them in the mirror.

## Findings not fixed

1. **The mirror diverges for good after the first forward.** The mirror's
   `main` holds the crew's squash commit; the source holds the forwarded
   commit. Neither is an ancestor of the other, so the sync step stops with a
   "diverged" row on the first crew merge and never syncs again. Later
   approvals on the source never reach the mirror, and `verify-issue` then
   fails for those issues (seen in Proof 24). Recommendation: when the source
   head is not an ancestor, merge the source's `main` into the mirror's `main`
   as a merge commit with a normal push, and stop only on a merge conflict.
2. **Release on a mirror is held.** The Release queue shows every mirror task
   held as "public, or its visibility could not be read", and no ready label
   is written, because `publicHold` and the projection look up the mirror's ID
   in `github_repositories`, where only the source is registered. A crew would
   never see a ready issue. In this run the crew pull requests were made by
   hand. Same class of bug as the fixes above.
3. **Preflight checks the source's merge path.** Radar preflight asked to
   turn on auto-merge in the source; the mirror already had it on.

## Commands

```
# Harness
AVOOZL_HARNESS_DIR=<home> AVOOZL_HARNESS_PORT=5693 \
  AVOOZL_HARNESS_REPO=https://github.com/mtdowling/avoozl-scratch-m1 \
  scripts/live-harness/harness.sh start
# Owner operations: POST /apps/avoozl/api/command with the dashboard cookie
{"operation":"mirror.create","input":{"repository":"mtdowling/avoozl-scratch-m2","source":"mtdowling/avoozl-scratch-m1"},"workspaceId":"..."}
{"operation":"mirror.create","input":{...,"confirm":true,"previewHash":"<hash>","ticked":["mirror","seed","plans-branch","labels","auto-merge","setting"]}}
{"operation":"plan.approve", ...}  {"operation":"github.project", ...}
{"operation":"mirror.forward.review","input":{"id":"<merge sha>"}}
{"operation":"mirror.forward","input":{"id":"<merge sha>","seenHash":"<hash>"}}
# Tick
kirocrew cron trigger <avoozl-tick job id>
```

## Not checked

The dashboard page itself was not clicked; its command route was called
directly with the owner's sign-in. No Issue Radar crew ran (see finding 2).
