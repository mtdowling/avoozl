# Radar-coder Proof 24: a public and a private plan in one mirror (live)

Receipt for task `rc-p24` in `.kiro/specs/radar-coder/tasks.md`.

- Recorded: 2026-11-15, 06:13 to 06:40 UTC, Linux, real GitHub.
- Avoozl: `main` plus the fixes of #218 and #222, in the same throwaway Kiro
  Crew harness and workspace as Proof 23 (see `rc-proof-23-live.md`).
- Verdict: **FAIL live.** Most checks pass, but a private plan's spec name and
  task ID reach the public repository. Failure means, as the task says: a
  private plan can reach the public repository.

## Scratch repositories (for the owner to delete)

The same two as Proof 23: `mtdowling/avoozl-scratch-m1` (source stand-in,
private) and `mtdowling/avoozl-scratch-m2` (mirror, private, plans branch
`avoozl-plans`).

## Setup

- Private spec `p24s` ("Rotate the hidden signing key", leaf `p24s.1.1`),
  committed on the mirror's `avoozl-plans` branch.
- Public spec `p24q` (leaf `p24q.1.1`, `requires: ["p24s.1.1"]`), merged on
  the source's `main` by pull request.
- Workspace setting `operator: "mtdowling"` (see finding 4).

## Results

| Expected                                       | Observed                                                                                                                                                                            | Result                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Both plans in one graph                        | Both approved and projected; the Release queue lists both                                                                                                                           | pass                     |
| Private approval on the plans branch           | PR #18 in the mirror against `avoozl-plans` (after fixes 1 and 2)                                                                                                                   | pass                     |
| Issues in the mirror only                      | Private #20, #21; public #26, #27; 0 open issues on the source                                                                                                                      | pass                     |
| Public issue says only that it waits           | #27's body: `Waits on a private task.`; no `p24s`, title or `avoozl-plans` in the body or marker; GitHub's blocked-by is #21, in the mirror                                         | pass                     |
| Cross edge holds                               | Release queue: `p24q.1.1` "Waiting on p24s.1.1"                                                                                                                                     | pass                     |
| Cross edge releases                            | After the public merge of the private task's forward (#11), `p24q.1.1` no longer waits on it                                                                                        | pass                     |
| Both verify                                    | `verify-issue` #21: exit 0, `ref=avoozl-plans`. #27: exit 1 (commit not in the mirror, finding 3) until the person merged the source's `main` into the mirror (PR #28); then exit 0 | pass, with a manual step |
| Private files on the plans branch only         | The mirror's `main` and every source ref hold no `.kiro/specs/p24s/` path                                                                                                           | pass                     |
| No plans-branch ref or name on the public side | No `avoozl-plans` ref on the source; the name in no file or commit message there                                                                                                    | pass                     |
| Planted name is blocked                        | Mirror PR #32 titled `Notes for avoozl-plans`: record `blocked` (plans-branch-name in commit message and title), nothing pushed                                                     | pass                     |
| Nothing private on the public side             | The forward of `p24s.1.1` pushed branch `avoozl/p24s.1.1` and the commit `Work on p24s.1.1` to the source (public PR #11). `p24q`'s committed manifest names `p24s.1.1`             | **fail**                 |

## Findings

1. **Fixed (#222): a private spec could not be approved.** `putFile` sent no
   `sha`, so GitHub refused to replace a file already on the plans branch
   (`"sha" wasn't supplied`). Every private spec lives there, so every private
   approval failed.
2. **Fixed (#222): a failed approval could not be retried.** The first try
   left `avoozl/approve-<spec>`; each retry failed with `Reference already
exists`. It now takes the next name.
3. **The private spec name leaks through a forward.** The forward branch is
   `<branchPrefix><taskId>` and the title and message come from the crew's
   pull request. The plans-branch scan (RC25.6c) blocks the branch name, a
   private spec's folder path and plans-branch commits, but not a private
   spec's bare name or task ID. Recommendation: name a private task's forward
   branch by the merge commit, and add the private spec names and task IDs to
   the plans-branch scan.
4. **A public manifest names the private task.** A cross edge is written as
   `requires: ["p24s.1.1"]` in the public spec's manifest, which lives on the
   source's `main`. Recommendation: keep the cross edge in the private spec
   (the reverse edge) or in a mirror-only file.
5. **The marker's approver is the local operator name.** With no `operator`
   setting the approval marker named the computer's user name, and `verify-issue` failed the approver check because that is not the
   GitHub login. Setting `operator` fixed it. Recommendation: use the
   signed-in GitHub login for approval pull requests.
6. **The diverged mirror (Proof 23, finding 1) blocks public plans.** An
   approval merged on the source after the first forward never reaches the
   mirror, so `verify-issue` fails for that issue. A person merged the
   source's `main` into the mirror (PR #28); Avoozl then listed that merge as a
   change to forward (#28 `to_forward`), which it is not.
7. **The plans-branch name in file contents is not scanned.** Mirror PR #31
   adds a file holding `avoozl-plans`; the scan passed it. RC25.6c names diff
   paths, not contents, so this matches the spec; it was not forwarded.
8. **Private specs appear only after a tick in the page's backend.**
   `refreshPrivateSpecs` runs in `workspace.tick`; the cron's tick runs in the
   MCP server, so the page saw no private spec until **Run tick** was pressed.

Test artifact: mirror PRs #31 and #32 also said `Closes #27`, so `p24q.1.1`
is held with "Several pull requests claim to close this task." That is
correct and came from the proof's own planted pull requests.

An earlier pair, `p24priv` and `p24pub`, ran before the `operator` setting
and the manual mirror merge, and is left in the mirror.

## Commands

As in Proof 23, plus:

```
avoozl verify-issue mtdowling/avoozl-scratch-m2#21 --json   # exit 0
avoozl verify-issue mtdowling/avoozl-scratch-m2#27 --json   # exit 1, then 0 after PR #28
git clone --mirror https://github.com/mtdowling/avoozl-scratch-m1.git
git grep -il avoozl-plans $(git for-each-ref --format='%(objectname)' refs/heads)
```
