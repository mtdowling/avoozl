# Radar-coder Proof 8, live: observe, and a retro rule a crew follows

Receipt for task `rc-p8`.

- Recorded: 2026-11-15, Linux, Kiro Crew 0.12.2.4 harness, crew `p6-crew` on
  `mtdowling/avoozl-scratch-6`.
- Verdict: **NOT RUN to the end.** One issue ran; Trace was read live. The
  retro rule and the fourth issue were not run.

## What ran

`avoozl radar.trace --json '{"repository":"mtdowling/avoozl-scratch-6","number":10}'`
returned GitHub times for issue #10: spec approved 04:57:34, issue created
05:23:52, ready 05:24:00, claimed by `p6-crew` 05:28:52 (comment link), PR #13
opened 05:29:20.

## Why the rest did not run

The proof needs three finished issues, a retro proposal, a rule landed
through a pull request, and a fourth crew run. A retro proposal comes from a
retro chat, and the tick-opened chats in this harness could not report back
(see `docs/evidence/rc-proof-20-live.md`, caller identity). Several crew
cycles of about 5 minutes each were also needed. This was left for a run
after the identity problem is fixed.
