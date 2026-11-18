# lt-p2 receipt: ten branches land in one train
Train train-09e3a59b0f72: 10 members, outcome landed.
- OBSERVED: one train of nine (ten queued, one dropped)
- OBSERVED: the later same-line branch (t2) returned to its task
- OBSERVED: its conflicted file (lib.js) was recorded for its chat
- OBSERVED: the stacked branch carries no duplicated commit (t4 appears once)
- OBSERVED: the changelog merged by rule and passed verify
- OBSERVED: one trunk push
- OBSERVED: one CI run read for the whole train
- OBSERVED: no forced update on any ref (21 ref updates, all create, fast-forward or delete)
next: landed landed  [["t2","stacked"]]
- OBSERVED: the returned branch, fixed by a merge and requeued, landed in the next train
- OBSERVED: still no forced update after the second train

Run 2026-11-18T07:38:19.778Z on linux with git git version 2.50.1.
