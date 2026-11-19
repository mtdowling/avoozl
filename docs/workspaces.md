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
**Initialize new**, or with `node cli.mjs init ~/plans --name "My plans"`.
**Add existing** opens a directory that already holds a workspace.

## Example data

A new workspace has no tasks and no repositories, and the triage agent is off.
`seed` writes the made-up Recipe Box epic and its three specs to
`.kiro/specs/` as drafts:

```sh
node cli.mjs seed --workspace ~/plans
node cli.mjs plan batches --workspace ~/plans
node cli.mjs epics --workspace ~/plans
```

`plan batches` lists the specs in approval order, and `epics` shows the epic.
Loading examples never approves a plan, starts a session, or configures a
repository.

## Demo mode

**Start demo** opens a made-up Recipe Box workspace to look around in. It
shows in the empty **In flight** box on Home while nothing is in flight and the
workspace has never run a task, and on the empty page when you have no
workspace yet.

While the demo is on, a **Demo** badge shows in the header. Reads work. Every
change only says what it would do, no agent or chat starts, and GitHub is a
fake that writes nothing. **Exit demo** returns to your own workspace, which
the demo never opens. The sample is built once in a folder under your system
temp folder, and it is kept with your edits for the next demo.

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

`avoozl serve` serves the page without Kiro Crew:

```sh
node cli.mjs serve --workspace ~/plans --port 4800
```

It listens on `127.0.0.1` only. `--host`, `--bind`, and `AVOOZL_HOST` refuse to
start. It prints a one-time owner link that signs one browser in, and
`avoozl serve link` prints another for the running server.

On a headless machine, set `serve.enabled`, and optionally a fixed
`serve.port`, in the machine's `config.json`. The supervisor then runs the
server as a child, restarts it on the same port, and prints no link; run
`avoozl serve link` in that machine's shell. `avoozl status` shows the
server's origin.

Without Kiro Crew, a button that opens a chat opens a **Start a session**
dialog. **Start** runs the message as a read-only `assist` session on a
harness approved on this machine, and the dialog shows its log, its cost, a
**Send message** box, and an attach command. Features that need Kiro Crew say
"Needs Kiro Crew". **Settings › Workspaces** has a **Notifications** box for
browser notices about new **Needs you** items, off until you turn it on.

The app backend inside Kiro Crew also binds `127.0.0.1`, and it accepts only
requests the Kiro Crew gateway signed. Do not expose either one.

## Backup

```sh
node cli.mjs backup --workspace ~/plans --output ~/plans-backup.sqlite
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
- reads the retros committed under `.kiro/retros/`
