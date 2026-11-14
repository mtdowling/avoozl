# Radar-coder Proof 15: a remote coder end to end with a fake harness

Receipt for task `rc-p15` in `.kiro/specs/radar-coder/tasks.md`.

**Run on fake GitHub; the live run on a scratch repository is pending the owner.**

- Test: `src/app/test/radar-proof-15.test.mjs`
- Run with: `node --test src/app/test/radar-proof-15.test.mjs`
- Recorded: 2026-11-14, Node 24 on Linux, isolated temporary workspace, fake GitHub, no network.
- Verdict: **PASS on the fake GitHub.** Live verdict: **pending the owner.**

## Setup

A single-repo workspace with `coder: remote`. A fake harness runs as a child process. Three tasks: `leaf-a`, `leaf-b`, and `leaf-c` which needs `leaf-a`.

## Action

1. Release (tick twice).
2. The harness reports `leaf-a` completed with no pull request. Tick three times.
3. A person publishes: an open pull request closes the `leaf-a` issue. Tick.
4. The pull request merges and the issue closes. Tick twice.

## Observation

- `leaf-a` and `leaf-b` are filed once each. `leaf-c` is not ready.
- After the harness finishes, `leaf-a` is `finished-unpublished` and does not count as done. One Needs you row ("Waiting for a person to publish") shows across three ticks. `leaf-c` stays not ready.
- With the pull request open the row clears, `leaf-a` is `pr-open`, and `leaf-c` is still not ready.
- After the merge `leaf-a` is `merged`, counts as done, and `leaf-c` is released. `leaf-b` never counts as done.

## What this does not show

The fake harness stands in for a real managed remote provider. Real sign-in, real task text and a real pull request from a harness are not exercised.

## Live steps for the owner

Use a scratch repository you can delete. Nothing here touches a real project.

1. Set `coder: remote` on a scratch repository and point the remote provider setting at your managed remote provider.
2. Approve a spec with two free tasks and one that needs the first. Create the issues and release.
3. Look for: two tasks filed with the provider, the third not ready.
4. Let the provider finish one task without opening a pull request. Look for: one Needs you row asking a person to publish, and the dependent still not ready.
5. Publish the pull request from the provider. Look for: the row clears; the dependent is still not ready.
6. Merge the pull request. Look for: the task counts as done and the dependent is released.
7. If a finished provider task releases the dependent before the merge, the proof fails; the next decision is to tighten the adapter map.
