# Design: merge batches

`MB` numbers are in this spec's `requirements.md`; `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`.

## D1. The parts

`direct` landing has a per-base queue (`src/app/landing/landing-queue.ts`), a
landing worktree that stacks a group on the base and checks it, a halving
search, union paths, and a guarded fast-forward
(`src/app/landing/merge-batch.ts`, `src/app/landing/direct-landing.ts`,
`src/app/landing/guarded-push.ts`). The group size comes from MB2
(`src/app/landing/merge-batch-size.ts`), the bisect confirms its culprit
(MB4.3), and the group may hold tasks of several specs (MB1.4).

## D2. The size limit (MB2)

Per base branch, the store keeps `{limit, results}`: the limit, and the
outcome of the last 20 members that reached a result (`landed` or
`culprit`). After each merge batch:

```text
p     = results.length >= 5 ? culprits(results) / results.length : 0.10
ceil  = setting is a number ? setting : min(16, max(1, floor(0.7 / p)))
limit = culprit found    ? max(1, floor(limit / 2))
      : all landed and more were waiting than the batch held ? limit + 1
      : limit
limit = min(limit, ceil)
```

`0.7 / p` keeps a batch's chance to pass near one half or better:
(1 - p)^(0.7/p) is about e^-0.7, 0.5. At p = 5% the ceiling is 14; at 20%,
3. A member that was a culprit is kept in the record's `alone` list until it
lands, and the batch builder gives it a batch of its own.

The limit and the results are plain data in the store's meta, so a restart
keeps them.

## D3. One landing step

```text
take up to `limit` waiting members, in order (an `alone` member: only it)
build the candidate: stack each member on the base, in order
   conflict outside unionPaths -> drop that member, send it back (MB5), go on
run the repository's checks on the candidate
   pass -> guarded fast-forward, mark members landed
   fail -> rerun the failing checks once on the same head
      pass -> record flaky, land as above
      fail -> bisect (D4)
```

The candidate is built by stacking in the landing worktree, with each
member's commits keeping their author and message. A base that moved before
the push starts the step again with a new candidate.

## D4. The bisect, and the culprit confirmed

The halving search in `landNext` (`src/app/landing/landing-queue.ts`) finds
the first failing boundary by building shorter candidates, running only the
checks that failed. When it names a culprit:

1. Check the culprit alone on the base, with the failing checks.
2. Fails alone: the culprit is the cause. It goes back to its worker through
   the landing-failure message, with the failing checks and a log excerpt
   capped at 8 KB.
3. Passes alone: it fails only with something ahead of it. It goes back
   naming the members ahead of it in the batch, and they land.
4. Members before the culprit land in one fast-forward. Members after it go
   to the front of the queue, in order, and the next step tests them.

A batch of n costs at most about log2(n) + 1 extra runs of the failing
checks, plus one for the confirmation.

## D5. Local refs (MB6)

A member is a ref under `refs/avoozl/land/<task>` in the checkout that
lands, pointing at the verified commit. Avoozl pushes only the base branch.
`refs/avoozl/` is not under `refs/heads/`, so a plain `git push` from that
checkout never sends it, and it never reaches CI.

## D9. Risks

| Risk                                                        | Guard                                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A flaky check blames an innocent member                     | The rerun (MB4.1) and the confirmation alone (MB4.3)                           |
| The size grows on a run of luck and then fails big          | Halving on a culprit, and the ceiling from the measured rate                  |
