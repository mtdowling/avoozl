# Design: the remaining Avoozl work

Status: Draft

Requirements are in `requirements.md` (AN1 to AN4). This spec adds no design
of its own. Behavior is defined in `.kiro/specs/radar-coder/design.md`
(D28 gates, D30 private plans) and `.kiro/specs/avoozl/design.md` (§6.14 public
crews, and §4.11, §4.18, §4.19, §8.7, §8.8 for the proofs). This file says how
the open work was chosen, how it is ordered, and what a person must do.

## How the work was chosen

Source: the unchecked items in `.kiro/specs/avoozl/tasks.md` and
`.kiro/specs/radar-coder/tasks.md`, the open pull requests, and the `Open:`
notes in those task lists, read on the day of writing. An item went in only
if it is open, has no open pull request, needs no person, and does not exist
only for Avoozl's own workers.

| Source item | In this plan as | Why |
| --- | --- | --- |
| `rc-22.3` to `rc-22.5`, `rc-p22` | `an-1.1` to `an-p1` | open, fake plugin, no owner |
| `rc-24.3` to `rc-24.5` | `an-2.1` to `an-2.3` | open, fake GitHub |
| `rc-p24` | `an-p2` (fake) and an owner step (real) | the real run needs scratch repositories |
| `avoozl` 39.1 to 39.5, `avoozl-p49` | `an-3.1` to `an-p3` | open, tests with fakes |
| `avoozl-p38`, `p39`, `p43` | `an-4.1`, `an-4.2`, `an-4.4` | parts tested, named proof never run |
| `avoozl-p42` steps 13, 14 | `an-4.3` | Share steps not in the proof test |
| `rc-23.*`, `rc-24.1`, `rc-24.2`, `rc-25.1` to `rc-25.3`, `rc-26.*`, `rc-20.*`, `rc-22.1`, `rc-22.2` | not included | merged |
| `rc-25.4` to `rc-25.7`, `rc-p25` | not included | pull request 191 and later (another worker); `rc-p25` is an owner step |
| `rc-p23`, `rc-p26` | owner steps | the run needs real scratch repositories |
| `rc-12.*`, `rc-p12` | not included | Phase 12, retirement |
| `avoozl` 11.1, 11.10, 12.13, 13.9, 16.7, `p29` | not included | crew placement for workers, and upstream asks |
| `rc-p14` | not included | proof of the worker adapter |
| `avoozl` 8.5, `p8b` | not included | skipped by the owner |

## Order

```text
Phase 1 gates:   an-1.1 -> an-1.2 -> an-1.3 -> an-p1
Phase 2 plans:   an-2.1 -> an-2.3 -> an-p2   (an-2.2 joins an-p2)
Phase 3 public:  an-3.1 -> an-3.2 -> an-3.3 / an-3.4 -> an-3.5 -> an-p3
Phase 4 proofs:  an-4.1, an-4.2, an-4.3, an-4.4   (independent)
```

Outside the graph: `an-2.2` edits the forward path that `rc-25.4` to
`rc-25.7` also edit. A manifest edge cannot name a task outside this spec, so
start `an-2.2` after those pull requests merge. Phases 1, 3 and 4 do not wait.

## Owner steps

These need a person, a real repository, or a real Kiro Crew. None is a task
in this plan; `docs/evidence/` receipts record them when done.

1. Live runs of `rc-p1` to `rc-p7`, `rc-p9`, `rc-p10`, `rc-p13`, `rc-p15` to
   `rc-p19`: each has a fake-GitHub proof merged; the run on a scratch
   repository is pending. `rc-p8` (a crew follows a retro rule) is live only.
2. `rc-q4` to `rc-q9`: live checks and owner choices, including the public
   marker choice (Q8) and the default label names (Q9).
3. `rc-p11`: the whole path on a real repository, then `rc-12.1`, the decision
   to retire worker code.
4. `rc-p23`, `rc-p24`, `rc-p25`, `rc-p26`: the mirror proofs on scratch
   repositories. The first dogfood run is in `docs/dogfood-checklist.md`.
5. Live GitHub proofs of `avoozl`: P7, P8, P10, P11, P13, P16, P24, P25, and
   P17, P18 (scratch organizations).
6. Nupp cutover: 6.8, 6.9, then P14, P22, P23.
7. Release: 7.6 (publish and dogfood) and P15 (clean machine).
8. Upstream asks to Kiro Crew: 13.9 to file; 11.10 and 12.13 wait on Kiro Crew.
