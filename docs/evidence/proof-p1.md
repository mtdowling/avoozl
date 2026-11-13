# Proof P1: real Avoozl backend inside Kiro Crew

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 1,
proof P1 [R1, R20.4].

- App source: `kirocrew-native` at `3f8444a`
- Recorded: 2026-11-11, Node v26.13.0, macOS, Kiro Crew app bundle installed at `/Applications`
- Verdict: pass

## Setup

| Step | Result |
|---|---|
| Clean profile | New temporary `HOME`, `KIROCREW_HOME`, and `KIRO_HOME`; the active profile and its chats were not used |
| Build | `npm run build:kirocrew-app` exit 0 (`kirocrew-app/ui/dist/index.mjs` 12.18 kB) |
| Install | `kirocrew app install <worktree>/kirocrew-app` -> `installed avoozl v0.1.0`, origin `local`, approved grant `/apps/avoozl/api/*` |
| Trust | `agent.apps_trusted = ["avoozl"]` in the temporary profile, then `kirocrew app enable avoozl` -> enabled |
| Gateway | `kirocrew gateway --test-mode --no-crons --no-tunnel`, dashboard on loopback |

The agent shell runs inside an existing macOS Seatbelt sandbox, and Seatbelt
cannot nest, so the gateway refused to start the backend under its own
sandbox. The temporary profile set `agent.sandbox_allow_unsandboxed_exec=true`;
the backend still ran inside the outer sandbox. The active profile was not
changed.

## Action and expected results

| Expected | Observed | Result |
|---|---|---|
| The page loads data through `useAppApi` | Signed in to the temporary gateway with `kirocrew token --port <gateway port>` (temporary homes set). The Avoozl page rendered the planning shell and Workspace view; the workspace list showed "No workspaces yet. Add or initialize one." That list comes from `workspace.list` over `useAppApi()` at `/apps/avoozl/api/command` | pass (observed by a person) |
| A direct call without the gateway gets 401 | `POST http://127.0.0.1:9103/api/command` with no principal -> `401 {"error":"A valid Kiro Crew gateway-signed principal is required."}`; same call with a forged `x-kirocrew-principal` -> 401; `GET /health` -> 200 | pass |
| The only Avoozl listener is on `127.0.0.1` | `lsof -nP -a -p <backend pid> -i` lists one socket: `TCP 127.0.0.1:9103 (LISTEN)`. The only process with its working directory in the installed app folder is that backend | pass |

## Notes

- The installed app's three agents did not register in the temporary profile
  ("agent source missing or unreadable"), and their `@avoozl` MCP references
  were reported as unmounted. P1 does not use agents; these are open for
  later proofs.
- The temporary dashboard repeated "agent.crew_mode_agent names
  kirocrew-conductor, which is not an agent template (agent_not_found)". The
  temporary `KIRO_HOME/agents` holds only `kirocrew.json`, because the gateway
  refused to write derived agent specs into a directory its data home does not
  own. The active profile has `kirocrew-conductor.json`. This is a limit of the
  test profile; P1 does not use Crew Mode.
- The gateway log has no per-request proxy lines, so the `useAppApi` step
  rests on the rendered page, not on a log entry.
