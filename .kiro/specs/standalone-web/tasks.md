---
repo: avoozl
---
# Tasks: a standalone web view

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`SW1` to `SW12`, in `requirements.md`); `D` sections
refer to this spec's `design.md`, `R` numbers to
`.kiro/specs/avoozl/requirements.md`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders; Avoozl runs the repository's checks
(AGENTS.md). Before landing a task that touches the server, run the D10
search and explain every hit in the pull request.

Task IDs start with `sw-` so they never collide with the IDs
of the other specs.

## Phase 1: The page without Kiro Crew

- [x] `sw-1.1` One command dispatch for both servers [SW5.1, SW5.2, SW10.2, SW10.3] (§D4, §D9)
  - The app backend's tests pass; a test runs one write and one observe operation through the app backend and straight through `dispatchCommand` with an `owner-session` claim and gets the same results; an unoffered operation gets the same 403 message from both; each reader-using operation, run with its reader absent, returns a "Needs Kiro Crew" result and throws nothing; `workspaces.list` returns `host: "kirocrew"` from the app backend.
  - `src/app/api/command-dispatch.ts` holds the `/api/command` dispatch; the app backend calls it after `verifyPrincipal`; each Kiro Crew reader is optional in its `context`, and every operation that uses an absent one returns "Needs Kiro Crew"; `workspaces.list` reports `host`.
- [x] `sw-1.2` Kiro Crew's own parts at a pin, the host shim and the second bundle [SW1, SW2, SW6, SW12] (§D2, §D3, §D6, §D11)
  - The fetch refuses a tree whose digest differs, and the Kiro Crew bundle still builds with no source to fetch; no Kiro Crew file is in git and a compare of the cache with the release is clean; the contract test fails naming a moved path or export; the version test fails on a package that differs from the pin's lockfile; the build test fails on a file under `standalone/` that exports an SDK name, and the source test on a view importing a Kiro Crew file by path; the import-specifier fixture for `dist/index.mjs` matches; `host-classes.test.ts` runs against the built stylesheet with no skip and passes; the variable test finds every `var(--...)` name for the default palette in both modes; the script is within its budget and holds no dashboard module; the build lists every `<style>` text and fails on one built at run time; the release scan fails with a notice removed; the class check against the pin's own stylesheet, built without the Avoozl page, runs and fails on a planted class Kiro Crew lacks (SW12.9); `docs/workspaces.md` names the pin (SW12.8); the path scan finds no home folder or worktree path in `dist/standalone/`; screenshots of Home, Specs and Settings at 390 and 1280 px, light and dark, beside the same views in a running Kiro Crew at the pinned release, go to the owner.
  - `hosts/kirocrew/ui/kirocrew-pin.json` and `scripts/bundle/fetch-kirocrew-ui.ts`; `src/standalone/` with `main.tsx`, `host.ts` and `app.css`; `vite build --mode standalone` into `dist/standalone/` with aliases into the fetched source, the left-out table and the size budget; the packages Kiro Crew's parts import as UI dev dependencies at the pin's versions; the standalone header with the theme control and Sign out; Kiro Crew's notices in `THIRD_PARTY_NOTICES.md`.
- [x] `sw-1.3` The page server on loopback with the owner link, after sw-1.1, sw-1.2 [SW3, SW4, SW5.4, SW5.5] (§D5, §D10)
  - Tests on Linux, macOS and Windows: the listener's address is `127.0.0.1`; `--host` and `--bind` refuse to start; a taken `serve.port` exits with "port N is in use"; a link works once, fails after use and after 10 minutes with the same 403; the cookie has `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Domain`, and a port in its name; a POST with the cookie and no CSRF header, a wrong `Origin`, a missing `Origin`, `Sec-Fetch-Site: cross-site`, `text/plain`, and a `Host: evil.example:<port>` request are each refused with 403; `OPTIONS` gets 403; no response has an `Access-Control-Allow-*` header and every one has the SW4.8 headers; each app backend principal header and a bearer header with no cookie gets 401; a search of the log, `serve.json` and the database after the run finds no token, cookie or CSRF value; `avoozl link` with `AVOOZL_CHILD=1` is refused; the sandbox test shows the state folder outside a child's read and write roots.
  - `src/app/serve/serve-server.ts` and `src/app/serve/serve-auth.ts`; `avoozl link` in `src/app/commands/machine.ts`; `serve.json` and `serve.sqlite` in the machine state folder; the sandbox keeps that folder out of children's roots.
- [x] `sw-1.4` Open chat as a process session, Kiro Crew-only states and browser notices, after sw-1.3 [SW7, SW8, SW10.1, SW10.4] (§D7, §D9)
  - UI tests on the standalone page: Ask for help opens the dialog with the message and the `assist` role, and Start, with a fake `process` executor, records one read-only session request in the workspace root and shows its process view; `openChat` with `autoSend: true` starts nothing until Start; with no approved harness the dialog offers Copy and starts nothing; `session.open` from MCP and from an `agent-tool` principal is refused; every SW10.1 feature shows "Needs Kiro Crew" and no error; a role on the `kirocrew` executor with no Kiro Crew opens one Needs you item across three ticks; with notices on and a fake `Notification`, two new Needs you items give two notices and a reload gives none; screenshots go to the owner.
  - The Start a session dialog behind the chat launcher's navigation (SW1.5); the `session.open` operation (person-only) and the `assist` role with `prompts/assist.md`; "Needs Kiro Crew" states on the page from `workspaces.list`; Settings › Notifications on the standalone page; a role on `kirocrew` with no Kiro Crew waits with one Needs you item.
- [x] `sw-1.5` Each tick keeps the page up, after sw-1.3 [SW9] (§D8)
  - Tests: with `serve.enabled` a tick starts the server child and records its pid and port; a killed child is restarted on the same fixed port; the child prints no link; `avoozl status` shows the origin; `serve.*` in `.avoozl.json` is refused naming the key; the tick process itself has no listening socket.
  - `serve.enabled` and `serve.port` in the machine configuration schema; the tick starts, records and restarts `serve-main.ts`; `avoozl status` shows the origin.

- [x] `sw-p1` Proof: Avoozl runs a task end to end with no Kiro Crew, from its own page, after sw-1.1, sw-1.2, sw-1.3, sw-1.4, sw-1.5 [SW1 to SW10] (§D1, §D5, §D7)
  - Expected: (1) the page loads with no console error and no CSP report, in light and dark, and its buttons, cards, inputs and badges are Kiro Crew's own, with Kiro Crew's fonts and colors; (2) the task lands and the message reaches the child; (3) a read-only `assist` session starts and its view shows its log; (4) every attempt is refused and changes nothing; (5) the server comes back on the same port, the old session is gone and a new link signs in; `lsof` or `ss` shows only `127.0.0.1:<port>` listening for the server.
  - Expected result observed; receipt under `docs/evidence/`.
  - Setup: an isolated scratch workspace and a scratch repository with a bare remote, on a machine user with no Kiro Crew running and an approved Claude Code harness definition; `serve.enabled: true` with a fixed port.
  - Action: (1) run `avoozl link` and open the link in headless Chrome; (2) approve a one-task spec and let the `process` worker run it, watching its log tail and sending one message; (3) use Ask for help; (4) from a second page served on another `127.0.0.1` port, try a cross-origin `fetch` and a form POST to the command route, and replay the cookie with `curl` and no CSRF header; (5) stop the server and run a tick.
  - Failure means: a person without Kiro Crew still needs the CLI for a step, or the server accepts a caller other than the signed-in owner.
