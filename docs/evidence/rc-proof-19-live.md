# Radar-coder Proof 19, live: the parent is not taken by a crew

Receipt for task `rc-p19`. The fake-GitHub run is `docs/evidence/rc-proof-19.md`.

- Recorded: 2026-11-15, Linux, Kiro Crew 0.12.2.4 harness (own home, port
  5692), real Issue Radar crew `p6-crew` on agent `avoozl-crew`, label scope
  `ready`.
- GitHub: private scratch repository `mtdowling/avoozl-scratch-6`.
- Verdict: **PASS.**

## Setup

Parents #2 (`alpha`) and #3 (`beta`) both carry `ready`. Both plans were
approved (Proof 18), so Avoozl wrote its claim: a comment
`<!-- kirocrew-crew v=1 id=avoozl phase=awaiting-merge ... -->` and the
`crew: in progress` label on each. #4 had `ready` removed.

## Observation

1. Crew poll after approval (05:23 UTC), from the crew's chat: "Issues #2 and
   #3 are the only `ready` issues, and both are still claimed. Issue #4 has no
   `ready` label." It recorded an idle sweep and took nothing.
2. `avoozl github project alpha` created #8 to #11; the release step put
   `ready` on #10 (`alpha.1.1`).
3. Next crew poll (05:28 UTC): "Candidates with `ready` and no claim: #10 and
   #12". It took #10 and opened PR #13. It never touched #2 or #3.

Radar's own claim rule reads Avoozl's claim marker as a live claim on this
release.
