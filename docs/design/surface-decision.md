# Keeping the website, or going VS Code only

A self-contained comparison for the VSC-10 decision. Editor and browser
observations were measured on this machine; where they were not, that is said.
Receipts are in `docs/evidence/vscode/`. The OpenCode comparison is research
against the versioned upstream documentation cited in that section, not a local
integration measurement.

## What each surface is, concretely

Both talk to the same workspace through the same operations
(`src/app/operations.mjs`), and the same persistent agent host owns every
provider process. Neither is a second writer. They differ in how they reach
the user.

- **The website** is ours: `src/*.mjs` served by `src/app/server.mjs`. One
  process, no external runtime, responsive layout, reachable by any browser.
- **The VS Code client** is an extension plus an Agent Host Protocol facade
  (`src/app/ahp/`). For native chat it needs the facade bridged into a **VS
  Code Server** started with `--agent-host-bridge-port`. That server is a
  646 MB Microsoft package under *Microsoft Pre-Release Software License
  Terms*, which the operator accepts with
  `--accept-server-license-terms`. The desktop application has no bridge flag
  at all; configured as a remote host it gets a session list and no chat
  editor.

## What only the editor can do

Measured, in `native-controls-claude.json` and `native-controls-codex.json`
(14 of 14 checks each, driven by real clicks):

- A real chat transcript for an owned session, with the editor's own **Allow
  once** and **Cancel** controls driving our run. Cancelling stopped the real
  child process with `SIGTERM`, kept the tool `completed` and unsuccessful
  rather than skipped, and left the run `interrupted` with no error.
- Plan editing in a real text editor with conflict-safe saves, where saving
  records a revision and never approves (`desktop-flow.json`).
- The code context an operator at a keyboard actually wants: the run's
  worktree open, diffs in the editor's diff view, file navigation.

## What only the website passed at a phone viewport

Measured, in `phone-viewport.json` — both surfaces at an iPhone 15 viewport
(393×852 at DPR 3) driven with **touch events only**, because a phone has
neither mouse nor keyboard:

| Phone, touch only                 | Website | Bridged editor                   |
| --------------------------------- | ------- | -------------------------------- |
| Find work needing a decision      | yes     | not reachable without a keyboard |
| Open that conversation            | yes     | no                               |
| Approve a tool                    | yes     | not reached                      |
| Cancel, and stop the real process | yes     | not reached                      |
| Layout adapts to the viewport     | yes     | no                               |

The editor's sessions list is behind `agentSessions.showAgentSessionsSidebar`,
a command with no toolbar control on this build, so touch cannot reach it.
Given a keyboard it still does not render: the command wants roughly 600px of
width to place the list beside the chat, and there are 393. The workbench does
not reflow at that size — it renders activity bar, editor and chat at once,
with text wrapping to two or three words a line.

The website also costs nothing to reach: no 646 MB download, no licence to
accept, no second server to keep running.

This is emulation, not the physical-phone gate (VSC-08, still open), and it
does not prove the remote route (VSC-07, also open). It establishes that the
website's layout and the measured controls can complete the flow with touch at
this viewport, while the bridged editor cannot reach its session. Physical
hardware, its browser chrome and its network route can behave differently in
either direction, so end-to-end phone readiness remains conditional on those
two gates.

## So is the VS Code client worth keeping?

Yes, but as the keyboard operator's surface, not as the replacement.

The honest case for it: for an operator already in the editor with the code
open, the native transcript, the real approval controls, the diff view and the
plan editor are better than a browser tab, and they cost nothing extra once
that operator is there. The case against going editor-only: it cannot be
reached by thumb, it needs a large proprietary server to have chat at all, and
its limits — the hidden sessions command, the non-reflowing layout — are
upstream in VS Code, so we cannot fix them. The website's equivalent faults
are ours and are fixable; the measurement found its own controls at 131×40,
57×42 and 34×28 CSS pixels against a 44px minimum, which is worth fixing
whatever is decided here.

## The proposed division of labour

- **Website — the operator's remote-control surface and complete fallback.**
  Triage, what needs a decision, allow or deny a provider request, answer a
  question, cancel, read a plan and read a graph. It stays a full participant,
  not a viewer: it is the only surface that passed the phone-viewport touch
  test, and the phone case is exactly when a decision is blocking an agent.
  Calling it ready for an actual phone still depends on VSC-07 and VSC-08.
  Existing plan drafting, revision approval, validation, integration and
  acceptance remain available here unless a separate decision retires them.
- **VS Code client — depth at a keyboard.** The live transcript with native
  provider controls, plan editing and revision approval against a reviewed
  hash, diffs, worktrees, validation and integration.
- **Shared operations, intentional surface overlap.** "Ownership" here means
  the primary experience for a context, not exclusive capability. Safety-
  critical remote actions and existing workflows may remain on both surfaces;
  they still use the same operations and canonical state rather than
  independent implementations or writers. The parity matrix in
  `vscode-client.md` records the capabilities that actually pass, not the
  intended division alone.

Turning the website into a minor-editing surface only is the one option the
measurement argues against: it would put the phone case behind a surface that
cannot serve it.

## Can the website hand off to the editor instead of being the chat app?

Partly, and the limits are specific.

**On a computer: yes, and the mechanism exists.** The extension registers a
URI handler (`extension/src/extension.js`), so a website link of the form

    vscode://mtdowling.avoozl/conversation?run=<runId>

opens the desktop application and runs `avoozl.openConversation` for that run.
Also handled: `/task?id=`, `/plan?id=`, `/graph`, `/diagnostics`. One caveat
found the hard way: the editor lists a session only when its working directory
is, or contains, an open folder, and every run works in its own worktree — so
`openConversation` checks containment first and offers to open that worktree
window rather than reporting an unverified attempt.

**On a phone: no, on two counts.** There is no application to receive a
`vscode://` link, and the browser editor has no external deep-link entry for a
conversation — VS Code Web accepts only `folder`, `workspace`, `ew` and a
`payload` whose single documented use is `openFile`. Even if a link existed,
it would land the user in the layout measured above. So on a phone the website
has to do the work itself, which it does.

**If a phone handoff is ever wanted**, the route that does not depend on
Microsoft adding anything is ours: the website records an intent against the
workspace, and the extension acts on it when it next connects — the same
mechanism as `intent.submit`, read by the client rather than pushed to it.
That is a real option, not something to assume works; nothing of it is built.

## Embedding someone else's chat UI instead (OpenCode)

Considered, because it would be attractive if our website had no chat. It
does: `src/app/ui/workspace.mjs` already renders the transcript with history
paging, a composer with send, a queue-versus-steer choice where the provider
supports steering, a Stop control, the approvals mode, and request answering
with option buttons and a free-text field. The phone receipt drove the path
into the conversation, the provider approval and Stop by touch. The source and
automated tests establish that the other controls exist; they do not constitute
touch acceptance for history paging, composing, queue or steer, approval-mode
changes, or option and free-text answers.

The interface must be named by version. OpenCode's source is MIT licensed. The
V1 documentation checked on 2026-11-10 describes `opencode serve` as an HTTP
and server-sent-events server, including session and message endpoints,
`POST /session/:id/permissions/:permissionID` for a permission response and
`POST /session/:id/abort` to stop a turn. Its web documentation describes a
browser interface served by that server and a `--cors` option for custom
frontends. The separately published V2 documentation describes
`opencode pair`, `opencode service`, REST under `/api`, and a background server
that owns sessions, providers, permissions, plugins and application state.
The checked documentation does not document iframe embedding or an installable
web UI component. Sources:

- Source licence:
  `https://github.com/anomalyco/opencode/blob/dev/LICENSE`
- V1 server and web:
  `https://opencode.ai/docs/server/`,
  `https://opencode.ai/docs/web/`
- V2 client/server and plugin system:
  `https://v2.opencode.ai/docs/client-server/`,
  `https://v2.opencode.ai/docs/plugin-system/`

There are therefore two materially different proposals:

1. **Use OpenCode's web UI and server as another operator surface.** Its front
   end speaks its server's session model, so showing Avoozl runs there would
   require a second protocol facade beside the Agent Host Protocol one, or
   would make OpenCode the execution and session authority for those runs.
   Either route introduces a second operator-facing session model and must map
   interrupted versus failed, queued versus delivered, approval option
   identifiers, unsend, model choice at a turn boundary and one-writer
   ownership. That conflicts with the decision that SQLite and the Avoozl
   agent host remain canonical. The V1 and V2 interfaces also differ, so an
   integration would have to pin and test one rather than follow an
   unversioned moving target.
2. **Run OpenCode as a supervised provider.** This could fit as a pinned
   `src/app/providers/opencode.mjs` alongside `claude.mjs` and `codex.mjs`.
   The agent host would launch, monitor and stop one OpenCode process; Avoozl
   would retain the canonical run, delivery, request and lifecycle records;
   and an OpenCode session identifier would be provider-internal state, like
   the existing provider session identifiers. OpenCode would still own an
   internal agent loop and session storage. The adapter does not make those
   disappear; it prevents them from becoming a second canonical or
   operator-facing store.

The second option is an architecture fit, not yet an implementation claim.
Before adding it, a spike must choose and pin V1 or V2 and prove process
supervision, reconnect, cleanup, permission-option mapping, cancellation,
interrupted-versus-failed classification, queued delivery and model changes at
turn boundaries through the existing adapter contract.

If the goal is a better chat on a phone, the cheapest real improvement is not
a foreign UI: it is raising our own touch targets from the measured 131×40,
57×42 and 34×28 to the 44px minimum.

## What is still unknown

- The physical-phone gate (VSC-08) and the remote route (VSC-07) are open; the
  relay was DNS-blocked on the network where this was built. See
  `vscode-handoff.md`.
- Whether a future VS Code gains a touch-reachable sessions control and a
  layout that reflows below ~600px. If both arrive, this comparison should be
  re-run before the decision is revisited — the script is checked in.
