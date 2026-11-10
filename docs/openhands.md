# OpenHands executor

Avoozl can run implementation conversations through OpenHands while retaining
ownership of tasks, worktrees, validation, integration, and acceptance. The Agent
Server stays separate from the web process, so an Avoozl web reload does not
replace active work.

The normal UI direction is now an installable Avoozl page inside Agent Canvas.
The standalone site remains useful for compatibility, CLI-adjacent setup, and
providers other than OpenHands.

## Supported versions

The integration is pinned and checked as one compatibility set:

| Component                      | Version  |
| ------------------------------ | -------- |
| OpenHands Agent Server         | `1.61.0` |
| `@openhands/typescript-client` | `1.61.0` |
| `@openhands/agent-canvas`      | `1.38.0` |
| Avoozl OpenHands plugin        | `1.0.0`  |

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
OH_CONVERSATIONS_PATH=/absolute/path/to/openhands-state \
.openhands/bin/agent-server --host 127.0.0.1 --port 38100
```

Persist the generated keys in a permission-restricted machine-local secret store
if conversations must survive restarts. Changing `OH_SECRET_KEY` without retaining
the previous key can make stored OpenHands secrets unreadable.

Configure Avoozl in the environment of both the web process and its agent host:

```sh
export AVOOZL_OPENHANDS_URL=http://127.0.0.1:38100
export AVOOZL_OPENHANDS_API_KEY=the-session-api-key
export AVOOZL_OPENHANDS_MODEL=anthropic/claude-sonnet-4-5
export AVOOZL_OPENHANDS_LLM_API_KEY=the-provider-key
node cli.mjs serve --workspace /path/to/workspace
```

`AVOOZL_OPENHANDS_LLM_BASE_URL` optionally selects an OpenAI-compatible endpoint.
The existing `AICOMMANDER_OPENHANDS_*` and `NUPP_WORKSPACE_OPENHANDS_*` prefixes
remain aliases.

## Install the Canvas App

With the compatible Agent Server running, install the package from the Avoozl
checkout:

```sh
node cli.mjs openhands install-app
node cli.mjs openhands status
```

Installation copies the self-contained package through the Agent Server's
Canvas Extensions API and explicitly enables it. Open **Avoozl** in Canvas and
enter the loopback address printed by `avoozl serve`. That address is stored in
Canvas browser storage for the selected backend; no Avoozl, GitHub, or provider
credential is copied into the App.

On macOS and Windows, Avoozl remains a separately started local service because
the current managed Canvas backend artifact contract is Linux-only. The App
uses a direct loopback iframe deliberately: it does not guess a port, read
Canvas credentials, or proxy arbitrary requests through the Agent Server.
Opening an OpenHands-owned run sends only its conversation ID to the trusted
parent App, which navigates to Canvas's native conversation page. This prevents
a nested Canvas and leaves terminal, files, browser, chat, and steering native.

The App package lives in `canvas-app/` and is included in the npm package.
Canvas Apps execute as trusted same-realm code after enablement, so installation
must remain an explicit operator action.

## Authority and network boundary

- The local executor accepts only a loopback Agent Server URL.
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
