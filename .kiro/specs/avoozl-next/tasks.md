# Tasks: the remaining Avoozl work

Status: Draft

Ordered by phase. Each phase ends with a proof; a phase starts after the
proofs it depends on pass (the edges in `avoozl/manifest.json` say which).
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
the IDs of `.kiro/specs/avoozl/`. Phase 1 builds on `rc-22.2` (pull request
155) and `rc-20.1` (pull request 138); start it after both merge. The
`design.md` section "Owner steps" lists what needs a person.

## Phase 1: Tracker gates finish

Requirement AN1 (RC23, D28). `rc-22.1` is done; `rc-22.2` is pull request 155.

- [ ] an-1.1 The waiting label setting and its writes (was rc-22.3) [AN1.1] (§D28)
  - `radar.trackerLabel` with default `avoozl:waiting-on-tracker` joins the label table, the clash check, Settings and Set up's label step; the tick adds the label to the gate issue and to dependents held only by gates, and removes it on done, cleared or removal from the plan; `src/app/test/tracker-gate-label.test.mjs`, `kirocrew-app/ui/test/tracker-label.test.mjs`.
  - Done when: Fake-GitHub tests: the label is on the gate and its gate-only dependents, off a dependent that has another unmet blocker, kept on failed and unknown, removed on done, and written once across three ticks; a label equal to another managed label is refused naming both; the UI test shows the field with its default.
- [ ] an-1.2 Needs you row and the person's clear as an order (was rc-22.4), after an-1.1 [AN1.2] (§D28)
  - One row for a failed gate or two unknown reads, never cleared by Avoozl; a clear by label removal, command, MCP call or control passes the trigger-label check and is recorded as an order with who, how, time, reason and last known state; the brief of each released dependent says the gate was cleared by a person; a stranger's removal is reverted with one row; `src/app/test/tracker-gate-clear.test.mjs`.
  - Done when: Fake tests: a failed gate gives one row across three ticks and releases nothing; an allowed clear releases the dependent and is not counted as verified completion; a stranger's clear is reverted; a later `done` adds evidence only; a second clear records nothing new.
- [ ] an-1.3 Gate rows in Release queue, Trace and Waiting on you, plus the CLI and MCP reads (was rc-22.5), after an-1.2 [AN1.3] (§D28)
  - Release queue and Trace show tracker, state word, last and next check, evidence, link and Clear; Waiting on you lists only failed or twice-unknown gates; `avoozl gate list` and the MCP read return the same rows; docs describe the three example roles by role only; `kirocrew-app/ui/test/tracker-gates.test.mjs`.
  - Done when: The UI test renders an open, a failed and a cleared gate and checks the fields and the Waiting on you filter at 320 px; the CLI read matches the page; `node scripts/release-scan.mjs` is clean.
- [ ] an-p1 Proof: a gate with a fake plugin, after an-1.1, an-1.2, an-1.3 [AN1.4] (§D28)
  - Setup: a scratch repository, an approved spec with a gate and one dependent, and a fake `gate` plugin whose answer the test sets. Action: the plugin says `open`, then `unknown` twice, then `failed`, then `done`; in a second run clear the gate as an allowed person and as a stranger. Expected: the label sits on the gate and the dependent; nothing is released until `done`; one Needs you row for the failed state, closed on `done`; an allowed clear releases the dependent and is recorded as an order; a stranger's clear is reverted.
  - Done when: Expected result observed with the fake plugin; receipt under `docs/evidence/`.

## Phase 2: Mirror repositories

Requirement AN2 (RC24, D29). The mirror's private plans branch is pull request 154 and is not part of this phase.

- [ ] an-2.1 `mirror` setting: form and raw `.avoozl.json`, private-only validation [AN2.1] (§D29)
  - Fields, defaults and refusals of RC24.1 and RC24.2; the form and the raw file write one record; `src/app/test/mirror-policy.test.mjs`.
  - Done when: A public or unreadable mirror is refused; `forward: auto` with no trusted person is refused; the form and the raw file agree after an edit in either; `npm test` passes.
- [ ] an-2.2 Sync step and write targets, after an-2.1 [AN2.1] (§D29)
  - `mirrorSyncStep` fast-forwards the mirror's default branch; divergence raises one Needs you row and pauses the mirror steps; `writeRepo(policy)` sends projection, labels, Project, release and merge to the mirror; source issue link marker with no private text copied out.
  - Done when: A fake GitHub test: a fast-forward is applied, a divergence gives one row across three ticks and no write to either branch, no call writes to the source except the forward path.
- [ ] an-2.3 Track merged mirror PRs, rows and Trace steps, after an-2.2 and an-1.3 [AN2.1] (§D29)
  - `mirror_forward` record keyed by merge commit; rows in Waiting on you and Release queue; Trace steps Mirror merged, Forwarded, Public PR, Public merged. It follows an-1.3 because both edit the same Trace and Release queue code.
  - Done when: A merge in the mirror gives one record across repeated ticks and the four Trace steps appear in order with GitHub times.
- [ ] an-2.4 Forward: one commit, strip, scan, push, public PR; nudge and auto, after an-2.3 [AN2.1] (§D29)
  - Squashed commit by the approver; private trailers and text stripped; content rules run on commit, message, branch, title and body before any push; Forward button with a one-line reason; `auto` only for a trusted approver; no shared-token fallback; normal push only.
  - Done when: Tests: a clean change forwards once; a planted private term blocks the push with one row naming the rule; `auto` forwards for a trusted approver and not for another; a second press opens no second PR; no force push is ever issued.
- [ ] an-2.5 Public poll: done on public merge, closed unmerged, review copy-back, after an-2.4 [AN2.1] (§D29)
  - Dependents release only on the public merge; a close without merge returns the item with the reason; review comments copy to the mirror PR or one follow-up issue once.
  - Done when: A fake GitHub test: a mirror merge alone releases no dependent; the public merge releases them; a close returns the row; a comment copies once across three ticks.
- [ ] an-2.6 Conflicts: sync, re-apply, then a mirror issue for a crew, after an-2.4 [AN2.1] (§D29)
  - One retry after a sync and a fresh scan; then one mirror issue naming paths only.
  - Done when: A fake GitHub test: a moved source applies on retry; a true conflict opens one issue with paths and no contents.
- [ ] an-p2 Proof: the mirror flow with a fake GitHub, after an-2.1, an-2.2, an-2.3, an-2.4, an-2.5, an-2.6 [AN2.2] (§D29)
  - Setup: a fake GitHub with a public-visibility source and a private mirror seeded as a full copy. Action: sync, merge a crew PR in the mirror, forward in nudge mode, merge the public PR; then plant a private term and try again. Expected: the public merge completes the task; the planted term blocks the push with one row.
  - Done when: Expected result observed with the fake GitHub; receipt under `docs/evidence/`. The run on two real scratch repositories is an owner step.

## Phase 3: Crews on public repositories

Requirement AN3 (R85, §6.14).

- [ ] an-3.1 Hook command: scan a crew's writes before they run [AN3.1] (§6.14)
  - `avoozl content hook`, `src/app/public-crews.mjs`; tests with a fake terms file and a canary, one per write kind in R85.3, plus an expansion refusal.
  - Done when: `avoozl content hook` refuses a gh or git write that holds a rule match or text it cannot read, naming the rule set, id and place and never the text.
- [ ] an-3.2 Audit on the tick: delete a hit, pull the cord, alert, after an-3.1 [AN3.1] (§6.14)
  - `publicCrewAudit`, cursor per repository, fake GitHub; a comment is deleted, a pull request closed, one notice and one Needs you item.
  - Done when: The tick deletes a matching crew comment, closes a matching pull request, pulls the cord for the repository, and sends one notice and one Needs you item.
- [ ] an-3.3 Public crew checklist, sign-off and handoff gate, after an-3.1 and an-3.2 [AN3.1] (§6.14)
  - `publiccrews.signoff`, the Public crews card, the `untriaged.handoff` check; person-only; lapse on a changed hash.
  - Done when: A person signs off the checklist; a public repository is handed to Issue Radar only with a current sign-off, which lapses when a hashed item changes.
- [ ] an-3.4 Stop public crews, after an-3.2 [AN3.1] (§6.14)
  - `publiccrews.stop` in the app, the CLI and MCP policy (person only to resume).
  - Done when: One person-only action pulls the cord for every public repository with a crew and lists the crews to pause.
- [ ] an-3.5 Public docs and the upstream requests, after an-3.3 and an-3.4 [AN3.1] (§6.14)
  - `docs/public-crews.md` in generic terms; limits stated; requests drafted, none filed.
  - Done when: `docs/public-crews.md` states the limits in generic terms and drafts the Kiro Crew requests without filing them.
- [ ] an-p3 Proof: a public crew's leak is stopped, deleted and alerted, after an-3.1, an-3.2, an-3.3, an-3.4, an-3.5 [AN3.2] (§6.14)
  - Setup: an isolated Kiro Crew home, a scratch repository, a fake terms file with one canary, a test crew agent with the hook. Action: (1) the crew posts a comment, opens a pull request and publishes a commit, each with the canary; (2) it publishes a commit with the canary in a file; (3) it writes a comment through a script; (4) the tick runs; (5) hand an issue to a crew before and after sign-off. Expected: (1) and (2) refused with rule set, id and place and no text; (3) goes through, then the tick deletes it, pulls the cord and notifies once; (4) a clean comment stays; (5) refused before sign-off, accepted after, refused again when the hook changes.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 4: Named proofs for shipped features

Requirement AN4. The parts of each proof already have tests; each task adds the one named proof test and a receipt. These tasks touch only test files and `docs/evidence/`, so they can run beside any other phase.

- [ ] an-4.1 Proof P38: the Specs name and ideas [AN4.1] (§8.7, §8.8)
  - Run steps 1 to 7 of `avoozl-p38` in `.kiro/specs/avoozl/tasks.md` as `src/app/test/proof-p38.test.mjs`, reusing the helpers of `ideas.test.mjs` and `specs-name.test.mjs`.
  - Done when: The named test passes and a receipt under `docs/evidence/` records setup, action, observation and verdict.
- [ ] an-4.2 Proof P39: pull the Andon cord [AN4.1] (§4.11)
  - Run steps 1 to 8 of `avoozl-p39` as `src/app/test/proof-p39.test.mjs`, reusing `flow-andon.test.mjs`; where a step dispatches a worker, check the Radar release instead (no `ready` label in the stopped scope).
  - Done when: The named test passes and a receipt under `docs/evidence/` records the run.
- [ ] an-4.3 Proof P42: add the Share steps 13 and 14 [AN4.2] (§4.18, R28.9)
  - Extend `src/app/test/proof-p42.test.mjs` with steps 13 and 14 of `avoozl-p42`, reusing `lessons-share.test.mjs`.
  - Done when: The extended test passes; the receipt names steps 13 and 14.
- [ ] an-4.4 Proof P43: activity log [AN4.1] (§4.19)
  - Run steps 1 to 7 of `avoozl-p43` as `src/app/test/proof-p43.test.mjs`, reusing `activity-log.test.mjs`; the MCP dispatch in step 2 becomes an MCP read or a Radar release row.
  - Done when: The named test passes and a receipt under `docs/evidence/` records the run.
