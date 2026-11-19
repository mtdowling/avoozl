# vm-harness build notes (2026-11-19)

What the build of `.kiro/specs/vm-harness/` checked, for the statements its
tasks ask a pull request to make. The work landed as one commit on main, so
the statements live here. Screenshots were checked and are not kept in git.

## Apple container 1.7.1, run here (vm-1.2, vm-2.3, D3)

On macOS 26.7.3 with `container` 1.7.1 (`container system status`: running):

- `container run -d --name avoozl-{session} --label avoozl.session={session}
  --network none --no-dns --uid {uid} --gid {gid} --cap-drop ALL --volume
  {dir}:{dir} --mount type=bind,source={ro},target={ro},readonly --env-file
  {file} {image}@{digest} sleep infinity` starts the box.
- In the box: only `lo` exists (`/sys/class/net`), a TCP connect to
  `1.1.1.1:443` and a DNS lookup both fail, the read-only mount refuses a
  write, commands run as the person's uid, every capability set is 0,
  `/Users` holds only the empty parent folders of the mounts, and the
  environment is the env file plus the image's `PATH`.
- `container exec -i --uid --gid --workdir --env-file` relays standard input
  and returns the command's exit code; `container list --all --format json`
  names each box in `configuration.id`; `container delete --force` removes it.
- `container image inspect` prints the index digest first, which
  `pinnedImage` takes.
- `src/app/executors/test/box-session.test.mjs` runs a contained session's
  box, broker and box exec for real where a runtime and a local
  `docker.io/library/bash:5` exist, and skips with the reason elsewhere.
- `scripts/proofs/vm-p0-preflight.mjs` run in a chat here passed the
  preflight's starts, no network, mounts and no route steps; its routing
  steps need macOS's sandbox, which a Kiro Crew chat cannot nest.

## Claude Code (vm-2.3, D3)

Claude Code 2.1.328: `claude --help` lists `--setting-sources`,
`--settings`, `--strict-mcp-config`, `--disallowedTools` and `--mcp-config`.
The binary holds the string `CLAUDE_CODE_SHELL_PREFIX` and says a prefix must
be "an absolute path outside what the session can write"; box exec lives in
the Avoozl package, which no session writes. Not run here: that every Bash
call goes through the prefix, the form of the argument it passes, and the
hosts a plan login refreshes against. vm-p0 decides these.

## Codex (vm-2.3, D11 question 3)

Codex 0.170.0: `codex features list` shows `shell_tool`, `unified_exec` and
`code_mode_host` as separate features, all on. So `features.shell_tool =
false` alone does not leave Codex with no command path, and whether a `-c`
MCP server reaches `codex exec` was not checked. Codex's `box` stays out of
`examples/harnesses/codex.json`, and the supervisor refuses a contained
session for a harness whose `box` names no `{box_exec}`.

## The macOS sandbox profile (vm-2.2)

The forms a contained profile adds, each compiled by `sandbox-exec -p` here
(a nested sandbox cannot be applied in a chat, so their effect is checked by
the macOS CI leg and vm-p0):

- `(deny process-exec*)`, then `(allow process-exec* (literal ...) (subpath
  ...))`, then `(deny process-exec* (literal "/usr/bin/security"))`.
- `(deny mach-lookup (global-name-regex #"^com\.apple\.container\."))`
  (A: Apple container's services carry that prefix).
- `(allow network-outbound (remote unix-socket (path-literal ...)))` for the
  session's broker socket.
- With `box.signIn.darwin: "keychain"`, the keychain's mach denial and its
  `~/Library/Keychains` denial are dropped, and that folder is read-write.

## Listeners (D9)

A search of the change for `listen(`, `0.0.0.0`, `[::]` and port publishes:
the egress proxy listens on `127.0.0.1` with a random port on macOS, or on a
`0600` Unix socket in a `0700` folder on Linux; the broker listens on a
`0600` Unix socket in a `0700` folder; the Linux forwarder listens on
`127.0.0.1` inside the session's own network namespace. No box publishes a
port. `scripts/proofs/p57-model-proxy.mjs` now runs the same proxy on the
loopback port it is given.

## GitHub calls (vm-3.1, vm-3.3)

- Visibility: one more field (`repository { isPrivate }`) on the open-items
  search the tick already makes, so no new call.
- Triage: one permission read per comment author not read already in that
  snapshot.
- Fix on an issue: one permission read when the item has no stranger reading.
- Fix on a pull request: three reads (the pull request, its commits, the
  permission of each new login), only when a person presses Fix.

## Not built

- vm-3.1's "the field survives `avoozl rebuild` from the issue's record":
  fixes keep no record on their issue yet, so a rebuild has nothing to read
  it from.
