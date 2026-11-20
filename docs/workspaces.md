# Workspaces

A workspace is a directory you own that holds your specs, your settings, and a
local database. It is separate from the Avoozl checkout.

```text
my-plans/
  .avoozl.json                     portable, reviewable policy
  .avoozl/local/workspace.sqlite   execution state (not committed)
  .kiro/specs/<name>/              specs
```

Create one on the Avoozl page under **Add or initialize a workspace** with
**Initialize new**, or with `avoozl init ~/plans --name "My plans"`.
**Add existing** opens a directory that already holds a workspace.

## Example data

A new workspace has no tasks and no repositories. Add a repository with
`avoozl repository configure ID --root PATH`, then run `avoozl rebuild` to read
its specs, ticks, claims and spec issues from git and GitHub.

## Settings files

`.avoozl.json` holds portable policy: repositories, GitHub mode and rules,
delivery limits, and agent instructions. It is meant to be committed. Paths in
it are relative to the file. The loader rejects absolute paths, fields that
look like secrets, and unknown top-level keys, and the error names the file and
the key.

Keep GitHub credentials in `gh` or your credential store.

Settings that belong to one machine, such as `lanes` and `serve`, live in
`~/.config/avoozl/config.json`. A repository's `.avoozl.json` may not set
`serve`.

## Standalone server

The page runs without Kiro Crew when this machine's `config.json` sets
`serve.enabled`, and optionally a fixed `serve.port`. Each `avoozl tick`
keeps it up: the next tick starts it, starts it again on the same port if it
stopped, and stops it once `serve.enabled` is off. It listens on `127.0.0.1`
only and prints no link; run `avoozl link` in that machine's shell for a
one-time owner link that signs one browser in. `avoozl status` shows the
page's origin. See [Getting started](getting-started.md#run-the-tick-on-a-timer)
for the timer that runs the tick.

Without Kiro Crew, a button that opens a chat opens a **Start a session**
dialog. **Start** runs the message as a read-only `assist` session on a
harness approved on this machine, and the dialog shows its log, its cost, a
**Send message** box, and an attach command. Features that need Kiro Crew say
"Needs Kiro Crew". **Settings › Workspaces** has a **Notifications** box for
browser notices about new **Needs you** items, off until you turn it on.

The app backend inside Kiro Crew also binds `127.0.0.1`, and it accepts only
requests the Kiro Crew gateway signed. Do not expose either one.

`npm run build` builds the standalone page into
`hosts/kirocrew/ui/dist/standalone/` from Kiro Crew's own source at a pinned
release: v0.12.2 (`hosts/kirocrew/ui/kirocrew-pin.json`), the same release as
the Kiro Crew version this app asks for. The build fetches that source into a
cache outside git, checks its digest, and edits none of it. The standalone
page and the page inside Kiro Crew match when the installed Kiro Crew is the
pinned release.

## Backup

```sh
avoozl backup --workspace ~/plans --output ~/plans-backup.sqlite
```

Use the backup command rather than copying the database file, because SQLite
also keeps a WAL file. Back up the spec folders and `.avoozl.json` with it.

## Rebuilding the database

The database is a cache, and `avoozl rebuild` makes it again from git. On a
fresh machine, clone the repository, move any old `workspace.sqlite` aside,
and run `avoozl rebuild`. It:

- reads every spec folder
- approves again each spec whose current text an approver committed on main
- lists what landed from the landing commits' trailers, with each task's Flow
  spans
