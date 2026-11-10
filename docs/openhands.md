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
| Avoozl OpenHands App           | `0.1.4`  |

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

Configure only the model credentials in the environment of both the web process
and its agent host:

```sh
export AVOOZL_OPENHANDS_MODEL=anthropic/claude-sonnet-4-5
export AVOOZL_OPENHANDS_LLM_API_KEY=the-provider-key
node cli.mjs serve \
  --workspace /path/to/workspace \
  --canvas-origin http://127.0.0.1:38400
```

For a separately managed Agent Server, set `AVOOZL_OPENHANDS_URL` and either
`AVOOZL_OPENHANDS_API_KEY` or `AVOOZL_OPENHANDS_API_KEY_FILE`. An explicitly
configured key always wins. Avoozl refuses symlinked, non-regular, empty, or
group/world-accessible key files.

`AVOOZL_OPENHANDS_LLM_BASE_URL` optionally selects an OpenAI-compatible endpoint.
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
Canvas Extensions API and explicitly enables it. On Linux amd64 and arm64,
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
Linux. On macOS and Windows, Avoozl retains the existing native React fallback:
start `avoozl serve` separately with the exact Canvas origin allowed, then enter
its loopback address once. That path uses exact-origin CORS and never receives an
OpenHands or provider credential. Remove the fallback when OpenHands adds
managed backend support for those platforms.

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
- Ask and plan sessions have no OpenHands terminal, file-editor, or browser tools.
  Their embedded workspace proxy also refuses mutating runtime routes.
- Implement sessions receive terminal, file-editor, and browser tools inside the
  exact Avoozl-created worktree.
- Each managed agent receives a separate expiring MCP bearer token. Only its hash
  is stored. The token is sent in an authorization header, never a URL.
- The run-scoped MCP policy is deny-by-default. It never grants plan approval,
  task acceptance, integration, project configuration, run dispatch, example
  seeding, or other control-plane operations.

An OpenHands `finished` event completes the conversation turn only. It does not
approve, validate, integrate, or accept the task.

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

OpenHands is an additional executor during migration. Codex and Claude remain
available, and existing run records are not converted.
