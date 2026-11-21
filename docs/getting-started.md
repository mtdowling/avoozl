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

`npm ci` also links a global `avoozl` command to the checkout, as `npm link`
does. It skips CI and `AVOOZL_NO_GLOBAL_LINK=1`, and a failed link only prints
how to run `npm link` yourself.

`npm run build` writes the page bundle and copies the CLI into
`hosts/kirocrew/bin/lib`. The built page is not committed. `npm run test:changed`
runs only the tests a change reaches, as CI does. Tests use disposable
workspaces and make no network or paid agent calls.

## Run it in Kiro Crew

```sh
npm run build:kirocrew-app
kirocrew app install "$PWD/hosts/kirocrew"
```

Open Kiro Crew's App Store, review Avoozl's trust request, and enable it. The
**Avoozl** page appears in the sidebar. The trust request asks for these API
grants:

- `/apps/avoozl/api/*` reaches the app's own backend.
- `/api/chat/slots/avoozl_*` reads the status of the sessions the tick opened,
  and no others.
- `/api/usage/turns` reads the model each of those sessions last ran on.
- `/api/models` fills the model lists in Settings.
- `/api/reveal` shows a spec file in the file browser.

An update that adds a grant waits until you approve it. To update, pull, then
run `npm run build && kirocrew app update avoozl` in the checkout.

## Run it without Kiro Crew

Without Kiro Crew, a timer runs the tick ([below](#run-the-tick-on-a-timer)).
To use the page too, set `serve.enabled` (and, if you like, a fixed
`serve.port`) in this machine's `config.json`:

```json
{
  "version": 1,
  "serve": {
    "enabled": true,
    "port": 4800
  }
}
```

The next tick starts the page on `127.0.0.1` only, and each tick after keeps
it up. It has no host or bind option. Sign a browser in with a one-time owner
link, printed by:

```sh
avoozl link
```

Without Kiro Crew, a button that opens a chat opens a **Start a session**
dialog. Start runs the message as a read-only session on a harness approved on
this machine. Features that need Kiro Crew say "Needs Kiro Crew". See
[Workspaces](workspaces.md#standalone-server) for headless machines and the
other server settings.

The CLI and MCP work with or without the page:

```sh
avoozl help
avoozl status --workspace ~/plans
```

Any stdio MCP client can run `avoozl mcp --workspace /path/to/my-plans`. It
serves that chat from the workspace database and starts nothing; its
`plans_maintain` `tick` tool runs one pass.

### Claude Code

`hosts/claude-code/` is a Claude Code plugin: the Avoozl skills (including
`avoozl-drive`), an MCP entry that runs `avoozl mcp`, and a hook that refuses
the agent's own shell call to a command only a person may run. Load it with:

```sh
claude --plugin-dir /path/to/avoozl/hosts/claude-code
```

The hook is a speed bump, not a wall; see [Person-only](person-only.md).

## Run the tick on a timer

All of Avoozl's work happens in `avoozl tick`: one pass that plans, starts
and checks agents, lands what passed, and exits. Something has to run it
again and again. In Kiro Crew, the app's `avoozl-tick` cron runs it every
minute, so there is nothing to set up. On a machine without Kiro Crew, pick
one of the timers below. Each runs `avoozl tick` once a minute for every
enabled workspace in this machine's catalog.

A tick starts and lands work only on a machine whose `config.json` turns its
`loop` on; picking Autopilot in Settings › Autopilot writes it
([Delivery](delivery.md#turning-autopilot-on)). Without it, each tick still
reads and caches.

An agent a tick starts keeps running after that tick exits; the next tick
finds it again by its process and session, and reaps or resumes it. Two
ticks that overlap are safe: the second skips what the first holds.

First find the two paths every timer names, since a timer does not read your
shell's setup:

```sh
command -v node
realpath "$(command -v avoozl)"
```

Below, `/usr/local/bin/node` stands for the first and
`/path/to/avoozl/cli.ts` for the second. Put your own in their place. The
`PATH` line must reach `git`, `gh` and each harness program (`claude`,
`codex`). No timer line holds a secret: model keys go in `machine.env`
([below](#model-access-for-unattended-agents)).

### macOS: a launchd agent

Save this as `~/Library/LaunchAgents/dev.avoozl.tick.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>dev.avoozl.tick</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/avoozl/cli.ts</string>
    <string>tick</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartInterval</key>
  <integer>60</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/avoozl-tick.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/avoozl-tick.log</string>
</dict>
</plist>
```

Load it, and unload it to stop:

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.avoozl.tick.plist
launchctl bootout gui/$(id -u)/dev.avoozl.tick
```

### Linux: a systemd user timer

Save this as `~/.config/systemd/user/avoozl-tick.service`:

```ini
[Unit]
Description=One Avoozl tick

[Service]
Type=oneshot
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/local/bin/node /path/to/avoozl/cli.ts tick
```

And this as `~/.config/systemd/user/avoozl-tick.timer`:

```ini
[Unit]
Description=Run an Avoozl tick every minute

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min

[Install]
WantedBy=timers.target
```

Start it, and stop it:

```sh
systemctl --user daemon-reload
systemctl --user enable --now avoozl-tick.timer
systemctl --user disable --now avoozl-tick.timer
```

`journalctl --user -u avoozl-tick` shows each tick's output. To keep ticking
while you are logged out, run `loginctl enable-linger` once.

### Any Unix: a crontab line

Run `crontab -e` and add one line:

```text
* * * * * PATH=/usr/local/bin:/usr/bin:/bin /usr/local/bin/node /path/to/avoozl/cli.ts tick >> /tmp/avoozl-tick.log 2>&1
```

### From a chat

With no timer, a chat can drive Avoozl. The `avoozl-drive` skill, in both
host packages, tells it to run `avoozl tick` once on each wake, read
`avoozl next` and `avoozl status`, and tell you what needs you. It decides
nothing the tick decides. Any scheduled chat or loop in Claude Code or Kiro
Crew can follow it.

`avoozl status` shows when each workspace last had a pass, so a timer that
stopped is easy to see.

### Model access for unattended agents

A tick a timer runs does not have your shell's environment. Put the model
keys a harness needs in `machine.env` in this machine's Avoozl config folder
(`~/.config/avoozl/machine.env`), one `NAME=value` per line, readable only by
you (`chmod 600`). A child gets the secret-looking names its harness
definition lists in `keepEnv`, such as `ANTHROPIC_API_KEY` or `AWS_PROFILE`,
and none is required. A sign-in that Claude Code keeps only in the macOS
keychain is out of a sandboxed child's reach: use an API key, a cloud
provider's credentials, or the repository's model proxy instead.

For a cloud provider such as Amazon Bedrock, the example definitions copy
`~/.claude/settings.json` or `~/.codex/config.toml` into the child's own
home (`homeFiles`) and let it read `~/.aws` (`reads`). If the credential
helper your settings name lives under your home folder, add its folder to
`reads` too. The child's network is off, so it reaches the provider only
through the repository's `sandbox.modelProxy`.

Each example definition names a `probe`, a one-line prompt such as
`claude -p ok`. **Check again** in **Settings › Models**, or
`avoozl harness probe NAME`, runs it once in the same sandbox a
worker gets. That is a model call, so Avoozl keeps the answer until the
definition or `machine.env` changes and never runs it on its own. A failed
probe shows the harness's own error, with secrets taken out.
A harness program is looked up on `machine.env`'s `PATH`, then the
server's, then your login shell's, so one installed for you is found. If it
is still not found, set `PATH` in `machine.env` or give an absolute path in
the harness definition. **Settings › Models** and `avoozl status` show a
harness that cannot start here, and why.


## Approve a harness

A harness file in this machine's config (`harnesses/NAME.json`) runs a program
here, so a person approves its exact bytes by hash. A changed file waits for a
new approval.

```sh
avoozl harness list
avoozl harness approve NAME
avoozl harness probe NAME
```

`list` shows each harness as approved, not approved, or changed since approval.
`approve` prints the name, path and hash it approved. **Settings › Models** has
the same **Approve** button. Only a person can approve; MCP and `process`
children are refused.

## Create a workspace

A workspace is a directory you own, separate from the checkout:

```sh
avoozl init ~/plans --name "My plans"
```

```text
my-plans/
  .avoozl.json                     portable, reviewable policy
  .avoozl/local/workspace.sqlite   execution state (not committed)
  .kiro/specs/<name>/              specs
```

A new workspace has no tasks and no repositories. Add one with
`avoozl repository configure ID --root PATH`, then run `avoozl rebuild`. See
[Workspaces](workspaces.md) for settings files and backups.

## Write and approve a spec

A spec is a Kiro spec folder: `requirements.md` (or `bugfix.md`), `design.md`
and `tasks.md`:

```markdown
- [ ] `cfg-1` Read the config file
  - A file with every key loads
- [ ] `cfg-2` Validate config
  - An unknown key is reported with its path
```

Write it by hand, or ask a chat to with the `avoozl-spec` skill, which lints
it, writes its graph block and leaves it on a spec branch. `avoozl spec lint`
checks a folder. For the task format and the commit that approves a spec, see
[Tasks](github-workflow.md#2-tasks) and
[Approval](github-workflow.md#7-approval).

## Deliver

Register the checkout the work changes, with its base branch and its named
checks, then set the repository's `landing` to `off`, `direct` or `pr`.
Then pick **Autopilot** in **Settings › Autopilot**. That writes the
`delivery` block to `.avoozl.json` and `"loop": {"run": ["specs"]}` to this
machine's `~/.config/avoozl/config.json`. Without the loop the tick starts
nothing, and **Needs you** says so while tasks are ready;
`avoozl next --claim` and `avoozl land TASK` then run one task at a time. Avoozl
pushes and merges only after its checks pass. See
[Landing](github-workflow.md#16-landing) for the rules, [Delivery](delivery.md#the-server-loop)
for the loop and the commands, and [Avoozl](overview.md) for what each page shows.
