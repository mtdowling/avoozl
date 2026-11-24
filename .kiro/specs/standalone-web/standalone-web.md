---
repo: avoozl
category: Planning
---

# A standalone web view

## Requirements

### Introduction

This spec lets a person who runs Avoozl with Claude Code, Codex or another
agent CLI, and no Kiro Crew, use the Avoozl page in a browser. Avoozl
serves the page itself, on `127.0.0.1` only, behind a one-time owner link:
with `serve.enabled`, each `avoozl tick` keeps the page's server up.

The page looks exactly as it does in Kiro Crew and is not a fork: it is
built with Kiro Crew's own UI parts, SDK provider and stylesheet, unmodified,
at a pinned release (SW12).

#### What this builds on

`.kiro/specs/avoozl/` is the product spec. This spec reuses the operation
set in `src/app/api/operations.ts` and adds no operation for agents.

#### Scope

- One person, on the machine that runs Avoozl, in a browser on that same
  machine.
- The page Kiro Crew shows, every view, with the Kiro Crew-only parts
  shown as unavailable (SW10).
- Kiro Crew's own install keeps working. A machine may run both; they share
  the workspace database.

#### Out of scope

- Remote access of any kind. The page's server binds `127.0.0.1` only and has no
  option to bind anything else. No tunnel, relay, share link, reverse proxy
  support or TLS is built here.
- A second set of views. The standalone page is the same React views built a
  second way, not a new design.
- Agents using the web page. Agents keep the MCP server and the CLI (SW5.4).
- A Kiro Crew chat stand-in. Open chat becomes a process session (SW7); it is
  not a chat UI.
- Several people on one server. There is one owner.
- Kiro Crew's own shell: its sidebar, top bar, chat and toasts. The
  standalone page is the Avoozl page, with Kiro Crew's parts and look, under
  a thin Avoozl header.

#### Words

| Word             | Meaning                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Kiro Crew page   | The Avoozl page, `hosts/kirocrew/ui/dist/index.mjs`, rendered inside Kiro Crew                             |
| Standalone page  | The same views built with Kiro Crew's own parts at the pin and served by Avoozl's page server             |
| Host shim        | Avoozl's code on the host side of the SDK: the provider's props, navigation, one request header, the theme |
| Pin              | The Kiro Crew release whose source the standalone build uses, named with a digest (SW12)                  |
| Owner link       | A one-time `http://127.0.0.1:<port>/login?token=...` URL that signs the browser in                        |
| Session cookie   | The cookie the owner link sets; it names one server-side browser session                                 |
| CSRF token       | A per-session random value the page sends in a header on every write                                     |
| Server origin    | `http://127.0.0.1:<port>`, exactly                                                                        |


#### Requirement SW1: One host seam, with Kiro Crew's own parts

**User story:** As the owner, I want the standalone page to look exactly as
it does in Kiro Crew, so that there is one look to learn and none to
maintain.

##### Acceptance criteria

1. The standalone build SHALL resolve `@kirocrew/app-sdk` and
   `@kirocrew/app-sdk/ui` to Kiro Crew's own source files at the pin
   (SW12), unmodified. Avoozl SHALL write no component, hook or style rule
   that stands in for one of theirs.
2. The standalone build SHALL reach those files by module alias. No view
   file SHALL change, import a Kiro Crew file by path, or test which host it
   runs in; only `host.ts`, the build config and the standalone entry MAY
   know.
3. Avoozl SHALL write only the host shim. The standalone entry SHALL mount
   the page inside Kiro Crew's own `AppApiProvider`, giving it the app's
   name and version, the allowed API paths from `app.json`, a navigate
   function and a notify function.
4. The SDK's client sends each request with `fetch` and a relative path.
   The standalone entry SHALL add the CSRF header (SW4.6) to requests
   for the server origin, and SHALL change nothing else about a request or
   its reply, so a non-2xx reply reaches a view exactly as it does in Kiro
   Crew.
5. The navigate function SHALL move between the page's own paths under
   `/apps/avoozl` with the History API. A path under `/chat`, which the
   SDK's chat launcher asks for, SHALL open the Start a session dialog
   (SW7). Any other path SHALL do nothing and log one line.
6. The notify function SHALL show the notice in the standalone header.
7. A build test SHALL fail when a file under
   `hosts/kirocrew/ui/src/standalone/` exports a name that
   `@kirocrew/app-sdk` or `@kirocrew/app-sdk/ui` exports, and a source
   test SHALL fail when a view imports a Kiro Crew file by path.

#### Requirement SW2: A second bundle

**User story:** As the maintainer, I want the standalone page built as its
own files, so that the Kiro Crew bundle stays exactly as it is.

##### Acceptance criteria

1. `npm run build` SHALL build the standalone page as well, into
   `hosts/kirocrew/ui/dist/standalone/`: one `index.html`, its script, one
   stylesheet and its fonts, with React, the `lucide-react` icons the page
   uses and the Kiro Crew modules the page reaches bundled in. React SHALL
   be the version the pin's own lockfile resolves, one copy for the page
   and Kiro Crew's parts. `dist/` stays out of git (AGENTS.md).
2. The Kiro Crew bundle (`dist/index.mjs`) SHALL keep its externals and
   SHALL contain none of the standalone entry's code. A build test SHALL
   compare the bundle's import specifiers with a recorded fixture and
   require them equal.
3. The standalone stylesheet SHALL be built from Kiro Crew's own stylesheet
   source at the pin, with the Avoozl page's sources added to what it scans
   for class names, and with no rule of Avoozl's own. The class check in
   `hosts/kirocrew/ui/test/host-classes.test.ts` SHALL run against it on
   every test run, with no skip, and SHALL fail on a class it lacks.
4. The standalone files SHALL hold no absolute machine path, user name or
   host name. A build test SHALL scan them for the build machine's home
   folder and the worktree path.
5. The standalone script SHALL load as same-origin files with no inline
   script. Each `<style>` element the page renders SHALL be one the policy
   of SW4.8 allows by hash.
6. The standalone script SHALL hold only the Kiro Crew modules the page's
   imports need, not Kiro Crew's dashboard. What is left out SHALL be left
   out by build configuration alone (SW12.3). The build SHALL fail when the
   script grows past a budget written down in the build config.

#### Requirement SW3: The page's server on loopback only

**User story:** As the owner, I want the page served only to my own machine,
so that nobody on my network can reach Avoozl.

##### Acceptance criteria

1. The page's server (`src/app/serve/serve-main.ts`, which a tick starts
   with `serve.enabled`) SHALL listen on `127.0.0.1` only. It SHALL have no
   host or bind option and SHALL read no environment variable for one.
2. With no `serve.port`, or port 0, the server SHALL take a random free
   port. With `serve.port` N (1024 to 65535) it SHALL take that port or exit
   with "port N is in use" and not try another.
3. The server SHALL serve the standalone files at `/apps/avoozl` and below,
   SHALL redirect `/` to `/apps/avoozl`, and SHALL answer
   `POST /apps/avoozl/api/command` with the same dispatch the app backend
   runs for an `owner-session` (SW5). Any other path SHALL get 404.
4. Static files SHALL come from a fixed list of the built files, by name.
   No request path SHALL be joined to a folder.
5. On start the server SHALL print its origin, and SHALL write its origin,
   port and pid to `serve.json` in the machine state folder with mode
   `0600`. It SHALL NOT write a link or any token to that file or to a log.
6. A test on Linux, macOS and Windows SHALL start the server and check that
   the listening socket's address is `127.0.0.1` and no other.
7. `avoozl link` SHALL be refused in a `process` child
   (`AVOOZL_CHILD=1`), as a person-only command.

#### Requirement SW4: The owner signs in with a one-time link

**User story:** As the owner, I want my browser signed in from my terminal,
and every other caller refused, so that another local program or a web page
I visit cannot drive Avoozl.

##### Acceptance criteria

1. An owner link SHALL carry 32 random bytes from the operating system's
   secure random source, base64url encoded. It SHALL work once and SHALL
   expire 10 minutes after it was made. The server SHALL keep only a SHA-256
   hash of it and SHALL compare hashes in constant time.
2. `avoozl link` SHALL make a new owner link for the running server and
   print it to the terminal that ran it. It SHALL be refused in a `process`
   child.
3. `GET /login?token=...` with a valid, unused, unexpired token SHALL mark the
   token used, start a browser session, set the session cookie and redirect
   with 303 to `/apps/avoozl`. Any other token SHALL get 403 with one fixed
   message and no cookie, and the response SHALL NOT say whether the token
   was unknown, used or expired.
4. The session cookie SHALL be `HttpOnly`, `SameSite=Strict`, `Path=/`, with
   no `Domain`, and its name SHALL include the port. Its value SHALL be 32
   random bytes; the server SHALL keep only its hash. A session SHALL end
   after 12 hours with no request and 7 days after it began, and when the
   server stops.
5. Every request other than `/login` SHALL need a live session cookie. A
   page request without one SHALL get a page that says to run
   `avoozl link`, with status 401; an API request without one SHALL
   get 401 JSON.
6. Every `POST` SHALL also need the header `X-Avoozl-CSRF` equal to the
   session's CSRF token. The CSRF token SHALL be 32 random bytes made with
   the session, SHALL reach the page only in the HTML of a page request that
   carried the session cookie, and SHALL never be set as a cookie. A cookie
   alone SHALL NOT be enough for any write. (Browsers send `127.0.0.1`
   cookies to every port, so another local server the owner visits can
   receive the cookie; it cannot read the page's CSRF token.)
7. The server SHALL refuse with 403, before any other work:
   - a `Host` header other than `127.0.0.1:<port>` or `localhost:<port>`
     (DNS rebinding);
   - a `POST` whose `Origin` is missing or is not the server origin
     (`localhost:<port>` counts as the same server);
   - a `POST` whose `Sec-Fetch-Site` header, when present, is not
     `same-origin`;
   - a `POST` whose `Content-Type` is not `application/json`;
   - any `OPTIONS` request.
8. The server SHALL send no `Access-Control-Allow-*` header on any response.
   Every response SHALL carry `Content-Security-Policy: default-src 'none';
   script-src 'self'; style-src 'self' <hashes>; img-src 'self' data:; font-src
   'self'; connect-src 'self'; base-uri 'none'; form-action 'self';
   frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: no-referrer` and, for API replies and the login reply,
   `Cache-Control: no-store`. `<hashes>` is one `'sha256-...'` source for
   each style text the build lists (SW2.5), and nothing wider:
   `'unsafe-inline'` SHALL NOT appear.
9. `POST /logout` with a valid CSRF header SHALL end the session and clear
   the cookie.
10. No token, cookie value or CSRF token SHALL appear in a log, an
    error message, `serve.json`, the workspace database, or any GitHub write.
11. A request body over the app backend's limit SHALL get 413, as the app
    backend does.

#### Requirement SW5: The local owner is the owner

**User story:** As the owner, I want the standalone page to let me do what
the Kiro Crew page lets me do, and no more, and agents to stay off it.

##### Acceptance criteria

1. A request with a valid session and CSRF token SHALL be dispatched as the
   principal `{ kind: "owner-session", ownerId: "local" }` through the same
   `principalAllows` and operation dispatch as the app backend. The two
   servers SHALL share one dispatch function; a test SHALL run one write and
   one observe operation through each and require the same results.
2. An operation the app backend does not offer SHALL be refused with the
   same 403 message.
4. The standalone server SHALL offer no `app-token` or `agent-tool`
   principal and SHALL accept no bearer token or other credential header. Agents keep the
   MCP server and the CLI, and the CLI works on the workspace database
   directly and takes no `--url`. A
   test SHALL send a request with each of the app backend's principal
   headers, a bearer header and a made-up credential header, and no
   session cookie, and require 401.
5. The process sandbox SHALL keep the machine state folder, which holds
   `serve.json` and the link records, outside every `process` child's read
   and write roots. A sandbox test SHALL check it.

#### Requirement SW6: Kiro Crew's themes

**User story:** As the owner, I want the standalone page to have the colors
and type it has in Kiro Crew, in light and dark, so that it is the same
page.

##### Acceptance criteria

1. Colors, type, spacing and every CSS variable the page reads SHALL come
   from Kiro Crew's stylesheet at the pin. Avoozl SHALL define no theme
   variable and no font.
2. The standalone entry SHALL set the theme attributes on `<html>` the way
   Kiro Crew does (`data-theme` as palette and mode, and `data-mode`), with
   Kiro Crew's default palette, following `prefers-color-scheme`. A
   control in the standalone header MAY set light, dark or system, and MAY
   offer the other palettes the stylesheet has. The choice SHALL be kept in
   the browser's local storage.
3. A test SHALL list every `var(--...)` name used under
   `hosts/kirocrew/ui/src` and fail when the built stylesheet lacks one for
   the default palette in either mode.
4. The page's server SHALL serve the fonts the stylesheet uses from the
   bundle. The page SHALL request no font the bundle does not hold.

#### Requirement SW7: Open chat becomes a process session

**User story:** As the owner, I want every Ask for help and Open chat button
to still do something useful without Kiro Crew.

##### Acceptance criteria

1. On the standalone page, `useChatLauncher().openChat({ message, agent,
   autoSend })` SHALL open a Start a session dialog with the message in an
   editable box, the role it maps to, and the harness Settings › Models picks
   for that role. Start SHALL run the person-only operation `session.open`,
   which asks the `process` executor for a session in the workspace root
   with the message as its brief, and SHALL then show that session's
   process view.
2. A session started this way SHALL use the read-only permission class
   unless its role is a write role in Settings › Models. Its role SHALL
   default to `assist`, a read-only role with its prompt in
   `prompts/assist.md`.
3. `openChat({ slotKey })` for an existing session SHALL show that
   session's process view when it is a `process` session, and SHALL say
   "This is a Kiro Crew chat; open it in Kiro Crew" otherwise.
4. The process view SHALL show the session's status, log tail, cost when
   known, Send message and the copyable attach command.
5. With no approved harness definition on the machine, the dialog SHALL say
   so, link to Settings › Models, and offer Copy message so the person can
   paste it into their own CLI. It SHALL start nothing.
6. `autoSend: true` SHALL NOT start a session without a click on the
   standalone page.

#### Requirement SW8: Needs you in the browser (optional)

**User story:** As the owner, I want a browser notice when Avoozl needs me,
if I turn it on, so that I can leave the tab in the background.

##### Acceptance criteria

1. Browser notices SHALL be off by default. Settings › Notifications on the
   standalone page SHALL turn them on, and only a click SHALL ask the
   browser for permission.
2. When on, the page SHALL show one notice for each new Needs you item it
   sees in `conflicts.view`, with the item's title and no path, and a click
   SHALL open that item. An item SHALL be noticed once per browser.
3. The page SHALL read Needs you no more often than the Kiro Crew page
   does, and only while it is open. No server push, service worker or
   background sync SHALL be built.
4. With permission denied, the setting SHALL say so and the page SHALL keep
   working.

#### Requirement SW9: Each tick keeps the page up

**User story:** As the owner of a machine with no Kiro Crew, I want the page
kept up by the tick, so that I do not keep a terminal open for it.

##### Acceptance criteria

1. With `serve.enabled: true` (and an optional `serve.port`) in the machine
   configuration, each `avoozl tick` SHALL start the server detached when it
   does not run, start it again once it has exited, stop it when the setting
   is off or the port changed, and record its pid, start time and port
   (machine-server MS3.4). The keys SHALL be refused in `.avoozl.json`.
2. The server SHALL print no link. The owner SHALL get one with
   `avoozl link` at that machine's own shell.
3. `avoozl status` SHALL show whether the server runs and its origin.
4. The tick process itself SHALL listen on no socket; only the server it
   starts does, under SW3 and SW4.

#### Requirement SW10: Say what needs Kiro Crew

**User story:** As the owner, I want the page to say plainly what needs Kiro
Crew, so that I do not look for a feature that cannot work.

##### Acceptance criteria

1. These SHALL NOT work without Kiro Crew, and the standalone page SHALL show
   each as unavailable with the reason "Needs Kiro Crew", never as an error:
   the Kiro Crew chat harness in Settings › Models; opening a Kiro Crew chat;
   Kiro Crew's model list; Reveal in the file manager; Stop all agents for
   Kiro Crew chats.
2. The app backend's Kiro Crew readers (`notifier`, `slotReader`,
   `rowReader`, `sessionStopper`) SHALL be absent in the standalone server,
   and every operation that uses one SHALL return a result that says "Needs
   Kiro Crew", not throw. A test SHALL run each such operation with the
   readers absent.
3. `workspaces.list` SHALL report the host as `standalone` or `kirocrew`,
   and the page SHALL read SW10.1's states from it, not from the build.
4. A role set to the `kirocrew` executor on a machine with no Kiro Crew
   SHALL wait with one Needs you item for that role. It SHALL NOT fall back
   to another executor by itself.

#### Requirement SW12: Kiro Crew's parts as a pinned, unmodified dependency

**User story:** As the maintainer, I want Kiro Crew's parts to be a
dependency Avoozl names and checks, so that the standalone page is not a
fork and a new Kiro Crew release is one change.

##### Acceptance criteria

1. One file in this repository SHALL name the pin: the Kiro Crew release
   tag, its commit, and a digest of the source tree the build uses. No Kiro
   Crew source file SHALL be committed to this repository.
2. The standalone build SHALL fetch that source from Kiro Crew's public
   repository into a cache outside git and SHALL check the digest before it
   reads a file. A machine that has the source already MAY name its folder;
   the digest is checked the same way. When the source cannot be had, the
   standalone build SHALL fail saying so, and the Kiro Crew bundle SHALL
   still build.
3. The build SHALL NOT edit a fetched file. What the page does not need
   SHALL be left out by build configuration: an alias or an empty module,
   each listed in one place with the reason.
4. A contract test SHALL list every Kiro Crew path and export the build
   depends on, and SHALL fail naming the missing one, so a release that
   moves a file fails on that line and nowhere else.
5. The packages Kiro Crew's parts import SHALL be installed at the versions
   the pin's lockfile resolves, and a test SHALL compare them.
6. The standalone bundle, and every package that ships it, SHALL carry Kiro
   Crew's `LICENSE` and `NOTICE`, the notices of the third-party packages
   bundled with it, and the licenses of its fonts.
   `THIRD_PARTY_NOTICES.md` SHALL list them and
   `scripts/check/release-scan.ts` SHALL fail when one is missing.
7. Moving the pin SHALL be one change: the pin file and the package
   versions. It SHALL pass the contract test, the class check and the
   variable test, and its screenshots SHALL go to the owner as SW12.10
   says.
8. The pin SHALL be a release the Kiro Crew bundle also runs on: not older
   than `minKiroCrewVersion` in `hosts/kirocrew/app.json`.
   `docs/workspaces.md` SHALL name the pin beside the Kiro Crew version it
   asks for, and say that the two pages match when the installed Kiro Crew
   is the pinned release.
9. The class check SHALL also run against the stylesheet a person gets
   inside Kiro Crew: built from the pin's own stylesheet source with only
   Kiro Crew's sources scanned, without the line that adds the Avoozl page.
   A class the page uses that this stylesheet lacks SHALL fail, naming the
   files that use it, because inside Kiro Crew that class does nothing.
   `.kiro/specs/ui-components/` (UC4) runs this check in CI.
10. Each pin move SHALL put the standalone page beside the same views in a
    running Kiro Crew at the new pin, for Home, Specs, a task drawer and
    Settings › Models, at 390 and 1280 px, light and dark, and give those
    screenshots to the owner before the move lands. They are never
    committed (AGENTS.md).

## Design

See [Requirements](#requirements) for SW1 to SW12. Section numbers here
(D1 to D11) are this file's; `§` numbers refer to
`.kiro/specs/avoozl/avoozl.md#design`.

### D1. Shape

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

### D2. The host shim

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

### D3. The second bundle

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

### D4. One dispatch

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

### D5. Sign-in and request checks

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

### D6. Themes

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

### D7. Open chat on the standalone page

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

### D8. The tick keeps the page up

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

### D9. What needs Kiro Crew

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

### D10. Security review

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

### D11. The pin

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

## Tasks

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`SW1` to `SW12`, in [Requirements](#requirements)); `D` sections
refer to [Design](#design), `R` numbers to
`.kiro/specs/avoozl/avoozl.md#requirements`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders; Avoozl runs the repository's checks
(AGENTS.md). Before landing a task that touches the server, run the D10
search and explain every hit in the pull request.

Task IDs start with `sw-` so they never collide with the IDs
of the other specs.

### Phase 1: The page without Kiro Crew

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
