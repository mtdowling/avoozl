---
category: Planning
---

# Requirements: Avoozl as one standalone binary

## Introduction

A machine with no Node can run Avoozl from one downloaded file. The file is
a Node single executable application (SEA) that `node --build-sea` writes:
the Node runtime with Avoozl's bundled code and data inside it.

```sh
curl -fsSLO https://github.com/owner/repo/releases/download/v0.2.0/avoozl-darwin-arm64.tar.gz
tar xzf avoozl-darwin-arm64.tar.gz
./avoozl init ~/avoozl-workspace
```

The binary runs the same CLI, MCP server, operations and page as the npm
package. The npm package and the Kiro Crew app folder stay, and they ship
from the same source.

Claims about code and Node carry one label: **V**, read in the file cited
at `55ec5492` or run on this Mac with the official Node v26.13.1
darwin-arm64 build; or **A**, assumed and not checked, with the reason.

### Why

- **Headless machines need nothing but the file.** A machine that only runs
  workers needs Node 22.18 or later and a checkout or npm install
  (`package.json` `engines`). **V**
- **One file is one version.** A release asset with a checksum is easier to
  pin, audit and roll back than a checkout and its `node_modules`.

### Scope

- The build of one binary per target from the bundle that
  `scripts/bundle/build-kirocrew-app.ts` already writes.
- A binary-mode path for every place Avoozl starts itself, a program of its
  own, or a plugin file with `process.execPath`.
- The runtime files the binary carries.
- A CI job that builds and smoke-runs the binary on Linux, macOS and
  Windows.
- Signing, and release assets with checksums.

### Out of scope

- Replacing the npm package or the Kiro Crew app folder.
- Cross-building a target on another OS. Each target builds on its own
  runner.
- An installer, a package manager formula, or a self-update command.
- Windows arm64 and Linux musl (Alpine). Node does not test SEA on Alpine
  ([SEA platform support](https://nodejs.org/api/single-executable-applications.html#platform-support)).

### Words

| Word | Meaning |
| --- | --- |
| Binary | The single executable file for one target, such as `avoozl-darwin-arm64` |
| Target | One OS and CPU pair: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64` or `win32-x64` |
| Bundle | The `preserveModules` tree of `.mjs` files and data that the app build writes under `hosts/kirocrew/bin/lib` |
| Archive | The ZIP of the bundle and the built page that the binary embeds as its virtual file system |
| VFS | Node's read-only virtual file system for SEA assets (`useVfs`), mounted at a path that exists only inside the process |
| Program | A module Avoozl starts as its own process: the supervisor child, the context broker, the context relay, the page server, the plugin child and the egress proxy |
| Binary mode | Avoozl running inside a binary, as `node:sea` `isSea()` returns |

## Requirements

### Requirement SB1: The binary build

**User story:** As the maintainer, I want one command that writes the
binary for the machine it runs on, so that CI and I build it the same way.

1. `npm run build:binary` SHALL write `dist/binary/avoozl-<target>` (with
   `.exe` on Windows) for the machine's own target from the bundle and the
   built standalone page.
2. The binary SHALL be a SEA with `mainFormat: "module"`, `useVfs: true`
   and a `vfsArchive`, and SHALL NOT use `useSnapshot` or `useCodeCache`.
3. The build SHALL refuse, naming the reason, a Node older than 26.9.0 and
   a Node built without SEA support
   (`process.config.variables.single_executable_application` is `false`).
4. The build SHALL refuse a built page whose stamp does not match its
   source (`uiBundleProblem` in `src/app/serve/ui-bundle.ts`).
5. On macOS the build SHALL sign the binary ad hoc (`codesign --sign -`)
   when no signing identity is set (SB6).

### Requirement SB2: Starting Avoozl's own programs

**User story:** As a person running the binary, I want the supervisor,
workers and page to start, so that the binary does everything the npm
package does.

1. Every place that starts Avoozl's CLI or a program SHALL get its argv from
   one module, which returns `[process.execPath, file]` outside binary mode
   and `[process.execPath, "__program", name]` or `[process.execPath]` in
   binary mode.
2. In binary mode the binary's entry SHALL run the named program when the
   first argument is `__program`, and SHALL refuse an unknown name with exit
   code 2.
3. A plugin `.mjs` or `.js` file that Avoozl runs with `process.execPath`
   SHALL run in binary mode as `[process.execPath, "__script", file, ...]`,
   which imports the file from disk with `process.argv` set as `node file`
   sets it.
4. Every shell command Avoozl writes for a worker, a git credential helper,
   a pre-push hook or a skill SHALL name the binary alone in binary mode.
5. No argv, environment value, hook or file Avoozl hands to another process
   SHALL hold a path inside the VFS.
6. `__program` and `__script` SHALL NOT appear in `avoozl help`, in the MCP
   tool list or in the operation table.

### Requirement SB3: Runtime files

**User story:** As a person running the binary, I want prompts, schemas,
skills and the page to be there, so that nothing reads a file the binary
does not carry.

1. The archive SHALL hold every file the bundle holds and the built
   standalone page (`hosts/kirocrew/ui/dist/standalone`).
2. Code SHALL read these files through `import.meta.url` as it does in a
   checkout, with no binary-mode branch, except where SB3.3 names one.
3. `standaloneUiDirectory` in `src/app/serve/ui-bundle.ts` SHALL find the
   page inside the archive in binary mode.
4. No code SHALL write a file beside its own module.
5. The npm-only steps, `src/app/cli/postinstall.mjs` and
   `src/app/cli/link-global.ts`, SHALL do nothing in binary mode.

### Requirement SB4: Same commands, same results

**User story:** As a person moving from the npm package to the binary, I
want every command to behave the same, so that docs and scripts still work.

1. The binary SHALL accept every CLI command, flag and environment variable
   the npm package accepts, with the same output and exit codes.
2. `avoozl mcp` SHALL serve the same tools.
3. The operation table, the dispatcher and each command entry SHALL be the
   same code in both.
4. A workspace, a machine configuration and a SQLite cache written by one
   SHALL be read by the other at the same version.
5. `NODE_OPTIONS` in the environment SHALL NOT change how the binary runs
   (`execArgvExtension: "none"`).

### Requirement SB5: CI builds and runs the binary

**User story:** As the maintainer, I want CI to build and run the binary on
each OS, so that a change that breaks binary mode fails before it lands.

1. A CI job SHALL build the binary on `ubuntu-latest`, `macos-latest` and
   `windows-latest` for every pull request and every push to main.
2. The job SHALL run `scripts/check/binary-smoke.ts` against the built
   binary with Node removed from `PATH`.
3. The smoke script SHALL check SB2, SB3 and SB4 as D8 lists.
4. The `test (ubuntu-latest)`, `test (macos-latest)` and
   `test (windows-latest)` checks SHALL fail when the job fails on their OS.

### Requirement SB6: Signing

**User story:** As a person downloading the binary, I want it signed where
the OS checks, so that it opens without a bypass.

1. With the signing secrets set, the release SHALL sign the macOS binaries
   with a Developer ID identity and the hardened runtime, and submit them
   for notarization.
2. With the signing secrets set, the release SHALL sign the Windows binary
   with Authenticode.
3. Without them, the release SHALL ship ad hoc signed macOS binaries and an
   unsigned Windows binary, and the release notes SHALL say so.
4. No secret SHALL appear in a log, an artifact or the repository.

### Requirement SB7: Release assets

**User story:** As a person installing Avoozl, I want the binaries and
their checksums on the GitHub release, so that I can check what I run.

1. A tag `v*` pushed to the repository SHALL start a workflow that builds
   every target on its own runner and attaches one archive per target to a
   draft release: `.tar.gz` for macOS and Linux, `.zip` for Windows.
2. The release SHALL hold `SHA256SUMS`, one line per archive.
3. The workflow SHALL run the smoke script on each target's binary before
   it attaches the archive.
4. The npm package SHALL keep its `pack` check and ship as before.

### Requirement SB8: The Kiro Crew app folder

**User story:** As a Kiro Crew user, I want the app to keep working, so
that the binary changes nothing for me.

1. `hosts/kirocrew` SHALL stay a folder that Kiro Crew runs with its own
   Node, carrying its own bundle.
2. The binary and the app folder SHALL share one workspace and machine
   configuration format.

### Requirement SB9: Docs

**User story:** As a person setting up a headless machine, I want install
steps for the binary, so that I do not need Node.

1. `docs/getting-started.md` SHALL show installing the binary, checking its
   checksum, and the launchd and systemd units that run it.
2. The docs SHALL state the size, the signing state of each target, and how
   to verify `SHA256SUMS`.
