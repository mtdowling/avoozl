# Proof 25 (rc-p25), live: forward targets and protections

Run on 2026-11-15 on `main` at `78445c7` (plus this PR), through the throwaway
harness gateway (port 5694) with `forward` set to `nudge`. Each mirror change
was a pull request merged in the mirror from a branch named `avoozl/<task>`;
the Avoozl tick recorded it, and the Forward screen operations
(`mirror.forward.review`, `mirror.forward`) did the rest. Nothing was created on
or forwarded to any repository other than the two below.

Scratch repositories (private, safe to delete):

- `mtdowling/avoozl-scratch-f1` (source, the "public" side)
- `mtdowling/avoozl-scratch-f2` (mirror, built by Create setup; see `rc-proof-26-live.md`)

Verdict: **partial pass**. Targets `each` and `branch` and every planted case
passed live. Target `batch` was not run live, so `rc-p25` stays unticked.

| Case                                                      | Expected                                                              | Observed                                                                                                                                                                                                                                                   |
| --------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean change, target `each`                               | Public pull request on `f1:main` after the person pressed Forward     | Review showed the exact diff, title and body. Forward with a wrong hash returned `changed` and pushed nothing (f1 had only `main`). Forward with the shown hash opened `f1` PR 1. The public commit has one parent, the person as author, one changed file |
| Planted trailer in the mirror commit message              | No trailer on the public commit                                       | Public commit message is the title and body only (PR 2 on `f1`)                                                                                                                                                                                            |
| Target `branch` (`publicBranch` = `avoozl-public`)        | Mirror merge into the mirror's copy of the branch forwards against it | The sync step created the copy; a mirror PR into it forwarded as `f1` PR 3 with base `avoozl-public`                                                                                                                                                       |
| Planted excluded path (`.kiro/notes.md`)                  | Block, one row, nothing pushed                                        | `path-kiro in file 1`; "Nothing was pushed."                                                                                                                                                                                                               |
| Planted secret-shaped string (`token = "..."`, fake)      | Block, one row, nothing pushed                                        | `assigned-secret in file 1 line 1`                                                                                                                                                                                                                         |
| Planted instance name (this workspace's own ID in a file) | Block, one row, nothing pushed                                        | `instance in file 1`                                                                                                                                                                                                                                       |
| Three more ticks after the blocks                         | Still one row each, no retry                                          | 3 blocked records, 3 rows, unchanged across ticks; no retry field; `f1` had no branch for any of them                                                                                                                                                      |
| Extra file pushed by hand onto a forwarded public branch  | Audit finds it, one row, Stop the line                                | Audit row `audit-extra-file`, `audit-extra-commit`; one stop opened for `f1`                                                                                                                                                                               |
| Forward a clean change while the stop is open             | Refused, nothing pushed                                               | "Forwarding is stopped: The forward audit found a difference..."; no new branch on `f1`                                                                                                                                                                    |
| Resume the stop (`flow.resume`)                           | Forwarding works again                                                | Stop closed; the `branch` forward above then succeeded                                                                                                                                                                                                     |

Forward screen screenshots (see below) were taken in headless Chrome from the
repository's UI harness, fed the replies these operations gave in this run:
`forward-screen/forward-{ok,blocked,stopped}-{390,1100}.png`, from
`kirocrew-app/ui/test/browser/forward-shots.mjs`. The harness stubs the host's
button styles, so the Forward button looks enabled on the blocked and stopped
screens; the component's `disabled` rule is checked by `forward-screen.test.mjs`.
The screen was not opened in the real dashboard: the page there stays on
"Loading app" for a script-driven browser without a full host session.

## Not checked

- Target `batch` (one net-diff commit, one public PR at epic done): needs an
  approved plan with an epic; fake-GitHub tests only.
- The public pull requests were not merged, so the public-merge poll and
  dependents' release were not exercised here (Proof 23 covers that).
- Forbidden private terms from a terms file, hosts, ticket IDs, binary and
  over-size files: fake-GitHub tests only. Only the secret, excluded path and
  instance cases were planted live.
- The `auto` and `person` modes: only `nudge` was used.
