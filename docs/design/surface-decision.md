# Keeping the website, or going VS Code only

A self-contained comparison for the VSC-10 decision. Everything asserted here
was measured on this machine; where it was not, that is said. Receipts are in
`docs/evidence/vscode/`.

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

## What only the website can do

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

This is emulation, not the physical-phone gate (VSC-08, still open). Real
hardware can only be worse than this, never better.

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

- **Website — the operator's remote control, everywhere.** Triage, what needs
  a decision, approve or deny, answer a question, cancel, read a plan, read a
  graph. It stays a full participant, not a viewer: it is the only surface that
  works on a phone, and the phone case is exactly when a decision is blocking
  an agent.
- **VS Code client — depth at a keyboard.** The live transcript with native
  controls, plan editing against a reviewed hash, diffs, worktrees,
  validation and integration.
- **Not duplicated:** whichever surface owns a flow owns it. The parity matrix
  in `vscode-client.md` is where that is recorded, filled in from passing
  gates rather than intent.

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

## What is still unknown

- The physical-phone gate (VSC-08) and the remote route (VSC-07) are open; the
  relay was DNS-blocked on the network where this was built. See
  `vscode-handoff.md`.
- Whether a future VS Code gains a touch-reachable sessions control and a
  layout that reflows below ~600px. If both arrive, this comparison should be
  re-run before the decision is revisited — the script is checked in.
