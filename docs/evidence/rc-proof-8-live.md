# Radar-coder Proof 8, live: observe, and a retro rule a crew follows

> Screenshots for this receipt were checked and are not kept in git.

Receipt for task `rc-p8`.

The first live attempt (2026-11-15, crew `p6-crew` on
`mtdowling/avoozl-scratch-6`) ran one issue and read Trace; the retro rule and
the fourth issue were not run.

- Recorded: 2026-11-15 07:20 to 08:22 UTC, Linux, Kiro Crew 0.12.2.4 harness
  (own home `/tmp/avoozl-live-p7-10`, port 5697), Avoozl from `main` at
  `67c1267` plus the fixes below.
- GitHub: private scratch repository `mtdowling/avoozl-scratch-7` (a tiny
  Node package, no CI).
- Crew: `avoozl-avoozl-scratch-7` (`c_fcd78836`), agent `avoozl-crew`, label
  scope `ready`, one open claim at a time, enabled and unattended.
- Verdict: **FAIL.** Trace showed GitHub times, and the rule landed through a
  pull request, but the fourth issue's pull request did not follow it. The
  next decision from the proof (put the rule in the Additional prompt) was then
  tried, and that pull request followed it.

## Steps and observation

| Step | Result |
| --- | --- |
| Spec `helpers` (four leaves) approved through approval PR #11, projected | issues #12 to #17; `ready` on #14 and #15 first |
| Issue 1 | #15 claimed 07:31, PR #18 07:31, merged 07:33 |
| Issue 2 | #14 claimed 07:46, PR #20 07:46, merged 07:47 |
| Issue 3 | #17 claimed 07:57, PR #21 07:57, merged 08:00 |
| Trace (`radar.trace`, and the page) | for each issue: Spec approved, Issue created, Ready, Claimed, PR opened, Merged, all with GitHub's times; CI "Skipped, No checks yet"; Retro "In progress" (`rc-proof-8-live-trace.png`) |
| Retro rule, target `AGENTS.md` (`radar.retro.apply`) | PR #22 "Add a crew rule to AGENTS.md", merged 08:00:47. The rule: end every PR body with `Retro rule: followed`, and export each new helper from `src/index.js` |
| Issue 4 | #16 claimed 08:08 (after the merge), PR #23. Neither rule followed: no closing line, and the body says "`chunk` is not re-exported from `src/index.js`, because the issue did not ask for that" |
| Next decision: rule in the Additional prompt (`radar.retro.apply` target `prompt`, then the text added to the crew's Additional prompt as the owner would) | |
| Issue 5 | spec `more`, #28 claimed, PR #29: exports `sum` from `src/index.js` "because the crew operator asked", and ends with `Retro rule: followed` |

## Why it failed

The crew's chat is long-lived. Its transcript shows it read `AGENTS.md` once,
in its first cycle, and never again. So "crews re-read `AGENTS.md` for each
issue" (RC8.6, fact 3) does not hold for this crew. The Additional prompt is
sent with every crew turn, so a rule there is followed.

## Also found, and fixed in their own PRs

- PR #239: a closed leaf of a spec this workspace does not drive made the
  completion step write its marker; the driver guard refused it, and the
  whole GitHub step failed for every spec (`github.status` error, nothing
  projected or released). The completion and parent-close loops now skip
  read-only specs.
- PR #245: Flow found finished issues by the `ready` label only, but the tick
  takes `ready` off each closed issue it projected, so Flow found none of the
  three. It now also lists closed issues with the managed label. With it,
  #14, #15 and #17 are found; all three are then skipped, because the scratch
  repository has no CI and so no "green" time (`rc-proof-8-live-flow.png` is
  from before the fix).

## Also found, not fixed here

- The retro chat cannot see Radar-built work. Retro 3 ran (chat
  `avoozl:retro-3 retro`) after the three issues merged; its data had
  `"tasks": 0` and no stage times, because the retro brief reads Avoozl's own
  worker timings (`flowView` in `flow-retro.mjs`), not the GitHub flow
  (`radar-flow.mjs`). It answered with no bottleneck and no proposal, and was
  recorded as failed.
- Retro rule targets have no page UI. PR #139 (`rc-8.5`) merged the backend
  only (`radar.retro`, `radar.retro.apply`); no component calls them. The rule
  in this run was applied with the same operation from the CLI.
- A retro started while no cron tick runs (only CLI ticks) is marked running
  with no chat, and times out after 10 minutes (retro 1 and 2 here).
- `plan.delete` with `retire` archives the plan's tasks, but the release
  queue still lists them and their stale `ready` state uses slots in the
  queue's count ("4 of 2 in use").

## Harness notes

- The CLI must run with `KIROCREW_HOME=<home>`. The app keeps its machine
  config in `<home>/avoozl/`; a CLI run without it registers the workspace
  and its machine id elsewhere, and the app then shows "No workspace yet" and
  treats every spec as driven by another machine.
- Start the harness without `XDG_CONFIG_HOME` set: the app backend inherits
  it, and then `gh auth token` finds no sign-in, so Trace on the page said
  "GitHub is not available."
- Each gateway restart re-arms the crew's grant late, so its next turn waited
  on a tool approval and the loop paused; `POST /api/autonudge/<id>/fire`
  resumed it.
- The harness home's `kiro/agents/kirocrew.json` had no `name` field, and the
  dashboard refused to load until one was added.
