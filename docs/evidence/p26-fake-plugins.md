# Proof P26: fake tracker and fake route plugins end to end

Recorded 2026-11-12 on branch `task/p8`, fast-forwarded onto
`kirocrew-native`. Requirements R22.5-R22.10, R34, R35; design §4.8. Node
v26.13.0 on macOS (Darwin 25.6.0). Result: **pass**.

The automated proof is `src/app/test/proof-p26.test.mjs`, run with
`node --test src/app/test/proof-p26.test.mjs` (3 of 3 pass) and in `npm test`
(553 of 553 pass).

## The gate is not met

Phase 8 and R22.4 say the plugin seam waits until P1-P25 pass and a second
real route exists. Neither holds: ten GitHub proofs (P7, P8, P10, P11, P14,
P16, P17, P18, P24, P25) are skipped because there is no scratch GitHub org,
and no private route package exists. The owner asked for Phase 8 to be built
anyway, against fakes only. So the seam is built and tested here, and it stays
inert: no plugin loads unless a `plugins` entry declares it and a person
approved its exact version and content hash on this machine. Turning a real
plugin on still waits for the R22.4 gate. The tracker contract (8.7, R35.11)
was built against the fake tracker only, for the same reason.

## Setup

- An isolated temporary workspace with a sample git repository `app` and one
  check, `scripts/check.sh`.
- `.avoozl.json`: a namespace and `delivery.concurrency: 3`. No GitHub mode.
- Both fakes copied from `src/app/test/fixtures/plugins/` into the temporary
  folder and declared in a temporary machine-local `plugins.json`:
  - `fake-tracker`: records in a JSON file, capabilities `actor` only (no
    `edges`), `allowedActors: ["maintainer"]`, account `avoozl-bot`;
  - `fake-route`: remote work in a JSON file.
- Approved spec `p26`: chain `a -> b -> c` and pair `x -> y`, all
  `authority: plugin:fake-tracker`; `b` has `route: plugin:fake-route`.
- The fake session driver (`fake-crew.mjs`) plays every local worker and
  verifier. x's checks never finish, so x is still open at action 4.

## Results

| Action                                               | Expected                                                                                                                                      | Observed                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Tick before approval                              | Nothing loads; every task "needs you"                                                                                                         | Neither plugin process started and neither state file was written; 5 of 5 tasks show "needs you" with "Not approved on this machine."; no dispatch                                                                                                                                                                                                                                      |
| 2. Approve both, tick until b is submitted           | 5 records with markers, no edges; a in a local worker; b through `submit`, no session                                                         | 5 records, each with the namespace marker and no `blockedBy`; a and x dispatched as workers; b submitted as `remote-p26.2`; no session for b                                                                                                                                                                                                                                            |
| 3. Route crashes on `status`, then listens           | Each parks only b; the tick finishes; x keeps advancing; no child listening                                                                   | Crash: `fake-route` unavailable, "crashed (exit 3)", tracker `ok`, only b "needs you", x's verifier dispatched in the same tick. Listen: "opened a network listener", only b parked. No plugin child process left after either tick                                                                                                                                                     |
| 4. A person not in `allowedActors` closes x's record | y held, a decision opens, x not reopened                                                                                                      | Decision on x ("closed by stranger"), a decision notice, y not ready and not dispatched, x's record still closed                                                                                                                                                                                                                                                                        |
| 5. Tick until c is done                              | b "needs you" with the fake link, then completion; c's brief quotes b's result as data; a, b, c close `completed` only after Avoozl's verdict | b showed the route's `#answer` link while its record stayed open; after completion, c's brief quoted the pull request link and answer inside a data fence, with the answer's backticks defused; a, b, c closed `completed` by `avoozl-bot`, each with a `verified` verdict in its marker (b's basis `route`). A check after every tick found no record closed before its task's verdict |
| 6. Hand edit of a's title; direct edit of c          | Conflict left alone; 409                                                                                                                      | A `tracker-conflict` on a's title in the Conflicts view, the tracker file unchanged by the tick; `task.update` on c refused with 409 `authority-plugin`. A following quiet tick left the database revision unchanged                                                                                                                                                                    |
| 7. New tracker version, then re-approval             | Stops loading; parks the tracker's tasks                                                                                                      | Version 1.0.1 read as "approve it again"; all 5 tasks "needs you"; no tracker write; loads again after re-approval                                                                                                                                                                                                                                                                      |
| 8. Delete SQLite, `rebuild`, tick                    | Every task, edge, status, verdict and baseline match; scan passes                                                                             | Rebuild from `list` and the spec folder at the pinned hash restored 5 tasks and 3 edges with no notes; after the tick, every task's title, authority, route, status, completion, verdict, decision, record fields, baseline and conflicts, and every edge, matched the state before deletion. A second rebuild wrote nothing. The plugin docs and fixtures scan found nothing           |

The release scan with this machine's private terms (`node
scripts/release-scan.mjs`): npm package 223 files and app package 125 files
with 0 findings; plugin docs and fixtures 5 files, 0 findings.

## Repairs found while building the proof

These were found while writing 8.7 against P26, before the recorded run:

- Integration sets a local leaf's status to `implemented`, which rebuild
  could not know. The verdict Avoozl writes into the record's marker before
  it closes the record now carries the task's status.
- Rebuild reset the conflict list that the tick had judged, so a second
  rebuild wrote again. Rebuild now keeps the cached conflicts.

## What this does not show

- The listening-socket check was exercised on macOS (`lsof`). The Linux
  `/proc` path is written but was not run here. Design §4.8 marked the check
  Inferred; it is now verified on macOS only.
- Pauses (the `pause` capability) are implemented but the fake tracker does
  not declare `pause`, so P26 does not exercise them.
- Edges as tracker links (the `edges` capability) are implemented but not
  exercised; the fake tracker has none, as P26 specifies.
