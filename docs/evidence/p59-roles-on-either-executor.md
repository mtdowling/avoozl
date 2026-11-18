# P59 live: each role runs on either executor

Proof P59 (Requirement 97, design §4.28), run with
`scripts/proof-p59-live.mjs` on 2026-11-18 (UTC). The same scenario ran
once with every role on `kirocrew` and once with every role on `process`
(Claude Code). Each run had its own scratch repository with a bare remote
and its own Avoozl workspace. No real workspace, Avoozl home, Claude Code
home or Kiro Crew home was read or written, and nothing was pushed outside
the scratch remotes except the fixes below.

**Verdict: pass. P59 is ticked.** Every role Phase 49 names gave the same
result kind on both executors, and no read-only role wrote a file.

## Setup

- One leaf, `<tag>-one`: create `notes/one.txt` holding `alpha`, check
  `node check.mjs`. `verify: "agent"`, so a verifier session judges it.
- One review role, `docs`, whose focus also asks it to try two writes once:
  `P59-RO-PROBE` in its own worktree and `ro-outside.txt` in the run folder.
- A New plan request (`<tag>-notes-two`) for the planner, and a retro
  started by hand after the task landed.
- Settings › Models pins: `harnesses.worker`, `planner` and `retro` all name
  the run's harness (`kirocrew` or `claude-code`). The `process` project
  also sets `executor: "process"`, so its verifier and review role run as
  children; on the `kirocrew` run they are chats.
- `landing: "direct"`; investigate-first off (see Not covered).

| Run                      | Where                                                                                                                                                 | Avoozl                              | Run root            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------- |
| `kirocrew` (tag `p59k2`) | the throwaway P50 test crew, Kiro Crew 0.12.2.4, port 5698, its own home                                                                              | `51fd489a`, app build of `89c1b386` | `p59-run/kirocrew2` |
| `process` (tag `p59p4`)  | the owner's terminal: real tick, app backend drain and machine supervisor; Claude Code 2.1.326 under `sandbox-exec`, Bedrock through a loopback proxy | `0ae6b7d8`                          | `p59-run/process4`  |

On the `kirocrew` run, a script answered the test crew's approval cards
through the owner's saved test-crew sign-in, as the person at the dashboard
would: it approved every tool call of this run's chats except the two probe
writes, which it refused. Without it an unattended read-only chat cannot run
a shell command (each call times out after 180 s and is declined).

## Results

| Role                      | `kirocrew`                                              | `process` (Claude Code)                                                         | Same kind |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- | --------- |
| Worker                    | `done` with a commit; landed (`d660cc3 Land p59k2-one`) | `done`; Avoozl committed the child's edit (`9c897b2`) and landed it (`57db098`) | yes       |
| Verifier (read)           | `done`, `approved`, accepted                            | `done`, `approved`, accepted                                                    | yes       |
| Review role `docs` (read) | `done`, `approved`, accepted, one observation           | `done`, `approved`, accepted, one observation                                   | yes       |
| Planner                   | spec folder written; imported as a `draft` plan         | spec folder written; imported as a `draft` plan                                 | yes       |
| Retro (read)              | `done`, bottleneck `review`                             | `done`, bottleneck `review` (reply read from its result file)                   | yes       |
| Watch                     | no session: the line watch runs in the tick             | same                                                                            | yes       |

## A read-only role cannot write

| Run                    | What was tried                                                                                   | Seen                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `kirocrew`             | the reviewer's one shell call writing both probe files                                           | refused at its approval card; neither file exists                             |
| `process` runs 2 and 3 | the Claude Code reviewer's `Write` of both probe files                                           | refused by Claude Code (`dontAsk`, `permission_denials`); neither file exists |
| `process` run 4        | none: the reviewer declined the probe, since its brief says to write no file but the result file | no probe file in the run root, the checkout or any worktree                   |

In every run the evaluator found no `P59-RO-PROBE` in the checkout or any
worktree and no `ro-outside.txt`. On `process`, Avoozl's sandbox also limits
a read class to its temp folder, `.avoozl/` and the project's cache folders
(#502); the refusals above came from Claude Code before the sandbox was
reached.

## Bugs found and fixed

Each merged after Linux, macOS and Windows passed.

| PR   | Merge      | Found by                    | What                                                                                                                                                                                                                                                               |
| ---- | ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #499 | `d4fe0095` | the fake-agent plumbing run | A `process` planner whose spec folder is in no checkout (a local workspace's own specs) ran with no project: network off, no write roots. It now takes the plan's first repository's sandbox.                                                                      |
| #502 | `e1e6d3ca` | `process` run 1             | Every read-only Claude Code child (verifier, reviewer, retro) exited 1 at start: it could not write its config folder, because the read class dropped the project's `sandbox.writeRoots`. The read class now gets them, refused when one overlaps the task folder. |
| #511 | `14479347` | `process` run 3             | A verdict child was never told the allow-list. Claude Code chained `od` and `cat` onto `node check.mjs`, the whole call was refused, and the verifier reported blocked twice. The brief now names the allowed commands, one per call.                              |

Scenario fixes in the proof script only: run 2's check was declared by an
absolute node path that the allow-list (`node check.mjs`) did not match, and
a retro started before anything finished had no window, so Avoozl rejected
its empty reply on both executors. Run 4 declares the check as `node
check.mjs`, lists read-only git commands, and starts the retro after the
task lands.

## Also seen

- The `kirocrew` run's verifier and review chats were held for a while: the
  tick waits until every bound session is observed, and the app backend
  observes the workspace it served at start. Reloading the app fixed it, as
  `docs/live-proof-harness.md` says.
- Claude Code reached only `bedrock-runtime.us-west-2.amazonaws.com`. The
  proxy refused `bedrock.us-west-2.amazonaws.com` (5 tries) and the toolbox
  telemetry host (234 tries); neither stopped a run.
- The planner child writes no result file, by design (its folder is
  imported once it lints clean), so the supervisor records "The child wrote
  no result file." for it.

## Not covered

- The falsifier (investigate-first) still opens only Kiro Crew chats
  (`src/app/investigate.mjs`), so both runs turned investigate-first off.
  The GitHub breakdown planner, plan review and pull request review chats
  also stay on `kirocrew`, as task 49.1 records. These are outside Phase
  49's exit (verifier, reviewer, planner, retro and watch).
- Only macOS `sandbox-exec` and Claude Code were exercised.

## Next decision

Whether to move the falsifier's dispatch to the executor seam so it can run
on `process`, as the verifier's did in 49.1.
