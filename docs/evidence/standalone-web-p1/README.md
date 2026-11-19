# Receipt: standalone-web proof sw-p1 (Claude Code)

Result: PASS at 2026-11-19T02:42:25.607Z

- PASS 1 page loads, no console error or CSP report, Kiro Crew's colors and fonts, light and dark
  - "ok"
- PASS 2 the task lands and the message reaches the child
  - {"sawRow":true,"queued":true,"landed":true,"delivered":true}
- PASS 3 Ask for help starts a read-only assist session and shows its log
  - {"shown":true,"permissionClass":"read","folder":"ws"}
- PASS 4 cross-origin fetch, form POST and a cookie replay without the CSRF header are refused and change nothing
  - {"fetch":"blocked: TypeError","noCors":"opaque","form":"{\"error\":\"Not allowed.\"}","curlNoCsrf":"403","curlNoOrigin":"403","workspaceEnabledBefore":"true","after":"true"}
- PASS 5 the server returns on the same port, the old session is gone, a new link signs in, and only 127.0.0.1 listens
  - {"port":51075,"oldPage":"Sign in needed. Run `avoozl serve link` ","sockets":["127.0.0.1:51075"]}

Screenshots stay outside git (AGENTS.md).
