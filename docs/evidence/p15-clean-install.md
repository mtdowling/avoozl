# Proof P15 (approximate): open-source installation on a clean machine

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), proof
P15 [R24] (design §13). Approximated on the owner's Mac with a clean home, not
a fresh machine.

- App source: `kirocrew-native` at `a356449` for the first run; `task/p15`
  at `af14e7c` for the retry
- Kiro Crew: release build 0.12.2.3 (not the source checkout), kiro-cli 3.2.1
- Node v26.13.0, npm 11.20.0, macOS
- Recorded: 2026-11-12 16:40–17:15 UTC
- Verdict: **PASS after one repair and one retry.** Three findings, all fixed.

## Setup

| Item | Value |
|---|---|
| Profile | `HOME`, `KIROCREW_HOME`, `KIRO_HOME`, `KIROCREW_WORKSPACE`, `XDG_*`, `GH_CONFIG_DIR` all under `$TMPDIR/kc-p15` (`env.sh`). `KIROCREW_POD=1`, `KIROCREW_BIND=127.0.0.1` |
| PATH | `$TMPDIR/kc-p15/bin` (links to `node`, `npm`, `npx`, `kirocrew`, `kiro-cli`) then `/usr/bin:/bin:/usr/sbin:/sbin`. `command -v gh` finds nothing |
| GitHub | No `gh`, no `GH_TOKEN`, `GITHUB_TOKEN` or `AVOOZL_GITHUB_TOKEN`, no `~/.config/avoozl`, empty `GH_CONFIG_DIR` |
| Source | `git clone --branch kirocrew-native` of the local worktree into `$TMPDIR/kc-p15/src`; no `node_modules` copied. This stands in for the README's `git clone https://github.com/...` |
| Sign-in | `os-home` holds a copy of the P5 rerun profile's staged kiro-cli sign-in store. No sign-in link was needed |
| Gateway | `kirocrew gateway --test-mode --no-tunnel --approval yolo`, loopback only. The company edition defaults `tunnel.enabled` to true on a new profile; it was set to false before the first boot |

## README steps, word for word

| README step | Result |
|---|---|
| `npm ci` | exit 0 |
| `npm run build:kirocrew-app` | exit 0; `kirocrew-app/ui/dist/index.mjs` and `kirocrew-app/bin/lib` written |
| `kirocrew app install "$PWD/kirocrew-app"` | `installed avoozl v0.1.0`; Kiro Crew copied the package to `crew/apps/avoozl` |
| Review the trust request and enable in the App Store | The two requests the App Store sends: `POST /api/security/trusted-apps/avoozl`, then `POST /api/apps/avoozl/enable` with `grantsConsent {api: ["/apps/avoozl/api/*"]}` -> 3 agents, 1 skill, 1 cron, MCP server `avoozl:avoozl`, backend healthy on 127.0.0.1 |
| The Avoozl page appears | `GET /apps/avoozl/ui/dist/index.mjs` serves the page bundle; `POST /apps/avoozl/api/command` `workspaces.list` reaches the loopback backend through the gateway and returns an empty catalog |
| **Initialize new** with an ID and an absolute directory | `workspaces.init {id: plans, root: <home>/plans}` -> `.avoozl.json`, `.avoozl/local/workspace.sqlite`; no tasks, no repositories |
| `node cli.mjs init ~/plans2 --name "My plans"`, then **Add existing** | both succeed |
| `node cli.mjs project configure code ...` | repository `code` registered for a one-commit sample checkout |
| Plan a goal | See finding 2. The chat message the page drafts, plus a goal, sent to a new chat. The chat called `plans_workspace`, `plans_specs`, `plans_query`, `plans_duplicates`, a draft `avoozl-planner` session, `plans_create_plan`, a separate critique session, and `plans_lint_plan`. Spec `farewell-function`: one epic, two leaves, lint 0 errors, critique no findings. The chat did not approve |
| Approve | The Plans view's requests: `plan.preview` (revision 1), then `plan.approve {expectedHash: 6a785671…d330, expectedRevision: 1}` -> approval recorded; both leaves `planned` with `parent` set; `query --q 'ready:true'` lists both |
| `node cli.mjs query`, `show` | work |
| To update: pull, rebuild, `kirocrew app install` again | Refused; see finding 3. `kirocrew app update avoozl` (owner route `POST /api/apps/avoozl/update`) updated it; backend healthy, approval intact, tick `ok` |

## Checks

| Check | Result |
|---|---|
| App installs | pass |
| Page opens over the loopback backend | pass (bundle served, backend answers through the gateway's signed proxy). Not rendered in a browser |
| A new empty workspace initializes | pass |
| A local plan can be drafted and approved | pass |
| No default trigger rule | pass: `.avoozl.json` has no `github` key; `github.settings.get` -> `mode: null`, no repositories, no rules; `workspace.tick` -> no observe, dispatch or messages |
| GitHub reports unavailable with no `gh` or token | pass: `github.setup` -> step `token` failed, "GitHub authentication is unavailable. Run gh auth login or set AVOOZL_GITHUB_TOKEN." No GitHub request was made |
| Release scan on the built packages (with the local terms file) | first run: npm 127 files, app 112, 0 findings. After the fix: npm 203 files, app 113, 0 findings, 0 excluded |

## Findings and fixes

1. **The npm package could not run its app.** `kirocrew-app/bin/.gitignore`
   ignores `lib/`, and npm applies it, so the tarball had
   `kirocrew-app/bin/avoozl.mjs` but no `bin/lib`, and the launcher failed
   with `ERR_MODULE_NOT_FOUND`. Fix: `kirocrew-app/bin/.npmignore` so npm ships
   the built `lib/`; `release-scan.test.mjs` checks the npm file list holds it.
   Retry: the tarball from a clean clone of `task/p15` has `bin/lib`, and its
   `bin/avoozl.mjs mcp` answers `initialize`.
2. **README named a button that does not exist.** "Choose **Plan a goal**"
   is a card title; the button is **Open planning draft**, and approval is
   **Approve revision**. Fixed in the README's Plan section.
3. **README's update step is refused.** A second `kirocrew app install`
   answers "already installed … Update it in place instead". README now says
   `kirocrew app update avoozl`.

## Harness notes (not README findings)

- The agent shell runs inside a macOS Seatbelt sandbox, so enabling the app
  needed `agent.sandbox_allow_unsandboxed_exec: true`, as in P4 and P5.
- `kiro-cli` was linked into the test PATH; it is a Kiro Crew prerequisite.
- After an in-process gateway restart moved the ephemeral port, chat tool
  servers kept the old port. After a fresh gateway on a fixed port, tool
  servers in the pod profile fell back to the default port 5476, which is the
  owner's live gateway; it refused them (wrong internal credential), and
  nothing ran there. Setting `dashboard.url` and `KIROCREW_PORT` to the test
  port fixed it. This is a Kiro Crew pod-isolation issue worth reporting.
- With the gateway running, `kirocrew app install` from the sandboxed shell is
  refused ("could not verify this process as the local owner"); the owner
  HTTP routes were used instead.

## Not covered

Local delivery (P4/P5 flow) was not rerun: delivery stays off until
`.avoozl.json` sets it. Installing `gh` and running P7 on a public repository
was out of scope (no GitHub use). The App Store and Plans view were driven
through the routes their buttons call, not by clicks. A new workspace's
`.avoozl.json` still carries `port` and `host` from the old host server, and
a `plans/` documents folder the README layout does not show; neither breaks a
step.

## Source checks

`npm test` on `task/p15`: 494 of 494 pass; `git diff --check` clean.
