---
repo: avoozl
---
# Tasks: GitHub-native Avoozl

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`GN1` to `GN8`, in `requirements.md`); `D` sections
refer to this spec's `design.md`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces, real git with a bare remote and a fake GitHub; Avoozl runs the
repository's checks; no real workspace data, machine configuration,
credentials or personal plans in the repository (AGENTS.md). Screen changes
need phone and desktop, light and dark screenshots for owner approval before
merge, shown to the owner and never committed. Public text names no company
or internal tool.

## Phase 1: Worker machines go

- [x] `gn-1.1` Remove worker machines [GN1] (§D1)
  - No worker offer, grant, result step, `worker` command, `spec offer` or `spec grants` command or operation is left in `src/` or `hosts/kirocrew/`
  - `runner report` from a manual take and from a local session still records

## Phase 2: No trailers

- [x] `gn-2.1` Landing commits with no trailers; rebuild reads the tick [GN2] (§D2)
  - A direct landing, a batch landing and a pull request landing write no trailer line, and `landing-trailers.mjs` is gone
  - A rebuilt workspace takes each ticked task's tick commit as its landing commit

## Phase 3: Publishing on approval

- [x] `gn-3.1` Publish the spec issue of an adopted approval [GN3] (§D3)
  - With a fake GitHub: the merger of an approving pull request publishes one spec issue with that pull request's assignees, once; a pushed approval publishes it unassigned; another runner makes no issue; an open issue with the spec's marker is used; a failed publish is tried again; local-only mode makes no GitHub call
  - The tick queues each approval it adopts, and the evidence cache keeps the approving pull request's number

## Phase 4: Review output on GitHub

- [x] `gn-4.1` Post each review round on the pull request or the spec issue [GN5.1, GN5.2, GN5.4, GN5.5, GN5.6, GN5.7] (§D4)
  - With a fake GitHub: a review round is one marked spec issue comment naming the task and commit, once; a task with a pull request gets it there; text the content rules refuse is held; a failed post is tried again; output that exists before the first pass is not posted
- [x] `gn-4.2` Post failing checks the same way [GN5.3] (§D4)
  - A failing check run is one comment with each failing check's command, exit code and output tail, and no passing check

## Phase 5: The other specs

- [x] `gn-7.1` Delete what this spec removes from the other specs [GN8] (§D5)
  - Each requirement and criterion GN8 names is deleted or changed, with no dated note; `node scripts/check/spec-lint.mjs` reports 0 errors

## Phase 6: Proof

- [ ] `gn-p1` Proof: a merged spec PR publishes its issue, and review output reaches GitHub [GN3, GN5] (§D3, §D4) (**MANUAL**)
  - Setup: an isolated workspace and a scratch GitHub repository with one task on `landing: pr` and one on `landing: direct`, and a second login that is not an approver
  - Action: (1) the second login opens a spec PR and assigns the approver's login, and the approver merges it; (2) run ticks until both tasks land, with one task made to fail its checks once
  - Expected: (1) one spec issue appears with the approver's login assigned, made by the approver's runner only; (2) each review round and the failing check run are one comment, on the pull request for the `pr` task and on the spec issue for the `direct` task; (3) neither landing commit has a trailer
  - Expected result observed; receipt under `docs/evidence/`
