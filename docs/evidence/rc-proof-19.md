# Radar-coder Proof 19: the parent is not taken by a crew

Receipt for task `rc-p19` in `.kiro/specs/radar-coder/tasks.md`.

**Run on fake GitHub; the live run on a scratch repository is pending the owner.**

- Test: `src/app/test/radar-proof-19.test.mjs`
- Run with: `node --test src/app/test/radar-proof-19.test.mjs`
- Recorded: 2026-11-14, Node 24 on Linux, isolated temporary workspace, fake GitHub, no network.
- Verdict: **PASS on the fake GitHub.** Live verdict: **pending the owner.**

## Setup

A fake GitHub with one source issue (the parent), one approved plan and a stand-in crew poll. The poll takes an open issue with the `ready` label and no live claim (Radar's claim marker or the `crew: in progress` label). It is not a real crew. The parent carries `ready`, so the poll would take it before approval.

## Action

1. Poll before approval.
2. Approve the plan. Poll.
3. Release the sub-issues (`github.project`) and tick. Poll.

## Observation

- Before approval the poll would take the parent.
- After approval the parent has Avoozl's claim comment and the `crew: in progress` label, and the poll takes nothing.
- After release the poll takes released task issues and never the parent.

## What this does not show

**This proof needs a live observation.** A real Radar crew has not read Avoozl's claim. Only a real crew can show that the claim format holds it off.

## Live steps for the owner

Use a scratch repository you can delete. Nothing here touches a real project.

1. Start a Radar crew on a scratch repository with the label scope `ready`.
2. Open an issue, add `ready` to it, and ask Avoozl for a plan. Approve the plan.
3. Let the crew poll (wait one cycle). Look for: the crew does not take the parent issue; it has Avoozl's claim comment and the `crew: in progress` label.
4. Create the issues and release. Look for: the crew takes a released sub-issue.
5. If the crew takes the parent, the proof fails; the next decision is to re-read the claim format on the current Radar release.
