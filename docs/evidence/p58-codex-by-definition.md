# P58 live: Codex runs a task from its definition file alone

Proof P58 (Requirement 94.7, design §4.28), run once with
`scripts/proof-p58-live.mjs` on 2026-11-17 at 23:11 UTC, on Avoozl commit
`19af828c`. The scratch repository was a bare remote with its own checkout.
The run had its own Avoozl workspace, its own Avoozl config and state home
(`XDG_CONFIG_HOME`, `XDG_STATE_HOME`), and its own `CODEX_HOME`. No real
workspace, Avoozl home, Codex home or Kiro Crew home was opened. The owner
ran it from his terminal, because Kiro Crew's sandbox refuses a nested
`sandbox-exec`.

**Verdict: pass. P58 is ticked.** Every Expected item held, and the source
tree matched the recorded commit. The script printed `P58 FAIL` because its
own pass rule also required every read probe to be refused. One read probe
was allowed: listing `~/.codex`. That probe is not part of P58's bar,
and #479 fixes it (see Also record).

## Fixes before the run

Each merged after Linux, macOS and Windows passed.

| Pull request | Found by               | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #446, #451   | a preflight            | Codex's own macOS sandbox cannot nest inside Avoozl's (`sandbox_apply: Operation not permitted`), so with `workspace-write` or `read-only` it could neither edit a file nor run a command. Owner decision R94.4d: `permission.write` may be exactly `danger-full-access`, and only inside Avoozl's sandbox with write roots. Without an Avoozl sandbox it is refused, opt-in or not (task 48.2).                                                                                   |
| #465         | the fake-agent dry run | The supervisor marked a resume message delivered before the child read `running`. A backend reading in between took the earlier run's exit for the resumed run's, reported done at the old HEAD, and never committed the resumed run's edits. Both writes are now one transaction.                                                                                                                                                                                                 |
| #470         | the owner's preflight  | The proof script itself. With its default TLS, Codex inside Avoozl's sandbox failed every model request (`Connection failed: error sending request`, 5 retries) even though the proxy let each CONNECT through. With `SSL_CERT_FILE=/etc/ssl/cert.pem`, Codex checks TLS with that bundle and works. The second preflight showed both: step 1 without the bundle failed, and step 2 with it passed. The proxy also allows `bedrock-mantle.<region>.api.aws`, Codex's Bedrock host. |

## Setup

- `examples/harnesses/codex.json`, approved by hash in the isolated machine
  config. The run's copy changed two things only. `start[0]` and `resume[0]`
  name the Codex binary itself (`codex-cli 0.169.0`), not the toolbox
  launcher, which edits `config.toml`. `keepEnv` also lists `AWS_REGION`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`,
  because Codex on this Mac signs in to Amazon Bedrock. Short-lived
  credentials went only into the supervisor's environment.
- `CODEX_HOME` was a folder in the run root, listed in the project's
  `sandbox.writeRoots`. Its `config.toml` names the `amazon-bedrock` provider,
  region `us-east-1`, model `openai.gpt-5.6-luna`, and no MCP servers.
- The supervisor's environment also set `SSL_CERT_FILE` and the loopback
  proxy (`HTTPS_PROXY`). `sandbox.network` was `["localhost:18458"]`.
- The project had `executor: "process"`, `harness: "codex"`,
  `landing: "direct"`, and one check, `node check.mjs`. The check failed once
  on the landing candidate (the injected feedback round) and asked for
  `notes/INDEX`.
- One leaf, p58-one: create `notes/one.txt` holding `alpha`, run a probe
  script once, and run the check.

## Expected, item by item

| Expected                                           | Seen                                                                                                                                                                                                                        | Pass |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| The child exits with a valid `.avoozl/result.json` | One worker session, 2 runs, each exited 0 with a `done` result file.                                                                                                                                                        | yes  |
| Avoozl commits its changes                         | The remote's log holds `Avoozl task p58-one, attempt 1` twice (the first run and the resumed round), then `Land p58-one` (`06b198a`). `notes/one.txt` and `notes/INDEX` are on the remote. The child made no commit itself. | yes  |
| The task finishes                                  | `integrated` at 23:13:09 UTC, about two minutes after setup.                                                                                                                                                                | yes  |
| One feedback round on Codex                        | The landing check failed once. One message was delivered, and the same session ran a second time through `resume --last -`. Codex reproduced the failure, added `notes/INDEX`, and ran the check again, which printed `ok`. | yes  |
| `git diff --stat` of every source file is empty    | Avoozl's HEAD was `19af828c` before and after. `git diff --stat HEAD` and `git status --porcelain --untracked-files=all` were both empty.                                                                                   | yes  |

## Also record

| Item                                        | What was seen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permission and sandbox values Codex accepts | `--sandbox` takes `read-only`, `workspace-write` and `danger-full-access` (`sandbox_mode = "external-sandbox"` is rejected). On macOS, inside Avoozl's `sandbox-exec`, only `danger-full-access` can edit or run anything, so the write class uses it (R94.4d). Approvals are off (`approval_policy=never`). Codex ran 9 commands (7 completed; the 2 that failed were its own shell mistakes, such as assigning zsh's read-only `status`) and made 4 file edits, all completed. The read class (`read-only`) was not exercised: no read-only role runs on `process` until 49.1, and it will meet the same nesting failure. |
| Its writes stay in the worktree             | Refused from inside the child (`EPERM`): the main checkout's `.git`, the run folder outside the worktree, and the home folder. None of the three probe files exist afterwards.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Reads (beyond P58's bar)                    | Refused (`EPERM`): the workspace database, Avoozl's machine config and state, `~/.aws`, `~/.config/gh`, `~/.ssh`, the Kiro Crew home and `~/Library/Keychains`. **Allowed: listing `~/.codex`**, the person's own Codex home, where Codex keeps `auth.json` and transcripts. #479 adds it to the sandbox's denied paths.                                                                                                                                                                                                                                                                                                    |
| Network                                     | The proxy let through only `bedrock-mantle.us-east-1.api.aws:443`. It refused `github.com`, `api.github.com`, `chatgpt.com` and `ab.chatgpt.com` (Codex's plugin sync and telemetry).                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Cost                                        | Codex reports tokens, not dollars, and has no spend cap flag. No cost was recorded.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Notes

- The definition needed no change for this run beyond the binary path and
  the sign-in variables, as with P57. `SSL_CERT_FILE` came from the machine
  environment, not the file. A machine whose Codex works with the macOS
  TLS check inside the sandbox would not need it.
- Only macOS `sandbox-exec` was exercised. Linux `bwrap` was not.

## Next decision

None from this proof. P58's failure branch ("fix the seam so the next
harness needs no code") did not apply. Codex needed one seam rule, R94.4d,
which serves any harness whose own sandbox cannot nest inside Avoozl's,
and no Codex-specific code. The same nesting failure will meet Codex's
read-only roles in Phase 49.
