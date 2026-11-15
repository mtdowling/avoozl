# Radar-coder Proof 11 (rc-p11), live: Avoozl's own dogfood setup, up to the first to-forward row

Receipt for the dogfood part of task `rc-p11` in `.kiro/specs/radar-coder/tasks.md`.

- Recorded: 2026-11-15, 09:12 to 09:20 UTC, Linux, real GitHub.
- Avoozl: `main` at `8202a86`, run in the throwaway Kiro Crew harness
  (`scripts/live-harness/harness.sh`, own home, port 5699). Owner steps went to
  Avoozl's command route as the harness's dashboard owner. The tick was the
  app's own `avoozl-tick` cron, fired with `kirocrew cron trigger`.
- Mode: Nudge. Stopped at the first to-forward row.
- Verdict: **PASS for setup, mode and the first row. rc-p11 stays unticked.**
  The task's own bar is a 10-task spec merged by crews, two crews, a retro, and a
  second person's crew. None of that ran: no plan was approved, no issue was
  projected and no Radar crew was started, as ordered.

## Repository made

| Repository                | Role                                                     | Visibility |
| ------------------------- | -------------------------------------------------------- | ---------- |
| `mtdowling/avoozl-mirror` | Private mirror of `mtdowling/avoozl`, kept (not scratch) | private    |

Nothing was written to `mtdowling/avoozl`: no branch, no pull request, no issue.
GitHub rate limit before the run: 4,980 of 5,000 left.

## Steps

| Step                                    | Observed                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create setup, dry run (`mirror.create`) | 7 lines, 6 ticked, 6 writes: `mirror` (create the private repository), `seed`, `plans-branch`, `labels` (7 labels), `auto-merge`, `setting`. `branch-rule` asks for a CI check name and is not ticked. `mtdowling/avoozl-mirror` answered 404 afterward. Hash `1e017a0c4f92641b4cb656853be4fc58`. |
| Private check before                    | The `mirror` line says "Create the private repository". Create setup refuses an existing repository that is not private and stops if the new one does not read private.                                                                                                                           |
| Apply with that hash and 6 lines        | All six `done`.                                                                                                                                                                                                                                                                                   |
| Private check after                     | `gh api repos/mtdowling/avoozl-mirror`: `private: true`, `visibility: private`, `allow_auto_merge: true`. Branches seeded from the source, plus `avoozl-plans`. Seven `avoozl:*` labels.                                                                                                          |
| Create setup again                      | 0 writes, `mirror` refused, points to Adopt.                                                                                                                                                                                                                                                      |
| Adopt, dry run                          | 0 writes on `mirror`, `plans-branch`, `labels`, `auto-merge`, `merge-method`, `setting`; `branch-rule` `input`.                                                                                                                                                                                   |
| Mode                                    | Setting saved as `forward: nudge`, `forwardTo: source`, `plansBranch: avoozl-plans`, `trustedPersons: []`.                                                                                                                                                                                        |
| Mirror pull request #1, squash merged   | Recorded as a `to_forward` record, but under the wrong repository key (see finding 1), so it showed no row.                                                                                                                                                                                       |
| Mirror pull request #2, squash merged   | Next tick: record `7b10221`, `to_forward`, "scan clean, ready for the public repository"; Waiting on you row `Forward mirror pull request #2`. **Stopped here.**                                                                                                                                  |
| Check the source                        | No branch matching `avoozl/` or `probe`, no pull request. The record has `forwardedAt: null` and `publicPr: null`.                                                                                                                                                                                |

The two mirror pull requests added `docs/rc-p11-probe.txt` and
`docs/rc-p11-probe2.txt`, harmless one-line files, to the private mirror only.

## Findings

1. **Create setup before the repository entry exists writes the setting on the
   wrong entry.** The harness had no entry for `mtdowling/avoozl`, so the setting was saved under
   `mtdowling/avoozl-mirror`. Sync then compared the mirror with itself and
   showed "has diverged", and a merge was recorded under the mirror's name, which
   hides its row. After the entry was added through `github.settings.update`
   (the Settings > Repositories save), both went away. The checklist now says to
   add the entry first. Not fixed in code: the dry run could say so.
2. **After the first mirror merge, a "diverged" row shows next to the forward
   row.** The mirror's default branch has the squash commit and the source does
   not, so sync does not fast-forward and says "has diverged". This is the same
   cause as Proof 23 finding 1 and is by design (no reset, no force push). It
   was not followed past the forward, because forwarding is out of scope.
3. **The tick already ran the forward review in Nudge mode.** The record had
   `scanClean: true` and a `reviewHash` before anyone pressed Forward. Nothing was pushed.

## Not run

- Forward, public merge, and everything after the first row.
- The Settings page itself was not clicked. The same operations the page calls
  were run. The branch rule line was not applied.
- A plan, projection, a Radar crew, a second person's crew, the retro. These are
  the rest of rc-p11 and need the owner's go-ahead.

## Undo

Delete `mtdowling/avoozl-mirror` in GitHub. The public repository was not changed.
