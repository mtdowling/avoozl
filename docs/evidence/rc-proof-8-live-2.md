# Radar-coder Proof 8, live run 2: a retro rule a crew follows

Receipt for task `rc-p8`, second live run. The first run is in
`rc-proof-8-live.md`.

- Recorded: 2026-11-15 17:55 to 18:47 UTC, Linux, Kiro Crew 0.12.2.4 in the
  live-proof harness (its own home and port), Avoozl from `main` at `807e990`
  (with PR #247), then the fix below.
- GitHub: private scratch repository `mtdowling/avoozl-scratch-p8a` (a tiny
  Node package, no CI).
- Crew: `p8-crew` (`c_a68c459c`), agent `avoozl-crew`, label scope `ready`,
  one open claim at a time, enabled and unattended.
- Verdict: **PASS with the fix.** Without it, the fourth issue's pull request
  ignored the rule, as in run 1. With it, the next issue's pull request
  followed both parts of the rule.

## Steps and observation

| Step | Result |
| --- | --- |
| Spec `util` (four leaves) approved through approval PR #8, projected | issues #10 to #13 |
| Issue 1 | #10 claimed 17:58, PR #14, merged 18:02 |
| Issue 2 | #11 claimed 18:12, PR #15, merged 18:13 |
| Issue 3 | #12 claimed 18:23, PR #16, merged 18:23 |
| Trace (`radar.trace` on #12) | Spec approved 16:41, Issue created 16:41, Ready 18:03, Claimed 18:23 (by `p8-crew`), PR opened 18:23, Merged 18:23, all GitHub times; CI "No checks yet" (skipped) |
| Retro rule, target `AGENTS.md` (`radar.retro.apply`) | PR #17 "Add a crew rule to AGENTS.md", merged 18:25. The rule: end every pull request body with `Retro rule: followed`, and export each new helper from `src/index.js` |
| Issue 4, before the fix | #13 claimed after the merge, PR #18 opened 18:34, merged 18:34. Neither part followed: no closing line, `src/index.js` not changed |
| Fix installed in the harness app; spec `more` (one leaf) approved through PR #20, projected | issue #21 |
| Issue 5, with the fix | #21 claimed 18:44, PR #23, merged 18:44. Adds the export to `src/index.js` "as the repo rule asks", a test for the export, and ends with `Retro rule: followed` |

The crew's transcript shows `plans_verify_issue` returning
`Retro rule (AGENTS.md): ...` in the brief's `rules` for #21.

## Why issue 4 failed, and the fix

PR #247 puts Avoozl's workspace agent rules into each issue body. A retro
rule lands in the repository's `AGENTS.md` later, so it is not in any issue
body. The crew's chat is long-lived and read `AGENTS.md` once, so it never
saw the new rule. This is the same cause as run 1.

The fix: `plans_verify_issue`, which the crew calls for each issue, now reads
the retro rule blocks from `AGENTS.md` and `.kiro/steering/*.md` on the
default branch and adds them to the brief's `rules`. The crew prompt already
says to follow those rules. If the files cannot be read, the brief says so
and tells the crew to read them itself. Tests:
`src/app/test/verify-issue-brief.test.mjs`.

## Harness notes

- The Kiro sign-in was hidden at first, because the shell that started the
  harness set `XDG_DATA_HOME` to a throwaway folder. Start the harness with
  no `XDG_*` overrides.
- Issue Radar's own backend cannot run `gh` inside an agent sandbox (its
  trust check sees `/` as owned by another user). This does not stop a
  crew: the crew runs `gh` from its shell.
- After each gateway restart the crew's first turn raced its auto-approve
  grant, timed out on `issue_radar_crew_read`, and paused the loop.
  `POST /api/autonudge/<id>/fire` after the grant resumed it (also seen in
  run 1).

## Commands

```
harness.sh start
radar.trace {"repository":"mtdowling/avoozl-scratch-p8a","number":12}
radar.retro.apply {"repository":"mtdowling/avoozl-scratch-p8a","target":"agents","text":"..."}
gh pr merge 17 --merge
plan.create {"spec":"more"}; plan.approve {"id":"more",...}; gh pr merge 20 --merge; plan.approve again
github.project {"planId":"more","repository":"mtdowling/avoozl-scratch-p8a"}
```
