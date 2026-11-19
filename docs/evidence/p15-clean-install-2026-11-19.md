# P15: install from the packed package in a clean home, and deliver locally

Proof P15 (Requirement 24, design §13), run on 2026-11-19 from 09:57 to
10:14 UTC on the owner's Mac, in a clean home under `/private/tmp/p15-run`.
The earlier approximate run is `p15-clean-install.md` (2026-11-12). This run
installs the npm tarball instead of the checkout, and runs local delivery to
the end, which the earlier run did not.

- Source: `git clone https://github.com/mtdowling/avoozl.git`, `main` at
  `d2c10efe`
- Node v26.13.1, npm 11.20.0, git 2.56.1, macOS
- **Verdict: pass, with the limits below. P15 is ticked.** Two README gaps
  found and fixed in the same change.

## Setup

| Item | Value |
| --- | --- |
| Profile | `HOME`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME`, `GH_CONFIG_DIR`, the npm cache and the npm prefix all under `/private/tmp/p15-run/home`. Every `KIROCREW_*` and `AVOOZL_*` variable, `GH_TOKEN` and `GITHUB_TOKEN` unset |
| PATH | links to `node`, `npm`, `npx` and `git` only, the npm prefix's `bin`, then `/usr/bin:/bin:/usr/sbin:/sbin`. `command -v gh` finds nothing |
| Repository | A bare `origin.git` and its clone `app` with `check.mjs`, no GitHub remote |
| Agent | A scripted stand-in (`stand-in-agent.mjs`, no model call) as the process harness for every role: findings first, `hello.txt` on Go ahead, a verdict as falsifier. A chat cannot sign Claude Code in from a clean home |

## Steps

| Step | Result |
| --- | --- |
| `npm ci`, `npm run build` | exit 0 |
| `node scripts/release-scan.mjs` | npm package 1020 files, app package 909 files, 0 findings (no local terms file, so private names were not checked) |
| `npm pack` | `avoozl-0.1.0.tgz`, 4.5 MB, 1020 files, 335 of them under `kirocrew-app/bin/lib` |
| `npm install -g` the tarball | exit 0; `avoozl` is the npm prefix's `bin/avoozl`. Every later step runs that installed command, not the checkout |
| `avoozl init ~/plans`, `avoozl workspace add p15` | an empty workspace, the catalog default |
| `avoozl repository configure app` | `checks.test = node check.mjs`, `landing: direct`, a worktree folder |
| Spec `hello` (one task) in `~/plans/.kiro/specs/` | `plan approve hello` said "hello is not a draft spec". `avoozl plan.create --json '{"spec":"hello"}'` stored it; `plan approve hello`, then `--yes --expect 074fcb874edeaa1d`, approved it: task `hello.1` |
| `.avoozl.json` `delivery: {}`, every role on harness `p15-agent`, `lanes.local: 1`; `avoozl supervisor --tick-seconds 15` | The tick started `hello.1` as a process child. See the runs below |
| Landing | Refused: "Take over hello before it lands: avoozl spec takeover hello." After `avoozl spec publish hello` and `avoozl spec takeover hello`, then `avoozl retry hello.1`, the task landed |
| Origin `main` | `0ccb62b Land hello.1`, author `Avoozl agent <agent@avoozl.invalid>`, committer `P15 Person`, with the `Avoozl-Task`, `Avoozl-Tries` and `Avoozl-Span` trailers; `hello.txt` holds `hello` |
| GitHub, no `gh` or token | `avoozl github setup --mode plans-repo --planning-repository mtdowling/avoozl`: step `token` failed, "GitHub authentication is unavailable. Run gh auth login or set AVOOZL_GITHUB_TOKEN."; every later step skipped |
| GitHub, with `AVOOZL_GITHUB_TOKEN` | The same preview: token, repository, issues, epic, labels and settings all `ok`, 0 writes, nothing applied |

The runs on the way to the landing:

1. Attempts 1 to 3: "This machine has no sandbox for harness p15-agent".
   The chat's own shell is sandboxed, so `sandbox-exec` cannot nest. The
   harness was allowed unconfined on this machine at its approved hash
   (`harness-unconfined.json`). On a real clean Mac the sandbox is there.
2. Attempts 4 to 6: the stand-in agent reported done before findings
   ("Investigate first: report kind findings"), because investigate-first
   is on by default. The stand-in was changed to follow the protocol.
   After 3 failures each time the task stopped with one Needs you item, as
   it should.
3. Attempt 7: findings, the falsifier's verdict `stands`, Go ahead, done at
   `33b0b1f`. Avoozl ran `node check.mjs` itself (`ok`, unconfined), then
   refused to land until the workspace drove the spec (above).

## Findings and fixes

1. **The README did not say how to load a spec folder from the CLI.** The
   page stores a lint-clean folder as a draft; on the CLI only the generic
   operation does. The Specs section now names `plan.create`.
2. **The README did not say that a task lands only from the spec's
   driver.** With no GitHub a person must publish the spec's local journal
   and take it over first. "Deliver locally" now gives both commands.
3. Not fixed: there is no CLI command to approve a harness definition or to
   allow one unconfined on a machine without a sandbox. This run wrote the
   approval with the installed package's `approveHarnessDefinition`. The
   standalone page has the person's buttons.

## Not covered

- The Kiro Crew app install (`kirocrew app install`): on macOS a chat's
  shell cannot start a Kiro Crew gateway. The 2026-11-12 run covered it,
  and the test crew's `reload-app` installed this build for P8b.
- A model-backed worker: the stand-in agent makes no model call.
- P7 on a public repository after installing `gh`: it writes to GitHub.
  Only the read-only setup preview ran.
- A fresh machine or user account: this is a clean home on the owner's Mac.
