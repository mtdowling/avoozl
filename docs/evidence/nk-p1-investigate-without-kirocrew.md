# nk-p1 live: investigate first with no Kiro Crew chat

Proof nk-p1 of `without-kirocrew` (NK1, NK2, design §D2), run once with
`scripts/proof-nk-p1-live.mjs --root /tmp/nk-p1-1795057616` on 2026-11-19
from 03:06:57 to 03:09:31 UTC, at Avoozl commit `a5f3e698` (after #710). The
owner ran it from his own terminal on a fresh clone. Claude Code runs under
`sandbox-exec`, and Kiro Crew's own sandbox refuses that nested sandbox (as in
P57).

**Verdict: pass, every Expected item. nk-p1 is ticked.**

## Setup

- A bare `origin.git` and its checkout `app`, with one check, `node check.mjs`
  (each `notes/*.txt` must be one lowercase word and a newline). The project
  had `executor: "process"`, `harness: "claude-code"`, `landing: "direct"`, and
  the P57 sandbox: write roots plus a Claude Code config folder,
  `allowCommands` `node check.mjs`, `git rev-parse`, `git diff`,
  `git status` and `git log`, and network `localhost:18461` only.
- Two leaves with investigate first on: `nkp1-go` (write `notes/alpha.txt`)
  and `nkp1-again` (write `notes/beta.txt`). The plan was installed approved,
  as P59's was.
- Claude Code from `examples/harnesses/claude-code.json`, approved by hash
  `7107c835…`, model `global.anthropic.claude-sonnet-5`. The runs reported
  $0.86 in total.
- The gate lets a sure worker and a sure falsifier go ahead with no person
  (R75.3). The script's backend holds each such gate pass for the person's
  decision, so that the proof presses each button. Avoozl's own gate is
  unchanged. Two passes were held: `nkp1-go` round 1 (03:07:53) and
  `nkp1-again` round 2 (03:08:47). `nkp1-again` round 1 was refuted, so the
  gate already asked the person.

## Expected, item by item

| #   | Expected                                                   | Seen                                                                                                                                                                                                                                                                                                                                                                                                                         | Pass |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Each worker reports findings and each falsifier a verdict  | `nkp1-go` round 1: findings, verdict `stands`. `nkp1-again` round 1: findings, verdict `refuted` (medium: `node check.mjs` passes with no notes, so it cannot prove the file exists); round 2: new findings, verdict `stands`. Three falsifier children, one per round.                                                                                                                                                       | yes  |
| 2   | The first task lands; the second investigates again, lands | `nkp1-go`: one Go ahead (decided `go`), attempt 1 committed `11adf80`, checks accepted, landed as `cc256fa`; origin main holds `notes/alpha.txt` = `alpha\n`. `nkp1-again`: Investigate again, then Go ahead (decided `again,go`), attempt 1 committed `3de93f4`, landed as `526cd39`; origin main holds `notes/beta.txt` = `beta\n`. Remote log: `Land nkp1-go`, then `Merge main into avoozl/nkp1-again`, `Land nkp1-again`. | yes  |
| 3   | Every session is `process`; no `kirocrew` request          | 5 session bindings (2 workers, 3 falsifiers), all executor `process` and closed. 8 session requests (5 starts, 3 sends), all executor `process`.                                                                                                                                                                                                                                                                             | yes  |

The script now checks item 2 against origin main's file content, not only
the delivery state (#710).

## Also seen

- Both workers wrote their notes with Claude Code's Write tool and ran
  `node check.mjs` by itself. No tool call was refused.
- The model proxy let through only `bedrock-runtime.us-west-2.amazonaws.com`
  (8 connections). It denied the Bedrock control-plane host (8) and the CLI's
  telemetry host (360).
- The backend stopped at 03:09:26, and the script stopped the supervisor.

## The run before this one

The first run after #697 (2026-11-19, about 01:46 UTC, at `fb4833ad`)
reported pass, but `nkp1-go` landed nothing. After Go ahead, its worker's one
chained shell call was refused whole, because `xxd` was not allowed. It then
wrote a done result anyway. Avoozl took done at the base commit, the check
passed with no notes, and the delivery read integrated. #710 fixed this:

| Pull request | Change                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #710         | A `process` write worker's done with nothing committed since its base is recorded blocked with that reason, so it retries. The worker's brief names its file tools and its allowed commands. The proof checks origin main. |

## Not checked

- Codex and every harness other than Claude Code.
- A second machine: this ran on the owner's Mac, with no Kiro Crew chat in the
  run.
- A retry after a refused empty done: this run had none. A unit test covers it.

## Next decision

None (nk-p1's own). nk-p2 runs all of Avoozl on a machine with no Kiro Crew.
