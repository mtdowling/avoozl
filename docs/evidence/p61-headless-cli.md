# P61 live: a headless machine runs tasks with the CLI only

Proof P61 (Requirements 95 and 98.5, design §4.28), run once with
`scripts/proof-p61-live.mjs --root /tmp/p61-run1` on 2026-11-18 from 02:32
to 02:34 UTC, at Avoozl commit `7953479c`. The owner ran it from his own
terminal: the job loads into his launchd user domain, and Kiro Crew's own
sandbox refuses the nested `sandbox-exec` that confines Claude Code (as in
P57).

**Verdict: pass, every Expected item. P61 is ticked.**

## What "headless" meant here

The run used this Mac, not a second machine. The spec asks for "a machine
without Kiro Crew's page". Avoozl's Node code never calls Kiro Crew; only the
Kiro Crew app's cron (`kirocrew-app/crons/tick.py`) and app backend do. The
run had neither: its workspace sat in an isolated Avoozl config and state
home (`XDG_CONFIG_HOME`, `XDG_STATE_HOME` under the run root) that no Kiro
Crew catalog lists, the Avoozl host port was off, and the project used the
`process` executor only. The tick ran inside the supervisor that launchd
started. Every session binding in the run has executor `process`.

## Setup

- A bare `origin.git` and its checkout `app`, with one check,
  `node check.mjs`. The project had `executor: "process"`,
  `harness: "claude-code"`, `landing: "direct"`, and the P57 sandbox: write
  roots plus a Claude Code config folder, `allowCommands` `node check.mjs`,
  network `localhost:18461` only.
- Two chained leaves, p61-one → p61-two, each asking for one file in
  `notes/`. The plan was installed approved, as a rebuild installs one.
- Claude Code from `examples/harnesses/claude-code.json`, approved by hash,
  with the Bedrock sign-in variables added to `keepEnv`, as in P57. Model
  `global.anthropic.claude-sonnet-5`. The two runs reported $0.13 in total.
- The unit: `avoozl supervisor unit launchd --tick-seconds 10 --write`, with
  `HOME` pointed at a scratch folder so the plist was written under the run
  root, never `~/Library/LaunchAgents`. It was loaded with
  `launchctl bootstrap gui/<uid> <plist>`.

## Expected, item by item

| #   | Expected                                      | Seen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Pass |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | Both tasks finish                             | Both `integrated` on attempt 1. Each child exited 0 with a `done` result file. The remote's log: `Avoozl task p61-one, attempt 1`, `Land p61-one`, `Avoozl task p61-two, attempt 1`, `Land p61-two`. Nobody touched the Kiro Crew page or the run between the start and the status read.                                                                                                                                                                                                                                                                                                               | yes  |
| 2   | The supervisor comes back and finds its state | Restart 1: the supervisor (pid 58988, parent 1, launchd's) was killed with SIGKILL while p61-one's child ran. launchd's KeepAlive started a new one (pid 61625, parent 1) 31 s later, as `ThrottleInterval` allows. It found the child by pid and start time, and recorded its exit 0 once. Restart 2: while p61-two's child ran, the job was booted out (no supervisor, child still alive 5 s later) and bootstrapped again, as a reboot or login does. The new supervisor (pid 65668) found the child and recorded its exit once. Each child ran once, with one worker binding per task and attempt. | yes  |
| 3   | `runner status --json` reports both           | Exit 0. Supervisor `running: true, pid 65668`. Children: `p61-one worker exited 0`, `p61-two worker exited 0`, each with session id and harness `claude-code`. `avoozl status` (exit 0) lists the one scratch workspace and the same two children under `machine`.                                                                                                                                                                                                                                                                                                                                     | yes  |

## Also seen

- The model proxy let through only `bedrock-runtime.us-west-2.amazonaws.com`.
  It denied the Bedrock control-plane host and the CLI's telemetry host.
- After the run the job was booted out (`launchctl print` finds no
  `dev.avoozl.supervisor`), no child or supervisor was left running, and the
  credentials in the run's plist read `REDACTED`.

## Bug found, fixed first

| Pull request | Found by           | Bug                                                                                                                                                                                                         | Fix                                                             |
| ------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| #497         | the plumbing check | Opening a workspace `Store` beside another process's write lock failed at once with `database is locked`: the first statement (the activity-log check on `sqlite_master`) ran before `PRAGMA busy_timeout`. | The timeout is set right after the database opens, with a test. |

The plumbing check is the script's `--agent fake` mode: a scripted agent
and a supervisor started directly, never through launchd. It never counts as
the proof.

## Notes

- The unit Avoozl writes holds only `PATH`. A harness's sign-in (an API key,
  or Bedrock credentials and `CLAUDE_CODE_USE_BEDROCK`) and its config
  folder must reach the supervisor's environment some other way, so a person
  adds them to the unit by hand once per machine. The script added them to
  its own copy (mode 0600) and redacted them at the end. Short-lived
  credentials like these Bedrock ones also expire, which a long-lived unit
  cannot refresh. A follow-up could have the supervisor read a private
  environment file in the machine config, so secrets stay out of the unit.
- Only launchd was exercised. The systemd unit was not run.
- Children survived a bootout because they run in their own process groups;
  launchd stopped only the supervisor and its tick.

## Next decision

Build Phase 43's pull-based worker mode on this, and decide how a headless
machine's supervisor gets its harness sign-in.
