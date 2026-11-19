# Design: merge batches

`MB` numbers are in this spec's `requirements.md`; `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`. Labels are as in the
requirements: **V** read in the file cited at `9124dcd`, **A** assumed.

## D1. What stays and what goes

`direct` landing already has the pieces: a per-base queue
(`landing-queue.mjs`), a landing worktree that merges a group with the base
and checks it, a halving search, union paths, intents read back before the
push, and a guarded fast-forward (V: `src/app/landing-trains.mjs`,
`src/app/landing-queue.mjs`, `src/app/direct-landing.mjs`). Merge batches are
that code with three changes: the group size comes from MB2 instead of a
fixed four, the bisect confirms its culprit (MB4.3), and the group may cross
drivers (MB1.4).

| Goes                                                          | Lines (V) | Why it is not needed                                        |
| ------------------------------------------------------------- | --------- | ----------------------------------------------------------- |
| `integrator-*.mjs` (11 modules)                               | 3,167     | The second landing system                                    |
| `landing-lease.mjs`                                           | 169       | One machine lands; the work lock already serializes it       |
| `resource-slots.mjs`, and its use in `check-runs.mjs`         | 174       | Trains held platform slots; a check's own command manages its VM or container |
| `setup-workflows.mjs`                                         | 130       | Nothing is pushed but the base, so no CI edit is needed      |
| `train-heads.mjs`                                             | 16        | Trains' validated heads for Stop the line                    |
| `docs/integrator-trains.md`, `scripts/proof-landing-trains.mjs` | —       | Docs and proofs of the removed system                        |

The `workflow_dispatch` input `platforms` in Avoozl's own
`.github/workflows/test.yml` was added for trains' CI fallback (V: its
comment cites the deleted spec). It stays, because a plain dispatch still
runs every platform, and its comment is rewritten.

## D2. The size limit (MB2)

Per base branch, the store keeps `{limit, results}`: the limit, and the
outcome of the last 20 members that reached a result (`landed` or
`culprit`). After each merge batch:

```
p     = results.length >= 5 ? culprits(results) / results.length : 0.10
ceil  = setting is a number ? setting : min(16, max(1, floor(0.7 / p)))
limit = culprit found    ? max(1, floor(limit / 2))
      : all landed and more were waiting than the batch held ? limit + 1
      : limit
limit = min(limit, ceil)
```

`0.7 / p` keeps a batch's chance to pass near one half or better:
(1 − p)^(0.7/p) is about e^−0.7, 0.5. At p = 5% the ceiling is 14; at 20%,
3. A member that was a culprit carries `alone: true` until it lands, and the
batch builder gives it a batch of its own.

The limit and the results are plain data on the base's queue record, so a
restart keeps them, and the Landing queue page reads them.

## D3. One landing step

```
take up to `limit` waiting members, in order (an `alone` member: only it)
build the candidate: stack each member on the base, in order
   conflict outside unionPaths → drop that member, send it back (MB5), go on
run the repository's checks on the candidate
   pass → intents, guarded fast-forward, mark members landed
   fail → rerun the failing checks once on the same head
      pass → record flaky, land as above
      fail → bisect (D4)
```

The candidate is built by stacking, as the halving search's landing
worktree does today, with each member's commits keeping their author and
message. A base that moved before the push starts the step again with a new
candidate.

## D4. The bisect, and the culprit confirmed

The halving search in `landNext` finds the first failing boundary by
building shorter candidates (V: `src/app/landing-queue.mjs:229`). It keeps
doing that, running only the checks that failed. When it names a culprit:

1. Check the culprit alone on the base, with the failing checks.
2. Fails alone: the culprit is the cause. It goes back to its worker through
   the existing landing-failure message, with the failing checks and a log
   excerpt capped at 8 KB.
3. Passes alone: it fails only with something ahead of it. It goes back
   naming the members ahead of it in the batch, and they land.
4. Members before the culprit land in one fast-forward. Members after it go
   to the front of the queue, in order, and the next step tests them.

A batch of n costs at most about log2(n) + 1 extra runs of the failing
checks, plus one for the confirmation.

## D5. Local refs (MB6)

A member is a ref under `refs/avoozl/land/<task>` in the checkout that
lands, pointing at the verified commit. A worker machine's result is fetched
into the same ref (R90.2 already fetches it to check it). Avoozl pushes only
the base branch. `refs/avoozl/` is not under `refs/heads/`, so a plain `git
push` from that checkout never sends it, and it never reaches CI.

## D6. What the page shows (MB7)

The Landing queue page keeps its place (R92.7) and loses the train columns.
Per base:

| Part                | Shows                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| Waiting             | Each member, its spec, its wait time, and why it waits if it is held  |
| Testing             | The current merge batch, its members and its step                     |
| Last merge batches  | Outcome (landed, partly landed, culprit sent back), duration, size    |
| Size                | The current limit and the failure rate it comes from                  |

The one notice is MB7.3: a member waiting longer than 60 minutes opens one
Needs you item. There is no setting for the 60 minutes.

## D7. The retro (MB8)

Flow already records time per stage per task, landing included (R43). The
retro's facts gain, per repository, the median lead time and the median
time waiting to land over its window. When the second is more than half of
the first, the retro brief adds one line asking whether a different landing
mode would help, with the numbers and the two choices of MB8.1. The retro
proposes; the person decides, as for every retro proposal (R47).

## D8. Old settings and commands

| Old                                                   | After                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| `landing.mode: "train"`, repository `landing: "train"`   | Loads as `direct`                                            |
| `landing.trains.*`                                    | Loads, ignored                                               |
| `machine.platforms`, `machine.slots`, `lease.*`       | Load, ignored                                                |
| `avoozl integrator run|status`                        | One line naming `direct` landing                             |
| `avoozl landing submit`                               | One line naming `direct` landing                             |
| `avoozl landing status`                               | Kept, showing D6                                             |
| `avoozl-batch/*` branches on a remote                 | Left alone; Avoozl neither reads nor deletes them            |

`src/avoozl-config.schema.json` marks the ignored keys as ignored, as it
does for other retired keys, so an old file still validates.

## D9. Risks

| Risk                                                        | Guard                                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A flaky check blames an innocent member                     | The rerun (MB4.1) and the confirmation alone (MB4.3)                           |
| The size grows on a run of luck and then fails big          | Halving on a culprit, and the ceiling from the measured rate                  |
| Removing `resource-slots` lets two checks share one VM       | A repository's check command owns its VM or container; the old slots served only trains (A: from the import list, `check-runs.mjs` is the one other reader) |
| A repository relied on `landing: train`                     | It loads as `direct` and lands in merge batches; nothing is left unlanded     |
| Tests of the old system carry behavior worth keeping        | Each removal task lists what the deleted tests covered and where it is covered now |
