# Getting started

Avoozl needs Node 22.13 or later (for built-in SQLite) and Git, and runs
inside Kiro Crew 0.12.2 or later or on its own. The GitHub features also need
`gh` signed in, or a token.

```sh
git clone https://github.com/mtdowling/avoozl.git
cd avoozl
npm ci
npm run build
npm test
```

`npm run build` writes the page bundle and copies the CLI into
`kirocrew-app/bin/lib`. The built page is not committed. `npm run test:changed`
runs only the tests a change reaches, as CI does. Tests use disposable
workspaces and make no network or paid agent calls.

## Run it in Kiro Crew

```sh
npm run build:kirocrew-app
kirocrew app install "$PWD/kirocrew-app"
```

Open Kiro Crew's App Store, review Avoozl's trust request, and enable it. The
**Avoozl** page appears in the sidebar. The trust request asks for these API
grants:

- `/apps/avoozl/api/*` reaches the app's own backend.
- `/api/chat/slots/avoozl_*` reads the status of the sessions the tick opened,
  and no others.
- `/api/usage/turns` reads token and credit counts per flow stage for those
  sessions.
- `/api/models` fills the model lists in Settings.
- `/api/apps/spec-builder/specs` hands a new spec to Spec Builder.
- `/api/reveal` shows a spec file in the file browser.

An update that adds a grant waits until you approve it. To update, pull, then
run `npm run build && kirocrew app update avoozl` in the checkout.

## Run it without Kiro Crew

```sh
npm run build
node cli.mjs serve --workspace ~/plans
```

`avoozl serve` serves the same page on `127.0.0.1` only. It has no host or
bind option. It prints a one-time owner link that signs one browser in;
`avoozl serve link` prints another for the running server.

Without Kiro Crew, a button that opens a chat opens a **Start a session**
dialog. Start runs the message as a read-only session on a harness approved on
this machine. Features that need Kiro Crew say "Needs Kiro Crew". See
[Workspaces](workspaces.md#standalone-server) for headless machines and the
other server settings.

The CLI and MCP work with or without the page:

```sh
node cli.mjs help
node cli.mjs status --workspace ~/plans
```

Any stdio MCP client can run `node /path/to/avoozl/cli.mjs mcp --workspace
/path/to/my-plans`.

## Create a workspace

A workspace is a directory you own, separate from the checkout:

```sh
node cli.mjs init ~/plans --name "My plans"
```

```text
my-plans/
  .avoozl.json                     portable, reviewable policy
  .avoozl/local/workspace.sqlite   execution state (not committed)
  .kiro/specs/<name>/              specs
```

A new workspace has no tasks and no repositories, and the triage agent is off.
`node cli.mjs seed --workspace ~/plans` adds a made-up example epic as draft
specs. Loading examples never approves a plan, starts a session, or configures
a repository. See [Workspaces](workspaces.md) for settings files, demo mode and
backups.

## Write and approve a spec

A spec is a Kiro spec folder: `requirements.md` (or `bugfix.md`), `design.md`
and `tasks.md`. Each task in `tasks.md` has an ID, a title, and a `Facts:`
bullet that gives its dependencies and what done means:

```markdown
- [ ] 1.2 Validate config
  - Facts:
    - after: 1.1
    - done:
      - An unknown key is reported with its path
  - Report each key the schema does not name, with its JSON path.
```

Choose **New spec** on the Specs page. Review the lint results and the graph,
then choose **Approve revision**. An approval is a commit on main authored by
an approver, so a later edit reads as unapproved until you approve again. See
[Specs](specs.md) for the full task format and for approvals.

## Deliver

Register the checkout the work changes, with its base branch and its named
checks, then set the repository's `landing` to `off`, `direct` or `pr`.
Avoozl pushes and merges only after the checks pass on the exact head it
lands, and it never force pushes. See [Delivery](delivery.md) for the
commands, and [Avoozl](overview.md) for what each page shows.
