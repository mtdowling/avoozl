# Assessment: an AWS orchestration store for Avoozl (2026-11-14)

A pivot was proposed: require AWS. DynamoDB holds orchestration state,
SQLite is a cache and journal, S3 holds transcripts, Lambda takes webhooks,
hooks feed a collector, and GitHub keeps only the human record. This note
checks it against the code on `main` (`888dc52`). Nothing was run or built.

Marks: **code** (read in the file cited), **doc** (read in a research note),
**assumed** (not checked here).

## Verdict

Reject it as the default. Do not make AWS required. Keep GitHub as the
shared record. If a live view across machines is wanted later, add AWS IoT
Core as an opt-in, read-only status channel. Never let it own claims or
state. Most of the proposal solves problems Avoozl no longer has.

## 1. What is true, wrong or moot

| Claim                                                                           | Verdict                                  | Why                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Avoozl needs ownership, leases and heartbeats for its workers                   | **Moot**                                 | Local workers are retired (`docs/overview.md` §1, §5). Radar crews do the coding. Avoozl runs no worker to lease.                                                                                                                                                                                                                                                                |
| Radar claims need a shared store                                                | **Wrong**                                | The claim is a hidden comment marker, `kirocrew-crew v=1`. The oldest marker in a live phase wins (`src/app/radar-claims.mjs:1-12`, `liveClaim`). It works across people and machines with no service. A claim ages out only in the phases that count toward Radar's TTL (`TTL_PHASES`, same file).                                                                              |
| One driver per spec, with a fencing epoch                                       | **Half true, already built**             | The driver is the plan issue's one assignee plus a machine claim in the issue marker (`src/app/driver.mjs:1-10`, `newClaim` at `:373`). Only a person's Take over, Hand off or Force take over moves it. Nothing moves it because it is old. An epoch would add automatic takeover, which Avoozl rules out (`AGENTS.md`: never replace a worker only because its lease expired). |
| Ambiguous in-flight work needs explicit recovery, never auto-duplication        | **True, same rule**                      | Matches `AGENTS.md` and the driver.                                                                                                                                                                                                                                                                                                                                              |
| The tick is the scheduler, GitHub is polled                                     | **Mostly moot**                          | The tick asks GitHub for changes with an ETag. A 304 costs no rate limit (`src/app/github.mjs:173`, `src/app/github-sync.mjs:361`). Quiet repos back off from 1 to 8 minutes. The tick also checks the remaining budget (`lowBudget`, `github-sync.mjs:372`).                                                                                                                    |
| Hooks should be the main event producers                                        | **Unknown for Radar, narrow for Avoozl** | Hooks fire in worker chats that Avoozl's own tick opens (doc: `kirocrew-hooks-and-wake-paths-2026-11-13.md`, section A, verified). Avoozl uses them only on its own `avoozl-driver` agent (`src/app/driver-session.mjs:1-6`). Radar crew chats are a different agent. See section 4.                                                                                             |
| Webhook to Lambda to DynamoDB gives instant intake                              | **True, but needs setup nobody has**     | It needs a public endpoint and a webhook on every repo. A coworker's repo needs admin rights to add one (assumed). Today the 60-second tick reads labels and assignees.                                                                                                                                                                                                          |
| Apps can call a remote app, so AWS is the bridge                                | **Wrong**                                | Kiro Crew refuses a call to another crew unless the turn was sent by the owner (`remote_dispatch_routes.py:292-304`, doc: `kirocrew-bot-heartbeats-2026-11-13.md`, lines 94-102). A database does not change that rule. The workable path is a person-owned bell per machine over a shared queue (doc: `machine-conductors-2026-11-13.md`). That queue is already GitHub.        |
| Retention by TTL, transcripts to S3                                             | **Moot for Avoozl**                      | Avoozl keeps no transcripts. Kiro Crew keeps chats. Token use is local and is listed as lost on a rebuild (`driver.mjs` `REBUILD_LOSSES`).                                                                                                                                                                                                                                       |
| Remove transient labels, progress comments, session IDs, retry data from GitHub | **Mostly already true**                  | See section 3.                                                                                                                                                                                                                                                                                                                                                                   |
| Cost telemetry, structured evidence                                             | **Assumed useful, not asked for**        | Evidence export exists in SQLite (`driver.mjs`, `exportEvidence`).                                                                                                                                                                                                                                                                                                               |

## 2. Real problems and real costs

| Real problem                                     | Does AWS fix it?                                                                                                                        | Cheaper fix                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| See a Radar crew's live state on another machine | Only if its chat hooks fire and push events. Today the view shows claim phase and update time from the marker (`radar-claims.mjs:3-6`). | Keep the marker view. Add a live channel only if wanted (section 5). |
| Live view of a chat on another machine           | Yes, with a transcript pipe.                                                                                                            | Kiro Crew's own remote view. Out of Avoozl's scope.                  |
| Label and comment noise                          | A little. See section 3.                                                                                                                | Cut the driver's 15-minute heartbeat writes.                         |
| GitHub rate limits                               | Not needed. ETag and pacing already cover it.                                                                                           | None.                                                                |
| Latency under 60 seconds                         | Yes, with webhooks.                                                                                                                     | Shorten the tick for an active spec.                                 |

| Cost                                                    | Size                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| An AWS account per person, and sign-in on every machine | Large. Each user and coworker needs one, or one shared account with access control.                                                        |
| Setup                                                   | Large. Table, Lambda, endpoint, webhook secret, IAM, per-repo webhook.                                                                     |
| Public endpoint                                         | A new attack surface. Needs signature checks, replay guards and an actor allow-check (assumed).                                            |
| Data leaving machines                                   | Hook payloads carry prompts and tool output. Redaction must be perfect. Avoozl's repo rules already forbid private names in public output. |
| Offline or sleeping laptop                              | A lease that expires while the lid is shut. Avoozl's rule is not to take over on age. Epoch fencing fights that rule.                      |
| Second source of truth                                  | Real. GitHub still owns PRs and issues, so every state needs a reconcile rule. The proposal admits it.                                     |
| Open-source users without AWS                           | Locked out, or a second code path to test on three operating systems.                                                                      |
| Cost to run                                             | Small in money. Large in upkeep.                                                                                                           |

## 3. How much GitHub noise goes away

Radar's claim comment and its `crew:` labels stay on GitHub. Radar crews read
GitHub, not AWS, and Avoozl does not control Radar. Avoozl reads them
(`src/app/github-crew.mjs:1-6`) and writes none, except one claim comment at
approval (`src/app/approval-label.mjs:14-22`).

| On GitHub                                                                                                   | Who writes it                                          | Goes away with AWS?                                                          |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Radar claim comment, `crew: in progress`, `crew: needs human`                                               | Radar                                                  | No                                                                           |
| Human labels: plan, approval, review                                                                        | A person                                               | No (the proposal keeps them)                                                 |
| Ready and managed labels                                                                                    | Avoozl                                                 | No. They are the command to the crew.                                        |
| Stale label                                                                                                 | Avoozl, only when policy names one (`github-crew.mjs`) | Could                                                                        |
| Approval write-back comment, once per approval                                                              | Avoozl                                                 | Keep. It is the record.                                                      |
| Driver claim in the plan issue body, `heartbeatAt` rewritten every 15 minutes (`driver.mjs:41`, `:510-512`) | Avoozl                                                 | Yes. This is the one steady write.                                           |
| `instance=` in markers                                                                                      | Avoozl                                                 | Already kept out of public mirrors (`src/app/instance.mjs`, `stripInstance`) |

Net: one body edit per active spec every 15 minutes, and an optional label.
Everything else is Radar's or a person's. Changing the heartbeat to write
only on change would remove most of it with no AWS (assumed to be safe: the
heartbeat feeds the "seen" time at `driver.mjs:826`, so a longer interval
would need a matching stale rule).

## 4. Do hooks fire in Radar crew chats?

Unknown. Another chat is testing it. How the answer moves the verdict:

| Answer                                | Effect                                                                                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yes, with session key and tool events | A live channel becomes possible with no change to Radar. Reconsider the opt-in IoT layer in phase 3. The verdict on a required AWS store stays reject.      |
| Yes, but only for agents Avoozl owns  | Same as no. Avoozl cannot add hooks to Radar's agent without changing Radar.                                                                                |
| No                                    | Hooks cover only the driver chat. The live channel can show Avoozl's own driver and releases, not crews. Reject both AWS plans until Radar emits something. |

In every case claims and leases stay on the GitHub marker. The only thing
the answer changes is whether a live view of crews is possible at all.

## 5. Options compared

| Option                                                                                             | Gives                                                                                            | Costs                                                                                       | Fits            |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------- |
| A. GitHub only: markers, local cache, `instance=`, repo variables for names                        | Works with no account. Already built. Cross-person claims.                                       | Up to 8 minutes of lag on quiet repos. No live view.                                        | Yes             |
| B. AWS IoT Core, opt-in, read-only live channel (retained status per spec, last-will for presence) | Live status and "machine online" across machines. No tables. Retained message needs no database. | An AWS account and device certificates. A public broker. Presence is only a hint.           | Yes, as a layer |
| C. SQS relay                                                                                       | Queued wake-ups between machines                                                                 | Queue per machine, polling, dead letters. It duplicates what a bell plus GitHub already do. | No              |
| D. Proposed DynamoDB store                                                                         | Authority, history, dashboards                                                                   | Everything in section 2.                                                                    | No              |

Recommendation: **A now. B later as an opt-in layer. Reject C and D.**
B publishes only: spec, task, phase, crew id, PR number, time. It never
publishes transcripts or prompts. A lost message loses nothing, because the
GitHub marker stays the truth. B can never gate a release.

## 6. Keeping GitHub the default

| Rule                            | How                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| No AWS needed to install or run | The AWS code is off unless a setting names a broker. Default is off.                    |
| One source of truth             | GitHub markers and issues. The channel is a mirror and can be dropped.                  |
| Tests                           | The existing suite runs with the channel off. One fake-broker test covers on.           |
| Public repos                    | Nothing from the channel reaches a public repo. Instance IDs stay out (`instance.mjs`). |
| Failure                         | A missing broker shows "live view off". It never blocks a tick.                         |

## Phased path

| Phase | Work                                                                                                    | Gate                                         |
| ----- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1     | Make the driver heartbeat write only when the claim changes or the stale rule needs it.                 | Existing tests plus one for no extra writes. |
| 2     | Finish the Radar proofs (`rc-p*`). The marker view is still fake-tested only (`docs/overview.md`, top). | Real-repo proof passes.                      |
| 3     | Read the hooks result. If Radar chats emit hooks, prototype an IoT status channel behind a setting.     | A written design, one account, two machines. |
| 4     | Ship only if two users ask for a live view and phase 3 held.                                            | A decision from the owner.                   |

## Not checked

Radar's own marker edit rate, whether a coworker can add a repo webhook, and
any AWS prices. The 15-minute heartbeat write is read from code, not seen on
a live repo.
