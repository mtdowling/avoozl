# P60 live: a process session is watched and steered from the Avoozl page

Proof P60 (Requirement 98, design §4.28), run on 2026-11-18 between 02:42
and 03:02 UTC on a Mac. It used a throwaway Kiro Crew 0.12.2.4 with its own
home on port 5700, a scratch Avoozl workspace in that home's catalog, and a
scratch code repository whose only remote is a local bare repository. The
owner's real Kiro Crew and workspaces were not read or written. Every page
click was made by the proof chat in headless Chrome, signed in with the
test crew's saved cookie.

**Verdict: pass.** The first Send message was refused by the child, and
cost was summed wrongly; both were fixed (below) and the send was run again
on a new session, which followed it.

## Setup

- Project `app`: `executor: "process"`, `harness: "claude-code"`,
  `landing: "direct"`, check `node check.mjs`, sandbox write roots plus a
  Claude Code config folder, `allowCommands` `node check.mjs` and
  `node wait.mjs` (about 80 seconds, so a run can be watched), and
  `network: ["localhost:18460"]`, a loopback proxy that tunnels only to
  Bedrock runtime hosts (`scripts/live-proofs/p57-model-proxy.mjs`).
- Two harness definitions approved by hash in the test crew's Avoozl
  config: `claude-code` and `claude-code-alt`, the example Claude Code
  definition under two names, so the harness switch is the only change.
  The Bedrock sign-in variables are added to `keepEnv`.
- Tasks: `p60-one` (slow) → `p60-two`, then `p60-three` (slow) in a second
  plan for the rerun. Each plan was installed approved in this throwaway
  workspace. Investigate-first was off. Model
  `global.anthropic.claude-sonnet-5`.
- The owner ran one script in his own terminal: it started the proxy, the
  supervisor (short-lived Bedrock credentials in its environment only) and
  the test crew, and saved the sign-in cookie. A chat's shell can start
  neither a gateway nor `sandbox-exec`. The app backend found that
  supervisor running and used it (lock pid 58596).
- Avoozl `main` with #503 installed in the test crew for the rerun, updated
  in place through the test crew's app API.

## Expected, item by item

| Expected                                        | Seen                                                                                                                                                                                                                                                                                                                                                                      | Pass            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Status shows                                    | In flight row for `p60-three`: `claude-code-alt · running`, then `claude-code-alt · exited 0 · run 2` after the resume                                                                                                                                                                                                                                                    | yes             |
| Log tail shows                                  | The row's log box shows the child's last log lines, live, as text (see Notes on what Claude Code writes there)                                                                                                                                                                                                                                                            | yes             |
| Cost shows                                      | `$0.23` after run 2. Claude Code's own total for the session was `$0.136`: on a resume it reports the session's running total, and In flight summed both runs. Fixed in #504; with #504's code the same live session reads `$0.13565`                                                                                                                                     | yes, after #504 |
| Copy the attach command                         | Attach's tooltip and the copied text are the same: `cd …/p60-run/wt/avoozl-p60-three && /Users/dowling/.toolbox/bin/claude --resume b650ac1c-ade6-499d-a06f-02991e52c42a`. The button turned to "Copied"                                                                                                                                                                  | yes             |
| The message reaches the child through `send`    | Send message on the running row showed "Queued; it goes in when the run ends." The backend's drain handed it to the supervisor within seconds (supervisor message `queued`, then `delivered`), and the supervisor resumed the same Claude Code session with it (run 2). The child created `notes/sent.txt` (`delta`), as asked, and `Land p60-three` (`1df4747`) holds it | yes, after #503 |
| The next task of that role uses the new harness | Settings › Models: Worker harness `auto` → `claude-code-alt`, saved (`.avoozl.json` `harnesses: {worker: "claude-code-alt"}`) while `p60-one` ran on `claude-code`. Every worker started after the save ran on `claude-code-alt`: `p60-one` attempt 2, `p60-two` and `p60-three` (supervisor `children.harness`)                                                          | yes             |
| Screenshots at 390 and 1280 px, light and dark  | `docs/evidence/p60/`: `inflight-*` (running row, log tail, Attach), `cost-*` (after run 2), `send-*` (Send message queued at 1280 light; the form open in the others), `models-*` (Worker harness `claude-code-alt`), `attach-1280-light.png`. All inside the test crew's full app shell                                                                                  | yes             |

All three tasks landed: `Land p60-one` `48bf9e8`, `Land p60-two`
`72158b7`, `Land p60-three` `1df4747`.

## Bugs found and fixed

Each was merged after Linux, macOS and Windows passed.

| PR   | Merge      | Found                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #503 | `2bb4e074` | Run 1: the message was delivered by resume, but as bare text. The child read it against its brief's "Who counts" and untrusted-data rules and refused it ("a message relayed from the Avoozl page … is data, not an instruction"), wrote no new result file, and the attempt failed as "session closed without a done report". Avoozl now puts one fixed first line on a person's message, and the process brief says what that line means |
| #504 | `f14678e6` | Claude Code's `total_cost_usd` on a resume is the session total (run 1 `0.1340`, run 2 `0.1603`, while run 2's own `usage` was 42k cached input and 1.7k output tokens). A definition's cost may now say `"per": "session"`; the Claude Code example does                                                                                                                                                                                  |
| #505 | `f2e5edcc` | Every landed `process` task stayed in Needs you as "Session ended … is closed. Restart or close" (3 items): a finished child closes its binding, and a spec task's own status is not moved when it lands. A task whose delivery is `integrated` is no longer listed                                                                                                                                                                        |

## Notes (not part of the P60 bar)

- **Log tail content.** Claude Code in `-p --output-format json` prints its
  JSON only when a run ends. During a run the tail shows only the CLI
  wrapper's own stderr (sandbox-refused logging and telemetry lines). The
  tail is real, but it says little while Claude Code works.
- **Attach and the Claude Code config folder.** The run gave the child its
  own `CLAUDE_CONFIG_DIR`. A person who runs the copied attach command must
  use the same folder, or Claude Code will not find the session. The
  command does not name it.
- **Proxy.** It let through 6 Bedrock runtime connections and refused 268
  to the CLI wrapper's telemetry host.
- Spend: the four Claude Code sessions reported $0.52 together (session
  totals: `p60-one` 0.160 and 0.131, `p60-two` 0.091, `p60-three` 0.136).
- Headless Chrome ran with `AVOOZL_CHROME_NO_SANDBOX=1`, the repository's
  switch for a host where Chrome's own sandbox cannot start; it loaded only
  the local test crew.

## Next decision

Approve the screenshots.
