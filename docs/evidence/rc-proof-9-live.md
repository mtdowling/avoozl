# Radar-coder Proof 9, live: Make tests faster

Receipt for task `rc-p9`.

- Recorded: 2026-11-15.
- Verdict: **NOT RUN.**

## Why

`quickgoal.propose` starts the planner chat through the app backend's planner
hook, and the operation refuses any CLI or MCP caller ("Only a person works a
quick goal, in the Avoozl page"). The app backend accepts only a
gateway-signed page request, and this run had no page session. The planner
chat would also hit the missing caller identity seen in
`docs/evidence/rc-proof-20-live.md` when it hands its proposal back.

To run it: open the harness dashboard (`harness.sh url`), start Quick goal
"Make tests faster" with Measure on a scratch repository with a slow suite,
approve, and let the crew build.
