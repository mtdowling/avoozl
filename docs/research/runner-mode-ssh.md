# Runner mode over SSH (2026-11-14)

A prototype lets one Avoozl (the driver) hand a task to another Avoozl (the
runner) over SSH. The runner's own tick opens a worker on its own crew. Status
and the worker's identity come back, and the driver's In flight list shows the
worker with a Remote badge and an Attach link. It is off unless `.avoozl.json`
has `runner.role`. Spec: Requirement 84, design §6.13, Phase 38, proof P48.

Verdicts: **tested** (ran it), **unit** (test with a stand-in), **read** (from
source or docs, not run).

## Setup

- Two isolated Kiro Crew homes (release build 0.12.2.4, Linux), each with its
  own gateway, port and Avoozl catalog: `KIROCREW_HOME=/tmp/kc-runner-driver`
  and `/tmp/kc-runner-crew`. Avoozl installed and enabled in both. The main
  crew was not touched.
- A throwaway repository with a local bare remote. One runner workspace, one
  driver workspace.
- Four tasks (L1 to L4) were handed from the driver. Worker chats ran on the
  runner's gateway with the default model.

## SSH

| Question                                  | Answer                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can this desktop's sandbox ssh to itself? | **No (tested).** Kiro Crew's rule `sandbox-escape-ssh-self` refused the command before it ran. It matches ssh, scp, sftp and rsync aimed at this machine, any loopback address, and this host's own names. I did not look for another spelling.                                        |
| What stood in for ssh?                    | A host with `via: "local"` runs the same argv (`node cli.mjs runner accept -`, `runner status --json`) as a child process with the runner's environment. The envelope goes on stdin, as it would to ssh. The ssh argv is built by `commandFor` and unit tested. **ssh was never run.** |
| Is Midway (`mwinit`) needed from the Mac? | **Cannot tell from here.** `~/.ssh/config` only includes the bastion config (no `mwinit` or Midway line), `~/.ssh` has `id_ecdsa` and no `-cert.pub`, and `/etc/ssh/sshd_config` has no `TrustedUserCAKeys` or `AuthorizedPrincipals` line I can read. I changed no auth.              |
| What does that mean for the driver?       | The driver runs ssh with `BatchMode=yes`, `ConnectTimeout=10` and keepalives, so it never prompts. If a sign-in is needed and has expired, every call fails and the driver takes the dropped-link path below.                                                                          |

## What was built

- `src/app/remote-runner.mjs`: envelope check, runner state (meta key
  `runner.tasks`), `accept`, `status`, `report`, `runnerTick`, and the driver
  side (`handoff`, `pullStatus`, `remoteView`, `driverTick`).
- Operations `remote.accept|status|report|handoff|pull|view`, CLI
  `avoozl runner accept|status|report|handoff|pull`.
- `tick.py`: sets a trust mode on the worker only when the dispatch names one.
- UI: `RemoteWorker`, a Remote badge, and Attach that opens a new tab.
- The envelope holds `version, taskId, repo, baseCommit, brief, checks, agent,
model`. A repo ID and a check ID mean what the runner's own settings say; the
  runner never runs text from the driver. The brief is text for the worker
  agent to read, so a driver you do not trust can still steer that agent.

`.avoozl.json` may not hold absolute paths (the layered config refuses them),
so `runner.repos` and the local stand-in for ssh live in the machine config
(`<KIROCREW_HOME>/avoozl/config.json`).

## Can the driver see, attach to and message a remote worker?

| Question                                                    | Answer                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the driver see each remote worker?                     | **Yes (tested).** The driver's own cron tick pulled status (`lastOkAt` moved about every minute with no manual pull). `remote.view` listed L1 with host, crew ID, chat key and link. The In flight row is **unit** tested (`summarize`) and typechecks; I did not see the page.                                                                                                    |
| Can Attach open the chat?                                   | **The link is right, the open was not clicked.** The link is `<dashboardUrl>/chat?sid=<chat key>`, for example `http://localhost:41667/chat?sid=avoozl_L1_remote_task`. The chat key is the slot Kiro Crew gave the session. The agent browser cannot open a dashboard, so no one clicked it.                                                                                      |
| Does Attach need the crew's sign-in?                        | **Yes (tested with curl).** Without a sign-in, `GET /chat?sid=...` answers 200 with the page shell and `GET /api/chat/slots/<key>` answers 403. The person signs in to that crew's dashboard first. Status carries no token, and the driver builds the link from its own `dashboardUrl`.                                                                                           |
| Can a chat on the driver machine read or message that chat? | **No (tested and read).** Sessions are files in each gateway's home. The runner's home had `dashboard_avoozl_L1..L4_remote_task.jsonl`; the driver's home had none. Kiro Crew's cron docs say `send_to_session` and `set_session_mode` refuse a slot another creator made (`not_creator`). Reaching another crew's chat needs Kiro Crew's own remote-crew path, which is off here. |

## Does the runner keep working unattended?

| Question                                    | Answer                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No one sending turns?                       | **Yes (tested) once approvals are handled.** L2 and L3 went from hand-off to a pushed branch with no message from anyone. The tick is a script cron, so it spends no model turn.                                                                                                                                                                 |
| Tool approvals                              | **Blocks by default (tested).** L1's worker asked to run a shell command, nobody answered, and Kiro Crew declined it after 180 seconds. L1 has stayed `working` since. Setting `runner.workerMode` to `trust` (the cron may set `trust` or `trust_reads`, read in Kiro Crew's docs) let L2 to L4 run. This is the owner's call, per runner.      |
| Gateway restart                             | **Tested.** I killed the runner's gateway about five seconds after L4's chat opened and started it again. The task states came back from the database, and no second chat was opened: four tasks, four chat files. L4's worker was cut off mid-first-turn and never got another turn, so L4 sits `working`. The prototype has no nudge for that. |
| Claimed twice?                              | **No (tested, unit).** The same envelope again is a no-op, a different one under the same ID is refused, and a task with a bound worker is never dispatched again. One window is left: a crash between `open_session` and the bind. The title `avoozl:<id> remote task` lets `rediscoverSessions` bind it again (unit).                          |
| Replace a worker because its lease expired? | **Never (unit, tested).** A worker chat that ends without a report raises one decision notice and keeps its task. L1's worker, blocked on approval, was not replaced.                                                                                                                                                                            |

## Cost and latency

All from the live run on one machine. The cron fires once a minute, so each
hop that waits on a tick takes 0 to 60 seconds.

| Step                                   | L2 measured   | Notes                                                                                         |
| -------------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| Hand-off to worker chat opened         | 62 s          | Waits for the runner's next tick. L3 opened in under 9 s, L4 in 38 s, L1 in 60 s.             |
| Worker start to its `done` report      | 16 s          | 04:00:27 to 04:00:43, one commit.                                                             |
| Report to checks run and branch pushed | 46 s          | The next tick runs them.                                                                      |
| Pushed to the driver showing it        | up to 60 s    | The driver pulls on its own tick. `lastOkAt` stayed within a minute.                          |
| Idle cost                              | 0 model turns | Ticks with no task opened no session. The runner home held exactly four chats for four tasks. |

## What breaks when SSH drops

| Moment                               | Result                                                                                                                       | Recovery                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| During a pull                        | **Unit.** The driver keeps the last answer, marks it stale (In flight says "link down, last answer"), and records the error. | The next tick that works replaces it.               |
| During a hand-off, before it arrived | **Unit.** The driver gets a 502 and the runner has nothing.                                                                  | Send it again.                                      |
| During a hand-off, reply lost        | **Unit** (same ID, same content is a no-op).                                                                                 | Send it again; the answer says `duplicate`.         |
| Mid-task                             | **Read, not dropped live.** The runner's tick and push never call the driver, so a dead link cannot stop them.               | The driver learns the result on its next good pull. |
| A hung ssh                           | **Read.** The child is killed after 30 seconds, and `ConnectTimeout` and keepalives bound it earlier.                        | Same as a failed pull.                              |

## Findings and gaps

1. An unattended worker needs a trust mode or it stalls on its first tool call.
   `workerMode` is off by default. **Decision for the owner:** whether a
   runner may use `trust`.
2. A worker's `status` in runner status stays null. The runner tick returns
   before it writes the tick receipt that the app backend reads session
   statuses from.
3. A worker cut off mid-turn (L4) is not nudged. The local flow has a quiet
   worker nudge; the runner does not.
4. `avoozl runner report` is not tied to the worker's session. Any process
   that can run the CLI as that user can report a task done. The runner reads
   the commit from the worktree itself, so a false report cannot name a
   commit, but it can end a task early.
5. Checks run inside the tick, so a long check delays everything else on that
   runner.
6. Nothing yet turns a planned task into an envelope. Hand-off is a CLI call
   (`avoozl runner handoff FILE --host NAME`).
7. `kirocrew stop` in a test home looked for the system service and tried to
   stop `kirocrew` through the service manager. It was refused, and the main
   gateway kept running. To stop a test gateway, read its PID with
   `kirocrew gateway-pid` in that home and kill that PID.
8. Reinstalling an app in a test home clears `agent.apps_trusted`, so set it
   again before `app enable`.

## Not checked

ssh itself, a browser click on Attach, and the In flight row on a real page.
The sign-in requirement for Attach was checked with curl only.
