# Radar-coder Proof 2, live: spec to issues in both modes

Live run for task `rc-p2`. The fake-GitHub receipt is `rc-proof-2.md`.

- Recorded: 2026-11-15, Linux, Node 24, real GitHub (private scratch repositories), the real GitHub client.
- Script: `scripts/live-proofs/p2.mjs`
- Verdict: **PASS** in single-repo mode, in plans-repo mode, and with a Project board.
- The live run found two bugs in the approval pull request: one fixed on main by #220 (found the same night by another live run), the other in PR #215.

## Setup

The spec of the fake-GitHub test: package `1` and leaves `1.1` to `1.7`. Leaves `1.1` to `1.3` are small and in one phase; `1.4` needs `1.1`. `coder: issue-radar`. Each run used new scratch repositories.

## Commands

```
node scripts/live-proofs/p2.mjs OWNER/CODE --confirm                       # single-repo
node scripts/live-proofs/p2.mjs OWNER/CODE --plans OWNER/PLANS --confirm   # plans-repo
node scripts/live-proofs/p2.mjs OWNER/CODE --project --confirm             # with Set up GitHub and a Project
```

The script lands the spec through a pull request, approves it (Avoozl opens the approval pull request; the script merges it), previews, projects with the batch `1.1, 1.2, 1.3`, merges a pull request that says `Closes #<batch>`, ticks, then edits two tasks with one issue claimed and applies Spec changed.

## What happened

| Check                                      | Single-repo                 | Plans-repo                     |
| ------------------------------------------ | --------------------------- | ------------------------------ |
| Approval pull request opened and merged    | yes (after the fix)         | yes, in the plans repo         |
| Preview suggests batch `1.1, 1.2, 1.3`     | yes                         | yes                            |
| Preview writes no issue                    | 0 written                   | 0 written                      |
| Issues written                             | 7, all in the code repo     | 7 in the code repo, 0 in plans |
| Sub-issues under the package               | 5                           | 5                              |
| `1.4` blocked by the batch issue           | yes                         | yes                            |
| One merge verifies all three batched tasks | yes, on the second tick     | yes                            |
| Spec changed preview writes nothing        | yes                         | yes                            |
| Unclaimed edited issue (`1.5`)             | updated                     | updated                        |
| Claimed edited issue (`1.6`)               | one comment; text unchanged | one comment; text unchanged    |
| Unedited issue (`1.7`)                     | only the revision line      | only the revision line         |

Details:

- **Batch close takes two ticks.** GitHub closes the batch issue a few seconds after the merge. The tick right after the merge says "merged and passed, but issue #N is still open" and holds; the next tick verifies all three. In plans-repo mode the first tick already saw it closed.
- **Claimed issue.** Its visible text did not change. The hidden marker line changed once, recording the ready label Avoozl had released earlier; the script read the body before that release.
- **Unedited issue.** Only "projected from approved design `config` at `<revision>`" and the hidden marker's revision changed.
- **Project board** (`--project`). Set up GitHub made a new Project with the Status, Wave and Avoozl state fields. After projection every task issue was on the board with Status and Wave set (the batch issue Done, `1.4` on wave 2, the others on wave 1). There is no Release field, because the scratch workspace names no releases.
- **plans-repo verify.** `avoozl verify-issue` on a code-repo issue read the spec from the plans repo and passed all five checks.

## Bugs found and fixed

1. `putFile` never sent the file's current `sha`. GitHub refuses to replace a file without it ("sha wasn't supplied"), so the approval pull request failed for every spec whose files already exist. Fixed on main by #220.
2. The approval branch was always `avoozl/approve-<spec>`. After one approval merged, approving the next revision failed with "Reference already exists". PR #215 puts the spec hash in the branch name.

The runs above used a local build with both fixes.

## Not run

- The Kiro Crew page and the preview modal were not clicked; the same operations were run.
