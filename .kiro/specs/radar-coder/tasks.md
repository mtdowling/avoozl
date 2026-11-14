# Tasks: Avoozl plans and gates, Issue Radar crews code

Status: Approved

Ordered by phase. Each phase ends with a proof; a phase starts after the
proofs it depends on pass (the edges in `avoozl/manifest.json` say which).
Requirement numbers are in brackets (`RC1` to `RC12`, in `requirements.md`);
section numbers (`D1` to `D17`) refer to `design.md`.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces and a fake GitHub; run `npm test` and `git diff --check` before
landing; no real workspace data, credentials or personal plans in the
repository (AGENTS.md); no force push; land by task branch, pull request and
`gh pr merge --merge` once Linux, macOS and Windows pass.

This spec is a draft. Approving it, creating issues and starting agents are
separate acts. Task IDs start with `rc-` so they never collide with the IDs of
`.kiro/specs/avoozl/`. Entries marked `"manual": true` in the manifest wait for
a person.

Phases 13 to 19 add the work split, the coder plug, the remote coder,
integration branches, epic types, approval on the issue and the claim at
approval. They depend on Phases 1 to 5 and 9 only
and do not wait for Phase 12; the retirement epic still runs last among the
removals.

Phase 12 is the retirement epic. It is last and separate: no task in it starts
before Proof 11 (`rc-p11`) is accepted.

## Phase 1: Coder setting, labels and planning input

Requirement RC1. The Radar path starts with one setting and four label names. No projection runs yet.

- [x] rc-1.1 Per-repository `coder` in both GitHub modes, and the label set [RC1.1, RC1.3] (§D2)
  - `coder: issue-radar | worker` accepted in single-repo and plans-repo mode (the plans-repo refusal in `github-policy.mjs` is removed); `radar.planLabel`, `radar.conflictLabel`, `radar.clearPlanLabel` in the repository policy; two equal label names among planning, needs-human, claim, ready and conflict refused naming both; `src/app/test/radar-coder-policy.test.mjs`.
  - Done when: `issue-radar` validates in plans-repo mode; a policy with two equal label names is refused naming both; defaults are `to plan`, `ready`, `crew: in progress`, `merge conflict`; `npm test` passes.
- [ ] rc-1.2 Plan only the planning label, Untriaged off for Radar-coded repositories, after rc-1.1 [RC1.2, RC1.5, RC1.8] (§D3)
  - The Untriaged read lists no plain open issue for a `coder: issue-radar` repository; an issue with the planning label and an allowed labeler goes to Intake; the plan-me routing of PR 67 is untouched; Intake row action **Plan this** starts a planner chat; `src/app/test/radar-coder-intake.test.mjs`.
  - Done when: No list call for plain open issues is made for a Radar-coded repository (checked with a fake GitHub that records calls); a planning label added by a disallowed account does nothing; the plan-me routing tests of PR 67 still pass unchanged.
- [ ] rc-1.3 Source issue becomes the parent, planning label cleared only by setting, after rc-1.2 [RC1.4, RC1.6, RC1.7] (§D3)
  - After projection the source issue is the parent of the projected issues and has no ready label; `radar.clearPlanLabel` (default off) removes the planning label; one Needs you row says to clear the needs-human label, shown once; Avoozl never writes the claim or needs-human labels.
  - Done when: A fake-GitHub test shows the source is the parent, no claim or needs-human write ever happens, and the Needs you row appears once across three ticks.
- [ ] rc-p1 Proof 1: Avoozl lists only what it was asked to plan, after rc-1.1, rc-1.2, rc-1.3 [RC1] (§D17)
  - Setup: a scratch repository, `coder: issue-radar`, three plain open issues, one with the planning label from an allowed person, one with it from a stranger, one `plan me` issue from the owner. Action: run the Untriaged read and the hand-off read; start Plan this. Expected: only the two planned issues appear; the plain ones never; the stranger's is left alone; the `plan me` routes by scope. Failure means: Avoozl still triages. Next decision: drop the Intake list for Radar-coded repositories.
  - Done when: Expected result observed; a receipt under `docs/evidence/` records setup, action, observation and verdict.

## Phase 2: Projection

Requirement RC2. Spec to issues, in both modes, with batching and the preview. Nothing is written before a confirm.

- [x] rc-2.1 Plans-repo mode projects issues into the code repository, after rc-1.1 [RC2.2, RC2.3] (§D4.1)
  - Projection for `coder: issue-radar` writes issues in the code repository in both modes; closing by `Closes #N` or by Avoozl on merge; worker coder unchanged; `src/app/test/radar-coder-projection.test.mjs`.
  - Done when: With a fake GitHub, single-repo and plans-repo projections write issues only into the code repository; plans-repo with `coder: worker` still writes into the plans repository; closing works in both forms.
- [ ] rc-2.2 Show the plans repository name in issues, a per-repository switch, after rc-2.1 [RC2.4] (§D4.1)
  - `radar.showPlansRepo` (on for a private code repository, off for a public one); plans-repo projection to a public repository with it off is refused with the reason; content rules screen the name before the write.
  - Done when: A public code repository with the switch off is refused; turning it on writes the name after a content-rules pass; a private one writes it by default.
- [x] rc-2.3 Batch planner for small ready tasks, after rc-1.1 [RC2.5] (§D4.2)
  - Pure function over the plan: small, ready, same phase and repository, no edge, no human completion, cap `flow.batch.max` (3, at most 5); a task with an open blocker never batches; modes Off, Suggest, Auto; reuses `flow-batch.mjs` keys; `src/app/test/radar-coder-batch.test.mjs`.
  - Done when: Tests cover: blocked tasks never batch; the cap at 3 and at 5; an edge between two tasks splits them; a batch of one stays plain; `flow.batch.max` above 5 is refused.
- [ ] rc-2.4 Batch issues keep each task ID separate and close together, after rc-2.1, rc-2.3 [RC2.6, RC2.7] (§D4.2)
  - A batch issue with a checklist and one marker listing the task IDs; each task keeps its node, acceptance, timing and evidence; the merged closing pull request closes every member task; the checklist boxes are never read.
  - Done when: A fake merged pull request that closes a three-task batch completes all three tasks; unticked boxes change nothing; the Graph shows the batch node with its members.
- [ ] rc-2.5 Project to GitHub preview and Spec changed diff, after rc-2.3 [RC2.1, RC2.8] (§D4.3)
  - The preview modal with include, batch edit, wave and release mode; **Create issues (held)** and **Create and release**; the Spec changed diff updates unclaimed issues after approval, comments on claimed ones, closes removed tasks as not planned; mockup `04-projection.html`; `kirocrew-app/ui/test/radar-projection.test.mjs`.
  - Done when: Nothing is written before the confirm (a fake GitHub records zero writes); a claimed issue is never edited; a removed task closes as not planned; drawn at 320, 768 and 1280 px, light and dark.
- [ ] rc-2.6 Preflight checks in the preview, after rc-2.1, rc-5.1 [RC2.9] (§D4.3)
  - Preflight shows: spec on the default branch with `Status: Approved`, decision record, merge path, crew label scope (cannot verify without the grant), and the public sign-off; **Create and release** is refused when one fails.
  - Done when: Each failing preflight item refuses Create and release and names the item; a passing run enables it.
- [ ] rc-p2 Proof 2: spec to issues in both modes, after rc-2.1, rc-2.2, rc-2.3, rc-2.4, rc-2.5, rc-2.6 [RC2] (§D17)
  - Setup: a scratch single-repo and a scratch plans-repo pair; a spec with 8 tasks, 3 small and ready in one phase. Action: preview, confirm, merge a fake pull request closing the batch, edit the spec, preview Spec changed. Expected: issues in the code repository, sub-issues, blocked-by links, one batch issue of three, Project fields; three tasks close on one merge; the edit changes only unclaimed issues. Failure means: a task ID was lost in a batch. Next decision: cap batches at 1.
  - Done when: Expected result observed on real scratch repositories; receipt under `docs/evidence/`.

## Phase 3: Provenance and verify-issue

Requirement RC3. The approval becomes a commit a crew can read, and one command checks it.

- [ ] rc-3.1 Provenance marker writer and parser [RC3.1] (§D5.1)
  - `src/app/github-provenance.mjs`: write and parse `<!-- avoozl v=1 spec= tasks= commit= approved-by= plans= -->`; unknown keys ignored, unknown version refused; two markers refused; no private name or path allowed in any value; `src/app/test/github-provenance.test.mjs`.
  - Done when: Round-trip, unknown key, unknown version, duplicate marker, a space in a value, a bad commit and a path-like value are each tested.
- [ ] rc-3.2 Approve opens an approval pull request and records the merged commit, after rc-3.1 [RC3.6, RC3.8] (§D5.2)
  - Approve opens a pull request that sets `Status: Approved` in the three prose files and, with `approval.decisionRecord`, adds `docs/decisions/<spec>.md`; Avoozl records the merge commit and approver only after the merge; the `Status:` line is outside the revision hash; lint 0 errors is required; `src/app/test/radar-coder-approve.test.mjs`.
  - Done when: Approving does not change the spec hash; no commit is recorded before the merge; a closed unmerged approval pull request records nothing; a spec with lint errors cannot be approved.
- [ ] rc-3.3 verify-issue checks: marker, approver, author, spec, commit, after rc-3.1 [RC3.2–RC3.5] (§D5.3)
  - Operation `issue.verify`, read-only, observe class; five checks with the GitHub reads of D5.3; failed reads fail closed; later checks still run; output names checks, logins, repositories, task IDs and the commit and never quotes text; `src/app/test/verify-issue.test.mjs` with a fake `gh`.
  - Done when: Tests: all ok; each check failing alone, with the others reported; a 404 and a 403 each fail the check; plans-repo reads; `behind`, `ahead`, `diverged` and `identical` compare results; no issue text appears in the output.
- [ ] rc-3.4 CLI `avoozl verify-issue` and MCP tool `plans_verify_issue`, after rc-3.3 [RC3.2, RC3.4] (§D5.3)
  - The CLI command with `--json` and exit codes 0, 1, 2, 64; the MCP tool, with no workspace needed; the `aicommander` alias works; MCP tool count and classification tests updated.
  - Done when: Exit codes tested for each case; the command works with no workspace and no token other than the caller's `gh` login; `aicommander verify-issue` works.
- [ ] rc-3.5 The one-line Additional prompt, shipped verbatim, after rc-3.4 [RC3.7] (§D5.4)
  - The line of D5.4 as one constant used by Settings, the team pack and Set up; a test that compares the constant with the text in `design.md` and `AGENTS.md`-rule proposal.
  - Done when: A test fails if the constant, `design.md` D5.4 and the Set up text differ.
- [ ] rc-3.6 Projection writes the marker, after rc-3.1, rc-2.1 [RC2.10, RC3.1] (§D5.1)
  - Every projected issue body gets the provenance marker after the managed marker; `plans=` only when allowed; screened by content rules.
  - Done when: Both modes write a valid marker that `verify-issue` accepts against a fake GitHub; a private name in any value is refused.
- [ ] rc-p3 Proof 3: a real crew verifies, and each bad issue is refused, after rc-3.2, rc-3.4, rc-3.5, rc-3.6 [RC3] (§D17)
  - Setup: a scratch repository, one Radar crew with the one-line prompt, an approved spec merged through the approval pull request; plans-repo variant with a second private repo. Action: six issues: good; approver with no permission; task ID not in the spec; commit not on the default branch; author with no permission and a valid owner's login in the marker; marker edited after approval. Expected: the good one builds; each bad one is skipped as `needs-decision` and names its check. Failure means: the one-line prompt is not followed. Next decision: put the checks back in a longer prompt or add a hook.
  - Done when: Expected result observed live; receipt under `docs/evidence/`.

## Phase 4: Release

Requirement RC4. The tick adds the ready label in graph order, N at a time.

- [ ] rc-4.1 Release engine: capacity per repository and per scope, after rc-1.1, rc-2.1 [RC4.1, RC4.2, RC4.7] (§D6)
  - `release.capacity` (default 2) and `release.scopes`; a task's manifest `scope`; count open ready issues claimed or not; add ready in graph, wave, ID order; idempotent; `src/app/test/radar-coder-release.test.mjs`.
  - Done when: With N=2 and five eligible tasks, two get the label; claiming one keeps its slot; two scopes release independently; a second tick writes nothing.
- [ ] rc-4.2 Remove ready on Stop the line, reopen and re-block, after rc-4.1 [RC4.3] (§D6)
  - Ready removed from unclaimed issues in the stopped scope, on reopen and on a reopened blocker; one comment on each claimed issue; claimed issues untouched; ties to Requirement 64.
  - Done when: A claimed issue keeps its labels; unclaimed ones lose ready; the comment is posted once across three ticks.
- [ ] rc-4.3 Phase gate: release the next phase after the previous one merged, after rc-4.1 [RC4.4] (§D6)
  - A phase releases only when every task of the previous phase of the spec has a merged closing pull request; a closed-by-order task does not count.
  - Done when: A phase with one task closed by order stays held; merging it releases the next phase on the next tick.
- [ ] rc-4.4 Release mode radio fold-out and the Release queue, after rc-4.1 [RC4.5, RC4.6] (§D6)
  - Automatic, Step and Hold as one radio fold-out; the Release queue (Up next) shows what is next and why anything is held; another person's ready label counts as an order only where policy allows.
  - Done when: Step waits for one click per phase; Hold releases nothing; the queue shows the reason for each held item; drawn at 320, 768 and 1280 px.
- [ ] rc-p4 Proof 4: release honors N, scopes, phases and the stop, after rc-4.1, rc-4.2, rc-4.3, rc-4.4 [RC4] (§D17)
  - Setup: scratch repository, two crews with different label scopes, a spec of two phases. Action: run ticks while crews claim and merge; pull Stop the line; reopen a closed issue. Expected: never more than N ready per scope; phase 2 waits; a stop clears unclaimed ready labels only. Failure means: the order is lost. Next decision: add a lower N default.
  - Done when: Expected result observed live; receipt under `docs/evidence/`.

## Phase 5: Merge path

Requirement RC5. Crews do not arm auto-merge (Kiro Crew 0.12.2.4), so the tick does.

- [x] rc-5.1 Merge path check, after rc-1.1 [RC5.1] (§D7)
  - Per repository: auto-merge allowed, default branch rule requires the named CI check, `delivery.ship` set; shown as three items; Create and release refused for `auto-merge` while not ready.
  - Done when: Each missing item is named; a repository with all three reads ready; `manual` shows a warning only.
- [ ] rc-5.2 Arm GitHub auto-merge on crew pull requests, after rc-5.1, rc-3.1 [RC5.2, RC5.5] (§D7)
  - The tick arms merge-commit auto-merge on open non-draft same-repository pull requests whose author passes the actor check and that close a marked issue of this workspace; once per pull request; never `--admin`; `src/app/test/radar-coder-merge.test.mjs`.
  - Done when: A fork pull request, a pull request from a stranger, a draft, and one closing an unmarked issue are not armed; the right one is armed exactly once across three ticks.
- [ ] rc-5.3 Manual mode and the conflict label, after rc-5.1 [RC5.3, RC5.6, RC5.7] (§D7)
  - With `manual`: a Ready to merge row per green pull request, nothing armed. Conflict label on pull requests with a merge conflict and removed when clear; one Needs you row; no label written to Radar.
  - Done when: Manual arms nothing; a conflicted pull request gets the label and one row; resolving it removes both.
- [ ] rc-5.4 Stop the line stops arming, and Disarm, after rc-5.2, rc-4.2 [RC5.4] (§D7)
  - While a stop is open for the scope the tick arms nothing; armed pull requests are listed in the banner with a person-only **Disarm**.
  - Done when: With a stop open a new pull request stays unarmed; Disarm is refused for an agent or app token.
- [ ] rc-5.5 Re-verify before arming, after rc-5.2, rc-3.3 [RC5.8] (§D7)
  - The tick runs `issue.verify` once per issue per marker hash before arming; a failure arms nothing and opens one Needs you row.
  - Done when: An edited marker blocks arming; an unchanged marker runs the check once across three ticks.
- [ ] rc-p5 Proof 5: auto-merge on the right pull requests only, after rc-5.2, rc-5.3, rc-5.4, rc-5.5 [RC5] (§D17)
  - Setup: scratch repository with a required check and auto-merge allowed; one crew. Action: crew PR for a marked issue; a stranger's fork PR; a manual-mode run; a conflict. Expected: only the crew PR merges by itself after green; the rest wait. Failure means: a pull request merged that should not. Next decision: arm only on an explicit label.
  - Done when: Expected result observed live; receipt under `docs/evidence/`.

## Phase 6: The avoozl-crew agent

Requirement RC6. Avoozl ships the crew agent, because an unknown agent name falls back silently.

- [ ] rc-6.1 Ship `avoozl-crew` in the app, after rc-3.4 [RC6.1, RC6.2, RC6.6] (§D8)
  - `kirocrew-app/agents/avoozl-crew.json` and the `app.json` entry; MCP `avoozl:avoozl`; the tool and skill lists of D8 including Radar's two crew tools; the build step refuses an install with no `bin/lib`; `kirocrew-app` build tests updated.
  - Done when: The built app contains the agent; its tool list holds `plans_verify_issue` and Radar's two crew tools; a build without `bin/lib` is refused with the command to run.
- [ ] rc-6.2 Crew tools need no workspace and return the brief, after rc-3.3 [RC6.3] (§D8)
  - `plans_verify_issue` works with no default workspace and, when all checks pass, returns task IDs, acceptance and references from the issue body; no other tool in the crew's list needs a workspace.
  - Done when: A call with no workspace succeeds; the brief appears only when every check is ok; no listed tool answers "no workspace".
- [ ] rc-6.3 Set up verifies the agent is in Radar's Agent list, after rc-6.1 [RC6.5] (§D8)
  - Read the list through the grant, or the installed agent files, else show Not verified; show a crew with another agent as not covered; say that changing an existing crew's agent is unreliable.
  - Done when: The three outcomes each show a distinct state; a fake Radar list without the agent shows missing.
- [ ] rc-p6 Proof 6: a crew on avoozl-crew verifies and builds, after rc-6.1, rc-6.2, rc-6.3 [RC6] (§D17)
  - Setup: Avoozl built and installed, a crew created with agent `avoozl-crew`. Action: one marked issue and one with a bad approver. Expected: the crew calls `plans_verify_issue`, builds the first, skips the second; Set up shows the agent present. Failure means: a crew silently ran on the default agent. Next decision: fall back to the prompt-only path.
  - Done when: Expected result observed live; receipt under `docs/evidence/`.

## Phase 7: Set up and the team pack

Requirement RC7. Avoozl does what `gh` can and shows exact values for what only the owner can do.

- [ ] rc-7.1 Set up steps through `gh`: labels, branch rule, auto-merge setting, after rc-1.1, rc-5.1 [RC7.1] (§D9)
  - Each step is a preview and a confirm; a step the permission cannot do shows the permission it needs and changes nothing; read back after the write.
  - Done when: Against a fake GitHub each step writes once after confirm; a missing permission writes nothing and names the permission.
- [ ] rc-7.2 Review-rules pull request to `AGENTS.md`, and the Project, after rc-7.1, rc-3.5 [RC7.1, RC3.7] (§D9)
  - A pull request that adds the review rules and the one-line prompt sentence to `AGENTS.md`; the Project and its fields through the existing Project sync.
  - Done when: The pull request text passes content rules; the Project fields match Requirement 29.
- [ ] rc-7.3 The Radar values screen and re-read, after rc-3.5, rc-6.3 [RC7.2, RC7.3] (§D9)
  - One screen: repository, crew name, agent, model, label scope, needs-human label, claim time limit, Additional prompt, each with Copy and what it controls; with the grant, each item ticks after a re-read; without it, a checkbox marked cannot verify.
  - Done when: Every value has Copy; the grant path ticks a fake Radar's items; the no-grant path shows checkboxes; drawn at 320, 768 and 1280 px.
- [ ] rc-7.4 Crews and rules settings in the app's style, after rc-7.3 [RC7.6] (§D9)
  - Titled boxes, plain fields with defaults shown, advanced values folded, inherited values say where they come from, modes as radio fold-outs, edits in modals, no model price.
  - Done when: A UI test fails on "same as above", on a model price field, or on a mode that is not a radio fold-out.
- [ ] rc-7.5 Team pack with a `crews` section, after rc-7.3 [RC7.4, RC7.5] (§D9)
  - The settings pack gains `crews` (count, agent, models, labels, prompt, review rules, template); validated; screened by content rules; applying shows a preview and fills Set up; no crew is created; the example `sdk-team` pack ships in `examples/` with fake terms only.
  - Done when: A pack with a private name is refused; applying writes only after the preview confirm; `sdk-team` validates.
- [ ] rc-p7 Proof 7: Set up end to end, after rc-7.1, rc-7.2, rc-7.3, rc-7.4, rc-7.5 [RC7] (§D17)
  - Setup: a scratch repository with nothing configured, Radar on, grant approved. Action: run Set up with the `sdk-team` pack; do the Radar steps by hand with the shown values. Expected: Set up ticks each item after the re-read. Failure means: a shown value was wrong. Next decision: show Radar's own field names.
  - Done when: Expected result observed live; receipt under `docs/evidence/`.

## Phase 8: Observe

Requirement RC8. The screens of the experience proposal, built for Variant B (GitHub only) first.

- [ ] rc-8.1 Home: On the line, Release queue, Progress by goal, Needs you, after rc-4.4 [RC8.1, RC8.4, RC8.7] (§D10)
  - On the line from claim markers across machines (`radar.crews`), with a five-step rail and a Stale badge; Conflicts folded into Needs you; no view that repeats Issue Radar or Kiro Crew's pull request review; mockup `01-home.html`.
  - Done when: Rows come from claim markers only; paused, machine and chat are not shown without Variant A; drawn at 320, 768 and 1280 px, light and dark.
- [ ] rc-8.2 Trace drawer and page, after rc-8.1 [RC8.2] (§D10)
  - Eight steps with GitHub times, never `updated=`; deep link and Back history (Requirement 60); mockup `02-trace.html`.
  - Done when: A claim marker with `updated=` ahead of GitHub's time still shows GitHub's time; the page opens by URL and Back returns.
- [ ] rc-8.3 Side panel tab, after rc-3.2 [RC8.3] (§D10)
  - One `panelTabs` entry; matches the chat from the URL; spec check and Approve in a Spec Builder chat; a test fails when the URL shape changes; opens by itself only in a Spec Builder chat with an unapproved `tasks.md`; mockup `03-side-panel.html`.
  - Done when: Each chat kind shows its content; the URL-shape test exists.
- [ ] rc-8.4 Flow from GitHub data, after rc-8.1 [RC8.5] (§D10)
  - Ready to Claim, Claim to PR, PR to green, green to merge, flow efficiency; Stop the line keeps its meaning; mockup `07-flow-retro.html`.
  - Done when: Stage times computed from fixture events match hand-computed values.
- [ ] rc-8.5 Retro rule targets: AGENTS.md, steering, Additional prompt text, after rc-8.4, rc-3.5 [RC8.6] (§D10)
  - Retro proposals with a target; repo rules land as a pull request or a one-task issue; the Additional prompt target shows full text with Copy and a link to Radar; a check after N issues and an undo offer.
  - Done when: Applying a repo rule opens a pull request; the prompt target writes nothing to Radar; the check runs after N issues.
- [ ] rc-8.6 Variant A: Radar's crew list through one grant, after rc-8.1 [RC8.1] (§D10)
  - One grant in `permissions.api`; a Crews strip and cost per stage; behind the grant only.
  - Done when: Without the grant nothing changes; with it, crews and counts show.
- [ ] rc-p8 Proof 8: observe, and a retro rule a crew follows, after rc-8.1, rc-8.2, rc-8.3, rc-8.4, rc-8.5 [RC8] (§D17)
  - Setup: a scratch repository with a running crew. Action: run three issues; open Trace; apply a retro rule through a pull request; run a fourth issue. Expected: Trace shows GitHub times; the fourth issue's pull request follows the new rule. Failure means: a crew did not re-read the rules. Next decision: add the rule to the Additional prompt.
  - Done when: Expected result observed live; receipt under `docs/evidence/`.

## Phase 9: Quick goals

Requirement RC9. A goal becomes issues after one approval, through a generated mini-spec.

- [ ] rc-9.1 Planner chat, proposal shape and promote rules, after rc-3.2 [RC9.1, RC9.4] (§D11)
  - Planner chat with a quick-goal brief and a turn-and-time budget; proposal of 1 to 8 tasks with evidence; the four promote rules; Look and Measure; Measure off by default.
  - Done when: A proposal with a task lacking evidence is refused; each promote rule triggers alone; the budget stops the chat.
- [ ] rc-9.2 Mini-spec writer and approval, after rc-9.1, rc-3.2 [RC9.3, RC9.5] (§D11)
  - Writes `.kiro/specs/goal-<slug>/` in the Kiro layout with the goal quoted verbatim and the evidence; goes through the same approval pull request; issue bodies end with the quoted prompt after private data is removed.
  - Done when: The folder lints with 0 errors; a private name in the prompt is removed or refused; the marker passes `verify-issue`.
- [ ] rc-9.3 Quick goal modal, proposal screen, Promote to spec, after rc-9.2, rc-2.5 [RC9.1, RC9.2, RC9.4, RC9.6] (§D11)
  - Mockup `05-quick-goal.html`; Approve, Edit, Promote, Discard; confirm lists every issue; Promote opens the folder in Spec Builder and keeps issue links; auto-approve setting off by default.
  - Done when: Nothing is written before Approve; Promote keeps task IDs and issue links; drawn at 320, 768 and 1280 px.
- [ ] rc-p9 Proof 9: Make tests faster, after rc-9.1, rc-9.2, rc-9.3 [RC9] (§D17)
  - Setup: a scratch repository with a slow test suite. Action: quick goal "Make tests faster" with Measure; approve; let crews build; then a goal that crosses a promote rule. Expected: issues with measured evidence; one approval; the second goal offers Promote. Failure means: a crew skipped a mini-spec issue (Q6). Next decision: Promote for every goal.
  - Done when: Expected result observed live; receipt under `docs/evidence/`.

## Phase 10: Public repositories

Requirement RC10. This phase gates on the public-crew layers and does not restate them.

- [ ] rc-10.1 Hold release for a public repository until the public sign-off is complete, after rc-4.1 [RC10.1, RC10.2] (§D12)
  - Release and arming refuse a public repository (or one whose visibility cannot be read) until the sign-off of "Crews on public repositories" in `.kiro/specs/avoozl/` is complete. This task waits for that work to land; it adds no layer of its own.
  - Done when: A public repository with no sign-off releases nothing and says why; once that work lands the check reads its sign-off.
- [ ] rc-10.2 verify-issue output is safe to post, after rc-3.3 [RC10.3, RC10.4] (§D12)
  - A test over every output path of `issue.verify` asserts no issue or spec text and no secret appears; public docs and examples use fake terms only; `scripts/release-scan.mjs` is clean.
  - Done when: The test fails when a path prints text from an issue; the release scan finds nothing.
- [ ] rc-p10 Proof 10: public repository, after rc-10.1, rc-10.2 [RC10] (§D17)
  - Setup: a scratch public repository. Action: try release before and after the sign-off. Expected: nothing releases before. Failure means: a crew could be handed work without the layers. Next decision: refuse public repositories for the Radar path.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 11: The Radar path on a real repository

The gate for retirement. It also answers open questions Q1 and Q2 (design D16).

- [ ] rc-q3 Q3: note for Kiro Crew asking for `scope=` in the claim marker [RC12.2, RC12.4] (§D16)
  - Write the request as a note under `docs/` for a person to file. File nothing. Re-read a skip comment's marker on each new Kiro Crew release and record the answer.
  - Done when: The note exists and says exactly what key and why; the report names the release checked.
- [ ] rc-q4 Q4: re-check the `updated=` time on a later release [RC12.2] (§D16)
  - On each new release compare five claim markers' `updated=` with GitHub's `updated_at`; record the answer.
  - Done when: The report states the release, the five differences and whether stale detection may use `updated=`.
- [ ] rc-q5 Q5: a crew with no access to the plans repository, after rc-3.4 [RC12.2] (§D16)
  - Run a crew under an account with no read on a private plans repository on a marked issue; record what it does and whether mirroring the approved spec into the code repository is needed.
  - Done when: The report states the result and either closes Q5 or proposes the mirror task.
- [ ] rc-q6 Q6: does a crew take a mini-spec issue, after rc-9.2, rc-3.5 [RC12.2] (§D16)
  - One quick goal with a generated mini-spec and no decision record; one crew; record claim or skip.
  - Done when: The report states the result and whether a decision record or Promote is required.
- [ ] rc-q7 Q7: does the one-line prompt make the decision record unnecessary, after rc-3.5 [RC12.2] (§D16)
  - A marked issue with an approved spec and no `docs/decisions/` entry, the one-line prompt, one crew; record claim or skip.
  - Done when: The report states the result and sets `approval.decisionRecord`'s default.
- [ ] rc-q8 Q8: the plans repository name in a public marker, after rc-2.2 [RC12.2] (§D16)
  - Show the owner a sample public marker with the plans repository named; record the owner's choice.
  - Done when: The report states the choice: switch on, or spec moved into the code repository.
- [ ] rc-q9 Q9: the default label names [RC12.2] (§D16)
  - Read the label set Kiro Crew's own repository uses and compare it with design D2; change the defaults to match or record why not.
  - Done when: The report lists each label, its source and the decision; defaults in `rc-1.1` match.
- [ ] rc-p11 Proof 11: the whole path on a real repository, Q1 and Q2, after rc-p1, rc-p2, rc-p3, rc-p4, rc-p5, rc-p6, rc-p7, rc-p8, rc-p9, rc-p10, rc-q5, rc-q6, rc-q7 [RC11.1, RC12] (§D16, D17)
  - Setup: a real repository with slow CI (the nupp repository), two crews on two machines, one planner. Action: approve a 10-task spec; project; release N=2; merge by auto-merge; run the retro. Then repeat with a second person's crew in the same repository. Expected: every task merges through crews; no double claim; Flow shows where time went. Failure means: the path is not ready to replace the worker coder. Next decision: keep `coder: worker` as the default.
  - Done when: Expected result observed live and accepted by a person; receipt under `docs/evidence/`. Q1 and Q2 are answered in it.

## Phase 12: Retirement epic (runs only after Proof 11)

Requirement RC11. A separate last epic. Nothing here starts before `rc-p11` is accepted. Removals apply by repository `coder` first; code is deleted only when no workspace is on `worker`.

- [ ] rc-12.1 Owner decision to retire, and what to keep, after rc-p11 [RC11.1, RC11.3] (§D13)
  - The owner reads Proof 11 and decides: retire for Radar-coded repositories only, or delete the code. The decision is recorded in `docs/evidence/`.
  - Done when: A recorded owner decision exists before any removal task starts.
- [ ] rc-12.2 Switch off worker dispatch for Radar-coded repositories, after rc-12.1 [RC11.2, RC11.3] (§D13)
  - The tick opens no Avoozl worker for a `coder: issue-radar` repository; `coder: worker` unchanged; tests for both.
  - Done when: A Radar-coded repository opens no worker; a worker-coded one still does.
- [ ] rc-12.3 Retire crew routing and placement for Radar-coded repositories, after rc-12.2 [RC11.2] (§D13)
  - Routing, placement and the router prompt stop applying to them; Settings hides the Routing section when no repository is on `worker`.
  - Done when: No routing call is made for a Radar-coded repository; the Routing section is hidden only when no repository needs it.
- [ ] rc-12.4 Retire runner mode, after rc-12.1 [RC11.2] (§D13)
  - Remove `remote-runner.mjs`, its operations and CLI, the Remote badge and Attach for runners, and their tests.
  - Done when: `npm test` passes; the removed names appear nowhere in the app.
- [ ] rc-12.5 Retire the remote relay, after rc-12.1 [RC11.2] (§D13)
  - Remove the relay queue, `plans_relay`, the `avoozl-relay` agent and the Routing relay block, and their tests.
  - Done when: `npm test` passes; the relay agent is not in the built app.
- [ ] rc-12.6 Retire per-task worker budgets and the worker Files and diff fold, after rc-12.2 [RC11.2] (§D13)
  - Per-task budgets stay for planner, retro and quick-goal chats only; the worker Files and diff fold is removed with the worker drawer parts.
  - Done when: Budgets still cap a planner chat; the drawer has no Files fold for a Radar-coded task.
- [ ] rc-12.7 Compatibility test: names and aliases that must stay, after rc-12.2, rc-12.3, rc-12.4, rc-12.5, rc-12.6 [RC11.4] (§D13)
  - One test asserts that every `plans_*` MCP name, `NUPP_WORKSPACE` and `AICOMMANDER_*` variable, the `aicommander` command and `aicommander.*` setting still resolves.
  - Done when: The test fails if any listed name stops working.
- [ ] rc-12.8 Docs and Demo retargeted to crews, after rc-12.7 [RC11.7, RC8.1] (§D13)
  - README and docs say the Radar path first and `coder: worker` as the local option; Demo uses fake crews and a fake claim comment; `docs/research/` and `docs/evidence/` untouched.
  - Done when: The docs name each path once; the release scan is clean; a diff check shows no change under `docs/research/` or `docs/evidence/` except new receipts.
- [ ] rc-p12 Proof 12: after retirement both coders work, after rc-12.8 [RC11] (§D17)
  - Setup: one Radar-coded and one worker-coded repository in one workspace. Action: run both through a task. Expected: crews build the first, a worker the second; every compatibility name resolves. Failure means: retirement broke local-only mode. Next decision: restore the removed code behind `coder: worker`.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 13: The work split

Requirement RC13. Avoozl is for epics. This phase puts the scope statement in three places and adds one hint.

- [ ] rc-13.1 Scope statement in the README, Set up and the quick goal modal, after rc-1.2 [RC13.1, RC13.2, RC13.5] (§D18)
  - One source string holds the statement and the rule of thumb; the README, Set up and the quick goal modal show it; it is guidance and gates nothing; `src/app/test/radar-coder-scope.test.mjs`.
  - Done when: The three places show the same words from one string; no operation changes behavior; `npm test` passes.
- [ ] rc-13.2 One-pull-request hint with Plan it anyway, after rc-13.1, rc-9.1 [RC13.3, RC13.4] (§D18)
  - A proposal with one task and no edge shows the hint and a **Plan it anyway** action; nothing is refused; no triage, maintenance or single-pull-request feature is added.
  - Done when: A one-task proposal shows the hint and still plans when chosen; a two-task proposal shows no hint.
- [ ] rc-p13 Proof 13: the work split, after rc-13.1, rc-13.2 [RC13] (§D22)
  - Setup: a scratch repository, a one-task goal and a five-task goal. Action: open each in the quick goal modal. Expected: the statement shows in all three places; the hint shows only for the one-task goal and does not block it. Failure means: Avoozl blocks or misleads. Next decision: remove the hint.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 14: The coder plug

Requirement RC14. One adapter per coder. The Radar path moves behind it unchanged; the worker is frozen.

- [x] rc-14.1 Per-repository coder setting with three values, after rc-1.1 [RC14.1] (§D19)
  - `coder: issue-radar | worker | remote` validated per repository; Settings shows Radar crew, Avoozl worker and Remote coder and where each value comes from; `src/app/test/coder-setting.test.mjs`.
  - Done when: Each value validates; an unknown value is refused naming the allowed ones; Settings shows the three display names; `npm test` passes.
- [ ] rc-14.2 Coder adapter: hand over, read state, count as done, after rc-14.1, rc-4.1, rc-5.1 [RC14.2, RC14.3, RC14.6] (§D19)
  - A small adapter object with `handOver`, `readState` and `countsAsDone`; the `issue-radar` behavior moves behind it with no change in output; release, Stop the line and the merge path call the adapter; `src/app/test/coder-adapter.test.mjs`.
  - Done when: The Radar tests of Phases 4 and 5 pass unchanged; a fake third adapter in a test needs no change to release or projection; done is true only for a merged pull request.
- [ ] rc-14.3 Put the worker behind the adapter and mark it frozen, after rc-14.2 [RC14.4] (§D19)
  - The existing worker dispatch is wrapped as an adapter with no new behavior; Settings and docs say it is frozen (upkeep only); a comment in the adapter says `shortcut: frozen, upgrade only for security, bugs and compatibility`.
  - Done when: Existing worker tests pass unchanged; Settings says frozen; no new option is added to the worker.
- [ ] rc-14.4 Coder change with tasks in flight, after rc-14.2 [RC14.5] (§D19)
  - Tasks already handed over keep their coder; the next tasks use the new one; one notice shows the split.
  - Done when: A test switches coder with one task in flight: that task finishes with the old coder, the next goes to the new one, one notice appears.
- [ ] rc-p14 Proof 14: the same plan, any coder, after rc-14.1, rc-14.2, rc-14.3, rc-14.4 [RC14] (§D22)
  - Setup: a scratch repository and a three-task plan. Action: run it with the Radar adapter, then the worker adapter; switch coder after the first task. Expected: identical release order, gates and acceptance; the switch leaves the first task where it was. Failure means: planning depends on a coder. Next decision: move that logic into the adapter.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 15: The remote coder

Requirement RC15. A managed remote harness as a coder. A task is done only when the public pull request merges.

- [ ] rc-15.1 Remote coder adapter: file one task per ready task or batch, after rc-14.2, rc-2.3 [RC15.2, RC15.3, RC15.7, RC15.9] (§D20)
  - A `remote` adapter files a task through the harness's own app or MCP interface with the task ID, spec reference, marker text and approved task text; the harness reference is stored with the task so a retry files nothing twice; no credentials are stored; tests use a fake harness.
  - Done when: A fake harness receives one task per ready task and one per batch; a retried tick files nothing twice; nothing the content rules mark private is sent.
- [ ] rc-15.2 Watch the remote task and count done only on a public merge, after rc-15.1, rc-5.1 [RC15.3, RC15.4, RC15.8] (§D20)
  - States `filed`, `working`, `finished-unpublished`, `pr-open`, `merged`, `failed` are mapped in the adapter only; a harness "complete" is not done; a read failure keeps the last state and shows its age; arming waits for `verify-issue`.
  - Done when: A fake harness that says complete with no pull request leaves the task not done; the merge of the public pull request releases dependents; a read failure shows the age and changes nothing.
- [ ] rc-15.3 Needs you row for a waiting publish, and larger batches, after rc-15.2, rc-2.5 [RC15.5, RC15.6] (§D20)
  - A task `finished-unpublished` shows one Needs you row with the harness link and the age, cleared when the pull request appears; for `remote` the default batch is larger, the preview counts publishes, and a batch does not split a chain that fits in one.
  - Done when: The row appears once across three ticks and clears on the pull request; the preview shows the publish count; a chain that fits one batch is batched whole.
- [ ] rc-15.4 No internal names in the repository, and a scan check, after rc-15.1 [RC15.1] (§D20)
  - Forbidden-name patterns come from an environment variable or local config and are never committed; the release scan uses them; docs and tests say only "a managed remote harness" or "a remote coder"; the scan runs before every push.
  - Done when: A test with a pattern set in the environment fails when a listed name appears in a tracked file; `node scripts/release-scan.mjs --tree` is clean.
- [ ] rc-15.5 Start the harness's MCP server as a child process; file under the approver, after rc-15.1 [RC15.10, RC15.11] (§D20)
  - The tick starts the harness's MCP server as a local child process, calls only its create-code-task and get-task-statuses tools and stops it after the tick; no socket is opened; each task is filed under the approving person's own sign-in; the receipt records the approver, the harness task ID and the Avoozl task IDs.
  - Done when: A test with a fake MCP server shows only those two tools are called and the process ends with the tick; the receipt holds approver, harness task ID and Avoozl task IDs; no other identity is used.
- [ ] rc-15.6 Expired sign-in: one Needs you item and no retry loop, after rc-15.5, rc-15.2 [RC15.12] (§D20)
  - A refused sign-in opens one Needs you item, "Sign in again", and holds new filing for that person; the next try needs the person's word or one cheap check that passes; watching tasks already filed continues when the harness allows it; the item clears when filing works.
  - Done when: A fake harness that refuses the sign-in causes one item across five ticks and no filing attempts beyond one check per tick; filing resumes and the item clears after sign-in.
- [ ] rc-p15 Proof 15: a remote coder end to end with a fake harness, after rc-15.1, rc-15.2, rc-15.3, rc-15.4, rc-15.5, rc-15.6 [RC15] (§D22)
  - Setup: a scratch repository, `coder: remote`, a fake harness. Action: release two tasks; let the harness finish one with no pull request; publish it; merge. Expected: the Needs you row while waiting; done only after the merge; dependents released then. Failure means: Avoozl counted a harness state as done. Next decision: tighten the adapter map.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 16: Integration branches

Requirement RC16. A rewrite lands as small pull requests into a long-lived branch, then one person lands the branch.

- [ ] rc-16.1 Integration branch in the manifest, with branch checks, after rc-2.1, rc-5.1 [RC16.1, RC16.9] (§D21)
  - `integrationBranch` in an epic's manifest; Avoozl checks the branch exists, is not the default branch and is protected, and names what is missing; it creates nothing; an epic without the field behaves as before; `src/app/test/integration-branch.test.mjs`.
  - Done when: A missing, unprotected or default branch is refused naming the reason; a manifest without the field changes nothing.
- [ ] rc-16.2 Projected tasks target the branch, and the branch merge path, after rc-16.1, rc-3.6, rc-5.2 [RC16.2] (§D21)
  - The marker and the issue name the branch as base; `verify-issue` checks the base equals the branch; the branch has its own rule (CI, light review); auto-merge may be armed on task pull requests into it.
  - Done when: A pull request into main for a branch epic fails `verify-issue`; a pull request into the branch passes and may be armed.
- [ ] rc-16.3 Whole-head checks on the branch and acceptance records, after rc-16.2 [RC16.3, RC16.5, RC16.8] (§D21)
  - The tick reads the branch head's check runs and records an acceptance row naming the head; a task merge does not mark the epic accepted; Trace, In flight and Progress show tasks merged, distance behind main and the head's check state.
  - Done when: A green task merge leaves acceptance open; a green head records acceptance for that head; a new merge makes the record name the new head.
- [ ] rc-16.4 Scheduled merge of main into the branch, after rc-16.1 [RC16.6] (§D21)
  - On the epic's schedule (default weekly, off allowed) Avoozl merges main into the branch as a merge commit and pushes normally; no rebase and no force push anywhere in the code path; a conflict stops the sync, labels it and shows a Needs you row with the files.
  - Done when: A test repository gets a merge commit and a normal push; a conflict leaves the branch unchanged and raises the row; the sync code contains no force option.
- [ ] rc-16.5 Stop the line for the branch, after rc-16.2, rc-4.2, rc-5.4 [RC16.7] (§D21)
  - The stop takes the branch as a scope: a red head, a failed sync or a person's stop; while open, no release and no arming for the epic; the row says why.
  - Done when: A red head stops release and arming; clearing it resumes both.
- [ ] rc-16.6 Landing the branch in main: one person-approved step, after rc-16.3, rc-16.4 [RC16.4, RC16.5] (§D21)
  - When the head is green and up to date with main, one Needs you row asks a person to land it; Avoozl records who approved and which head; Avoozl never merges the branch into main; an approval for an older head does not count.
  - Done when: No code path merges the branch into the default branch; an approval on an old head is refused; the row records approver and head.
- [ ] rc-p16 Proof 16: a rewrite on an integration branch, after rc-16.1, rc-16.2, rc-16.3, rc-16.4, rc-16.5, rc-16.6 [RC16] (§D22)
  - Setup: a scratch repository, a protected branch, a four-task epic. Action: merge three tasks, force a conflict in a sync, fail a head check, then fix both and land. Expected: small merges into the branch; the sync conflict and the red head each stop the line; landing needs one person's approval on the current head. Failure means: the rewrite could reach main by itself. Next decision: block the branch feature.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 17: Epic types

Requirement RC17. Templates and docs for migrations, codegen changes and cross-repository proposals.

- [ ] rc-17.1 Templates and docs: rewrite, cross-repository migration, large codegen change, after rc-14.1, rc-16.1 [RC17.1, RC17.2, RC17.3, RC17.7] (§D22)
  - Three templates (spec skeletons with manifests and edges) and one doc page; generic wording only; each template lints clean.
  - Done when: Each template lints with 0 errors; the release scan finds no internal name.
- [ ] rc-17.2 Cross-repository proposal: parent spec and one sub-spec per repository, after rc-17.1, rc-2.1 [RC17.4, RC17.5] (§D22)
  - A parent spec holds shared requirements and the list of sub-specs and no repository tasks; each sub-spec is approved and released alone; a cross-repository `requires` is refused when the other sub-spec is unapproved or lacks the ID.
  - Done when: A parent with a repository task is refused; a `requires` on a missing ID is refused naming it; two sub-specs approve separately.
- [ ] rc-17.3 External gap report becomes proposed tasks, after rc-17.2 [RC17.6] (§D22)
  - A report read from a path or an issue gives a repository-by-requirement table; each failing cell becomes a proposed task in that repository's sub-spec; a passing cell gives none; nothing is added until a person accepts; an unparseable line is refused by number.
  - Done when: A fixture report with two failing and three passing cells gives two proposals; an unreadable line is refused naming it; accepting adds the tasks.
- [ ] rc-p17 Proof 17: epic types, after rc-17.1, rc-17.2, rc-17.3 [RC17] (§D22)
  - Setup: a scratch workspace and three repositories. Action: create a migration from the template; create a proposal with three sub-specs; import a gap report. Expected: valid specs, separate approvals, proposed tasks only for failing cells. Failure means: the templates mislead. Next decision: fix the template before the docs.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 18: Approve on the issue

Requirement RC18. A trusted person approves by label; any approval is written back to the issue.

- [x] rc-18.1 Approval label setting and label clash check, after rc-1.1 [RC18.1] (§D23)
  - `approval label` per repository, default `plan approved`; equal to the planning, needs-human, claim, ready or conflict label is refused naming both; Settings shows what it does and who writes it; `src/app/test/approval-label.test.mjs`.
  - Done when: The default validates; a clash is refused naming both labels; `npm test` passes.
- [ ] rc-18.2 Tick reads the approval label and checks the labeler, after rc-18.1, rc-1.2, rc-3.6 [RC18.2, RC18.3, RC18.7] (§D23)
  - On a drafted plan with 0 lint errors, a label added by a person who passes the trigger-label check (`allowedActors`, `minimumPermission`) approves the plan; any other labeler, or an unreadable one, is ignored: the label is removed and one Needs you row names the login and issue; removing the label later revokes nothing.
  - Done when: A fake GitHub test: an allowed labeler approves; a stranger's label is removed with one row across three ticks; a label removal after approval changes nothing.
- [ ] rc-18.3 One approval record, with write-back to the issue, after rc-18.2 [RC18.4, RC18.5, RC18.6, RC18.8, RC18.9] (§D23)
  - Approving in Avoozl, in a chat or the CLI (`plans_*` tool), or by label ends in one approval record; the first two write back to the source issue: the label and one comment with a hidden marker (approver login, spec path, commit, time) and no spec text; a second approval is a no-op; a failed write-back leaves the approval and raises one row; a plan with no source issue skips it.
  - Done when: Three fake-GitHub tests: each path gives one record; a second approval writes nothing; a failed write-back leaves the approval and one row.
- [ ] rc-p18 Proof 18: approve on the issue, after rc-18.1, rc-18.2, rc-18.3 [RC18] (§D17)
  - Setup: a scratch repository with a drafted plan and a source issue. Action: approve by label as an allowed person; approve a second plan in Avoozl; label a third as a stranger. Expected: one record each; the issue shows the label and one marker comment for the second; the stranger's label is removed. Failure means: the issue and the record can disagree. Next decision: make the record the only source and drop the label path.
  - Done when: Expected result observed; receipt under `docs/evidence/`.

## Phase 19: Claim at approval

Requirement RC19. The parent issue is marked as taken when its plan is approved.

- [ ] rc-19.1 Claim the parent at approval, after rc-18.3, rc-1.3 [RC19.1, RC19.2, RC19.3, RC19.4, RC19.5, RC19.6] (§D24)
  - At approval Avoozl posts the claim marker in Radar's format, naming Avoozl and no real crew id, and adds the in-progress label on the parent; an existing crew claim is left alone and noted once in Trace; the claim is written once per approval; Avoozl removes only its own claim when the plan is superseded or the parent closes.
  - Done when: A fake-GitHub test: the parent gets one claim and label; a parent with a crew's claim gets no write and one Trace note; a second approval writes nothing; a superseded plan removes only Avoozl's claim.
- [ ] rc-p19 Proof 19: the parent is not taken by a crew, after rc-19.1 [RC19] (§D17)
  - Setup: a scratch repository, a Radar crew with label scope `ready`, an approved plan. Action: let the crew poll after approval and after the first release. Expected: the crew never takes the parent; it takes released sub-issues. Failure means: the claim format does not hold the crew off. Next decision: re-read the claim format on the current release.
  - Done when: Expected result observed live; receipt under `docs/evidence/`.
