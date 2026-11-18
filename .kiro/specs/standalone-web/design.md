# Design: a standalone web view

Status: Draft

Requirements are in `requirements.md` (SW1 to SW11). Section numbers here
(D1 to D10) are this file's; `§` numbers refer to
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
as externals (today), once against the SDK stand-in with React and the icons
bundled (D2, D3). The new server checks its own owner session and hands the
same request to the same dispatch the app backend uses (D4).

| Part                                     | New or changed | Job                                                    |
| ---------------------------------------- | -------------- | ------------------------------------------------------ |
| `kirocrew-app/ui/src/standalone/sdk.ts`   | New            | `useAppApi`, `useNavigate`, `useChatLauncher` stand-ins |
| `kirocrew-app/ui/src/standalone/sdk-ui.tsx` | New          | `PageHeader`, `Card`, `Btn`, … stand-ins                |
| `kirocrew-app/ui/src/standalone/main.tsx` | New            | Entry: mounts `App`, header, theme control              |
| `kirocrew-app/ui/src/standalone/theme.css` | New           | Light and dark variables, utilities (D6)                |
| `kirocrew-app/ui/vite.config.ts`          | Changed        | `--mode standalone` with aliases and no externals       |
| `scripts/build-kirocrew-app.mjs`          | Changed        | Runs the third build                                   |
| `src/app/command-dispatch.mjs`            | New            | The body of today's `/api/command` handler              |
| `src/app/app-backend.mjs`                 | Changed        | Calls `command-dispatch.mjs`; behavior unchanged        |
| `src/app/serve-server.mjs`                | New            | `avoozl serve`: listener, sign-in, static files         |
| `src/app/serve-auth.mjs`                  | New            | Link tokens, sessions, CSRF, header checks              |
| `src/app/cli.mjs`                         | Changed        | `serve`, `serve link`                                   |
| `src/app/supervisor.mjs`                  | Changed        | Optional server child (D8)                              |

## D2. The SDK stand-in

The standalone Vite mode aliases `@kirocrew/app-sdk` to
`src/standalone/sdk.ts` and `@kirocrew/app-sdk/ui` to
`src/standalone/sdk-ui.tsx`. `host.ts` keeps importing the host names, so
no view changes (SW1.2).

- `useAppApi()` returns one object for the page's life with `request`,
  `get`, `post`, `put` and `del` over `fetch`, `credentials: "same-origin"`,
  and the `X-Avoozl-CSRF` header read once from
  `<meta name="avoozl-csrf">`. A non-2xx rejects with `{ status, body }`
  (SW1.3). `shareReads` and the Demo guard in `host.ts` wrap it as they wrap
  the host's.
- `useNavigate()` pushes a path under `/apps/avoozl` with
  `history.pushState` and dispatches `popstate`, so the page's router sees
  it. Any other path logs one line and does nothing (SW1.4). The page's own
  in-page Back history stays as it is.
- `useChatLauncher()` returns `openChat`, which opens the Start a session
  dialog (D7).
- The UI parts are small components with the declared props, styled only
  with the theme variables. `SegmentedControl` honors `compact`, `collapse`
  and `wrap` as the declaration describes, without the host's animated pill.

A type test compiles a file that assigns each stand-in export to the
declared type in `kirocrew-app-sdk.d.ts`, so a drift fails `tsc` (SW1.5).

## D3. The second bundle

`vite build --mode standalone` builds `src/standalone/main.tsx` with no
`rollupOptions.external`, into `dist/standalone/` as `index.html`,
`app.js` and `app.css`, with `emptyOutDir: false` like the panel build.
`main.tsx` imports only the `lucide-react` icons `src/icons.ts` names, so
tree shaking drops the rest. `react`, `react-dom` and `lucide-react` are
already installed for the type checks and tests; this adds no runtime
dependency.

The page today has no stylesheet: its utility classes come from Kiro Crew's
CSS. The standalone build needs its own. It uses Tailwind CSS v4 through
`@tailwindcss/vite`, scanning `kirocrew-app/ui/src`, as a dev dependency of
the UI package only. A hand-written generator was the other option; the page
uses about 2,300 class attributes with arbitrary values such as
`md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]`, and a generator would have to
reimplement that syntax. The class check in `host-classes.test.mjs` then
runs against `dist/standalone/app.css` with no skip (SW2.3), and keeps
running against the host's CSS when `KIROCREW_HOST_CSS` is set.

The build test for SW2.2 records the sorted import specifiers of
`dist/index.mjs` and `dist/panel.mjs` in a fixture and requires the built
files to match. SW2.4 reuses the existing path scan the build already runs
for the Kiro Crew bundle (`preserveSymlinks`).

## D4. One dispatch

The handler in `startAppBackend` does, after the principal check: method
and path checks, JSON parse, `principalAllows`, input shape check, `demo.*`,
the demo workspace, then the workspace's `Operations`. That body moves to
`src/app/command-dispatch.mjs` as
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
through the DOM, which `style-src 'self'` allows; the page has no inline
`<script>` or `<style>` (SW2.5). The proof checks the browser console for
CSP reports.

**Logs.** The server logs method, path without query, status and time.
`/login` is logged as `/login` with no query (SW4.10).

## D6. Themes

`theme.css` defines every variable the views read, under `:root` (light)
and `:root[data-theme="dark"]`, plus a `@media (prefers-color-scheme: dark)`
block for `data-theme="system"`. The values are Avoozl's own: a neutral gray
scale for `--bg`, `--bg-elevated`, `--bg-hover`, `--card`, `--border`,
`--border-strong`, `--text`, `--text-strong`, `--muted`, `--muted-strong`;
one blue `--accent` with `--accent-subtle`; `--ok`/`--success`, `--warning`/
`--warn`, `--danger`, `--info`, `--aim`, `--hit`; the `--tile-*` colors; and
`--mono`/`--font-mono` as the system monospace stack. The variable list is
taken from the source by the SW6.3 test, so a new variable in a view fails
until both themes define it.

The theme control sits in a thin standalone header with the Avoozl name,
the workspace picker the page already has, Sign out (`POST /logout`) and
the theme switch. Kiro Crew's left navigation has no stand-in; the page's
own tabs are its navigation.

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
