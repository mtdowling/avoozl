# Design: a standalone web view

Requirements are in `requirements.md` (SW1 to SW12). Section numbers here
(D1 to D11) are this file's; `§` numbers refer to
`.kiro/specs/avoozl/design.md`.

## D1. Shape

```text
Kiro Crew machine                             Machine without Kiro Crew
-----------------                             -------------------------
Kiro Crew page (dist/index.mjs)               browser on the same machine
  | host SDK (externals)                        | http://127.0.0.1:<port>/apps/avoozl
  v                                             v
Kiro Crew gateway -- signed principal --+     page server  (serve-server.ts)
                                        v       | Host/Origin/CSRF/cookie checks (D5)
                               app-backend.ts   | principal = owner-session "local"
                                        |       v
                                        +--> command-dispatch.ts (shared, D4)
                                                  |
                                              Operations (operations.ts) -- SQLite
```

The views are the same in both. The page is built twice: once against the
host SDK as externals, once with Kiro Crew's own parts at the pin, React and
the icons bundled (D2, D3, D11). The page server checks its own owner
session and hands the request to the same dispatch the app backend uses
(D4).

| Part                                            | Job                                                      |
| ----------------------------------------------- | -------------------------------------------------------- |
| `hosts/kirocrew/ui/src/standalone/main.tsx`     | Entry: Kiro Crew's provider, the page, the header        |
| `hosts/kirocrew/ui/src/standalone/host.ts`      | The host shim: navigate, notify, CSRF header, theme      |
| `hosts/kirocrew/ui/src/standalone/app.css`      | Imports Kiro Crew's stylesheet; adds the page to its scan |
| `hosts/kirocrew/ui/kirocrew-pin.json`           | The pin: tag, commit, digest (D11)                       |
| `scripts/bundle/fetch-kirocrew-ui.ts`           | Fetches the pinned source to a cache and checks it       |
| `hosts/kirocrew/ui/vite.config.ts`              | `--mode standalone` with aliases and no externals        |
| `scripts/bundle/build-standalone.ts`            | The standalone build, run by `build-kirocrew-app.ts`     |
| `src/app/api/command-dispatch.ts`               | The `/api/command` dispatch both servers call            |
| `src/app/executors/kirocrew/app-backend.ts`     | Calls `command-dispatch.ts` after `verifyPrincipal`      |
| `src/app/serve/serve-server.ts`                 | The page server: listener, sign-in, static files         |
| `src/app/serve/serve-auth.ts`                   | Link tokens, sessions, CSRF, header checks               |
| `src/app/commands/machine.ts`                   | `avoozl link`                                            |
| `src/app/executors/page-child.ts`               | Each tick keeps the server up (D8)                       |

## D2. The host shim

Inside Kiro Crew, the host gives the page two modules and a stylesheet. The
standalone build gives it the same two modules from Kiro Crew's own source
(D11) and writes only what the host does around them.

- **The provider.** `main.tsx` mounts `App` inside Kiro Crew's
  `AppApiProvider` with `appName`, `appDisplayName`, `appVersion`,
  `allowedApiPaths` from `app.json`, `navigateFn`, `notifyFn` and a
  session key. The provider brings its own query client and identity
  context. Kiro Crew's i18n is started once, as its Storybook does.
- **Requests.** The provider's client has no setting for a base address or a
  fetch function. It calls `fetch` with a relative path, so
  `/apps/avoozl/api/command` reaches the page server as it is. The entry
  wraps `fetch` once to add `X-Avoozl-CSRF`, read from
  `<meta name="avoozl-csrf">`, to requests for the server origin (SW1.4).
  `shareReads` in `host.ts` wraps the client as it does in Kiro Crew.
- **Navigation.** `navigateFn` pushes a path under `/apps/avoozl` with
  `history.pushState` and dispatches `popstate`. The SDK's chat launcher
  sets a launch record and navigates to `/chat...`; the shim reads that
  record and opens the Start a session dialog (D7). The page's own in-page
  Back history stays as it is. The page accepts only a path under
  `/apps/<name>` as its base, which is where the page server serves it.
- **Gateway routes.** The page also calls a few of Kiro Crew's own routes
  (models, reveal, chat slots, usage turns). The page server answers each in
  the shape the page reads, empty or with "Needs Kiro Crew" (D9).

Nothing here draws a button, a card or an input. The build test of SW1.7
fails if a file under `standalone/` exports one of the SDK's names.

## D3. The second bundle

`vite build --mode standalone` builds `src/standalone/main.tsx` with no
`rollupOptions.external`, into `dist/standalone/`. Its aliases point the two
SDK specifiers, and the `@/` alias Kiro Crew's files use among themselves,
into the fetched source (D11).

**Only what the page reaches.** Kiro Crew's SDK entry file also re-exports
its chat panel, and that import reaches the whole dashboard. The build
config answers those chat re-exports with an empty module, takes the UI
parts from the files that define them, and loads English only. The list of
what is left out is one table in the build config, with the reason for each
line (SW12.3). The budget of SW2.6 grows only in a change that says why.

**The stylesheet.** `app.css` is two lines: an import of Kiro Crew's
stylesheet entry, and one more source folder for it to scan, Avoozl's page.
Kiro Crew's own Tailwind then generates every class the page uses, with
Kiro Crew's tokens. Avoozl writes no rule. `host-classes.test.ts` runs
against the built file with no skip (SW2.3), and against a host's CSS when
`KIROCREW_HOST_CSS` is set.

**React.** One copy serves the page and Kiro Crew's parts. The standalone
build takes the version the pin's lockfile resolves, so it matches what the
page runs on inside Kiro Crew.

The build test for SW2.2 records the sorted import specifiers of
`dist/index.mjs` in a fixture (`hosts/kirocrew/ui/test/bundle-imports.json`)
and requires the built file to match. SW2.4 reuses the path scan the build
runs for the Kiro Crew bundle (`preserveSymlinks`).

## D4. One dispatch

`dispatchCommand({ claim, request, context })` in
`src/app/api/command-dispatch.ts` does the method and path checks, the JSON
parse, `principalAllows`, the input shape check, then the workspace's
`Operations`, and returns `{ status, body }`. `context` holds the registry
and the optional Kiro Crew readers. The app backend calls it after
`verifyPrincipal`; `serve-server.ts` calls it after `serve-auth.ts` passes,
with `claim = { kind: "owner-session", ownerId: "local" }` and the readers
absent (SW5.1, SW10.2).

Both servers may run on one machine at once. They share the workspace
database, whose writes go through the store's locking and
`expectedRevision`.

## D5. Sign-in and request checks

`serve-auth.ts` owns every check. Order for each request:

```text
Host ok? --no--> 403
OPTIONS? --yes-> 403
/login?  --yes-> token check -ok-> new session, Set-Cookie, 303 /apps/avoozl
   |                          +bad-> 403 "This link is not valid. Run avoozl link."
cookie -> live session? --no--> 401 (page: how to get a link; API: JSON)
POST?    --yes-> Origin, Sec-Fetch-Site, Content-Type, X-Avoozl-CSRF --bad-> 403
dispatch (D4) or static file (fixed list)
```

**Link records.** A link is 32 bytes from `crypto.randomBytes`, base64url.
Its SHA-256, creation time and used time go in a `serve_links` table in a
`serve.sqlite` file in the machine state folder (folder `0700`, file
`0600`). `avoozl link` adds one and prints it (SW4.2). The server reads the
table at `/login`, so `avoozl link` needs no channel to the server. Used and
expired rows are deleted on each login. Comparison uses
`crypto.timingSafeEqual` on the hashes (SW4.1).

**Sessions.** Sessions live in the server's memory: the hash of the cookie
value, the CSRF token, start time and last-request time. A restart ends
them (SW4.4). Holding them in memory keeps cookie hashes off disk and makes
"stop the server" a complete sign-out.

**Cookie and CSRF header.** Browsers scope cookies by host, not port (RFC
6265 §8.5), so any other server the owner opens on `127.0.0.1` receives the
Avoozl cookie. That server cannot read Avoozl's page, so it cannot get the
CSRF token, which reaches the page only inside HTML served to a request that
carried the cookie (SW4.6). A cross-site page cannot set
`Content-Type: application/json` or `X-Avoozl-CSRF` without a CORS
preflight, and the server answers `OPTIONS` with 403 and sends no CORS
header (SW4.7, SW4.8). The `Host` check stops DNS rebinding: a rebinding
page sends its own host name.

**Headers.** Every response gets the SW4.8 headers. React sets `style`
through the DOM, which `style-src 'self'` allows. The page has no inline
`<script>`. It renders `<style>` elements, each holding a constant text, so
the build lists those texts and the server sends one hash for each
(SW2.5, SW4.8); a view that builds a style text at run time fails the build.

**Logs.** The server logs method, path without query, status and time.
`/login` is logged as `/login` with no query (SW4.10).

## D6. Themes

There is no Avoozl theme. Kiro Crew's stylesheet defines every variable the
views read, for each of its palettes in light and dark, and selects one by
two attributes on `<html>`: `data-theme="<palette>-<mode>"` and
`data-mode`. `applyTheme` in `host.ts` sets them: Kiro Crew's default
palette, and the mode from `prefers-color-scheme` or the person's choice.

The fonts are Kiro Crew's and come out of its stylesheet as bundle files.
The page server serves them, and `font-src 'self'` allows them.

The theme control sits in a thin standalone header with the Avoozl name,
the workspace picker the page has, Sign out (`POST /logout`), the notice
area and the theme switch. The header is drawn with Kiro Crew's parts. Kiro
Crew's sidebar, top bar and chat are not here: the page's own tabs are its
navigation, as they are inside Kiro Crew.

## D7. Open chat on the standalone page

```text
openChat({message, agent}) -> Start a session dialog
     role  = map(agent) or "assist"          (Settings › Models gives harness, model)
     brief = message (editable)
Start -> session.open {role, brief}          (person-only operation)
      -> process executor -> process child in the workspace root, read-only
      -> process view: status, log tail, cost, Send message, attach
```

`agent` names a Kiro Crew agent such as `avoozl-reviewer`; `roleFor` in
`src/app/sessions/session-open.ts` strips the `avoozl-` prefix to get the
role and falls back to `assist`. `assist` is a read-only role whose prompt
says to answer and propose, never to edit or save. `session.open` is
person-only, so the MCP server and agent principals cannot call it.

With no approved harness, the dialog shows the message and a Copy button
and starts nothing (SW7.5).

## D8. The tick keeps the page up

`serve.enabled` and `serve.port` are machine configuration keys, validated
in `src/app/settings/serve-config.ts` and refused in `.avoozl.json`. When
enabled, each `avoozl tick` starts `serve-main.ts` detached when it does not
run, records its pid, start time and port in `supervisor/page.json` in the
machine state folder, starts it again once it has exited, and stops it when
the setting is off or the port changed (machine-server D8). The server
prints no link; `avoozl link` makes one (SW9.2). With a fixed `serve.port`
the origin stays the same across restarts, so a browser tab only needs a new
link, not a new address.

The page is local to its machine.

## D9. What needs Kiro Crew

| Feature                              | Without Kiro Crew                                   |
| ------------------------------------ | --------------------------------------------------- |
| Kiro Crew chat harness               | "Needs Kiro Crew"; the role waits (SW10.4)          |
| Notification channels                | Browser notices, optional (SW8)                     |
| Open chat, chat links                | Process session (D7)                                |
| Model list, reveal                   | Empty, or "Needs Kiro Crew"                         |
| Per-turn usage from Kiro Crew's log  | Process cost from the harness output only           |
| Stop all agents for chats            | "Needs Kiro Crew"                                   |

`workspaces.list` carries `host: "standalone" | "kirocrew"`, set by the
server that answers. The page reads it once per load (SW10.3).

## D10. Security review

This section follows the repository owner's exposure policy for anything
that listens on a socket.

**Exposure.** One listener, `127.0.0.1:<port>`, in the page server a tick
starts. There is no code path to any other address (SW3.1), and a test
checks the bound address on all three platforms (SW3.6). The tick itself
listens on nothing (SW9.4). No container, port publish,
tunnel, share or remote access is built (Out of scope).

**Callers on the same machine.** Any local process and any other local user
can open a TCP connection to the port. They are refused without a session
cookie (SW4.5), and a cookie needs a one-time link that is printed only to
the terminal that ran `avoozl link`. The link
records are hashes in a `0600` file in a `0700` folder. A `process` child
cannot read that folder (SW5.5) and cannot run `avoozl link` (SW3.7,
SW4.2).

**Callers in the owner's browser.** Other web pages are stopped by the
`Host` check (DNS rebinding), the `Origin` and `Sec-Fetch-Site` checks, the
JSON content type, the CSRF header and the absence of CORS (D5). Other
local servers that receive the cookie lack the CSRF token (D5).

**Authorization.** The signed-in browser is the owner: the same
`owner-session` the Kiro Crew gateway asserts, through the same
`principalAllows` (SW5.1). There is no agent principal on this server
(SW5.4).

**Authentication mechanism.** The owner link is the loopback token pattern
that local developer servers such as Jupyter Server and VS Code's server
use: a random secret shown only on the owner's terminal, exchanged once
for a session cookie. It is a secret
Avoozl makes itself, which is acceptable only because the listener is
loopback-only and serves one person. Any spec that widens the bind
SHALL replace it with an identity provider native to the place Avoozl is
deployed, and SHALL NOT reuse the owner link for remote callers.

**Data on screen.** The page shows what the Kiro Crew page shows,
including local paths (Requirement 92.10 allows paths in the local app).
None of it leaves the machine through this server.

**Checks before landing each build task.** Search the repository for
`0.0.0.0`, `::`, `listen(`, `--host` and `Access-Control-Allow`; every hit
is loopback, a test, or explained in the pull request.

## D11. The pin

**Not a fork.** A fork is Kiro Crew's code copied into Avoozl and changed
there. Here no Kiro Crew file is in this repository and none is edited: the
build reads the files of one named release, checks them against a digest,
and compiles them into the standalone bundle beside the page. Kiro Crew
publishes no package for these parts, so the build takes them from the
source of a release, and the paths it relies on are not a promised
interface. SW12.4's contract test covers that: when a release moves one,
the pin does not move until the build configuration follows.

**What is fetched.** `kirocrew-pin.json` names the repository, the tag, the
commit and a digest. `scripts/bundle/fetch-kirocrew-ui.ts` makes a partial,
sparse checkout of that commit from the public repository into the
machine's cache folder, keeping `website/src`, the fonts under
`website/public/fonts` with their license files, the lockfile and Kiro
Crew's `LICENSE` and `NOTICE`, and checks the digest. The packages those
files import are development dependencies of `hosts/kirocrew/ui`, at the
lockfile's versions (SW12.5), so Kiro Crew's whole front end is not
installed to build the modules the page reaches.
