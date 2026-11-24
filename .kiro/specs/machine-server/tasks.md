---
repo: avoozl
---
# Tasks: one tick pass, any timer, thin front ends

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`MS1` to `MS13`, in `requirements.md`); `D` sections
refer to this spec's `design.md`, `R` numbers to
`.kiro/specs/avoozl/requirements.md`. Phases are the phases of D11.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders, a fake GitHub, and fake executors; Avoozl runs
the repository's checks; no real workspace data, machine configuration,
credentials or personal plans in the repository (AGENTS.md). Before
landing a task that touches a listener, run the D10 search and explain every
hit in the pull request.

Task IDs start with `ms-` so they never collide with the IDs of the other
specs.

## Phase 1: One pass on Claude Code

- [x] `ms-1.1` The pass locks [MS2] (§D3)
  - Tests on Linux, macOS and Windows: an exclusive SQLite lock is held for the handle's life and refused at once to a second opener; eight processes behind one barrier leave exactly one holder and seven that name it; after the holder is killed and eight more start, exactly one new holder exists within 5 seconds; two state folders on one workspace leave one holder, named by its record; no code path renames or deletes a lock file.
  - The code is `src/app/executors/pass-lock.ts`: the workspace pass lock `<database>.loop-lock` and `tryLock`, which the supervisor pass lock uses.
- [x] `ms-1.2` `avoozl tick` is one pass, after ms-1.1 [MS1.1, MS1.2, MS1.3, MS1.5, MS2.2] (§D2, §D4)
  - Tests through the real CLI: `avoozl tick` passes every enabled catalog workspace once, records each for `avoozl status`, and exits holding no lock; `--workspace` passes only that one; a tick that finds one workspace's pass lock held skips it and passes the other; the source test of MS1.3 passes; the single-write-path test still sees every tick write inside Operations.
  - `runPass` and `tickWorkspace` in `src/app/tick/tick-pass.ts`, the `tick` entry in `src/app/commands/delivery.ts`, and the last passes in `src/app/executors/tick-passes.ts` and `src/app/workspace/machine-status.ts`.
- [x] `ms-1.3` Children and the page outlive the tick, after ms-1.1 [MS2.3, MS3] (§D8)
  - Tests: a child started by one tick process keeps running after that process exits, with its pid and session recorded; the next pass reaps it from its exit file, resumes it on a queued message with its run count raised, and records a dead or reused pid as gone; a pass that finds the supervisor pass lock held starts nothing; an epic context session still reaches its MCP servers through its own broker process; a page killed between ticks is started again by the next on the same port, a page turned off is stopped, and the tick process listens on no socket; `avoozl link` is refused with `AVOOZL_CHILD`.
  - `openSupervisor` in `src/app/executors/supervisor.ts`, `src/app/executors/context-broker-main.ts` and `src/app/executors/page-child.ts`.
- [x] `ms-1.4` The Kiro Crew backend and cron on the pass, after ms-1.2 [MS1.4, MS12.1, MS12.3] (§D5)
  - Tests: the cron's `plans_maintain tick` call runs the machine's pass on its own state folder, records its observations and returns the start the pass released; a chat's tick call runs one pass for its own workspace; the backend starts no process; the design's F129 reason is in the code comment of the cron call.
- [x] `ms-1.5` Model access and harness readiness for unattended children, after ms-1.3 [MS5] (§D6)
  - Tests: a `keepEnv` value from `machine.env` reaches the child and no other name does; a group-readable file is refused on macOS and Linux; no value appears in logs, status or receipts; the sandbox test shows the file outside a child's read roots; a harness whose program is missing, or whose cached sign-in probe failed, shows per role in `avoozl status` and Settings › Models and a request for it opens one Needs you item.
- [x] `ms-1.6` The role proof script for any harness, after ms-1.2 [MS6.3] (§D6)
  - `scripts/proofs/proof-ms-roles-live.ts --harness NAME` runs the D6 rows on a scratch repository with `avoozl tick` run every 10 seconds as its own process, and prints one line per row; a test fails when a `ROLE_TABLE` row with `process: true` is not in its list, or a row drives a role `ROLE_TABLE` does not have; a dry run with `--harness fake-cli --offline` passes every row it can drive offline; `scripts/proofs/run-ms-owner-proofs.ts` runs ms-p2 and ms-p3 and drafts their receipts.

## Phase 2: Codex

- [x] `ms-2.1` Codex's read class inside Avoozl's sandbox, after ms-1.3 [MS7.1, MS7.2, MS7.5] (§D7)
  - Tests: `permission.read: "danger-full-access"` loads only with write roots and runs only inside Avoozl's sandbox; with no sandbox it is refused for every role, opt-in or not, on the Windows leg too; a read child's write roots exclude the task folder; `codex.json` uses it and still loads.
  - Codex's own sandbox stays off only inside Avoozl's sandbox (D12).
- [x] `ms-2.2` The containment probes and their CI test, after ms-1.3, ms-1.6 [MS8.1, MS8.2, MS8.3, MS8.4] (§D7)
  - `src/app/sandbox-probes.ts` holds every MS8.1 probe as an argv list; the test runs them under `confineChild` with `danger-full-access` and a stand-in harness on the macOS and Linux legs and every probe is refused; the Linux leg fails rather than skips without a usable `bwrap`; a probe planted to succeed fails the test naming it; `scripts/proofs/proof-ms-roles-live.ts --probes` runs the same set in a live child.
  - Fix any probe that gets through in `src/app/executors/sandbox.ts`, never by changing the probe.

## Phase 3: MCP and the drive skill

- [x] `ms-3.1` `avoozl mcp` per chat, after ms-1.2 [MS10] (§D4, §D10)
  - Tests: `avoozl mcp --workspace` serves the workspace, lists the same tools as the MCP path, and starts no process; a caller block on it grants nothing; its tick tool runs one pass for the workspace and returns; `--url` and `AVOOZL_URL` are refused naming `avoozl mcp`; the Kiro Crew cron's call through `avoozl mcp --kirocrew` returns the chat intents.
  - `src/app/mcp/mcp-stdio.ts` and `src/app/mcp/mcp-tick.ts`, and the `mcp` entry in `src/app/commands/machine.ts`.
- [x] `ms-3.2` The `avoozl-drive` skill, after ms-1.2 [MS9] (§D2)
  - `prompts/skills/avoozl-drive.md` says to run `avoozl tick` once per wake, read `avoozl next` and `avoozl status`, report Needs you with the person's commands, pass on steers with the commands an agent may run, and decide nothing the tick decides; `npm run check:hosts` passes with it in both host packages.

## Phase 4: Host packages

- [x] `ms-4.1` One source and `hosts/kirocrew/` [MS11.1, MS11.2] (§D9)
  - The Kiro Crew app is `hosts/kirocrew/` and every reference outside `docs/research/` and `docs/evidence/` follows; `prompts/` (with `prompts/skills/`) and `roles.json` are the source; `npm run check:hosts` passes and fails naming a file after one generated byte changes; `pretest` and `pretest:ci` run the check; the Kiro Crew page tests pass.
  - `scripts/bundle/build-hosts.ts` holds the adapters.
- [x] `ms-4.2` The Claude Code host package, after ms-4.1, ms-3.1 [MS11.3] (§D9)
  - `hosts/claude-code/` is built by the Claude Code adapter and checked; a test installs it into a temporary Claude Code config and finds the skills and the `avoozl mcp` entry; the guard refuses an agent shell call to each person-only `avoozl` command and allows the others; the skill names how the person approves and answers.

## Phase 5: The cron and the docs

- [x] `ms-5.1` `tick.py` keeps only chat intents, after ms-1.4, ms-4.1 [MS12.2, MS12.4] (§D5)
  - `hosts/kirocrew/crons/tick.py` opens, sends and re-trusts and nothing else; the Python test with a fake context covers each and a refused send; the Node test that the cron's call runs the pass passes; `app.json`'s permissions are unchanged.
- [x] `ms-5.2` Docs and the product spec, after ms-1.2, ms-3.2 [MS4, MS13] (§D2)
  - The product spec, worker-paths WP1.1 and standalone-web SW3 and SW9 say what MS13 lists; `README.md`, `docs/getting-started.md`, `docs/person-only.md`, `docs/glossary.md`, `docs/workspaces.md` and `docs/scale-out.md` describe `avoozl tick`, the launchd, systemd and crontab lines, `avoozl mcp`, the drive skill, `machine.env` and the host packages.

## Phase 6: Live proofs

- [ ] `ms-live-proofs` Validate the harnesses and the Kiro Crew cron (**PARALLEL**)
  - [ ] `ms-harness-proofs` Validate the process harnesses
    - [ ] `ms-p2` Proof: every role on Claude Code with no front end, after ms-1.6 [MS5, MS6] (§D6) (**MANUAL**)
      - Expected: (1) the worker, reviewer, responder and assist rows reach their result kinds, the check decide row is named as not driven, and every session has executor `process`; (2) no watch session request exists and the line stops on the red head; (3) the sink file holds one line per decision; (4) the receipt lists each row with its harness version.
      - Record the observed result in a receipt under `docs/evidence/`.
      - Setup: an isolated Avoozl home and workspace, a private scratch GitHub repository, an approved Claude Code definition, model access from `machine.env` or a model proxy, every role's harness set to `claude-code`, the machine's `loop` on, and a `command` sink to a file. Only `avoozl tick` run as its own process drives the run: no interactive Claude Code or Codex session is open, and the run's isolated home has no Kiro Crew in it. A Kiro Crew running for other work may stay open. The owner runs it from his own terminal, because Kiro Crew's sandbox refuses a nested `sandbox-exec`.
      - Action: (1) `node scripts/proofs/run-ms-owner-proofs.ts --only ms-p2`, which makes a private scratch repository, pushes the failing commit, reads the sink file, and deletes the repository at the end; (2) correct and commit the receipt it drafts.
      - Failure means: some role still needs a front end open.
      - Next decision: whether `claude-code` becomes the default harness for new workspaces.

    - [ ] `ms-p3` Proof: every role on Codex, and the sandbox contains it, after ms-2.1, ms-2.2, ms-p2 [MS7, MS8] (§D7) (**MANUAL**)
      - Expected: (1) every row reaches its result kind or the receipt names why it cannot; (2) every probe is refused on both systems, each with its error text; (3) `codex.json`'s `proved` matches the receipt.
      - Record the observed result in a receipt under `docs/evidence/`.
      - Setup: as ms-p2 with every role on `codex`, its own `CODEX_HOME`, and the model reached through the repository's model proxy. On macOS and on Linux. The owner runs it from his own terminal.
      - Action: (1) `node scripts/proofs/run-ms-owner-proofs.ts --only ms-p3`; (2) read Codex's transcript and the probe log; (3) update `proved` in `codex.json` in the receipt's commit.
      - Failure means: Codex cannot run unattended here; it stays off the failing roles.

  - [ ] `ms-p7` Proof: the cron on a throwaway Kiro Crew, after ms-5.1 [MS12] (§D5) (**MANUAL**)
    - Expected: (1) the chat opens, gets the message and keeps trust mode; (2) the cron history shows only open, send and trust calls besides the pass; (3) the task lands.
    - Record the observed result from the current cron in a receipt under `docs/evidence/`.
    - Setup: the throwaway test Kiro Crew with its own home and this machine's `loop` on, an isolated workspace with one `kirocrew` task, its worker and reviewer lanes, and a private scratch repository; the cron is the only thing that runs the tick; `scripts/proofs/proof-ms-p7-live.ts` sets it up and acts as the person. The chat drives the test crew's clicks itself.
    - Action: (1) approve the task; (2) restart the test crew's gateway while the worker's chat has a turn running, so the pass nudges the quiet chat, which sends a message to it; (3) read the cron's run history.
    - Failure means: the cron does work the pass should own, or a Kiro Crew machine needs another timer.
