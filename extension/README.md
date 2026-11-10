# Avoozl for VS Code

Plans, tasks, and owned agent conversations from an Avoozl workspace,
inside the editor.

This extension is a **client**. The workspace server owns planning state,
SQLite owns execution state, Markdown owns design prose, and one persistent
agent host owns each managed Claude or Codex process. The extension never
starts a provider process, never writes a run record, and never opens a second
writer for a conversation that already has an owner.

## What it gives you

- **Now** — attention needed, running conversations, ready work, blocked work,
  and work queued for integration.
- **Tasks and plans** — the task tree, and plan drafts edited as ordinary
  Markdown documents.
- **Conversations** — every conversation the workspace owns, with its state,
  provider, and model.
- **Graph, progress, and timeline** webviews, rendered from the workspace's own
  model code.
- Validation, integration, and acceptance as separate, explicit actions.

## Setup

1. Serve a workspace, optionally with the editor agent-host facade:

   ```sh
   node cli.mjs serve --workspace /path/to/workspace --ahp
   ```

2. Point the extension at it:

   ```json
   {
     "avoozl.endpoint": "http://127.0.0.1:9428"
   }
   ```

3. To see conversations as native chat, and to let the extension confirm which
   transcript it opened, add the facade:

   ```sh
   node cli.mjs editor --workspace /path/to/workspace
   ```

   That prints the `chat.remoteAgentHosts` entry to paste in, and the
   `avoozl.facadeManifest` path. **The printed address contains the
   facade's bearer token — treat it as a credential.** The facade listens on
   loopback only; reach it from another machine through an authenticated tunnel
   or an SSH port forward, never by publishing the listener.

## Things this extension is deliberate about

**Saving a plan is not approving it.** Saving records a new draft revision.
Approval is a separate command that shows the exact reviewed revision, its
hash, and the precise task and dependency set it would create, then asks who
authorized it and on what evidence. A revision that would drop a previously
approved task block is refused rather than silently applied.

**A conflicting save cannot overwrite another client's revision.** Every save
carries the hash the editor last read. If the draft moved underneath, the save
is refused, your buffer is kept, and you choose to compare, discard, or
explicitly save over the current revision.

**Stopping a conversation is not a failure.** Cancellation records intent, asks
the provider, and waits for its acknowledgment; the terminal state comes from
the provider's own turn end. An interrupted run keeps any provider diagnostic
separately from an error, so a stopped process is never shown as a defect and a
real failure is never relabeled as a cancellation.

**Opening a task's exact conversation uses an unpublished command.** There is
no supported extension API for opening one specific native chat. The command
used is checked for registration, checked against the builds it has been
exercised on, and — crucially — the fact that it returned is _not_ treated as
proof that the right transcript opened. Where the facade is configured,
identity is confirmed against the host's record of which chat channel a client
subscribed to. Without that confirmation the result is reported as unverified,
and a session picker is always available. See **Avoozl: Show
Diagnostics**.

**The website is still the phone companion.** This extension has not been
accepted on a physical phone. Until it is, use the website there.

## Settings

| Setting                       | Purpose                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `avoozl.endpoint`             | Workspace server to drive.                                                              |
| `avoozl.facadeManifest`       | Path to `ahp-facade.json`, enabling connection diagnostics and transcript confirmation. |
| `avoozl.refreshSeconds`       | Fallback poll interval when the event stream is unavailable.                            |
| `avoozl.nativeChatNavigation` | `auto`, `always`, or `never` for the unpublished navigation command.                    |

## Building

```sh
node scripts/package-extension.mjs
```
