# P50 live: a three-task chain survives a gateway restart unattended

Proof P50 (R86, R87.10, R88; design §4.26), run on 2026-11-17 on a Mac.
It used a throwaway Kiro Crew 0.12.2.4 with its own home on port 5698, a
scratch Avoozl workspace, and a scratch code repository whose only remote
is a local bare repository. The owner's real Kiro Crew and workspaces were
not read or written. Nothing was pushed to GitHub except the fixes below.

**Verdict: pass, on run 3 (spec `relay`), 21:39–23:25 UTC.** Runs 1 and 2
found the bugs listed below and prove nothing on their own.

## Setup

- Workspace `p50c` with project `app`: `landing: "direct"`, check
  `npm test`, remote a bare repository under the scratch folder.
- Spec `relay`, three tasks in a chain: `relay.1` add `greet`, `relay.2`
  add `shout` after 1, `relay.3` document usage after 2. It was approved,
  published to its local journal, and taken over from the CLI as the
  test-workspace person.
- `.avoozl.json`: `delivery.concurrency 3`, `retries 1`,
  `delivery.investigate.minConfidence: "medium"` (see Gaps).
- Avoozl `main` at `ed0e6a50` (all fixes below) installed in the test crew,
  updated in place through the test crew's app API.

## Results

| Expected | Seen |
|---|---|
| Each task lands in order | Bare `main`: `5ae5a8f Land relay.1` (21:48:39Z), `0acc00d Land relay.2` (22:13:31Z), `923eec0 Land relay.3` (23:25:26Z), each a merge of the task commit onto the previous landing |
| … with its checks recorded | Each landing-queue entry has `npm test` exit 0 on the candidate. The spec journal holds an intent with `checks: [{name: "npm test", conclusion: "success"}]` before each push, and a landed outcome after it (7 records: generation, then 3 intent and outcome pairs) |
| Restart while task 2 works | The test crew was stopped at 21:49:45Z while `relay.2`'s worker read `working`. It was started again later, by the owner (see Gaps) |
| Trust set again; task 2 goes on in the same worktree; no second chat | `relay.2` kept exactly one worker binding, attempt 1, slot `avoozl_relay.2_Add_shout__after_1`. Its delivery has one attempt, `done`, with no vanish. After the restart the slot reads `trust: true`. The chat reported findings and then `done` with commit `3b4f98e` in `avoozl/relay.2` |
| The tick push goes through Kiro Crew's push policy | All three pushes were made by the tick (`directSteps`, guarded fast-forward, never forced). None was refused, and no chat ran `git push` |
| Worktrees removed after landing | After `relay.3` landed, `scratch3` has only `main`: no task worktree, no `avoozl/relay.*` branch |
| No person in the loop | No Avoozl decision, approval or retry was made by a person in run 3. The second `relay.3` attempt was opened by the tick after the first reported blocked (a bug, fixed in #471) |

## Bugs found and fixed

Each was fixed in its own pull request and merged after Linux, macOS and
Windows passed.

| PR | Merge | Found |
|---|---|---|
| #412 | `4596a076` | The tick never pushed a `direct` base; task 41.9 wires `directSteps` |
| #422 | `3e6753f7` | Local workers opened with the folder's project and waited on a person to set it |
| #429 | `ae188af8` | Same for falsifier, verifier and review chats |
| #431 | `7d30c8a3` | A quiet falsifier was never nudged; the task sat in `falsifying` |
| #436 | `e5a963a4` | Read roles' `plans_report` waited on a tool approval and was declined unattended |
| #443 | `94dda408` | Run 1: right after the restart a live chat read `gone` and the tick opened a second chat. Gone now counts after a 5-minute grace |
| #471 | `933954e3` | The brief's `avoozl runner report` ran from the task worktree and could not find the workspace |
| #474 | `ed0e6a50` | A later attempt's falsifier reused attempt 1's chat title, so Kiro Crew never opened it |

Run 2 reused run 1's task IDs. Kiro Crew keys a chat by its title, so
run 2's first brief went to run 1's old chat, and Avoozl refused its report
("bound in more than one Avoozl workspace"). Run 3 used a new spec name.

## Gaps (not part of the P50 bar)

- **Starting the gateway.** The stop was scripted. The start had to be run
  by the owner: at start-up the gateway reads the Kiro sign-in folder
  `~/.kiro/crew-auth-staging`, and the proof chat's sandbox refuses it. On
  the owner's own machine the gateway starts itself; Avoozl did nothing
  until the restart was done.
- **Falsifier confidence.** An unattended falsifier cannot run the checks
  (its shell still asks), so it reports `medium` at best. With the default
  `minConfidence: high` every task goes to Needs you. This run set
  `medium`. Separate task needed.
- **First report secret.** The first worker in a fresh workspace gets the
  MCP report step, because the CLI report secret is made at the first
  binding.
- Test-crew setup only: built-in tools added to the harness agent,
  `avoozl` added to `agent.apps_trusted` as on the real Mac.
