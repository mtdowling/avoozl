# Radar-coder Proof 10, live: public repository

Receipt for task `rc-p10`. The fake-GitHub run is
`docs/evidence/radar-coder-proof-10-fake-github.md`.

- Recorded: 2026-11-15 08:22 to 08:43 UTC, Linux, Kiro Crew 0.12.2.4 harness
  (own home `/tmp/avoozl-live-p7-10`, port 5697), Avoozl from `main` plus
  PR #248.
- GitHub: private scratch repository `mtdowling/avoozl-scratch-7`. No
  repository was made public.
- Verdict: **PASS on a private repository; the public-repository step is
  PARKED.** Not ticked.

## What ran

The hold covers a repository that is public or whose visibility was not read.
GitHub says the scratch repository is private (`private: true`), and Avoozl
stored that. For the run, the stored value was removed, which is what Avoozl
holds when it could not read the visibility. It was put back after.

| Step | Result |
| --- | --- |
| Visibility not read, no sign-off; spec `strings` approved, projected | #34 and #35 created with no `ready`; release queue reason "This repository is public, or its visibility could not be read, and its public sign-off is not complete, so nothing is released." on both; two cron ticks later still no `ready` |
| `radar.signoff` complete, then two cron ticks | nothing released (see the bug below); a forced `github project strings` then put `ready` on both |
| With PR #248 installed: visibility not read, sign-off not complete, capacity 3; spec `numbers` projected | #41 has no `ready`; one cron tick later still none |
| `radar.signoff` complete at 08:43:05, cron tick only | `ready` added to #41 at 08:43:21 |

## Found, and fixed in PR #248

After the sign-off, the tick projected nothing again. The tick re-projects a
plan only when its release fingerprint changes (capacity, mode, Step clicks),
and the fingerprint did not cover the public hold. The fingerprint now has
it.

## Found, not fixed

- A hold that starts after release does not take `ready` off issues that
  already have it (#35 kept it). Release counts a labelled issue as holding
  its slot. If a repository turns public after release, those issues stay
  open to crews.

## Parked: the public-repository step

Not run: it needs a public repository. Owner steps:

1. Create a public scratch repository, for example
   `gh repo create mtdowling/avoozl-scratch-public --public --add-readme`.
2. Push a small package and one approved test spec to it (the shape of
   `.kiro/specs/strings/` in `mtdowling/avoozl-scratch-7`).
3. Register it in an Avoozl workspace with `coder: issue-radar` and connect it
   in the harness (`harness.sh connect-repo <url>`). Check that Avoozl stored
   `private: false` for it.
4. Approve and project the spec. Expect no `ready` label on any issue, and the
   public-hold sentence on each Release queue row. Wait for two cron ticks.
5. Record the sign-off: `avoozl radar.signoff --json
   '{"repository":"<repo>","complete":true}' --as-person`.
6. Wait for one cron tick. Expect `ready` on up to the capacity.
7. Record the result here and tick `rc-p10`.
