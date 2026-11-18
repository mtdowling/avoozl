---
category: Planning
---

# Requirements: a standalone web view

Status: Approved

## Introduction

This spec lets a person who runs Avoozl with Claude Code, Codex or another
agent CLI, and no Kiro Crew, use today's Avoozl page in a browser. Avoozl
serves the page itself with `avoozl serve`, on `127.0.0.1` only, behind a
one-time owner link.

This spec is a draft. Approving it, creating issues and starting agents are
separate acts that a person does later.

Changed 2026-11-18 (owner decision): the standalone page must look exactly
as the page does in Kiro Crew, and must not be a fork. It is built with Kiro
Crew's own UI parts, SDK provider and stylesheet, unmodified, at a pinned
release, where this spec first had Avoozl write stand-ins and its own
themes. SW1, SW2 and SW6 changed, SW4.8 gained style hashes, and SW12 was
added. A one-day spike built it; design D11 records what it showed and what
it did not check. Claims marked **S** were seen in that spike.

### Why

The any-harness plan (`.kiro/specs/avoozl/`, Requirements 93 to 98, design
§4.28) made the work harness-neutral: a `process` child under
`avoozl supervisor` can code, verify and review a task with no Kiro Crew on
the machine. The page did not follow. Requirement 98 says Kiro Crew stays the
only UI, and Requirement 98.5 leaves a machine without Kiro Crew with only
`avoozl status` and `avoozl runner status --json`. A person who never
installed Kiro Crew can run every role but cannot see Needs you, approve a
plan or read a process session's log without the CLI.

The page is close to portable already:

- It reaches the host only through `kirocrew-app/ui/src/host.ts` (`useAppApi`,
  `useNavigate`, `useChatLauncher`) and the externals `react`, `react-dom`,
  `react/jsx-runtime`, `lucide-react`, `@kirocrew/app-sdk` and
  `@kirocrew/app-sdk/ui` (`kirocrew-app/ui/vite.config.ts`).
- Every view calls one route, `POST /apps/avoozl/api/command`, with an
  operation name (`COMMAND_PATH` in `kirocrew-app/ui/src/workspace-api.ts`).
- The backend (`src/app/app-backend.mjs`) checks a principal that Kiro Crew's
  proxy signs (`KIROCREW_PROXY_SECRET`) and authorizes by kind:
  `owner-session` may run any offered operation, `app-token` and
  `agent-tool` may only observe (`principalAllows`).
- Colors are Kiro Crew theme variables (`--border`, `--muted`, `--accent`,
  `--text`, `--card`, `--danger`, `--ok` and others), and layout uses the
  utility classes the host's stylesheet defines.
- Process sessions already have a log tail, Send message and a copyable
  attach command on the page (Phase 50, proof P60).

### What this builds on

`.kiro/specs/avoozl/` stays the product spec. This spec changes Requirement
98 (SW11) and design §4.28's UI paragraph, and reuses Requirement 95 (one
supervisor per machine), Requirement 98.1 and 98.2 (process sessions on the
page), and the operation set in `src/app/operations.mjs`. It adds no
operation for agents.

### Scope

- One person, on the machine that runs Avoozl, in a browser on that same
  machine.
- The page Kiro Crew shows today, every view, with the Kiro Crew-only parts
  shown as unavailable (SW10).
- Kiro Crew's own install keeps working exactly as today. A machine may run
  both; they share the workspace database.

### Out of scope

- Remote access of any kind. `avoozl serve` binds `127.0.0.1` only and has no
  option to bind anything else. No tunnel, relay, share link, reverse proxy
  support or TLS is built here. Viewing from another machine needs a later
  spec with a real identity provider.
- A second set of views. The standalone page is the same React views built a
  second way, not a new design.
- Agents using the web page. Agents keep the MCP server and the CLI (SW5.4).
- A Kiro Crew chat stand-in. Open chat becomes a process session (SW7); it is
  not a chat UI.
- Kiro Crew's side panel (`kirocrew-app/ui/src/Panel.tsx`); it is not built
  into the standalone bundle.
- Several people on one server. There is one owner.
- Kiro Crew's own shell: its sidebar, top bar, chat and toasts. The
  standalone page is the Avoozl page, with Kiro Crew's parts and look, under
  a thin Avoozl header.

### Words

| Word             | Meaning                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Kiro Crew page   | Today's Avoozl page, `kirocrew-app/ui/dist/index.mjs`, rendered inside Kiro Crew                          |
| Standalone page  | The same views built with Kiro Crew's own parts at the pin and served by `avoozl serve`                   |
| Host shim        | Avoozl's code on the host side of the SDK: the provider's props, navigation, one request header, the theme |
| Pin              | The Kiro Crew release whose source the standalone build uses, named with a digest (SW12)                  |
| Owner link       | A one-time `http://127.0.0.1:<port>/login?token=…` URL that signs the browser in                          |
| Session cookie   | The cookie the owner link sets; it names one server-side browser session                                 |
| CSRF token       | A per-session random value the page sends in a header on every write                                     |
| Server origin    | `http://127.0.0.1:<port>`, exactly                                                                        |

## Requirements

### Requirement SW1: One host seam, with Kiro Crew's own parts

**User story:** As the owner, I want the standalone page to look exactly as
it does in Kiro Crew, so that there is one look to learn and none to
maintain.

#### Acceptance criteria

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
   function and a notify function (S: these are the props the spike
   passed, and the page rendered).
4. The SDK's client sends each request with `fetch` and a relative path
   (S). The standalone entry SHALL add the CSRF header (SW4.6) to requests
   for the server origin, and SHALL change nothing else about a request or
   its reply, so a non-2xx reply reaches a view exactly as it does in Kiro
   Crew.
5. The navigate function SHALL move between the page's own paths under
   `/apps/avoozl` with the History API. A path under `/chat`, which the
   SDK's chat launcher asks for (S), SHALL open the Start a session dialog
   (SW7). Any other path SHALL do nothing and log one line.
6. The notify function SHALL show the notice in the standalone header.
7. A build test SHALL fail when a file under
   `kirocrew-app/ui/src/standalone/` exports a name that
   `@kirocrew/app-sdk` or `@kirocrew/app-sdk/ui` exports, and a source
   test SHALL fail when a view imports a Kiro Crew file by path.

### Requirement SW2: A second bundle

**User story:** As the maintainer, I want the standalone page built as its
own files, so that the Kiro Crew bundle stays exactly as it is.

#### Acceptance criteria

1. `npm run build` SHALL build the standalone page as well, into
   `kirocrew-app/ui/dist/standalone/`: one `index.html`, its script, one
   stylesheet and its fonts, with React, the `lucide-react` icons the page
   uses and the Kiro Crew modules the page reaches bundled in. React SHALL
   be the version the pin's own lockfile resolves, one copy for the page
   and Kiro Crew's parts. `dist/` stays out of git (AGENTS.md).
2. The Kiro Crew bundle (`dist/index.mjs`, `dist/panel.mjs`) SHALL keep its
   externals and SHALL contain none of the standalone entry's code. A build
   test SHALL compare the bundle's import specifiers before and after this
   spec's change and require them equal.
3. The standalone stylesheet SHALL be built from Kiro Crew's own stylesheet
   source at the pin, with the Avoozl page's sources added to what it scans
   for class names, and with no rule of Avoozl's own. The class check in
   `kirocrew-app/ui/test/host-classes.test.mjs` SHALL run against it on
   every test run, with no skip, and SHALL fail on a class it lacks.
4. The standalone files SHALL hold no absolute machine path, user name or
   host name. A build test SHALL scan them for the build machine's home
   folder and the worktree path.
5. The standalone script SHALL load as same-origin files with no inline
   script. Each `<style>` element the page renders SHALL be one the policy
   of SW4.8 allows by hash; the page renders 23 today (V: `<style` in
   `kirocrew-app/ui/src/*.tsx`).
6. The standalone script SHALL hold only the Kiro Crew modules the page's
   imports need, not Kiro Crew's dashboard. What is left out SHALL be left
   out by build configuration alone (SW12.3). The build SHALL fail when the
   script grows past a budget written down in the build config (S: the two
   SDK entry files reach the whole dashboard, 27.7 MB of script; with its
   chat exports left out the script was 2.7 MB).

### Requirement SW3: `avoozl serve` on loopback only

**User story:** As the owner, I want the page served only to my own machine,
so that nobody on my network can reach Avoozl.

#### Acceptance criteria

1. `avoozl serve [--workspace PATH] [--port N]` SHALL listen on `127.0.0.1`
   only. It SHALL have no host or bind option, SHALL read no environment
   variable for one, and SHALL refuse to start with an error naming the
   variable or flag when one is given (`--host`, `--bind`, `AVOOZL_HOST`).
2. With no `--port`, or `--port 0`, the server SHALL take a random free
   port. With `--port N` (1024 to 65535) it SHALL take that port or exit with
   "port N is in use" and not try another.
3. The server SHALL serve the standalone files at `/apps/avoozl` and below,
   SHALL redirect `/` to `/apps/avoozl`, and SHALL answer
   `POST /apps/avoozl/api/command` with the same dispatch the app backend
   runs for an `owner-session` (SW5). Any other path SHALL get 404.
4. Static files SHALL come from a fixed list of the built files, by name.
   No request path SHALL be joined to a folder.
5. On start the server SHALL print the server origin and a fresh owner link
   (SW4.1) to its own terminal, and SHALL write its origin, port and pid to
   `serve.json` in the machine state folder with mode `0600`. It SHALL NOT
   write the link or any token to that file or to a log.
6. A test on Linux, macOS and Windows SHALL start the server and check that
   the listening socket's address is `127.0.0.1` and no other.
7. `avoozl serve` SHALL be refused in a supervisor child
   (`AVOOZL_CHILD=1`, Requirement 95.5), as a person-only command.

### Requirement SW4: The owner signs in with a one-time link

**User story:** As the owner, I want my browser signed in from my terminal,
and every other caller refused, so that another local program or a web page
I visit cannot drive Avoozl.

#### Acceptance criteria

1. An owner link SHALL carry 32 random bytes from the operating system's
   secure random source, base64url encoded. It SHALL work once and SHALL
   expire 10 minutes after it was made. The server SHALL keep only a SHA-256
   hash of it and SHALL compare hashes in constant time.
2. `avoozl serve link` SHALL make a new owner link for the running server
   and print it to the terminal that ran it. It SHALL be refused in a
   supervisor child.
3. `GET /login?token=…` with a valid, unused, unexpired token SHALL mark the
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
   `avoozl serve link`, with status 401; an API request without one SHALL
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
   `Cache-Control: no-store`. `<hashes>` is one `'sha256-…'` source for
   each style text the build lists (SW2.5), and nothing wider:
   `'unsafe-inline'` SHALL NOT appear.
9. `POST /logout` with a valid CSRF header SHALL end the session and clear
   the cookie.
10. No token, cookie value or CSRF token SHALL appear in a log, an
    error message, `serve.json`, the workspace database, or any GitHub write.
11. A request body over the app backend's limit SHALL get 413, as the app
    backend does today.

### Requirement SW5: The local owner is the owner

**User story:** As the owner, I want the standalone page to let me do what
the Kiro Crew page lets me do, and no more, and agents to stay off it.

#### Acceptance criteria

1. A request with a valid session and CSRF token SHALL be dispatched as the
   principal `{ kind: "owner-session", ownerId: "local" }` through the same
   `principalAllows` and operation dispatch as the app backend. The two
   servers SHALL share one dispatch function; a test SHALL run one write and
   one observe operation through each and require the same results.
2. An operation the app backend does not offer SHALL be refused with the
   same 403 message.
3. Demo mode (`demo.*`, design §6.11) SHALL work on the standalone page as on
   the Kiro Crew page.
4. The standalone server SHALL offer no `app-token` or `agent-tool`
   principal and SHALL accept no bearer token or other credential header. Agents keep the
   MCP server and the CLI, and the CLI works on the workspace database
   directly: pointed at `avoozl serve` with `--url`, it is refused with an
   error that says only a browser's session cookie opens `/api/command`. A
   test SHALL send a request with each of the app backend's principal
   headers, a bearer header and a made-up credential header, and no
   session cookie, and require 401.
5. The supervisor's sandbox (Requirement 95.6) SHALL keep the machine state
   folder, which holds `serve.json` and the link records, outside every
   `process` child's read and write roots. A sandbox test SHALL check it.

### Requirement SW6: Kiro Crew's themes

**User story:** As the owner, I want the standalone page to have the colors
and type it has in Kiro Crew, in light and dark, so that it is the same
page.

#### Acceptance criteria

1. Colors, type, spacing and every CSS variable the page reads SHALL come
   from Kiro Crew's stylesheet at the pin. Avoozl SHALL define no theme
   variable and no font.
2. The standalone entry SHALL set the theme attributes on `<html>` the way
   Kiro Crew does (S: `data-theme` as palette and mode, and `data-mode`),
   with Kiro Crew's default palette, following `prefers-color-scheme`. A
   control in the standalone header MAY set light, dark or system, and MAY
   offer the other palettes the stylesheet has. The choice SHALL be kept in
   the browser's local storage.
3. A test SHALL list every `var(--…)` name used under `kirocrew-app/ui/src`
   and fail when the built stylesheet lacks one for the default palette in
   either mode.
4. `avoozl serve` SHALL serve the fonts the stylesheet uses from the
   bundle. The page SHALL request no font the bundle does not hold (S: one
   optional font's address did not resolve in the spike).

### Requirement SW7: Open chat becomes a process session

**User story:** As the owner, I want every Ask for help and Open chat button
to still do something useful without Kiro Crew.

#### Acceptance criteria

1. On the standalone page, `useChatLauncher().openChat({ message, agent,
   autoSend })` SHALL open a Start a session dialog with the message in an
   editable box, the role it maps to, and the harness Settings › Models picks
   for that role. Start SHALL run a new person-only operation,
   `session.open`, that asks the `process` executor for a session in the
   workspace root with the message as its brief, and SHALL then show that
   session's process view.
2. A session started this way SHALL use the read-only permission class
   unless its role is a write role in Settings › Models. Its role SHALL
   default to `assist`, a read-only role with its prompt in
   `prompts/assist.md`.
3. `openChat({ slotKey })` for an existing session SHALL show that
   session's process view when it is a `process` session, and SHALL say
   "This is a Kiro Crew chat; open it in Kiro Crew" otherwise.
4. The process view SHALL be the one Phase 50 built: status, log tail, cost
   when known, Send message and the copyable attach command.
5. With no approved harness definition on the machine, the dialog SHALL say
   so, link to Settings › Models, and offer Copy message so the person can
   paste it into their own CLI. It SHALL start nothing.
6. `autoSend: true` SHALL NOT start a session without a click on the
   standalone page.

### Requirement SW8: Needs you in the browser (optional)

**User story:** As the owner, I want a browser notice when Avoozl needs me,
if I turn it on, so that I can leave the tab in the background.

#### Acceptance criteria

1. Browser notices SHALL be off by default. Settings › Notifications on the
   standalone page SHALL turn them on, and only a click SHALL ask the
   browser for permission.
2. When on, the page SHALL show one notice for each new Needs you item it
   sees in `conflicts.view`, with the item's title and no path, and a click
   SHALL open that item. An item SHALL be noticed once per browser.
3. The page SHALL read Needs you no more often than the Kiro Crew page does
   today, and only while it is open. No server push, service worker or
   background sync SHALL be built.
4. With permission denied, the setting SHALL say so and the page SHALL keep
   working.

### Requirement SW9: The supervisor can host the page

**User story:** As the owner of a headless worker machine, I want the page
kept up by the supervisor, so that I do not keep a terminal open for it.

#### Acceptance criteria

1. With `serve.enabled: true` (and an optional `serve.port`) in the machine
   configuration, `avoozl supervisor` SHALL run the server as a supervised
   child, restart it when it exits, and record its pid and port, as it does
   for the tick and the integrator. The keys SHALL be refused in
   `.avoozl.json`.
2. The supervised server SHALL print no link. The owner SHALL get one with
   `avoozl serve link` at that machine's own shell.
3. `avoozl status` SHALL show whether the server runs and its origin.
4. The supervisor process itself SHALL still listen on no socket; only its
   server child does, under SW3 and SW4.

### Requirement SW10: Say what needs Kiro Crew

**User story:** As the owner, I want the page to say plainly what needs Kiro
Crew, so that I do not look for a feature that cannot work.

#### Acceptance criteria

1. These SHALL NOT work without Kiro Crew, and the standalone page SHALL show
   each as unavailable with the reason "Needs Kiro Crew", never as an error:
   the `kirocrew` executor (choosing it in Settings › Models, and Start for a
   task pinned to it); Kiro Crew's side panel; Kiro Crew notification
   channels; opening a Kiro Crew chat; Kiro Crew's model list (the model
   field becomes free text plus the harness definition's own list); per-turn
   usage read from Kiro Crew's log; Send to Issue Radar and Radar session
   reads; Stop all agents for Kiro Crew chats.
2. The app backend's Kiro Crew readers (`notifier`, `slotReader`,
   `rowReader`, `usageReader`, `modelSwitcher`, `modelReader`,
   `crewReader`, `sessionsReader`, `sessionStopper`) SHALL be absent in the
   standalone server, and every operation that uses one SHALL return a
   result that says "Needs Kiro Crew", not throw. A test SHALL run each such
   operation with the readers absent.
3. `instance.view` SHALL report the host as `standalone` or `kirocrew`, and
   the page SHALL read SW10.1's states from it, not from the build.
4. A task pinned to the `kirocrew` executor on a machine with no Kiro Crew
   SHALL wait with one Needs you item that names the pin. It SHALL NOT fall
   back to another executor by itself.

### Requirement SW11: Change to Requirement 98

**User story:** As the owner, I want the product spec to say the standalone
page is a proposed change, so that the two specs do not contradict each
other.

#### Acceptance criteria

1. Requirement 98 and design §4.28 SHALL say that this spec proposes a
   second, loopback-only host for the same page, and that Requirement 98.5
   stands until this spec is approved.
2. On approval, Requirement 98.5 SHALL change to: a headless machine gets
   the CLI, and the standalone page when `avoozl serve` or `serve.enabled`
   runs it; Avoozl SHALL host no other UI and SHALL serve nothing beyond
   `127.0.0.1`.

### Requirement SW12: Kiro Crew's parts as a pinned, unmodified dependency

**User story:** As the maintainer, I want Kiro Crew's parts to be a
dependency Avoozl names and checks, so that the standalone page is not a
fork and a new Kiro Crew release is one change.

#### Acceptance criteria

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
   each listed in one place with the reason (S: the spike left out six chat
   exports and the non-English languages this way, and edited no file).
4. A contract test SHALL list every Kiro Crew path and export the build
   depends on, and SHALL fail naming the missing one, so a release that
   moves a file fails on that line and nowhere else.
5. The packages Kiro Crew's parts import SHALL be installed at the versions
   the pin's lockfile resolves, and a test SHALL compare them.
6. The standalone bundle, and every package that ships it, SHALL carry Kiro
   Crew's `LICENSE` and `NOTICE`, the notices of the third-party packages
   bundled with it, and the licenses of its fonts.
   `THIRD_PARTY_NOTICES.md` SHALL list them and
   `scripts/release-scan.mjs` SHALL fail when one is missing.
7. Moving the pin SHALL be one change: the pin file and the package
   versions. It SHALL pass the contract test, the class check and the
   variable test, and its screenshots SHALL go to the owner as SW12.10
   says.
8. The pin SHALL be a release the Kiro Crew bundle also runs on: not older
   than `minKiroCrewVersion` in `kirocrew-app/app.json`. The README SHALL
   name the pin beside the Kiro Crew version it asks for, and say that the
   two pages match when the installed Kiro Crew is the pinned release.
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
