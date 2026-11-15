# Radar-coder Proof 1, live: Avoozl lists only what it was asked to plan

Live run for task `rc-p1`. The fake-GitHub receipt is `rc-proof-1.md`.

- Recorded: 2026-11-15, Linux, Node 24, real GitHub (a private scratch repository), the real GitHub client.
- Script: `scripts/live-proofs/p1.mjs`
- Verdict: **PASS for every case that one GitHub account can make. Not ticked:** the stranger case needs a second account with read access, and none was available.

## Setup

A new private scratch repository with five issues, made by the script:

| Issue | Labels                             |
| ----- | ---------------------------------- |
| 1-3   | none (`plain one`, `two`, `three`) |
| 4     | `avoozl:plan`, added by the owner  |
| 5     | `plan me`, added by the owner      |

`.avoozl.json` sets the repository to `coder: issue-radar`, `minimumPermission: write`, and `crewLabels.needsHuman: plan me`.

## Commands

```
node scripts/live-proofs/p1.mjs OWNER/REPO --confirm
# GitHub search indexes new issues a few seconds late; read the same issues again:
node scripts/live-proofs/p1.mjs OWNER/REPO --confirm --reuse
```

## What happened

- First run, seconds after the issues were made: Intake was empty. GitHub search had not indexed the new issues yet, so `untriaged.plan` on issue 4 was refused with "not in Intake". This is GitHub's search lag, not a fault.
- Second run, about a minute later:
  - Intake listed only issue 4.
  - Issue 5 was under With Issue Radar and gave one Needs you row.
  - Issues 1 to 3 appeared nowhere. Every search Avoozl sent named a label.
  - **Plan this** on issue 4 opened a planner request (`avoozl-planner`).
  - **Plan this** on issues 1 and 5 was refused with "not in Intake".
  - After the run, no issue had a new comment or label. Avoozl wrote nothing.

## Not run

- The stranger case (step 3 of the owner steps): a planning label added by an account with only read access. It needs a second GitHub account.
- The Kiro Crew page itself was not clicked; the same operations the page calls were run.
