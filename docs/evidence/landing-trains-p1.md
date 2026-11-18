# lt-p1 receipt: one integrator per trunk, and a dead one clears by itself
- OBSERVED: (1) with two integrators running, only A holds the lease; B reports busy
- OBSERVED: (1) one train exists
Killed A (pid 3232827) during full validation of train-912d6d5d183f.
- OBSERVED: (2) the survivor took the lease after the missed heartbeats and abandoned A's train
- OBSERVED: (2) it cleaned up A's landing worktree
Not shown here: the survivor landing the three. B's own train is suspended in step (3); landing is shown by p2, p3 and the engine tests.
Suspended B (pid 3232895) past its expiry.
- OBSERVED: (3) nothing was taken from the suspended holder; the lease is marked hung
- OBSERVED: (3) one Needs you notice names the hung integrator
- OBSERVED: the trunk never shows a forced update
(4) A trunk moved by hand during a train is covered by the engine test 'a trunk moved during the train is rebased onto and pushed after the rechecks' (src/app/test/integrator-engine.test.mjs).

Run 2026-11-18T07:40:19.051Z on linux with git git version 2.50.1.
