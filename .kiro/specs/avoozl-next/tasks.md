---
repo: avoozl
completion: integrated
checks: npm test, git diff --check
---
# Tasks: the remaining Avoozl work

Status: Draft

Status 2026-11-18 (spec audit). Phases 1 to 3 are built, under the PRs named
on each ticked task, except `an-p3`, which waits on the main spec's proof P49.
In Phase 4, `an-4.1` and `an-4.3` are superseded (Ideas and the lessons store
were removed) and `an-4.2` and `an-4.4` are proved live. Nothing here is
approved or projected.

Ordered by phase. Each phase ends with a proof; a phase starts after the
proofs it depends on pass (each task's `after` fact says which).
Requirement numbers are in brackets (`AN1` to `AN4` here; `RC` and `R`
numbers refer to the other two specs); `D` sections refer to
`.kiro/specs/radar-coder/design.md`, `§` sections to
`.kiro/specs/avoozl/design.md`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and a fake GitHub; run `npm test` and `git diff --check` before
landing; no real workspace data, credentials or personal plans in the
repository (AGENTS.md); no force push; land by task branch, pull request and
`gh pr merge --merge` once Linux, macOS and Windows pass.

This spec is a draft. Approving it, creating issues and starting agents are
separate acts. Task IDs start with `an-` so they never collide with `rc-` or
the IDs of `.kiro/specs/avoozl/`. The `design.md` section "Owner steps" lists
what needs a person.

## Phase 1: Tracker gates finish

Requirement AN1 (RC23, D28). `rc-22.1` and `rc-22.2` are merged.

- [x] an-1.1 The waiting label setting and its writes (was rc-22.3) [AN1.1] (§D28)
  - Facts:
    - done:
      - Fake-GitHub tests: the label is on the gate and its gate-only dependents, off a dependent that has another unmet blocker, kept on failed and unknown, removed on done, and written once across three ticks; a label equal to another managed label is refused naming both; the UI test shows the field with its default.
  - Built: PR #203 (was rc-22.3).
  - `radar.trackerLabel` with default `avoozl:waiting-on-tracker` joins the label table, the clash check, Settings and Set up's label step; the tick adds the label to the gate issue and to dependents held only by gates, and removes it on done, cleared or removal from the plan; `src/app/test/tracker-gate-label.test.mjs`, `kirocrew-app/ui/test/tracker-label.test.mjs`.
- [x] an-1.2 Needs you row and the person's clear as an order (was rc-22.4), after an-1.1 [AN1.2] (§D28)
  - Facts:
    - done:
      - Fake tests: a failed gate gives one row across three ticks and releases nothing; an allowed clear releases the dependent and is not counted as verified completion; a stranger's clear is reverted; a later `done` adds evidence only; a second clear records nothing new.
    - after: an-1.1
  - Built: PR #203 (was rc-22.4).
  - One row for a failed gate or two unknown reads, never cleared by Avoozl; a clear by label removal, command, MCP call or control passes the trigger-label check and is recorded as an order with who, how, time, reason and last known state; the brief of each released dependent says the gate was cleared by a person; a stranger's removal is reverted with one row; `src/app/test/tracker-gate-clear.test.mjs`.
- [x] an-1.3 Gate rows in Release queue, Trace and Waiting on you, plus the CLI and MCP reads (was rc-22.5), after an-1.2 [AN1.3] (§D28)
  - Facts:
    - done:
      - The UI test renders an open, a failed and a cleared gate and checks the fields and the Waiting on you filter at 320 px; the CLI read matches the page; `node scripts/release-scan.mjs` is clean.
    - after: an-1.2
  - Built: PR #203 (was rc-22.5). The Trace part ended when Trace was removed (#469); gate rows stay in the Release queue and Needs you.
  - Release queue and Trace show tracker, state word, last and next check, evidence, link and Clear; Waiting on you lists only failed or twice-unknown gates; `avoozl gate list` and the MCP read return the same rows; docs describe the three example roles by role only; `kirocrew-app/ui/test/tracker-gates.test.mjs`.
- [x] an-p1 Proof: a gate with a fake plugin, after an-1.1, an-1.2, an-1.3 [AN1.4] (§D28)
  - Facts:
    - done:
      - Expected result observed with the fake plugin; receipt under `docs/evidence/`.
    - after: an-1.1, an-1.2, an-1.3
  - Built: PR #232 (live receipt for rc-p22).
  - Setup: a scratch repository, an approved spec with a gate and one dependent, and a fake `gate` plugin whose answer the test sets. Action: the plugin says `open`, then `unknown` twice, then `failed`, then `done`; in a second run clear the gate as an allowed person and as a stranger. Expected: the label sits on the gate and the dependent; nothing is released until `done`; one Needs you row for the failed state, closed on `done`; an allowed clear releases the dependent and is recorded as an order; a stranger's clear is reverted.

## Phase 2: Private plans on the mirror's plans branch

Requirement AN2 (RC25, D30). The mirror itself (settings, sync, tracking, forward, public poll, conflicts, Create and Adopt setup) and the `plansBranch` setting with the two-home reader are merged. Forward targets (`rc-25.1` to `rc-25.3`) are merged; `rc-25.4` to `rc-25.7` are with another worker (pull request 191 and later). Start `an-2.2` after those land, because both edit the forward path.

- [x] an-2.1 Marker `ref`, approval on the plans branch, `verify-issue` and crew commands (was rc-24.3) [AN2.1] (§D30)
  - Facts:
    - done:
      - Tests: a private spec's issue passes; a `ref` that is the default branch, missing, or shares history fails with the reason; the prompt text equals the shipped one.
  - Built: PR #202 (was rc-24.3). `verify-issue` was removed later (#509, task 45.2).
  - Marker writer and parser gain `ref`; approval of a private spec opens its pull request against `plansBranch`; `commit` check uses `<ref>...<commit>` and requires an orphan branch; `--json` prints the fetch and show commands; the one-line prompt is unchanged.
- [x] an-2.2 Containment: sync, forward, leak scan, explicit refspecs (was rc-24.4) [AN2.2] (§D30)
  - Facts:
    - done:
      - Tests: a planted plans-branch name or path blocks the push with one row naming the rule; the sync leaves the `plansBranch` head unchanged; a test scans Avoozl's push calls and finds no banned flag.
  - Built: PR #202 (was rc-24.4).
  - Sync names the default branch only; the forward clone is single-branch; the leak scan blocks the plans branch name, private spec paths and commits from it in any forward text; every push has one explicit refspec and no `--mirror`, `--all`, `--tags` or wildcard.
- [x] an-2.3 Issues from public and private plans, with edges across homes (was rc-24.5), after an-2.1 [AN2.3] (§D30)
  - Facts:
    - done:
      - A fake GitHub test: both kinds of issue are written; no write reaches the source for a private plan; a public task waits on a private one and the reverse, each releases on its blocker's own rule, and the public body holds no private title, text, ID or link.
    - after: an-2.1
  - Built: PR #204 (was rc-24.5).
  - Private-plan issues stay in the mirror and never go to the source; public-plan issue bodies stand alone with no private text and no `plansBranch`; both homes project into the same mirror and release under the same rules; a `requires` edge across homes is allowed both ways, and a public-safe body says only `Waits on a private task.`
- [x] an-p2 Proof: a public and a private plan in one mirror, with a fake GitHub, after an-2.1, an-2.2, an-2.3 [AN2.4] (§D30)
  - Facts:
    - done:
      - Expected result observed with the fake GitHub; receipt under `docs/evidence/`. The run on real scratch repositories (`rc-p24`) is an owner step.
    - after: an-2.1, an-2.2, an-2.3
  - Built: PR #242 (rc-p24 rerun and receipt).
  - Setup: a fake GitHub with a public-visibility source and a private mirror. Action: one public and one private plan, active together, one public task waiting on a private one; approve both, project, run `verify-issue` on one issue of each, forward a change for each, then plant the plans branch name in a forward. Expected: both plans in one graph; the cross edge holds and releases; the public issue says only that it waits on a private task; both verify; the planted forward is blocked.

## Phase 3: Crews on public repositories

Requirement AN3 (R85, §6.14).

- [x] an-3.1 Hook command: scan a crew's writes before they run [AN3.1] (§6.14)
  - Facts:
    - done:
      - `avoozl content hook` refuses a gh or git write that holds a rule match or text it cannot read, naming the rule set, id and place and never the text.
  - Built: PR #381 (main spec task 39.1).
  - `avoozl content hook`, `src/app/public-crews.mjs`; tests with a fake terms file and a canary, one per write kind in R85.3, plus an expansion refusal.
- [x] an-3.2 Audit on the tick: delete a hit, pull the cord, alert, after an-3.1 [AN3.1] (§6.14)
  - Facts:
    - done:
      - The tick deletes a matching crew comment, closes a matching pull request, pulls the cord for the repository, and sends one notice and one Needs you item.
    - after: an-3.1
  - Built: PR #397 (main spec task 39.2).
  - `publicCrewAudit`, cursor per repository, fake GitHub; a comment is deleted, a pull request closed, one notice and one Needs you item.
- [x] an-3.3 Public crew checklist, sign-off and handoff gate, after an-3.1 and an-3.2 [AN3.1] (§6.14)
  - Facts:
    - done:
      - A person signs off the checklist; a public repository is handed to Issue Radar only with a current sign-off, which lapses when a hashed item changes.
    - after: an-3.1, an-3.2
  - Built: PR #420 (main spec task 39.3).
  - `publiccrews.signoff`, the Public crews card, the `untriaged.handoff` check; person-only; lapse on a changed hash.
- [x] an-3.4 Stop public crews, after an-3.2 [AN3.1] (§6.14)
  - Facts:
    - done:
      - One person-only action pulls the cord for every public repository with a crew and lists the crews to pause.
    - after: an-3.2
  - Built: PR #410 (main spec task 39.4).
  - `publiccrews.stop` in the app, the CLI and MCP policy (person only to resume).
- [x] an-3.5 Public docs and the upstream requests, after an-3.3 and an-3.4 [AN3.1] (§6.14)
  - Facts:
    - done:
      - `docs/public-crews.md` states the limits in generic terms and drafts the Kiro Crew requests without filing them.
    - after: an-3.3, an-3.4
  - Built: PR #425 (main spec task 39.5).
  - `docs/public-crews.md` in generic terms; limits stated; requests drafted, none filed.
- [ ] an-p3 Proof: a public crew's leak is stopped, deleted and alerted, after an-3.1, an-3.2, an-3.3, an-3.4, an-3.5 [AN3.2] (§6.14)
  - Facts:
    - done:
      - Expected result observed; receipt under `docs/evidence/`.
    - after: an-3.1, an-3.2, an-3.3, an-3.4, an-3.5
  - Setup: an isolated Kiro Crew home, a scratch repository, a fake terms file with one canary, a test crew agent with the hook. Action: (1) the crew posts a comment, opens a pull request and publishes a commit, each with the canary; (2) it publishes a commit with the canary in a file; (3) it writes a comment through a script; (4) the tick runs; (5) hand an issue to a crew before and after sign-off. Expected: (1) and (2) refused with rule set, id and place and no text; (3) goes through, then the tick deletes it, pulls the cord and notifies once; (4) a clean comment stays; (5) refused before sign-off, accepted after, refused again when the hook changes.

## Phase 4: Named proofs for shipped features

Requirement AN4. The parts of each proof already have tests; each task adds the one named proof test and a receipt. These tasks touch only test files and `docs/evidence/`, so they can run beside any other phase.

- [ ] an-4.1 Proof P38: the Specs name and ideas [AN4.1] (§8.7, §8.8)
  - Facts:
    - done:
      - The named test passes and a receipt under `docs/evidence/` records setup, action, observation and verdict.
  - Superseded 2026-11-18: Ideas were removed (#228), so there is no idea step to prove; the Specs-name steps of P38 are covered by `specs-name.test.mjs`.
  - Run steps 1 to 7 of `avoozl-p38` in `.kiro/specs/avoozl/tasks.md` as `src/app/test/proof-p38.test.mjs`, reusing the helpers of `ideas.test.mjs` and `specs-name.test.mjs`.
- [x] an-4.2 Proof P39: pull the Andon cord [AN4.1] (§4.11)
  - Facts:
    - done:
      - The named test passes and a receipt under `docs/evidence/` records the run.
  - Proved live instead of a named test: `docs/evidence/p39-andon-live.md` (2026-11-19).
  - Run steps 1 to 8 of `avoozl-p39` as `src/app/test/proof-p39.test.mjs`, reusing `flow-andon.test.mjs`; where a step dispatches a worker, check the Radar release instead (no `ready` label in the stopped scope).
- [ ] an-4.3 Proof P42: add the Share steps 13 and 14 [AN4.2] (§4.18, R28.9)
  - Facts:
    - done:
      - The extended test passes; the receipt names steps 13 and 14.
  - Superseded 2026-11-18: the lessons store and its Share steps were removed (#228). Nothing to add to P42.
  - Extend `src/app/test/proof-p42.test.mjs` with steps 13 and 14 of `avoozl-p42`, reusing `lessons-share.test.mjs`.
- [x] an-4.4 Proof P43: activity log [AN4.1] (§4.19)
  - Facts:
    - done:
      - The named test passes and a receipt under `docs/evidence/` records the run.
  - Proved live instead of a named test: `docs/evidence/p43-activity-live.md` (2026-11-19).
  - Run steps 1 to 7 of `avoozl-p43` as `src/app/test/proof-p43.test.mjs`, reusing `activity-log.test.mjs`; the MCP dispatch in step 2 becomes an MCP read or a Radar release row.
