# Radar-coder Proof 22, live: tracker gates with the fake gate plugin

Receipt for task `rc-p22`. Spec: RC23, D28, Phase 22.

- Recorded: 2026-11-15, Linux, Kiro Crew 0.12.2.4 harness (own home
  `/tmp/avoozl-live-p22`, port 5695), Avoozl from `main` at `67c1267`.
- GitHub: private scratch repository `mtdowling/avoozl-scratch-t1` (for the
  owner to delete). The machine's `gh` login is `mtdowling`.
- Plugin: the repository's `fake-gate` (`src/app/test/fixtures/plugins/fake-gate`),
  approved by its hash. A JSON file plays the outside tracker: the run edited
  one item's `state` by hand.
- Verdict: **PASS.** One product bug was found in the Release queue view and
  fixed in PR #230. The gate step, label step, Needs you rows, clears and
  `gate.list` behaved as the spec says.

## Setup

1. `harness.sh start` with `AVOOZL_HARNESS_DIR=/tmp/avoozl-live-p22`,
   `AVOOZL_HARNESS_PORT=5695`, `AVOOZL_HARNESS_REPO` set to the scratch
   repository, and `XDG_CONFIG_HOME` inside the harness directory.
2. A workspace in single-repo mode, `delivery: {"concurrency": 0}` (the tick
   runs the plugin step only when `delivery` is set; 0 keeps any agent from
   starting), allowed actor `mtdowling`.
3. Four specs in the scratch repository, each approved through its approval
   pull request and projected with `github.project`: `gate` (gate `gate.1`,
   item REV-1, dependent `gate.2`), `clr` (REV-2), `strg` (REV-3) and `rts`
   (four gates, REV-4 to REV-7, one dependent each).
4. `plugins.json` written into the harness home (the backend has no
   `plugins.add`), then `plugin.approve` with the hash `plugins.list` showed.

Every write to Avoozl went through the gateway's command route with the
harness's own sign-in token, as in earlier live receipts. Ticks are the app's
own 60-second cron.

## Part 1: the plugin's answer moves, one gate

REV-1 was edited by hand; each row is what the next tick showed
(`gate.list`, `radar.releasequeue` rows, `conflicts.view`, `gh issue list`).

| Plugin says | Gate state | Needs you | Labels on gate #3 and dependent #4 | Dependent |
| --- | --- | --- | --- | --- |
| `open` (07:02) | open, next check in 1 min | none | `avoozl:waiting-on-tracker` on both, put on in the first tick after projection | held |
| `unknown` (07:04) | unknown | none (first read) | kept | held |
| `unknown` again (07:06) | unknown, gap now 2 min | one row, `gate:gate.1:unknown` | kept | held |
| `failed` (07:09) | failed | one row, `gate:gate.1:failed`; the same single row at 07:10 and 07:11 | kept | held |
| `done` (07:13) | done, no next check | row gone | removed from both | `avoozl:ready` put on #4 in the same pass |

`gate.1` was never marked done by anything but the plugin's `done`. A failed
gate stayed failed across three ticks and cleared nothing.

## Part 2: the person's clear, four ways, and a stranger

| Gate | How | Result |
| --- | --- | --- |
| `clr.1` (#7) | `gh issue edit 7 --remove-label avoozl:waiting-on-tracker` as `mtdowling` (allowed) | Recorded as an order within two ticks: how `label`, actor `mtdowling`, last state `open`. Label stayed off, `clr.2` (#8) lost its label |
| `rts.1` (#15) | `avoozl gate clear rts.1 --reason ...` | `Cleared rts.1 as an order by mtdowling.` how `command` |
| `rts.3` (#17) | MCP tool `plans_conflicts` action `clear_gate` over the stdio server | `{"cleared":true,"state":"order","actor":"mtdowling"}` |
| `rts.5` (#19) | command route `gate.clear` (what the Clear button calls) | `{"cleared":true,"state":"order","actor":"mtdowling"}` |
| `rts.1` again | `gate.clear` a second time | `{"cleared":false,"state":"order"}`: nothing new recorded, the first record unchanged |
| `strg.1` (#11) | `.avoozl.json` allowed actors set to `octocat`, then `mtdowling` removed the label | Next tick put the label back, one row `gate:strg.1:stranger` ("mtdowling removed the waiting label from gate strg.1"), `strg.2` stayed held |
| `strg.1` | `avoozl gate clear` and `gate.clear` as the same stranger | Both refused: `Not cleared: mtdowling is not an allowed actor.` |

The brief of a released dependent says it. Issue #16 (`rts.2`) now carries:
"Gate rts.1 was cleared by a person: mtdowling cleared it by command at
2026-11-15T07:17:30.608Z, last state open. Its outside item (REV-4) may not
be done. Check before relying on it."

`gate.list` shows state `cleared`, the `cleared` record (actor, how, at,
reason, last state), `held` empty, and the last known evidence and link.

## Trace

`radar.trace` on gate #3 shows a `Tracker` step with the state, the plugin,
the item, the last check time and the evidence ("fake-gate REV-1: done ...").
`Ready` is `skipped` on a gate (no ready label). For the cleared gate #15 the
step reads "fake-gate REV-4: cleared".

## Found and fixed

- **Release queue (`radar.releasequeue`) ignored the gate verdict.** After
  REV-1 was done and #4 had its ready label, the queue still listed `gate.2`
  as "held - Waiting on gate.1" and the finished gate as "Next in line". Same
  for cleared gates. The queue judged a blocker by its status; a gate's
  verdict is the engine's rule (RC23.2). PR #230 uses the verdict and has a
  test that fails without the change. No UI file changed.
- Not fixed: `radar.trace` on a done or cleared gate still lists `Claimed`
  as the current step and `PR opened`, `CI`, `Merged` as later. A gate has no
  such steps. This is display only and belongs with the UI work.
- Not a bug, seen on the way: with release capacity 2, only #4 and #16 got
  `avoozl:ready` after four dependents were freed. The rest wait for a free
  slot, as the queue says.

## Not checked live

- A plugin `done` after a clear adds evidence only. The re-read of a cleared
  gate is due 30 minutes after the first one; the fake-GitHub test covers it.
- The Release queue and Trace screens in the browser (no sign-in or computer
  tool here); the data behind them was read through the same operations.
- A real tracker. The fake plugin was edited by hand.

## Left for the owner

Delete the private scratch repository `mtdowling/avoozl-scratch-t1`. The
harness home is `/tmp/avoozl-live-p22`; `harness.sh stop` stops it.
