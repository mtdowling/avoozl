---
repo: avoozl
---
# Tasks: Avoozl as one standalone binary

Tasks run in list order, and each phase waits for the one above it.
Requirement numbers are in brackets (`SB1` to `SB9`, in `requirements.md`);
`D` sections refer to this spec's `design.md`.

Phase 1 moves every self-start to one module and builds the binary. Phase 2
smoke-runs it in CI on Linux, macOS and Windows. Phase 3 signs and releases
it and writes the docs. `sb-p1` proves a release binary on a machine with
no Node.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and a temp Avoozl home; no real workspace data, machine
configuration, credentials or personal plans in the repository (AGENTS.md);
no signing secret in a log, a fixture or the repository; never force push
any branch. Build the binary with the official Node build, not Homebrew's
(D2). Task IDs start with `sb-` so they never collide with the IDs of the
other specs.

## Phase 1: Self-start and the build

- [ ] `sb-1.1` One module for self-start [SB2.1, SB2.4, SB2.5] (§D4)
  - `src/app/runtime/self.ts` exports `isBinary`, `cliArgv`, `programArgv`, `scriptArgv`, `cliCommand` and `readPaths` as D4's table gives them, each taking `{binary}` for tests
  - Every row of D4's call-site table uses `self.ts`, and a test finds no `process.execPath` in `src/app` outside `self.ts` and `src/app/cli/link-global.ts`
  - Unit tests cover both modes of each function, including Windows quoting in `cliCommand`
  - Outside binary mode every argv and shell command equals what it was before the change (the existing supervisor, page, plugin, hook, credential helper and report-command tests pass unchanged)
- [ ] `sb-1.2` The egress proxy in the bundle [SB2.1] (§D3)
  - `scripts/bundle/build-kirocrew-app.ts` bundles `src/app/executors/egress-proxy-main.ts`
  - `egress-proxy.ts` starts it through `programArgv("egress-proxy")`
  - A test starts the egress proxy from the built `hosts/kirocrew/bin/lib` bundle and connects to its loopback port
- [ ] `sb-1.3` The binary entry and build, after sb-1.1, sb-1.2 [SB1, SB2.2, SB2.3, SB2.6, SB3] (§D3, §D4, §D5)
  - `npm run build:binary` runs `scripts/bundle/build-binary.ts` and writes `dist/binary/avoozl-<target>` with D1's configuration; `dist/` is in `.gitignore`
  - The build refuses a Node older than 26.9.0 and a Node without SEA support with a message naming the official download, and refuses a stale page through `uiBundleProblem`
  - `binary-main.mjs` runs `__program NAME` and `__script FILE` as D4 says, and exits 2 naming the program for an unknown name
  - `standaloneUiDirectory` finds the page inside the archive in binary mode
  - `avoozl help` and the MCP tool list do not name `__program` or `__script`
  - A test finds no write through `import.meta.url` or `import.meta.dirname` in `src/app`
  - On this Mac, the built binary runs `--help`, `init`, `status`, `check` and `mcp`, and the sizes of the binary and the archive are written in the pull request

## Phase 2: CI

- [ ] `sb-2.1` The smoke script, after sb-1.3 [SB4, SB5.2, SB5.3] (§D8)
  - `scripts/check/binary-smoke.ts BINARY` runs D8's eight checks with Node removed from `PATH` and a temp home, and exits non-zero naming the first failed check
  - Each check fails when its part is broken on purpose: a program name missing from `binary-main.mjs`, a VFS path in the pre-push hook, the page left out of the archive
  - `npm run binary:smoke` builds the binary and runs the script on this machine
- [ ] `sb-2.2` The binary job on three OSes, after sb-2.1 [SB5.1, SB5.4] (§D9)
  - `.github/workflows/test.yml` has a `binary` job on `ubuntu-latest`, `macos-latest` and `windows-latest` with a pinned exact Node version, for every pull request and push to main
  - The job runs `npm run binary:smoke` and prints the binary's size
  - `test (ubuntu-latest)`, `test (macos-latest)` and `test (windows-latest)` each fail when the job fails on their OS
  - The job passes on all three OSes on the pull request that adds it, and the Linux x64 and Windows x64 sizes are written in the pull request

## Phase 3: Release and docs

- [ ] `sb-3.1` Add the signing secrets (**MANUAL**)
  - The repository holds D9's macOS and Windows secrets, or the owner has decided to release without them
- [ ] `sb-3.2` The release workflow, after sb-3.1 [SB6, SB7] (§D9, §D10)
  - `.github/workflows/release.yml` builds all five targets of D9 on their runners for a `v*` tag, runs the smoke script on each, and attaches the archives and `SHA256SUMS` to a draft release
  - With the secrets, the macOS binaries pass `codesign --verify --strict` and `spctl --assess --type execute`, and the Windows binary passes `signtool verify /pa`
  - Without them, the macOS binaries are signed ad hoc, the Windows binary is unsigned, and the draft's notes say so
  - No secret is read on a pull request, and the workflow log holds no secret
  - A `workflow_dispatch` run with `dry-run: true` builds and smoke-runs all five archives and creates no release
- [ ] `sb-3.3` Install docs, after sb-3.2 [SB9] (§D9)
  - `docs/getting-started.md` has a binary install section with the download, `SHA256SUMS` check on macOS, Linux and Windows, and launchd and systemd units that run the binary
  - The section states each target's size and signing state
  - `README.md` names the binary beside the npm package
  - `npm test` passes the docs link and JSON checks

## Proof

- [ ] `sb-p1` Proof: a release binary on a machine with no Node, after sb-3.3 [SB2, SB3, SB4, SB8] (§D8)
  - Setup: the draft release's `darwin-arm64` archive from sb-3.2, checked against `SHA256SUMS`; a shell whose `PATH` has no `node`; a throwaway Avoozl home and workspace; a bare git remote for one repository with a one-task approved spec, landing `direct`; the stand-in process harness from the smoke script
  - Action: run `avoozl init`, add the repository, run `avoozl tick` until the task lands, open the page the tick hosts, and call `avoozl mcp` `tools/list`
  - Expected: the task lands on the bare remote's main with the person's git author; the page shows the task done; the MCP tool names equal the npm package's at the same commit; no process started from the binary remains after the session ends; the receipt under `docs/evidence/` holds the commands, outputs and sizes, with no image committed
  - Failure means: any step needs `node` on `PATH`, any child argv, hook or environment holds a `/dev/null/vfs` path, or any output differs from the npm package's
