# OpenHands executor

Avoozl can run implementation conversations through OpenHands while retaining
ownership of tasks, worktrees, validation, integration, and acceptance. The Agent
Server stays separate from the web process, so an Avoozl web reload does not
replace active work.

The product UI is the installable Avoozl page inside Agent Canvas. OpenHands
owns conversations, attachment to a running conversation, terminal, files, and
browser. Avoozl's HTTP process remains the extension backend and control plane;
opening it directly shows only an embedded-surface handoff, not a second app.
CLI and MCP remain available for setup, automation, and recovery.

## Supported versions

The integration is pinned and checked as one compatibility set:

| Component                      | Version  |
| ------------------------------ | -------- |
| OpenHands Agent Server         | `1.61.0` |
| `@openhands/typescript-client` | `1.61.0` |
| `@openhands/agent-canvas`      | `1.38.0` |
| Avoozl OpenHands App           | `0.1.18` |

Avoozl refuses a different Agent Server version before creating a conversation.
Upgrades must test the client, plugin, and embedded Canvas together.

## Local setup

Run the Agent Server as a separate process. Docker is not required; the Python
package exposes the same server:

```sh
python3 -m venv .openhands
.openhands/bin/pip install openhands-agent-server==1.61.0

OH_SESSION_API_KEYS_0="$(openssl rand -hex 32)" \
OH_SECRET_KEY="$(openssl rand -hex 32)" \
OH_APP_BACKEND_PUBLIC_URL=http://localhost:38100 \
OH_CONVERSATIONS_PATH=/absolute/path/to/openhands-state \
.openhands/bin/agent-server --host 127.0.0.1 --port 38100
```

The backend ingress deliberately uses `localhost` while the Canvas control
connection uses `127.0.0.1`. They reach the same loopback listener but are
different browser origins. OpenHands places the Avoozl backend behind a
short-lived HttpOnly, app-scoped session instead of exposing its loopback port
or a reusable credential to extension JavaScript.

Persist the generated keys in a permission-restricted machine-local secret store
if conversations must survive restarts. Changing `OH_SECRET_KEY` without retaining
the previous key can make stored OpenHands secrets unreadable.

Agent Canvas persists its generated session key at
`~/.openhands/agent-canvas/api-key.txt` with owner-only permissions. For the
standard loopback Agent Canvas backend on port `38100`, Avoozl discovers that
file automatically. No secret is copied into a workspace or repository.

Authenticate the Claude Code or Codex CLI normally, or configure its credentials
through OpenHands. Then let Avoozl create restricted, reusable Agent Profiles:

```sh
node cli.mjs openhands setup-agents
node cli.mjs openhands setup-agents --default codex
```

The command installs and enables the pinned Avoozl OpenHands plugin, verifies
both agents by default, prefers Codex when both work, and prints no credential
values. When Codex advertises GPT-6.1 Sol, new Avoozl installations select it
instead of an older Codex default. The plugin contains the Avoozl skill and a
run-scoped MCP template; it contains variable names, not credentials. Limit
setup with `--agents claude-code` or `--agents codex`. Use `--skip-verify` only
when installing profiles before the agent CLI is authenticated.

The managed profiles expose only the provider's standard credential names and
the two run-scoped Avoozl MCP capabilities. They do not encode a particular
credential source, cloud, company environment, or login workflow. Teammates can
therefore use personal API keys, CLI login, or their organization's supported
credential mechanism without changing Avoozl.

Start Avoozl after the profiles are ready:

```sh
node cli.mjs serve \
  --workspace /path/to/workspace \
  --canvas-origin http://127.0.0.1:38400
```

`AVOOZL_OPENHANDS_AGENT_PROFILE` can select a profile by name or stable ID.
Without it, Avoozl uses OpenHands' active Agent Profile. The older
`AVOOZL_OPENHANDS_MODEL`, `AVOOZL_OPENHANDS_LLM_API_KEY`, and
`AVOOZL_OPENHANDS_LLM_BASE_URL` settings remain a direct-agent compatibility
path when no Agent Profile is active.

For a separately managed Agent Server, set `AVOOZL_OPENHANDS_URL` and either
`AVOOZL_OPENHANDS_API_KEY` or `AVOOZL_OPENHANDS_API_KEY_FILE`. An explicitly
configured key always wins. Avoozl refuses symlinked, non-regular, empty, or
group/world-accessible key files.

The existing `AICOMMANDER_OPENHANDS_*` and `NUPP_WORKSPACE_OPENHANDS_*` prefixes
remain aliases. Instead of the CLI flag, the exact Canvas web origin can be set
with `AVOOZL_CANVAS_ORIGINS` or the workspace's `canvasOrigins` array. This is an
explicit browser-origin allowlist, not a wildcard CORS switch.

## Install the Canvas App

With the compatible Agent Server running, install the package from the Avoozl
checkout:

```sh
node cli.mjs openhands install-app
node cli.mjs openhands status
```

Installation copies the self-contained package through the Agent Server's
Canvas Extensions API, installs the same pinned Avoozl skill/plugin used by
conversations, and explicitly enables both. Running either installation command
again refreshes Avoozl's plugin while preserving each agent profile's model,
command, arguments, MCP references, and integration references. On Linux amd64
and arm64,
enabling also approves the exact declared artifact revision. OpenHands verifies
the checksum, allocates a loopback port and durable data directory, starts
`avoozl openhands serve-backend`, waits for `/api/health`, and owns the process
group and bounded logs. The launcher initializes an empty workspace only once
and requires the `avoozl` executable on the Agent Server's `PATH`.

Open **Avoozl** in Canvas. When the owned backend is supported, Canvas mounts it
through OpenHands' separate-origin, sandboxed App backend view. This secure view
is intentionally an iframe: the isolation boundary is what keeps its HttpOnly
session and backend origin out of the trusted extension's JavaScript realm.
Opening an OpenHands-owned run still navigates to Canvas's native conversation
page, so terminal, files, browser, chat, and steering remain OpenHands-owned.

OpenHands Agent Server 1.61.0 only manages Canvas App backend artifacts on
Linux. On macOS and Windows, start `avoozl serve` separately with the exact
Canvas origin allowed, then enter its loopback address once. Canvas still owns
the product UI; the separate process supplies only the API, MCP endpoint, and a
small recovery handoff. That path uses exact-origin CORS and never receives an
OpenHands or provider credential. Remove the separately managed backend when
OpenHands adds managed backend support for those platforms.

The App package lives in `canvas-app/` and is included in the npm package.
Canvas Apps execute as trusted same-realm code after enablement, so installation
must remain an explicit operator action.

## Authority and network boundary

- The local executor accepts only a loopback Agent Server URL.
- The managed Avoozl backend binds only the OpenHands-assigned loopback port.
- Backend artifacts are checksum-pinned to the exact enabled App revision.
- The secure App view uses a short-lived HttpOnly cookie scoped to Avoozl's
  ingress path; the URL contains no credential.
- The Avoozl HTTP server accepts cross-origin Canvas requests only from exact,
  configured origins.
- The reusable Agent Server key remains in the Avoozl server process.
- The browser receives an expiring capability bound to one Avoozl run and one
  OpenHands conversation. The proxy refuses general Agent Server settings,
  another conversation, secret changes, forks, children, and runtime
  reprovisioning.
- Ask and plan conversations receive only their narrow run-scoped Avoozl MCP
  capability. The embedded workspace proxy refuses mutating runtime routes.
- Avoozl registers no reusable privileged MCP endpoint in OpenHands settings.
  Each created or resumed conversation loads the pinned Avoozl plugin and
  receives a separately minted `AVOOZL_MCP_URL` and `AVOOZL_MCP_TOKEN`. The URL
  identifies one run; only the token hash is persisted by Avoozl.
- Every Avoozl-started conversation has a configured project workspace.
  Implementation receives an isolated task worktree. Ask conversations inspect
  the configured project checkout read-only and never receive an empty
  temporary workspace. Task and plan project associations are inherited; when
  multiple configured projects remain possible, the caller must choose one.
- New-task conversations may record the user's agreed request or append a
  proposal. They cannot approve, dispatch, integrate, or accept work.
- Implement sessions receive terminal, file-editor, and browser tools inside the
  exact Avoozl-created worktree.
- Each managed agent receives a separate expiring MCP bearer token. Only its hash
  is stored. The token is sent in an authorization header, never a URL.
- The run-scoped MCP policy is deny-by-default. It never grants plan approval,
  task acceptance, integration, project configuration, run dispatch, example
  seeding, or other control-plane operations.

An OpenHands `finished` event completes the conversation turn only. It does not
approve, validate, integrate, or accept the task.

OpenHands child conversations are normalized into durable Avoozl child runs.
They inherit the parent task and project association, retain their own
conversation ID and workspace, and open in Canvas's native conversation UI.
Nested children retain the full parent-run chain. Child completion is
observational only: it never integrates or accepts the parent task.

## Recovery and updates

Web reloads preserve the separate Avoozl agent host. Before changing host or
provider code:

```sh
node cli.mjs host drain --workspace /path/to/workspace
node cli.mjs host stop --workspace /path/to/workspace
node cli.mjs serve --workspace /path/to/workspace
```

Stop refuses while owned work is active. If the Agent Server or host disappears,
Avoozl records an active run as disconnected rather than inferring failure,
completion, or permission to create a replacement. Resume reattaches to the
recorded conversation and rotates its run-scoped MCP capability.

OpenHands is the product execution surface. Existing Codex and Claude run
records remain readable, but Avoozl does not present a second chat or execution
UI for them.
