# P57 live: a Claude Code chain under the supervisor survives faults

Proof P57 (Requirements 93–96, design §4.28), run with
`scripts/proof-p57-live.mjs` on a scratch repository with a bare remote. Each
run used its own isolated Avoozl workspace and its own Avoozl config and
state home (`XDG_CONFIG_HOME`, `XDG_STATE_HOME`). No real workspace, Avoozl
home or Kiro Crew home was opened. The owner ran each run from his own
terminal, because Kiro Crew's own sandbox refuses a nested `sandbox-exec`
(`sandbox_apply: Operation not permitted`), and P57 needs it to confine
Claude Code.

| Run | When (UTC)       | Avoozl commit | Result                                                             |
| --- | ---------------- | ------------- | ------------------------------------------------------------------ |
| 1   | 2026-11-17 16:58 | `eba86466`    | fail: no shell command could run (#427)                            |
| 2   | 2026-11-17 18:17 | `eba86466`    | fail: the agent declined the step-5 command                        |
| 3   | 2026-11-17 19:06 | `a4655300`    | fail: step 5 refused for the wrong reason (#434), task two blocked |
| 4   | 2026-11-17 19:39 | `51ebe6ed`    | **pass, every Expected item**                                      |

**Verdict: pass. P57 is ticked.** Run 4 is the proof. Runs 1–3 are kept
because they found the bugs fixed below.

## Bugs found, fixed first

Each was merged after Linux, macOS and Windows passed. Run 4 ran on code
with all three.

| Pull request | Found by  | Bug                                                                                                                                                                                                                                                                                              | Fix                                                                                                                                                                                     |
| ------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #423         | a dry run | A process worker sent back after a landing failure was never watched again: its binding stayed `closed`, so the backend never read the resumed run's exit or result file, and the message told it to commit and report, which a child cannot do.                                                 | `reopenAttempt` sets a process binding back to `working`; `roundFinish` tells a process child to write `.avoozl/result.json` and exit.                                                  |
| #427         | run 1     | Every Bash call failed with `EPERM` on `/tmp/claude-<uid>`: Claude Code keeps its shell scratch folder there unless `CLAUDE_CODE_TMPDIR` is set, and the sandbox allows no writes to `/tmp`. Also, `Bash(<command>)` is an exact match, so a longer command waited for an approval nobody gives. | A definition may list `tmpEnv`, set by the supervisor to the session's temp folder; the Claude Code definition lists `CLAUDE_CODE_TMPDIR` and uses the prefix form `Bash(<command>:*)`. |
| #434         | run 3     | Inside the sandbox the CLI read Avoozl's machine config before its person-only check, and stopped on `EPERM` there, so the R95.5 refusal never showed.                                                                                                                                           | In a child (`AVOOZL_CHILD`), an unreadable config layer reads as absent, so the CLI reaches its own refusal. Outside a child it still fails loudly.                                     |

Two changes were to the proof script only. Run 2's agent declined to run a
person-only command with `--as-person` as a task step, reading it as posing
as a person, so step 5 moved into the probe script and the task never blocks
on it (`a4655300`). In run 3, the check's fault counter wrote outside the
child's write roots when the child ran the check itself. Now only Avoozl's
own check runs count (`b2fadc13`).

## Setup

- A bare `origin.git` and its checkout `app`, with one check,
  `node check.mjs` (each `notes/*.txt` holds one lowercase word and a
  newline). The project has `executor: "process"`, `harness: "claude-code"`,
  `landing: "direct"`, and `sandbox`: write roots plus a Claude Code config
  folder, `allowCommands` `node check.mjs` and `node probe.mjs`, and
  `network: ["localhost:18457"]`.
- A chain of three leaves, p57-one → p57-two → p57-three, each asking for
  one file in `notes/`. The plan was installed approved, as a rebuild
  installs one. Investigate-first was off for this chain.
- The Claude Code definition from `examples/harnesses/claude-code.json`,
  approved by hash in the isolated machine config. On this Mac Claude Code
  signs in to Amazon Bedrock, so the run's copy adds `AWS_REGION`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN` to
  `keepEnv`. Short-lived credentials went only into the supervisor's
  environment, and from there through the sandbox's filter.
- A loopback CONNECT proxy (`scripts/live-proofs/p57-model-proxy.mjs`) that
  tunnels only to Bedrock runtime hosts. It was the child's one network
  path.
- Model `global.anthropic.claude-sonnet-5`, permission mode `acceptEdits`.
  The four finished Claude Code runs in run 4 reported $0.41 in total.

## Run 4: Expected, item by item

| #   | Expected                                                                            | Seen in run 4                                                                                                                                                                                                                                                                                                                                                                                                       | Pass |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | All 3 tasks finish with an exit code and a result file, and Avoozl commits each one | All 3 `integrated`. Each landing run exited 0 with a `done` result file. The remote's log holds `Avoozl task p57-one, attempt 1`, `p57-two, attempt 1` (twice: first run and the resumed round), `p57-three, attempt 2`, each followed by its `Land` commit. Remote head `28ddee38`.                                                                                                                                | yes  |
| 2   | The resume argv delivers the feedback and the task passes                           | The check failed once on p57-two's landing candidate (injected fault). One message was delivered, and the same session ran twice: Claude Code's JSON shows the same `session_id` both times, so the second run was `--resume`. It added `notes/INDEX`, and the task landed on attempt 1.                                                                                                                            | yes  |
| 3   | The killed child is `exited` or `gone` and its task recovers on the retry path      | p57-three's child was killed with SIGKILL mid-task. The supervisor reports it `gone`. Attempt 1 failed with that cause, and attempt 2 opened in the same worktree and landed.                                                                                                                                                                                                                                       | yes  |
| 4   | The supervisor keeps or finds its children and nothing runs twice                   | The backend was killed with SIGKILL while p57-one's child ran. The detached supervisor was still running five seconds later. Then the supervisor was stopped too, and both were restarted. The new supervisor found the child by pid and start time (pid 17911). The child exited 0 after 1 run, and its result was recorded once. There was one worker binding per task and attempt, and no run without a message. | yes  |
| 5   | A person-only command from a child with `--as-person` is refused                    | `REFUSED person-only command: exit 1: Only a person lets a commit's protected paths land. This command is running inside an agent the supervisor started (process-768c3fa9-…). … --as-person does not apply here.`                                                                                                                                                                                                  | yes  |

## Also record

| Item                                                         | What was seen                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permission and sandbox values Claude Code accepts            | `--permission-mode acceptEdits` for write roles, under `sandbox-exec` with the network limited to one loopback port, and `--allowedTools "Bash(<command>:*)"`, the prefix form (`Bash(<command>)` matched only the exact text). Claude Code needs `CLAUDE_CODE_TMPDIR` inside its write roots (#427). `plan`, the read-only value, was not exercised: no read-only role runs on `process` until 49.1. |
| Writes outside the write roots, the git directory included   | Refused, from inside the child: the main checkout's `.git`, the run folder outside the worktree, and the home folder (`EPERM` each). None of the three probe files exist afterwards.                                                                                                                                                                                                                  |
| The database and credentials cannot be read                  | Refused (`EPERM`): the workspace database, Avoozl's machine config and state, `~/.aws`, `~/.config/gh`, `~/.ssh`, the Kiro Crew home, and `~/Library/Keychains`. The proxy let through only the Bedrock runtime host. It refused the CLI's telemetry host and the Bedrock control-plane host.                                                                                                         |
| Whether `--max-budget-usd` binds on a plan login             | **Not checked.** Claude Code on this Mac signs in to Bedrock, not to a plan login, and no task had a budget, so the spend cap flag was not passed.                                                                                                                                                                                                                                                    |
| Whether the app backend may keep a detached long-lived child | **Partly.** A backend process started the supervisor detached, and the supervisor outlived the backend's SIGKILL and kept its child. These were terminal processes. The Kiro Crew app backend's own lifecycle was not tested, because the run had to be outside Kiro Crew's sandbox.                                                                                                                  |

## Notes

- The vanished-attempt cause for a process child says "Kiro Crew no longer
  lists session …", though the supervisor is what reported it gone. The
  wording should name the supervisor. Behavior is correct.
- A landing-failure message lists the failed command and exit code but not
  its output. The child found the reason by running the check itself.
- Only macOS `sandbox-exec` was exercised. Linux `bwrap` was not.

## Next decision

Make `process` the default for Avoozl's own repository, or keep `kirocrew`.
The two open items above bear on it: the Kiro Crew backend's detached child,
and a plan login's spend cap.
