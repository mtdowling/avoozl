# Proof 26 (rc-p26), live: Create setup and Adopt existing setup

Run on 2026-11-15 on `main` at `78445c7` (plus this PR), through the throwaway
harness gateway (own home, port 5694) and Avoozl's own operations
`mirror.create` and `mirror.adopt`. Both calls went through the gateway's
signed-in command route, because the CLI refuses an apply from an agent session.

Scratch repositories (private, safe to delete):

- `mtdowling/avoozl-scratch-f1` (the source; created for this proof)
- `mtdowling/avoozl-scratch-f2` (the mirror; built by Create setup)

Verdict: **pass**.

| Step                                                                                                                                | Expected                                  | Observed                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create setup, dry run                                                                                                               | Six lines, writes listed, nothing written | 6 writes listed; `mtdowling/avoozl-scratch-f2` did not exist afterward (404)                                                                                                                               |
| Create setup, confirm with the dry run's hash                                                                                       | Private mirror built in order             | `mirror`, `seed`, `plans-branch`, `labels`, `auto-merge`, `setting` all `done`; read back: `private: true`, visibility `private`, auto-merge on, branches `main` and `avoozl-plans`, six `avoozl:*` labels |
| Create setup again                                                                                                                  | Writes nothing                            | Existing name refused (`found`, `refused`), 0 writes, points to Adopt                                                                                                                                      |
| Adopt again                                                                                                                         | Writes nothing                            | 7 lines all `found` or `input`, 0 writes                                                                                                                                                                   |
| Drift the mirror by hand: delete labels `avoozl:review` and `avoozl:drafted`, turn auto-merge off, add an unrelated label `keep-me` | Adopt notices both                        | Dry run shows 2 writes (labels, auto-merge), both ticked                                                                                                                                                   |
| Adopt with only `labels` ticked                                                                                                     | Only labels written                       | `labels` `done`; auto-merge stayed off; `keep-me` kept; nothing deleted                                                                                                                                    |

The branch-rule line asks for a CI check name (`input`) and stays unticked on
every run, so no branch rule was written. That is as designed.

Notes:

- A read taken within `github.cacheSeconds` (60) of an earlier read shows the
  earlier state. The first dry run after the drift showed 0 writes; one minute
  later it showed the 2 writes. Apply is guarded by the dry run's hash, so a
  stale view cannot write.
- Not run: Adopt on a mirror that is not private, and a missing-permission
  line. Both are covered by the fake-GitHub tests only.
