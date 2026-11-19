# Proof P7: configurable GitHub label intake on a public repository

Recorded 2026-11-18. Requirements R10, R11, R27.1; design §4.4. Item
`avoozl-p7` in `.kiro/specs/avoozl/tasks.md`. Code at `origin/main`
`68c76215`. Script: `scripts/proof-p7-live.mjs`.

**Result: pass.** Every Expected line was read back from GitHub (one GraphQL
read of the eight issues per check) and from the scratch workspace's
database. No test or fake counts.

## Setup

- Repository `avoozl-scratch/p07-label-intake`, public, issues on, created
  for this proof. Labels: triggers `p7:build`, `p7:go`, `p7:ask`; pause
  `p7:paused`; managed `p7:managed`, `p7:ready`, `p7:responding`.
- Allowed actor `mtdowling` (admin). Second account `avoozlbot`: invited as a
  repository collaborator with **triage** and accepted through its own
  `GH_CONFIG_DIR`. GitHub reports its `role_name` as `triage`. It is not in
  `allowedActors`.
- Scratch workspace `/tmp/avoozl-p7/ws` (`avoozl init`), project `code` on a
  clone of the repository, `avoozl github configure` with
  `--allowed-actors mtdowling`. Machine config lived in a test Kiro Crew home
  under `/tmp`; the real workspace and `~/.kiro/crew` were never used.
- Policy (`.avoozl.json`, `version: 1`):

  ```json
  {
    "baseBranch": "main",
    "allowedActors": ["mtdowling"],
    "minimumPermission": "write",
    "managedLabels": { "managed": "p7:managed", "ready": "p7:ready", "responding": "p7:responding" },
    "rules": [
      { "id": "build", "action": "deliver",
        "match": "label:p7:build label:p7:go -label:p7:paused assignee:mtdowling" },
      { "id": "answer", "action": "respond", "match": "label:p7:ask -label:p7:paused" }
    ]
  }
  ```

  It parses to `labelsAll [p7:build, p7:go]`, `labelsNone [p7:paused]`,
  `assignee mtdowling` and `labelsAll [p7:ask]`, `labelsNone [p7:paused]`.

- Every GitHub request Avoozl made went through a guard that allowed only
  this repository and logged each write.

## Action and observation

Issues were created by `mtdowling` (assignee set at create, before any
label), then labeled in one call each by the account shown. The tick ran as
the script cron runs it (`workspace.tick` with `cron: true`), so
`intakeStep` (`syncGitHubIssues`) and the respond step ran. The script waited
until GitHub search showed all 8 issues before the first tick.

| Issue | Labels | Assignee | Labeled by | Tick 1 (GitHub and workspace) |
|---|---|---|---|---|
| #1 | build, go | mtdowling | mtdowling | `authorized`, rule `build` (deliver); task created |
| #2 | build | mtdowling | mtdowling | no row, no write |
| #3 | build, go, paused | mtdowling | mtdowling | no row, no write |
| #4 | build, go | none | mtdowling | no row, no write |
| #5 | build, go | mtdowling | avoozlbot | ignored: "avoozlbot is not an allowed actor."; no row, no write |
| #6 | ask | none | mtdowling | `authorized`, rule `answer` (respond); `p7:responding` added |
| #7 | ask | none | avoozlbot | ignored: "avoozlbot is not an allowed actor."; no row, no write |
| #8 | ask, paused | none | mtdowling | no row, no write |

Then `mtdowling` edited #1's body and the tick ran again: #1 became
`quarantined` with "The issue body changed after its trigger snapshot.
Remove and reapply the trigger label, or confirm this exact body." Its task
has `dispatch.ready: false`, state `quarantined`. Nothing else changed.

Avoozl's whole write log for part A is one request:
`POST /repos/avoozl-scratch/p07-label-intake/issues/6/labels {"labels":["p7:responding"]}`.
On GitHub, #2, #3, #4, #5, #7 and #8 have no comments and no label events
other than the person's own.

### The respond rule's session

A test Kiro Crew that was already running and signed in (the P60 harness, a
separate `KIROCREW_HOME`) served the responder. The P7 workspace was added to
that crew's Avoozl catalog; no other workspace or session there was touched.
That crew's `avoozl-tick` cron ticks only its default workspace, so
`proof-p7-live.mjs dispatch` stood in for the cron on this one workspace. It
did what `kirocrew-app/crons/tick.py` does, on the same routes: one tick, take
the responder request (`executor.kirocrew.take`), open the chat
(`POST /api/chat/slots`, agent `avoozl-responder`) in a folder whose project
is the clone, bind it (`session.bind`), and send the brief
(`POST /api/chat?ws=1`). The folder was named `Avoozl P7/p07-label-intake`
instead of the tick's `Avoozl/code`, so it could not collide with another
proof's `code` project on the shared crew.

| Step | Result |
|---|---|
| Chat | `avoozl_respond-de131f9c51e11eeb6a8b_respond_avoozl-scratch_p07-label-intake_6`, agent `avoozl-responder`. It listed the folder, read `README.md`, and called `plans_post_reply` once |
| Approval | The chat stopped at Kiro Crew's tool approval for `plans_post_reply`. A headless browser (Playwright, signed in with the crew's saved state) clicked **Allow once** |
| Reply | One comment by `mtdowling`, [issuecomment-6969853789](https://github.com/avoozl-scratch/p07-label-intake/issues/6#issuecomment-6969853789), asking what the issue wants. No path, token or other repository's text |
| Label | `p7:responding` added at 04:56:03Z by the tick, removed at 05:19:13Z by `plans_post_reply` |
| Response row | `state: replied`, `commentId 6969853789` |
| Next tick | No new responder, no write; #6 stays matched with its one reply |

## Expected

| Expected | Verdict |
|---|---|
| Only the combinations the rules describe match | Pass. #1 matched `build`, #6 matched `answer`; #2 (one label), #3 (pause), #4 (no assignee) and #8 (pause) matched nothing |
| The disallowed account's labels cause no match and no write | Pass. #5 and #7 were read as matches whose actor is not allowed and recorded only in the sync result's `ignored` list: no issue row, no task, no request to either issue |
| The edited issue is quarantined | Pass. #1 is `quarantined`, its task not ready |
| Trigger and managed labels never overlap | Pass. Validation refused a policy with `ready: p7:go` ("rule build uses managed label p7:go as a trigger") and one with `responding: p7:ask`. Avoozl's only label writes were `p7:responding` (added, then removed); it never added or removed a trigger label |

Failure means the rules engine or actor check is wrong: neither is.

## Found on the way

Neither of these affects an Expected line. Both are left for a follow-up.

- **A responder chat waits on tool approval.** `tick.py` sets trust mode only
  for worker chats (`_mode`), and `avoozl-responder` has no allowed tools,
  so its one `plans_post_reply` call waits for a person in the chat. An
  unattended respond rule stalls there until someone clicks Allow.
- **A queued planner start outlives quarantine.** Tick 1 queued a planner
  start for #1. No cron took it here, and after #1 was quarantined the
  next tick still offered it in `dispatch`, from the pending session
  request. `plannerStep` itself skips non-authorized issues; the leftover
  request comes from `pendingSessionRequests`. On a live crew the cron
  normally takes the start in the same tick, so this shows only when the
  start is not taken before the edit. The brief holds the frozen body, not
  the edit.

## Next decision

Whether a GitHub search query form is needed beyond structured rules: no.
The `match` line is already GitHub search syntax, and these eight cases needed
nothing it cannot say. Who may trigger stays in `allowedActors` and
`minimumPermission`, which search cannot express.

## Commands

```
node scripts/proof-p7-live.mjs --root /tmp/avoozl-p7 preflight   # KIROCREW_HOME=<test home>
node scripts/proof-p7-live.mjs --root /tmp/avoozl-p7 setup
node scripts/proof-p7-live.mjs --root /tmp/avoozl-p7 run
node scripts/proof-p7-live.mjs --root /tmp/avoozl-p7 --harness <test crew dir> dispatch   # AVOOZL_HARNESS_PORT=<n>
node scripts/proof-p7-live.mjs --root /tmp/avoozl-p7 respond
```

No fix PRs were needed.
