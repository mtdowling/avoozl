---
repo: avoozl
---
# Tasks: GitHub-native Avoozl

Explicit `after` lists and each task's `after` fact govern execution; phase
numbers alone do not impose a dependency. Requirement numbers are in
brackets (`GN1` to `GN8`, in `requirements.md`); `D` sections refer to this
spec's `design.md`, `R` numbers to `.kiro/specs/avoozl/requirements.md`.

No task here starts before `spec/spec-assignee`, `spec/drop-mirror` and
`spec/approval-cutdown` have landed (§D8).

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and state folders, real git with a bare remote, a fake GitHub and
fake executors; Avoozl runs the repository's checks; no real workspace data,
machine configuration, credentials or personal plans in the repository
(AGENTS.md). A task that deletes a test file first lists, in its pull
request, each behavior that file covered and the test that covers it
afterward (GN1.8). Screen changes need phone and desktop, light and dark
screenshots for owner approval before merge (R92.12); screenshots are shown
to the owner and never committed (AGENTS.md). Public text names no company
or internal tool.

Approving this spec, creating issues and starting agents are separate
acts. Task IDs start with `gn-` so they never collide with the IDs of the
other specs.

## Phase 1: Worker machines go

- [ ] gn-1.1 Remove worker machines [GN1.1, GN1.2, GN1.3, GN1.4, GN1.5, GN1.6, GN1.8] (§D1)
  - $done: Each removed command and operation is refused as unknown and changes nothing; a config with `runner.role`, `workers.offerTo` or `workers.grantStaleAfter` loads with the key dropped; a journal with offer, claim and grant records replays with the spec not held; `runner report` from a manual take and from a local session still records; Take over, Hand off and Release still pass their tests; a search of `src/` and `kirocrew-app/` finds no `grant/`, `offerTo` or `worker-offer`; the pull request lists each deleted test file's kept behaviors and where they are tested now.
  - Delete the modules marked "gone" in §D1 and their tick steps, ops, commands, config schema keys, Needs you rows and page parts; move what `runner report` and the manual take still use out of `remote-runner.mjs`.
- [ ] gn-1.2 Docs say one machine per driver, after gn-1.1 [GN1.7] (§D1)
  - $done: README and `docs/` name no worker machine, offer or grant; the word test of WP8.3 fails on a planted "worker machine"; the README section on more agents names `avoozl take` and one driver per spec.
  - $after: gn-1.1

## Phase 2: No trailers

- [ ] gn-2.1 Landing commits with no trailers; Flow and rebuild read the tick, after gn-1.1 [GN2.1, GN2.2, GN2.3, GN2.4, GN2.5, GN2.8] (§D2)
  - $done: A direct landing, a batch landing and a pull request landing each write a message with no trailer line; a scratch repository rebuilds to the same landed tasks, landing times, authors and pull request numbers after its database is deleted; Flow shows lead time for a rebuilt task and "not known" for its model, tries and credits; a spec on its own specs branch takes its landing time from that branch's tick commit.
  - $after: gn-1.1
  - Delete `landing-trailers.mjs`; the tick reader of §4.41 records SHA, time, author and pull request number for each new tick; `landingsFromGit` reads ticks; retro files hold no per-task credits (GN2.6).

## Phase 3: Approval is a merged pull request, and it publishes

- [ ] gn-3.1 Publish the spec and epic issues on approval; drive only when every tied issue names this login [GN3.1, GN3.2, GN3.3, GN3.4, GN3.5, GN3.6, GN3.8, GN3.9, GN3.10, GN3.11] (§D3)
  - $done: With a fake GitHub: an approver's merge of a spec PR with an assignee makes one spec issue and one epic issue on the next tick, linked as a sub-issue, with that assignee copied; a spec PR with no assignee and a pushed approver commit leave both issues unassigned, shown as "Unassigned", with no Needs you row and nothing started; an instance drives a spec only when its spec issue and epic issue both name its login; a second workspace makes no issue; two racing workspaces of one login leave one open issue and close the other as a duplicate; local-only mode makes no GitHub call; every write goes through the write pacer.
- [ ] gn-3.2 Remove the publish button, keep the CLI retry, after gn-3.1 [GN3.7] (§D3)
  - $done: The page has no **Make the GitHub issues** button and no "Not shared" state in a GitHub workspace; a failed publish raises one Needs you row offering `avoozl spec publish`, which makes the issue; screenshots approved by the owner.
  - $after: gn-3.1
- [ ] gn-3.3 A merged spec PR is the only approval in a GitHub workspace [GN4.1, GN4.2, GN4.3, GN4.4, GN4.5, GN4.7] (§D4)
  - $done: A non-approver's spec PR merged by an approver is approved on the next tick; merged by a non-approver it is not; `plan.approve` and the delegation operations are refused as unknown in a GitHub workspace; **Open pull request** pushes `spec/<name>` and opens a spec PR; **Approve revision** writes a commit in local-only mode; screenshots approved by the owner.
- [ ] gn-3.4 `docs/specs.md` says how to approve, after gn-3.3 [GN4.6] (§D4)
  - $done: The Approving section says: open a pull request with the spec folder; an approver merges it; that merge is the approval; it names no button for a GitHub workspace.
  - $after: gn-3.3

## Phase 4: Review output on GitHub

- [ ] gn-4.1 Post each round's review on the pull request or the spec issue [GN5.1, GN5.2, GN5.4, GN5.5, GN5.7, GN5.8] (§D5)
  - $done: With a fake GitHub: a pr-mode round makes one review with event `COMMENT`, a line comment per finding on a changed line and the rest plus the falsifier verdict in its body; a direct-mode round makes one spec issue comment naming the task and candidate SHA; a spec review lands on the spec PR; a refused write posts the held line and one Needs you row; one write per round per place.
- [ ] gn-4.2 Failing check output in the check run, after gn-4.1 [GN5.3, GN5.4] (§D5)
  - $done: A failing check on a pull request head fills the check run's output with the command and at most 60 lines and 10 KB; in direct mode the same text is in the round's spec issue comment.
  - $after: gn-4.1
- [ ] gn-4.3 Finding decisions read from GitHub, and rebuild restores findings, after gn-4.1 [GN5.6, GN5.9, GN5.10] (§D5)
  - $done: A resolved review thread reads as resolved; an approver's `reject` reply records the decision and a non-approver's does not; the page's buttons post the same reply; a rebuild restores findings and decisions from the marked reviews and comments.
  - $after: gn-4.1

## Phase 5: The epic owner

- [ ] gn-5.1 The epic issue's assignee is its owner, and it closes when its specs land, after gn-3.1 [GN6.1, GN6.2, GN6.3, GN6.4, GN6.5, GN6.6] (§D6)
  - $done: With a fake GitHub: a published epic copies the spec PR's assignee, or stays unassigned; a reassignment on GitHub is read on the next tick; the epic assignee no longer stands in for a spec issue with none; a member spec whose epic issue names another login is not driven; two owners show "N owners" and one Needs you row; the epic closes once when its last spec closes; a new member spec reopens it.
  - $after: gn-3.1

## Phase 6: Acts from GitHub

- [ ] gn-6.1 Take over, Release, Stop the line and Go ahead from GitHub, after gn-4.1, gn-5.1 [GN7.1, GN7.2, GN7.3, GN7.4, GN7.5, GN7.6, GN7.7] (§D7)
  - $done: With a fake GitHub: a person assigning themselves is Take over on the next tick and unassigning is Release; `avoozl:stopped` on a spec issue stops that spec and its removal by an approver resumes it, while its removal by the agent identity or a non-approver does not; the page's buttons make the same GitHub change; label creation goes through the popup once; an approver's `go ahead` reply on a findings comment resumes the same session, while a non-approver's or the agent identity's reply, or a reply on an old round, does nothing; `docs/delivery.md` holds the table of §D7.
  - $after: gn-4.1, gn-5.1

## Phase 7: The other specs

- [ ] gn-7.1 Mark what this spec retires in the other specs [GN8.1, GN8.2, GN8.3, GN8.4, GN8.5, GN8.6] (§D8)
  - $done: Each requirement, task and proof GN8 names carries a dated line naming this spec, with its text kept; `node scripts/check/spec-lint.mjs` reports 0 errors.

- [ ] gn-p1 Proof: one machine, from spec PR to closed epic, with no Avoozl button, after gn-1.1, gn-2.1, gn-3.2, gn-3.3, gn-4.3, gn-5.1, gn-6.1 [GN1, GN2, GN3, GN4, GN5, GN6, GN7] (§D3, §D5)
  - $done: Expected: (1) one spec issue and one epic issue appear with the spec PR's assignee copied, and the spec runs only on the instance tied to that login; (2) the review and failing check output are on the pull request and the spec issue, and none is only in the database; (3) both tasks land with no trailer; (4) the epic closes; (5) the rebuilt workspace shows the same landed tasks and findings.
  - $done: Expected result observed; receipt under `docs/evidence/`.
  - $manual: true
  - $after: gn-1.1, gn-2.1, gn-3.2, gn-3.3, gn-4.3, gn-5.1, gn-6.1
  - Setup: an isolated workspace, a scratch GitHub repository with one task on `landing: pr` and one on `landing: direct`, in one epic, and a second login that is not an approver.
  - Action: (1) the second login opens a spec PR, assigns the approver's login, and the approver merges it; (2) run ticks until both tasks land, with one task made to fail its checks once; (3) add and remove `avoozl:stopped` on the spec issue; (4) delete the database and run `avoozl rebuild`.
  - Expected: (1) one spec issue and one epic issue appear with the spec PR's assignee copied, and the spec runs only on the instance tied to that login; (2) the review and failing check output are on the pull request and the spec issue, and none is only in the database; (3) both tasks land with no trailer; (4) the epic closes; (5) the rebuilt workspace shows the same landed tasks and findings.
  - Failure means: some part of the loop still needs Avoozl's page, or still lives only in the database.
  - Next decision: none.
