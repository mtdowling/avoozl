# Design: a standalone web view

Requirements are in `requirements.md` (SW1 to SW12). Section numbers here
(D1 to D11) are this file's; `§` numbers refer to
`.kiro/specs/avoozl/design.md`.

## D1. Shape

```
Kiro Crew machine (unchanged)                 Machine without Kiro Crew
─────────────────────────────                 ─────────────────────────
Kiro Crew page (dist/index.mjs)               browser on the same machine
  │ host SDK (externals)                        │ http://127.0.0.1:<port>/apps/avoozl
  ▼                                             ▼
Kiro Crew gateway ── signed principal ──┐     avoozl serve  (serve-server.mjs)
                                        ▼       │ Host/Origin/CSRF/cookie checks (D5)
                              app-backend.mjs   │ principal = owner-session "local"
                                        │       ▼
                                        └──> command-dispatch.mjs (shared, D4)
                                                  │
                                              Operations (operations.mjs) ── SQLite
```

The views do not change. The page is built twice: once against the host SDK
as externals (today), once with Kiro Crew's own parts at the pin, React and
the icons bundled (D2, D3, D11). The new server checks its own owner session and hands the
same request to the same dispatch the app backend uses (D4).

| Part                                     | New or changed | Job                                                    |
| ---------------------------------------- | -------------- | ------------------------------------------------------ |
| `kirocrew-app/ui/src/standalone/main.tsx` | New            | Entry: Kiro Crew's provider, the page, the header       |
| `kirocrew-app/ui/src/standalone/host.ts`  | New            | The host shim: navigate, notify, CSRF header, theme     |
| `kirocrew-app/ui/src/standalone/app.css`  | New            | Imports Kiro Crew's stylesheet; adds the page to its scan |
| `kirocrew-app/ui/kirocrew-pin.json`       | New            | The pin: tag, commit, digest (D11)                      |
| `scripts/fetch-kirocrew-ui.mjs`           | New            | Fetches the pinned source to a cache and checks it      |
| `kirocrew-app/ui/vite.config.ts`          | Changed        | `--mode standalone` with aliases and no externals       |
| `scripts/build-kirocrew-app.mjs`          | Changed        | Runs the third build                                   |
| `src/app/api/command-dispatch.mjs`            | New            | The body of today's `/api/command` handler              |
| `src/app/executors/kirocrew/app-backend.mjs`                 | Changed        | Calls `command-dispatch.mjs`; behavior unchanged        |
| `src/app/serve/serve-server.mjs`                | New            | `avoozl serve`: listener, sign-in, static files         |
| `src/app/serve/serve-auth.mjs`                  | New            | Link tokens, sessions, CSRF, header checks              |
| `src/app/cli/cli.mjs`                         | Changed        | `serve`, `serve link`                                   |
| `src/app/executors/supervisor.mjs`                  | Changed        | Optional server child (D8)                              |

## D2. The host shim

Inside Kiro Crew, the host gives the page two modules and a stylesheet. The
standalone build gives it the same two modules from Kiro Crew's own source
(D11) and writes only what the host does around them.

- **The provider.** `main.tsx` mounts `App` inside Kiro Crew's
  `AppApiProvider` with `appName`, `appDisplayName`, `appVersion`,
  `allowedApiPaths` from `app.json`, `navigateFn`, `notifyFn` and a
  session key (S: the props the spike passed). The provider brings its own
  query client and identity context (S). Kiro Crew's i18n is started once,
  as its Storybook does.
- **Requests.** The provider's client has no setting for a base address or a
  fetch function (S). It calls `fetch` with a relative path, so
  `/apps/avoozl/api/command` reaches `avoozl serve` as it is. The entry
  wraps `fetch` once to add `X-Avoozl-CSRF`, read from
  `<meta name="avoozl-csrf">`, to requests for the server origin (SW1.4).
  `shareReads` and the Demo guard in `host.ts` wrap the client as they do
  in Kiro Crew.
- **Navigation.** `navigateFn` pushes a path under `/apps/avoozl` with
  `history.pushState` and dispatches `popstate`. The SDK's chat launcher
  sets a launch record and navigates to `/chat…` (S); the shim reads that
  record and opens the Start a session dialog (D7). The page's own in-page
  Back history stays as it is. The page accepts only a path under
  `/apps/<name>` as its base (S), which is where `avoozl serve` serves it.
- **Gateway routes.** The page also calls a few of Kiro Crew's own routes
  (models, reveal, chat slots, Spec Builder). `avoozl serve` answers each
  from the table of what needs Kiro Crew (D9): with Avoozl's own data where
  it has it, such as the harness list for models, and with "Needs Kiro
  Crew" otherwise.

Nothing here draws a button, a card or an input. The build test of SW1.7
fails if a file under `standalone/` exports one of the SDK's names.

## D3. The second bundle

`vite build --mode standalone` builds `src/standalone/main.tsx` with no
`rollupOptions.external`, into `dist/standalone/`, with `emptyOutDir:
false` like the panel build. Its aliases point the two SDK specifiers, and
the `@/` alias Kiro Crew's files use among themselves, into the fetched
source (D11).

**Only what the page reaches.** Kiro Crew's SDK entry file also re-exports
its chat panel, and that import reaches the whole dashboard: built whole,
the script was 27.7 MB (S). The build config answers those six chat
re-exports with an empty module, takes the UI parts from the two files that
define them, and loads English only. That left 32 Kiro Crew modules and a
script of 2.7 MB, 0.8 MB compressed, with a stylesheet of 0.4 MB (S). The
list of what is left out is one table in the build config, with the reason
for each line (SW12.3). The budget of SW2.6 is set from the first real
build and grows only in a change that says why.

**The stylesheet.** `app.css` is two lines: an import of Kiro Crew's
stylesheet entry, and one more source folder for it to scan, Avoozl's page.
Kiro Crew's own Tailwind then generates every class the page uses, with
Kiro Crew's tokens (S: no unstyled area in the views captured). Avoozl
writes no rule. `host-classes.test.mjs` runs against the built file with
no skip (SW2.3), and keeps running against a host's CSS when
`KIROCREW_HOST_CSS` is set.

**React.** One copy serves the page and Kiro Crew's parts. Both React
18.3.1, which Kiro Crew uses, and 19.3.1, which Avoozl's tests use, built
and rendered the same views (S). The standalone build takes the version the
pin's lockfile resolves, so it matches what the page runs on inside Kiro
Crew. Two views use a React 19 form of `<style>`; on React 18 the element
stays where it is written and the rule still applies (S), which is also
what happens inside Kiro Crew today.

The build test for SW2.2 records the sorted import specifiers of
`dist/index.mjs` and `dist/panel.mjs` in a fixture and requires the built
files to match. SW2.4 reuses the existing path scan the build already runs
for the Kiro Crew bundle (`preserveSymlinks`).

## D4. One dispatch

The handler in `startAppBackend` does, after the principal check: method
and path checks, JSON parse, `principalAllows`, input shape check, `demo.*`,
the demo workspace, then the workspace's `Operations`. That body moves to
`src/app/api/command-dispatch.mjs` as
`dispatchCommand({ claim, request, context })`, returning
`{ status, body }`. `context` holds the registry, demo state and the
optional Kiro Crew readers. The app backend calls it after
`verifyPrincipal`; `serve-server.mjs` calls it after `serve-auth.mjs`
passes, with `claim = { kind: "owner-session", ownerId: "local" }` and the
readers absent (SW5.1, SW10.2). The move is a refactor; the app backend's
tests pass unchanged.

Both servers may run on one machine at once. They share the workspace
database, whose writes already go through the store's locking and
`expectedRevision`.

## D5. Sign-in and request checks

`serve-auth.mjs` owns every check. Order for each request:

```
Host ok? ──no──> 403
OPTIONS? ──yes─> 403
/login?  ──yes─> token check ─ok─> new session, Set-Cookie, 303 /apps/avoozl
   │                          └bad─> 403 "This link is not valid. Run avoozl serve link."
cookie -> live session? ──no──> 401 (page: how to get a link; API: JSON)
POST?    ──yes─> Origin, Sec-Fetch-Site, Content-Type, X-Avoozl-CSRF ──bad─> 403
dispatch (D4) or static file (fixed list)
```


**Link records.** A link is 32 bytes from `crypto.randomBytes`, base64url.
Its SHA-256, creation time and used time go in a `serve_links` table in a
`serve.sqlite` file in the machine state folder (folder `0700`, file
`0600`). `avoozl serve` adds one at start and prints it;
`avoozl serve link` adds one and prints it (SW4.2). The server reads the
table at `/login`, so `serve link` needs no channel to the server. Used and
expired rows are deleted on each login. Comparison uses
`crypto.timingSafeEqual` on the hashes (SW4.1).

**Sessions.** Sessions live in the server's memory: the hash of the cookie
value, the CSRF token, start time and last-request time. A restart ends
them (SW4.4). Holding them in memory keeps cookie hashes off disk and makes
"stop the server" a complete sign-out.

**Why both a cookie and a CSRF header.** Browsers scope cookies by host, not
port (RFC 6265 §8.5), so any other server the owner opens on `127.0.0.1`
receives the Avoozl cookie. That server cannot read Avoozl's page, so it
cannot get the CSRF token, which reaches the page only inside HTML served
to a request that carried the cookie (SW4.6). A cross-site page cannot set
`Content-Type: application/json` or `X-Avoozl-CSRF` without a CORS
preflight, and the server answers `OPTIONS` with 403 and sends no CORS
header (SW4.7, SW4.8). The `Host` check stops DNS rebinding: a rebinding
page sends its own host name.

**Headers.** Every response gets the SW4.8 headers. React sets `style`
through the DOM, which `style-src 'self'` allows. The page has no inline
`<script>`. It renders `<style>` elements, each holding a constant text, so
the build lists those texts and the server sends one hash for each
(SW2.5, SW4.8); a view that builds a style text at run time fails the build.
Whether Kiro Crew's parts need anything more under this policy was not
checked in the spike (D11). The proof checks the browser console for
CSP reports.

**Logs.** The server logs method, path without query, status and time.
`/login` is logged as `/login` with no query (SW4.10).

## D6. Themes

There is no Avoozl theme. Kiro Crew's stylesheet defines every variable the
views read, for each of its palettes in light and dark, and selects one by
two attributes on `<html>` (S: `data-theme="<palette>-<mode>"` and
`data-mode`). The entry sets them: Kiro Crew's default palette, and the
mode from `prefers-color-scheme` or the person's choice. The spike set the
attributes by hand and did not use Kiro Crew's own theme hook; the build
task uses the hook if it stands alone and the same two attributes if it
does not.

The fonts are Kiro Crew's and come out of its stylesheet as bundle files
(S: eight font files, 129 kB). `avoozl serve` serves them, and `font-src
'self'` allows them.

The theme control sits in a thin standalone header with the Avoozl name,
the workspace picker the page already has, Sign out (`POST /logout`), the
notice area and the theme switch. The header is drawn with Kiro Crew's
parts. Kiro Crew's sidebar, top bar and chat are not here: the page's own
tabs are its navigation, as they are inside Kiro Crew.

## D7. Open chat on the standalone page

```
openChat({message, agent}) ─> Start a session dialog
     role  = map(agent) or "assist"          (Settings › Models gives harness, model)
     brief = message (editable)
Start ─> session.open {role, brief}          (person-only operation)
      ─> process executor ─> supervisor child in the workspace root, read-only
      ─> process view (Phase 50): status, log tail, cost, Send message, attach
```

`agent` names a Kiro Crew agent such as `avoozl-planner`; the map strips the
`avoozl-` prefix to get the role and falls back to `assist`. `assist` is a
new read-only role whose prompt says to answer and propose, never to edit
or save, matching the help skills (costs, rules, plugin), which never save.
`session.open` is person-only in `classifyOperation`, so the MCP server and
agent principals cannot call it.

With no approved harness, the dialog shows the message and a Copy button
and starts nothing (SW7.5).

## D8. Supervisor hosting

`serve.enabled` and `serve.port` are machine configuration keys, validated
with the other machine keys and refused in `.avoozl.json`. When enabled,
the supervisor starts `serve-main.mjs` as a child, like the tick and the
integrator, records its pid and port, and restarts it when it exits. The
supervised server prints no link; `avoozl serve link` makes one (SW9.2).
With a fixed `serve.port` the origin stays the same across restarts, so a
browser tab only needs a new link, not a new address.

A person who wants to look at a headless machine from their laptop is out
of scope. The docs say only that `avoozl serve` is local to its machine.

## D9. What needs Kiro Crew

| Feature                              | Without Kiro Crew                                   |
| ------------------------------------ | --------------------------------------------------- |
| `kirocrew` executor                  | "Needs Kiro Crew"; a pinned task waits (SW10.4)     |
| Side panel                           | Not built                                           |
| Notification channels                | Browser notices, optional (SW8)                     |
| Open chat, chat links                | Process session (D7)                                |
| Model list                           | Free text plus the harness definition's list        |
| Per-turn usage from Kiro Crew's log  | Process cost from the harness output only           |
| Send to Issue Radar, Radar reads     | "Needs Kiro Crew"                                   |
| Stop all agents for chats            | Process sessions stop through the supervisor        |

`instance.view` gains `host: "standalone" | "kirocrew"`, set by the server
that answers. The page reads it once per load (SW10.3).

## D10. Security review

This section follows the repository owner's exposure policy for anything
that listens on a socket.

**Exposure.** One listener, `127.0.0.1:<port>`, in `avoozl serve` or its
supervised child. There is no code path to any other address (SW3.1), and a
test checks the bound address on all three platforms (SW3.6). The
supervisor itself listens on nothing (SW9.4). No container, port publish,
tunnel, share or remote access is built (Out of scope).

**Callers on the same machine.** Any local process and any other local user
can open a TCP connection to the port. They are refused without a session
cookie (SW4.5), and a cookie needs a one-time link that is printed only to
the terminal that ran `avoozl serve` or `avoozl serve link`. The link
records are hashes in a `0600` file in a `0700` folder. A `process` child
cannot read that folder (SW5.5) and cannot run either command (SW3.7,
SW4.2).

**Callers in the owner's browser.** Other web pages are stopped by the
`Host` check (DNS rebinding), the `Origin` and `Sec-Fetch-Site` checks, the
JSON content type, the CSRF header and the absence of CORS (D5). Other
local servers that receive the cookie lack the CSRF token (D5).

**Authorization.** The signed-in browser is the owner: the same
`owner-session` the Kiro Crew gateway asserts today, through the same
`principalAllows` (SW5.1). There is no agent principal on this server
(SW5.4).

**Authentication mechanism.** The owner link is the loopback token pattern
that local developer servers such as Jupyter Server and VS Code's server
use: a random secret shown only on the owner's terminal, exchanged once
for a session cookie. The owner chose it for this spec. It is a secret
Avoozl makes itself, which is acceptable only because the listener is
loopback-only and serves one person. Any later spec that widens the bind
SHALL replace it with an identity provider native to the place Avoozl is
deployed, and SHALL NOT reuse the owner link for remote callers. The owner
confirms this choice when approving this spec.

**Data on screen.** The page shows what the Kiro Crew page shows today,
including local paths (Requirement 92.10 allows paths in the local app).
None of it leaves the machine through this server.

**Checks before landing each build task.** Search the repository for
`0.0.0.0`, `::`, `listen(`, `--host` and `Access-Control-Allow`; every hit
is loopback, a test, or explained in the pull request.

## D11. The pin, and what the spike showed

**Why this is not a fork.** A fork is Kiro Crew's code copied into Avoozl
and changed there. Here no Kiro Crew file is in this repository and none is
edited: the build reads the files of one named release, checks them against
a digest, and compiles them into the standalone bundle beside the page. It
is how a program uses a library. The difference from a usual library is
that Kiro Crew publishes no package for these parts (V: its `website/`
package is private and its docs say apps do not install the SDK), so the
build takes them from the source of a release, and the paths it relies on
are not a promised interface. SW12.4's contract test is the answer to that:
when a release moves one, the pin does not move until the build
configuration follows.

**What is fetched.** `kirocrew-pin.json` names the tag, the commit and a
digest. `scripts/fetch-kirocrew-ui.mjs` downloads that commit's archive
from the public repository into the machine's cache folder, keeps
`website/src`, the fonts under `website/public/fonts` with their license
files, the lockfile and Kiro Crew's `LICENSE` and `NOTICE`, and checks the
digest. The packages those files import are development
dependencies of `kirocrew-app/ui`, at the lockfile's versions (SW12.5), so
Kiro Crew's whole front end is not installed to build 32 of its modules.

**The spike, 2026-11-18.** One day, on a scratch copy outside git, against
Kiro Crew v0.12.2 and Avoozl at `750396e`.

| Question                                          | Seen                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Does the page render on Kiro Crew's real parts?   | Yes: Home, Settings › Workspaces and Settings › Models, light and dark, with demo data       |
| Was a Kiro Crew file edited?                      | No. A recursive compare of the copy with the release was clean                               |
| Was an Avoozl view edited?                        | No                                                                                           |
| React 18 or 19?                                   | Both built and rendered; see D3                                                              |
| What else came along?                             | An animation library, a class-merge helper, a query client, i18n, the icons; listed in D3    |
| Console errors in the built page?                 | None in the views captured                                                                   |
| Against the stand-in harness this repo has today? | The one visible difference was the badge, which the stand-in draws differently               |

**Not checked by the spike.** The task that builds this checks each one.

- The same views in a running Kiro Crew, side by side. The spike compared
  with this repository's stand-in harness, not with Kiro Crew's own page.
- Every view other than the three above, and the 390 and 768 px widths.
- Modals, navigation, the chat launcher and notices in use.
- The content security policy of SW4.8, with the style hashes.
- Kiro Crew's own theme hook, and three small stylesheets its entry file
  also loads.
- A build that installs only the needed packages; the spike installed Kiro
  Crew's whole front end.
- The font licenses: Kiro Crew's third-party notice file does not name its
  two bundled fonts, so SW12.6 reads their license files from the source.
