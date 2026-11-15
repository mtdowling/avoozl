# Radar-coder Proof 5, live: auto-merge on the right pull requests only

Live run for task `rc-p5`. The fake-GitHub receipt is `rc-proof-5.md`.

- Recorded: 2026-11-15, Linux, Node 24, real GitHub (a private scratch repository), a real Actions check and a real branch ruleset.
- Script: `scripts/live-proofs/p5.mjs`, then `scripts/live-proofs/tick.mjs` for later ticks.
- Verdict: **PASS for every case one account can make. Not ticked:** the fork and stranger pull requests need a second account, and the conflict label coming off was not seen (GitHub merged the pull request first).

## Setup

The script makes all of this in a new scratch repository:

- Auto-merge and squash merges on. A workflow `build` that fails while a file `RED` exists.
- Spec `merge` with tasks `merge.1` to `merge.3`, approved through its pull request and projected (issues #3, #4, #5).
- A branch ruleset on the default branch that requires `build`.
- `.avoozl.json`: `coder: issue-radar`, `requiredChecks: ["build"]`, `delivery.ship: auto-merge`.
- Pull requests, opened with the same login the crews use, so GitHub cannot tell them from a crew's:

  | PR  | Branch      | Body        | State at start                      |
  | --- | ----------- | ----------- | ----------------------------------- |
  | #8  | `crew/a`    | `Closes #3` | `build` red (has `RED`)             |
  | #9  | `crew/none` | no issue    | green                               |
  | #10 | `crew/c`    | `Closes #5` | conflicts with main on `shared.txt` |

## Commands

```
node scripts/live-proofs/p5.mjs OWNER/NEW-REPO --confirm
node scripts/live-proofs/tick.mjs WORKSPACE_DIR   # one more tick, prints the merge rows
```

## What happened

The merge-path check said all four items were ready: auto-merge allowed, `main requires build`, ship mode set, squash allowed.

| Step                        | #8 (crew, red→green) | #9 (no issue)   | #10 (conflict)                      |
| --------------------------- | -------------------- | --------------- | ----------------------------------- |
| After two ticks, red        | armed, open          | not armed       | armed, `avoozl:merge-conflict`      |
| Needs you                   |                      |                 | one row                             |
| `RED` removed, build green  | **merged by GitHub** | open, not armed | open, label kept                    |
| Conflict resolved, one tick |                      |                 | label kept (GitHub still computing) |
| Later                       |                      |                 | merged by GitHub (it was armed)     |

Manual mode: `delivery.ship` set to `manual`, then #11 (`crew/b`, `Closes #4`) opened and went green.

- #11 was not armed and did not merge.
- The first tick after green had no Ready to merge row: GitHub had not computed `mergeable` yet (the first read answers null). A tick two minutes later listed #11 as Ready to merge.
- That tick also listed #9, which closes no marked issue. The code says this on purpose: Ready to merge counts every open same-repository pull request (a `shortcut:` note in `src/app/radar-merge.mjs`). Arming is the part limited to marked issues, and #9 was never armed.

Avoozl merged nothing itself; every merge above was GitHub's auto-merge.

## Not run

- A pull request from a fork and one from a stranger's branch: both need a second account.
- The conflict label being removed: after the fix, GitHub merged #10 before a tick read it as clean.
- The Kiro Crew page was not clicked; the same operations were run.
