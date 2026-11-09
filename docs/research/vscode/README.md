# VS Code investigation handoff

This is research for [the implementation plan](../../design/vscode-client.md), not an installed VS Code integration. The reusable application is AICommander. The original project happened to be Nupp; implementation and acceptance must use a fictional project on a different computer.

The architecture has evidence beyond transport markers: real approvals, questions, tool execution, cancellation, restart recovery, native plan editing, and a disposable backend integration flow. It still requires production translation work, desktop control acceptance, authenticated remote-session testing, and a physical-phone assessment. Do not retire the website based on this investigation alone.

## Most recent real-tool proof

The native VS Code browser chat approved a real Claude Bash request and a real Codex command-execution request. Each provider executed an authored, harmless Node fixture. The fixture wrote its actual PID and start time. Native Cancel then stopped each process; neither produced its normal completion marker. [The synthetic receipt](tool-roundtrip.json) correlates approvals, starts, native cancellation actions, and provider terminal events. Fixture paths are replaced with `<disposable-fixture>`; no account credentials or personal project data are included.

- Codex: run state `interrupted`, actual process stopped.
- Claude: actual process stopped after SIGTERM, but run state `failed`. The current adapter prioritizes the SDK error result over its interruption flag. This is a concrete prerequisite bug, not a missing transport test.

The original prototype also treated incomplete tool parts as skipped at turn end. The portable copy fixes its tool ID correlation and replays persisted approval decisions. [Replay assertions](projection-replay.json) confirm completed unsuccessful tool results and preserve Claude's raw failure. This replay is derived from the recorded actual events; it is not another native/provider execution test. Full tool-result semantics are implementation work.

## Earlier results and their limits

| Tested                                    | Result                                                                                                          | Boundary                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Claude native question and Write approval | Answer Blue reached the provider; an explicitly approved write produced `Blue` plus newline.                    | Native browser editor.                                                          |
| Codex native command denial               | Provider acknowledged the declined command.                                                                     | Native browser editor.                                                          |
| Claude queue, Codex queue and steer       | Durable follow-ups delivered in order; Codex received an active-turn steer.                                     | Some controls were backend RPC tests, not native UI clicks.                     |
| Live model changes                        | Both providers changed models within their existing sessions.                                                   | Direct SDK/RPC capability tests; production operation still needed.             |
| Facade restart                            | Real pending Claude question survived; original provider owner remained; reply reached the same session.        | One tested crash boundary.                                                      |
| Duplicate turn after restart              | One delivery for the repeated turn ID.                                                                          | Does not prove all exactly-once crash cases.                                    |
| Execution-host crash                      | Pending approval invalidated, queued message retained without automatic send; explicit resume retained session. | Codex tested.                                                                   |
| Actual native Markdown editor             | Save stayed draft, stale save returned false, approval extracted reviewed tasks once.                           | Disposable SQLite through existing plan operations, not an in-memory-only test. |
| Coding delivery                           | Agent committed a fixture file; checks, rebase over concurrent fixture main, recheck and integration passed.    | Backend operations; native integration UI not tested.                           |
| Plans MCP                                 | Both actual providers queried the fixture and returned expected task count/ID.                                  | Host MCP connection, not VS Code's separate MCP registry.                       |
| Native navigation                         | Exact host-owned Claude and Codex conversations opened using the internal workbench command.                    | Local browser editor; desktop remote resource scheme differs.                   |
| Desktop Agents connection                 | Installed desktop connected and registered both custom providers.                                               | Connection/log proof, not clicked desktop control acceptance.                   |
| Multiple clients                          | Desktop and browser editor connected to the custom host simultaneously.                                         | Local AHP connection, not simultaneous authenticated remote phone access.       |
| Direct provider ownership                 | Codex rejected a second live writer; post-exit resume worked.                                                   | Shared clients must use AICommander's owner.                                    |
| Official Claude history                   | Completed SDK-created session appeared after enabling programmatic discovery via a process wrapper.             | Wrapper skips occupancy checks; not an acceptable live sharing design.          |

The first report used only native transport markers for its bridge proof. A review of that report correctly called its conclusion too broad. Later tests supersede those specific limitations, but do not erase the remaining scope above. In particular, plan approval now has a real editor round trip, while full permission-scope translation, diffs, subagents, desktop controls and phone parity remain to implement or accept.

## Remote test

A temporary dev tunnel was authenticated through GitHub device login and successfully registered after the user explicitly accepted the Microsoft server license. The public VS Code browser editor and browser Agents client were both opened. The Agents client additionally required its GitHub Copilot sign-in terms; those were separately approved.

In the embedded test browser, both public clients failed their browser authentication flow with `No auth flow succeeded`. Host authentication and browser authentication are separate. A running host tunnel does not establish an end-to-end client session. The test did not copy credentials, enable anonymous access, or register a background service.

Regular Safari completed GitHub OAuth and connected successfully through the tunnel. The full remote editor listed the disposable Git repository and read a marker created on the host after the browser Agents client connected. The browser Agents client was separately signed in and displayed its host as Connected. Both remote clients remained open alongside the isolated desktop AHP client. This proves concurrent connection and fresh file access for that combination, not simultaneous steering of one managed agent. See [the remote receipt](remote-access.json).

At 390 by 844, Safari responsive mode initially kept a clipped desktop layout. Applying the iPhone user agent and reloading produced the actual compact mobile layout: Open sessions, a connected host picker in the title area, and a single-column prompt with collapsible session options. That corrects the inference from the earlier desktop-only narrow screenshot. The mobile folder picker opened, but a raw temporary repository path returned No workspaces match; Work in Repository initiated a separate GitHub repository authentication flow, which was canceled.

The custom AHP facade is not registered with the tunnel selection gateway. The remote Agents client therefore connected to a separate native VS Code host and showed zero chats, not the two AICommander-managed fixture conversations. Registering/routing our owned host is concrete integration work. No remote managed-session permission, cancellation, or steering success is claimed. No physical-phone soft-keyboard, pinch, app-switch, cellular, or complete phone-usage acceptance was possible here.

Microsoft's [Remote Tunnels documentation](https://code.visualstudio.com/docs/remote/tunnels#can-multiple-users-or-clients-access-the-same-remote-instance-simultaneously) says a full server instance is designed for one client at a time. Its [remote agent workflow](https://code.visualstudio.com/docs/agents/run/remote-agent-sessions#use-the-agents-window-in-the-browser) separately documents browser Agents access via a registered environment or authenticated tunnel. Test the intended desktop-plus-phone combination; do not infer its behavior from either sentence alone.

## Reproduce without the original machine

The [prototype](prototype/) includes the source of the tiny AHP facade, isolated production-host launcher, and real-provider fixture setup. It has intentionally not been installed into AICommander's normal command surface. It is an experimental source example with known gaps, not a product dependency or finished server.

```sh
# From the AICommander repository:
npm ci --ignore-scripts
cd docs/research/vscode/prototype
npm install --ignore-scripts
```

Set `AICOMMANDER_ROOT` to your checkout, `CODEX_COMMAND` to your installed Codex CLI if it is not on PATH, and `CODEX_MODEL` / `CLAUDE_MODEL` to models actually available to your accounts. Use each provider's normal authentication; do not copy original credentials. Then explicitly opt in to the real-provider probe:

```sh
RUN_REAL_PROVIDER_PROBE=1 node tool-roundtrip.mjs
```

The setup prints a fresh disposable root and owns a separate SQLite database and Git repository. It starts two real provider sessions in manual approval mode and bounds each Claude query to a $0.50 list-price budget. This is not a promise about subscription billing or a total cost cap. Stop the setup process with SIGTERM after testing. It closes its owned host. Do not point it at an existing workspace or keep an expired fixture as shared production state.

In another terminal, with the same environment, run `node managed-bridge.mjs <printed-root>`. It binds loopback port 9496 by default; set `AHP_PORT` to change it. It writes its manifest and trace inside that disposable root. Connect an isolated VS Code client to this AHP endpoint using the version-appropriate remote-host or server-bridge configuration. There is no authentication on this loopback research listener: never expose it publicly.

The tested desktop connection used these settings in its isolated profile:

```json
{
  "chat.remoteAgentHostsEnabled": true,
  "chat.remoteAgentHosts": [
    { "address": "ws://127.0.0.1:9496", "name": "AICommander research" }
  ],
  "chat.remoteAgentHostsAutoConnect": true
}
```

Launch `code --agents --user-data-dir <isolated-profile> --extensions-dir <isolated-extensions>`. These settings are experimental. The connection proof used desktop 1.142.0; record the result again on the target version. Use the session list to select the existing probe run rather than starting another provider session.

The clicked native controls were in the ordinary browser editor. That used the official VS Code Server package's `bin/code-server` with `--host 127.0.0.1 --port <web-port> --connection-token-file <private-token-file> --server-data-dir <isolated-data> --user-data-dir <isolated-profile> --extensions-dir <isolated-extensions> --agent-host-bridge-port 9496 --agent-host-bridge-host 127.0.0.1`. Accept its license deliberately before launch. These server flags connect to the existing facade; a new native `code agent host` process would be a different host. The public `code tunnel` workflow did not automatically reuse this custom bridge.

Approve only the displayed authored slow fixture command. Verify its `.started` marker before clicking native Cancel. Verify the recorded PID is gone and its `.completed` marker absent afterward. Preserve provider terminal events separately from the UI projection, especially Claude's failure classification. Run `node tool-roundtrip-receipt.mjs <printed-root>` after both native cancellations to assert the source events, native actions and actual process termination, and write a local receipt. Clean up only the fixture and clients you created.

The prototype doesn't implement all AHP methods, remote selection-gateway negotiation, per-client authorization, full tool output/results, canonical history pagination, native diff/subagent rendering, live model-change controls, or crash-safe transactional broadcasts. Unknown methods fail. It must not be mistaken for the production facade specified in the plan.

## Versions and compatibility

Original native desktop and local browser editor: VS Code 1.142.0, commit `6d62b1d5dace93a33b3a6d3eca1317bd5e15bcb1`. Downloaded standalone host and hosted browser client: 1.145.2, commit `c4453f8ea430795f941c1b2ff6c9321135a74a02`. AHP package: 1.0.0. Claude extension: 2.1.319; SDK: 0.3.319. Codex CLI: 0.163.0-alpha.11; separate post-exit extension-binary handoff: 0.164.0-alpha.11.1. Accounts were the existing ChatGPT and Claude Max subscriptions.

The public client/host/editor version split is a risk. The native navigation command and experimental remote-provider settings are compatibility adapters, not stable public extension contracts. Record and test the entire tuple on the second computer. Proposed session APIs are a possible private-install fallback via explicit enablement, not a generally shippable Marketplace assumption. Microsoft's [proposed API guidance](https://code.visualstudio.com/api/advanced-topics/using-proposed-api) describes that boundary.

## Portability and evidence

Earlier experiments lived in an unpushed snapshot Git repository inside a deeply nested local artifact directory. A reviewer looking under the ordinary project checkouts could not find them. This handoff corrects that for the critical latest source and synthetic receipts by putting them directly in AICommander.

Do not make the implementation depend on the old branch, profiles, temporary paths, private reports, screenshots containing unrelated projects, personal plans, or a production database. Reproduce the assertions on the canned project and publish its own compact evidence. No GitHub issues are needed; the implementation plan defines the proposed work and acceptance gates.
