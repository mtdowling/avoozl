# Request: hand the proxy secret to an app backend by file, not by environment

Status: draft. Not filed anywhere.

## What we ask

When Kiro Crew starts an app backend, pass `KIROCREW_PROXY_SECRET` (and
`KIROCREW_GATEWAY_ORIGIN_PROOF`) in one of these ways instead of the process
environment:

- an inherited file descriptor, named by a variable such as
  `KIROCREW_PROXY_SECRET_FD`, or
- a file with mode 0600 in a 0700 folder, named by
  `KIROCREW_PROXY_SECRET_FILE`.

Keep the old variable for one release, so existing apps still start.

## Why

An app backend uses the secret to check that a request really came from the
gateway and to read who the caller is. A process that holds the secret can sign
a request as the owner.

Today the secret sits in the backend's environment. Any process that runs as
the same user can read it from `/proc/<pid>/environ` on Linux. That includes
code an agent session runs in a shell. Avoozl keeps the secret out of the
processes it starts itself (checks and the worktree helper), but it cannot hide
it from a sibling process.

A descriptor is not visible to other processes. A 0600 file is visible only to
the same user, so it is no worse than the environment, and a backend can read
it once and delete or ignore it.

## What it would change for Avoozl

Avoozl's person-only rule would stop a same-user agent from signing as the
owner. Until then, the rule stops MCP calls and app tokens, not code running as
you (see `docs/policies.md`).

## Open points

- Windows has no `/proc/<pid>/environ`, but a same-user process can still read
  another process's environment. The file route works there with an ACL on the
  file.
- A backend that restarts needs the secret again. The descriptor route needs
  Kiro Crew to pass it on each start.
