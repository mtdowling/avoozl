# Workspaces

A workspace is a directory you own that holds your specs, your settings, and a
local database. It is separate from the Avoozl checkout.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-workspaces-desktop-dark.png">
  <img alt="Settings, Workspaces tab: the workspace list, notifications and telemetry" src="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-workspaces-desktop-light.png" width="800">
</picture>

```text
my-plans/
  .avoozl.json                     portable, reviewable policy
  .avoozl/local/workspace.sqlite   execution state (not committed)
  .kiro/specs/<name>/              specs
```

Create one with `avoozl init ~/plans --name "My plans"`, or on the page under
**Settings › Workspaces** with **Add a workspace**, then **Start new**.
**Add existing** in the same dialog opens a directory that already holds a
workspace.

## Repositories

A new workspace has no tasks and no repositories. Add a repository, then run
`avoozl rebuild` to read its specs, ticks, claims and spec issues from git and
GitHub.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-repositories-desktop-dark.png">
  <img alt="Settings, Repository setup tab: one added repository with its folder and landing branch" src="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-repositories-desktop-light.png" width="800">
</picture>

```sh
avoozl repository configure app --root ../app
avoozl rebuild
```

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

Each `avoozl tick` keeps the page up in a plain browser tab, with or
without Kiro Crew. To open it, run `avoozl link` in this machine's shell and
open the one-time owner link it prints:

```sh
avoozl link
```

The link signs one browser in. The page listens on `127.0.0.1` only, on a
port of its own choosing unless `serve.port` fixes one. Every request needs
the session the link starts, and every write needs its CSRF token.
`avoozl status` shows the page's origin under `machine.serve`, and
**Settings › Workspaces › Browser page** shows it inside Kiro Crew. When the
page cannot start, such as when `serve.port` is taken, both say why and the
next tick tries again.

To turn the page off, set `serve.enabled` to `false` in this machine's
`config.json`. The next tick stops it.

```json
{
  "version": 1,
  "serve": {
    "enabled": false
  }
}
```

See [Getting started](getting-started.md#run-the-tick-on-a-timer) for the
timer that runs the tick.

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

The database is a cache, and `avoozl rebuild` makes it again from git and
GitHub. It fills an empty database only. On a fresh machine, clone the
repository, move any old `workspace.sqlite` aside, and run `avoozl rebuild`.
It:

- reads every spec folder
- approves again each spec whose current text an approver committed on its
  specs branch
- marks each task done whose box is ticked on its done branch
