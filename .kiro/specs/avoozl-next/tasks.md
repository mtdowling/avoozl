---
repo: avoozl
---
# Tasks: the remaining Avoozl work

Status 2026-11-18 (spec audit). Phases 1 to 3 are built, under the PRs named
on each ticked task. In Phase 4, `an-4.1`
and `an-4.3` are superseded (Ideas and the lessons store
were removed) and `an-4.2` and `an-4.4` are proved live.

Ordered by phase. Each phase ends with a proof; a phase starts after the
proofs it depends on pass (each task's `after` fact says which).
Requirement numbers are in brackets (`AN1` to `AN4` here; `RC` and `R`
numbers refer to the other two specs); `D` sections refer to
`.kiro/specs/radar-coder/design.md`, `§` sections to
`.kiro/specs/avoozl/design.md`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and a fake GitHub; Avoozl runs the repository's checks; no real
workspace data, credentials or personal plans in the repository (AGENTS.md);
no force push; land by task branch, pull request and `gh pr merge --merge`
once Linux, macOS and Windows pass.

Approval lives in Avoozl, not in these files. Approving the spec, creating
issues and starting agents are separate acts. Task IDs start with `an-` so they never collide with `rc-` or
the IDs of `.kiro/specs/avoozl/`. The `design.md` section "Owner steps" lists
what needs a person.

## Phase 1: Tracker gates finish

Retired 2026-11-18 (owner decision): tracker gates went with tracker plugins. The tasks keep their IDs so that references hold; nothing in them exists.

- [x] an-1.1 Retired 2026-11-18
  - $done: Retired 2026-11-18. Nothing to do.
  - Retired 2026-11-18: tracker plugins and gates retired; tasks keep one record, local or GitHub.
- [x] an-1.2 Retired 2026-11-18
  - $done: Retired 2026-11-18. Nothing to do.
  - $after: an-1.1
  - Retired 2026-11-18: tracker plugins and gates retired; tasks keep one record, local or GitHub.
- [x] an-1.3 Retired 2026-11-18
  - $done: Retired 2026-11-18. Nothing to do.
  - $after: an-1.2
  - Retired 2026-11-18: tracker plugins and gates retired; tasks keep one record, local or GitHub.
- [x] an-p1 Retired 2026-11-18
  - $done: Retired 2026-11-18. Nothing to do.
  - $after: an-1.1, an-1.2, an-1.3
  - Retired 2026-11-18: tracker plugins and gates retired; tasks keep one record, local or GitHub.

## Phase 2: Private plans on the mirror's plans branch

Retired 2026-11-19 (owner decision): Avoozl does not forward pull requests or code between repositories. The tasks keep their IDs so that references hold; nothing in them exists.

- [x] an-2.1 Retired 2026-11-19
  - $done: Retired 2026-11-19. Nothing to do.
  - Retired 2026-11-19: the private mirror and its plans branch are deleted; a repository names its specs branch instead (Requirement 117).
- [x] an-2.2 Retired 2026-11-19
  - $done: Retired 2026-11-19. Nothing to do.
  - Retired 2026-11-19: the private mirror and its plans branch are deleted; a repository names its specs branch instead (Requirement 117).
- [x] an-2.3 Retired 2026-11-19
  - $done: Retired 2026-11-19. Nothing to do.
  - $after: an-2.1
  - Retired 2026-11-19: the private mirror and its plans branch are deleted; a repository names its specs branch instead (Requirement 117).
- [x] an-p2 Retired 2026-11-19
  - $done: Retired 2026-11-19. Nothing to do.
  - $after: an-2.1, an-2.2, an-2.3
  - Retired 2026-11-19: the private mirror and its plans branch are deleted; a repository names its specs branch instead (Requirement 117).

## Phase 4: Named proofs for shipped features

Requirement AN4. The parts of each proof already have tests; each task adds the one named proof test and a receipt. These tasks touch only test files and `docs/evidence/`, so they can run beside any other phase.

- [x] an-4.1 Proof P38: the Specs name and ideas [AN4.1]
  - $done: The named test passes and a receipt under `docs/evidence/` records setup, action, observation and verdict.
  - Superseded 2026-11-18: Ideas were removed (#228), so there is no idea step to prove; the Specs-name steps of P38 are covered by `specs-name.test.mjs`.
  - Run steps 1 to 7 of `avoozl-p38` in `.kiro/specs/avoozl/tasks.md` as `src/app/test/proof-p38.test.mjs`, reusing the helpers of `ideas.test.mjs` and `specs-name.test.mjs`.
  - Design: the avoozl spec's §8.7, §8.8.
- [x] an-4.2 Proof P39: pull the Andon cord [AN4.1]
  - $done: The named test passes and a receipt under `docs/evidence/` records the run.
  - Proved live instead of a named test: `docs/evidence/p39-andon-live.md` (2026-11-19).
  - Run steps 1 to 8 of `avoozl-p39` as `src/app/test/proof-p39.test.mjs`, reusing `flow-andon.test.mjs`; where a step dispatches a worker, check the Radar release instead (no `ready` label in the stopped scope).
  - Design: the avoozl spec's §4.11.
- [x] an-4.3 Proof P42: add the Share steps 13 and 14 [AN4.2]
  - $done: The extended test passes; the receipt names steps 13 and 14.
  - Superseded 2026-11-18: the lessons store and its Share steps were removed (#228). Nothing to add to P42.
  - Extend `src/app/test/proof-p42.test.mjs` with steps 13 and 14 of `avoozl-p42`, reusing `lessons-share.test.mjs`.
  - Design: the avoozl spec's §4.18 and its R28.9.
- [x] an-4.4 Proof P43: activity log [AN4.1]
  - $done: The named test passes and a receipt under `docs/evidence/` records the run.
  - Proved live instead of a named test: `docs/evidence/p43-activity-live.md` (2026-11-19).
  - Run steps 1 to 7 of `avoozl-p43` as `src/app/test/proof-p43.test.mjs`, reusing `activity-log.test.mjs`; the MCP dispatch in step 2 becomes an MCP read or a Radar release row.
  - Design: the avoozl spec's §4.19.
