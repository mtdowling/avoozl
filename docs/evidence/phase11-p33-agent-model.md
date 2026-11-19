# Proof P33: agent and model per task with fake crews and fake agents

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 11,
proof P33 (tasks.md; design §4.10 "Agent and model per session"; R53).

- Base: `kirocrew-native` at `112fe19`
- Recorded: 2026-11-13, macOS
- Result: **pass** with fake crews and fake agents

## What ran

`src/app/test/proof-p33.test.mjs` on the P29 workspace and crew driver
(`src/app/test/fixtures/crews/`), every chat limit 10, `fake-linux` listing
agents without `alt-worker`. Review role `correctness` on `model-r` with
`distinctFrom: model`, writer model `model-w`. Leaves `h1` (label `hard`),
`r1`–`r6`, `m1` (manifest `session: {model: "model-m"}`), and `q1` (labels
`hard` and `radar`, route `github` in a workspace with no GitHub mode, so
Avoozl opens no session for it, as for an Issue Radar leaf).

## Expected items

| # | Expected | Result |
|---|---|---|
| 1 | No `session` anywhere: every session as before | pass. Every worker on `kirocrew-worker` and `auto`; `m1`'s own manifest session gives it `model-m`; `q1` opens nothing. |
| 2 | `h1` on `model-a`, `m1` on `model-m`, `r1`–`r6` split 4 to 2, `q1` opens nothing with the does-not-apply note, Preview shows each reason | pass. Preview: `h1` `rule hard-parts`, `m1` `manifest`, no row for `q1`. The view marks rule `radar` (route `github`) `sessionApplies: false`. Tick: `model-b` 4, `model-c` 2. Every worker binding records `agent` and `sessionReason`. |
| 3 | `r1`'s retry keeps its model; `r2` picked afresh after Pick again | pass. Sessions are refused Pick again. Attempt 2 of `r1` keeps its model with `kept from the last attempt`; `r2`'s attempt 2 is chosen again by weight. |
| 4 | Choices `model-r` and `model-c`: no writer on `model-r` | pass. Preview shows no item on `model-r`. |
| 5 | `alt-worker` with only `fake-linux` allowed: one no-fit decision naming "agent not installed" | pass. No dispatch; one `no-fit` item with `fake-linux: agent not installed`. |
| 6 | Weight 0 and 11 choices refused, naming each key | pass. The policy is `invalid` and the error names `routing.rules[0].session.choices must list 1–10` and `routing.rules[0].session.choices[0].weight must be a whole number 1–100`. |

## Checks

See the P29 receipt (`docs/evidence/phase11-p29-crew-placement.md`).

## Not covered

- Kiro Crew's served-model report (F65) is not exercised: `modelUsed` stays
  the existing `served` record on each binding.
- The router ranking choices (R53.5) is built and unit-tested in
  `chooseSession`; the tick does not ask the router to rank choices yet.
