# Handoff: what the VS Code client still needs, and how to do it

Self-contained brief for an agent picking this up on another machine or
network. Everything here is work that could not be finished where it was
built, with the reason and the exact next step.

## The work so far

Repository `https://github.com/mtdowling/avoozl`, branch `vscode-client`
(based on `plan-vscode-client`). Read, in order:

- `AGENTS.md` — the rules that bind this repository.
- `docs/design/vscode-client.md` — the plan and, at the end, a long
  "Implementation status" section with the delivered table, the corrections
  the implementation forced on the plan, and the editor behaviors discovered
  by experiment. Read the corrections before writing code: several plan
  assumptions are wrong and are marked as such.
- `docs/evidence/vscode/` — receipts. `native-controls-claude.json` and
  `native-controls-codex.json` are the clicked-control acceptance,
  `desktop-flow.json` the desktop flow, `real-providers.json` the opt-in
  real-provider run, `tool-roundtrip.json` and `editor-connection.json` the
  protocol-level ones.

`npm test` must pass (189 tests at handoff). `git diff --check` must be
clean. Do not add commit attribution or co-authors. Use a task worktree. Do
not open GitHub issues. Keep evidence reproducible and safe to publish: no
real workspace data, credentials, transcripts, or personal plans.

Decisions to preserve, because they were expensive to establish:

- The persistent host owns each managed provider process; the editor is a
  client. Never create a competing writer for an existing session.
- SQLite owns execution state; Markdown owns design prose.
- Saving a plan must not approve it. Approval is a separate act against a
  reviewed hash.
- Cancellation must never be reported as failure, and a genuine failure must
  never be reported as cancellation. `src/app/providers/cancellation.mjs` is
  the contract; both adapters use it.
- Do not retire any website surface until its replacement passes the plan's
  parity gates, including physical-phone testing.

## 1. VSC-07 — an authenticated remote route (blocked: network)

**Why it is blocked.** `scripts/vscode-tunnel-check.mjs` runs `code tunnel`.
On the network where this was built, the GitHub device login succeeded and
then the tunnel could not register: Microsoft's relay hostnames do not
resolve there. Nothing was published and nothing is claimed.

**What to do.** Either route works; the SSH one is better and needs no relay.

- SSH route: `avoozl editor --ssh HOST` already emits the command. The facade
  binds loopback only, so the route is an SSH local port-forward of the
  facade port to the client machine, with the connection token carried as
  `Authorization: Bearer`. Prove: desktop stays connected, the forwarded
  client sees the same sessions, and two clients do not fight over one
  session (`ahp-facade.test.mjs` covers the last one at protocol level; the
  point here is the real route).
- Tunnel route: retry `node scripts/vscode-tunnel-check.mjs --yes` from a
  network that resolves `*.tunnels.api.visualstudio.com`. A phone hotspot is
  enough and also removes the corporate DNS from the path.

**The thing to watch.** A tunnel selects a *native* VS Code host, not our
facade. That was the plan's original mistake. With the bridge route
(below) the facade becomes the editor's own host, so a tunnel to a
`code-server` started with `--agent-host-bridge-port` is the combination
worth testing. Do not claim remote access from a tunnel that merely opened.

Never publish an unauthenticated listener, never copy host credentials into
browser storage, and remove the tunnel after testing.

## 2. VSC-08 — physical phone (blocked: depends on 1)

Needs a real phone, its real browser and soft keyboard, and a connection
outside the home or office network. The checklist is in
`docs/design/vscode-client.md` under "Remote access and the website
decision". Viewport emulation is supplementary and is not acceptance.

Note before you start: a browser window cannot list a bridged session if it
has a folder open. Its folders are `vscode-remote:` URIs while a session's
working directories are `file:` URIs, and the editor compares scheme and
authority; a window with no folder open skips the check entirely. The
sessions list also lives in a sidebar that is hidden until
`agentSessions.showAgentSessionsSidebar` runs. Both are in the design
document; neither is a defect in this product.

## 3. Claude's real-provider interruption (blocked: credentials)

`RUN_REAL_PROVIDER=1 node scripts/vscode-real-provider.mjs --providers claude`
fails at `Could not load AWS credentials`: the configured profile
`766237651968` is not in `~/.aws/config` on that machine. Codex already
passed and produced the session's headline finding — on Codex 0.167.0,
`turn/interrupt` ends the turn but does **not** stop a command the provider
already spawned (the process was alive 20 s later and was never signalled).
That contradicts the plan's claim that native Cancel stopped both providers'
commands, and is surfaced through `interruptStopsSpawnedWork`,
`interrupt.acknowledged.scope`/`spawnedWork`, and a transcript notification.

Claude's `interruptStopsSpawnedWork` is `"unknown"` and must stay `"unknown"`
until observed. Refresh credentials, run the check, and set it from what you
see — including if the answer is the uncomfortable one.

## 4. VSC-09 — three desktop steps not yet driveable

`scripts/vscode-desktop-check.mjs` passes 10 of 10 attempted checks and
records three as not attempted:

- answering the extension's modal decision dialog from an automated click,
- the command that approval would have started,
- stopping that conversation from the application.

The dialog is `vscode.window.showWarningMessage(..., { modal: true })` in
`extension/src/extension.js` (`answerRequest`). Clicking the sidebar entry
under automation did not produce it. Either find why the tree item's command
does not fire from a synthesised click, or drive the same decision from a
control that does, and then assert against the durable records as the rest of
the check does. Do not convert these into passes without driving them.

**Read this before automating any editor.** A throwaway `--user-data-dir` is
not an isolated identity: VS Code resolves signed-in sessions from the system
keychain, so a fresh profile still had a usable chat account. A keystroke sent
while the command palette was not focused landed in that chat's input,
submitted a partial command as a prompt, and started an agent turn nobody
asked for, which then asked for file permissions of its own.
`scripts/cdp.mjs` now refuses to type unless the palette is confirmed open,
and the desktop check disables the chat surface in its profile. Keep both
guards. Assume every keystroke reaches something.

## 5. VSC-10 — the website decision (needs a human)

This is a judgment call, not a task. The parity picture changed during
implementation, so state it plainly to whoever decides:

There are two integration shapes. A **bridged** host — the facade passed to
`code-server --agent-host-bridge-port` — becomes the editor's own agent host
and gets a real chat editor with working Allow and Cancel controls; that is
what the clicked-control acceptance proves. A host configured through
`chat.remoteAgentHosts` gets a session list and **no** editor, because that
registration path calls only `registerChatSessionItemController` and never
`registerChatSessionContribution`. The desktop application exposes no bridge
flag at all — the string is absent from its bundle.

So native chat for owned sessions is a server-and-browser capability, not a
desktop one. That alone does not settle the web question, because the bridged
route is itself served to a browser — so it was measured.
`scripts/vscode-phone-viewport.mjs` puts both surfaces at an iPhone viewport
and drives them with touch events only. The website completes the whole flow
by thumb: find blocked work, open the conversation, approve, cancel, and the
real process stops. The bridged editor cannot reach its own session list by
touch (the command has no toolbar control), and given a keyboard the list
still does not render, because the command wants about 600px of width against
393 available; the workbench does not reflow at that size. Receipt:
`docs/evidence/vscode/phone-viewport.json`.

The recommendation at handoff is therefore that no website surface is retired
and the extension is treated as an addition. Two things would change that,
and both are checkable rather than matters of taste: VS Code gaining a
touch-reachable sessions control and a layout that reflows below ~600px, or a
decision that phone use is not required. The same measurement also found our
own website's controls at 131×40, 57×42 and 34×28 CSS pixels against a 44px
minimum — small enough to be worth fixing whatever is decided, and fixable in
our own code.
