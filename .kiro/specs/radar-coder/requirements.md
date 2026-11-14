---
category: Planning
---

# Requirements: Avoozl plans and gates, Issue Radar crews code

Status: Approved

## Introduction

Avoozl changes its job. It stops running workers for repositories that have
Issue Radar crews. It becomes the **planner** (specs, the task graph, the
projection to GitHub) and the **gate** (proof that an issue came from an
approved plan, release order, merge path, retros). Issue Radar crews, on any
machine, do the triage and the coding.

### Scope: what Avoozl is for

Avoozl is for **epics**: approved goals that need many changes in a set order.
It does not do maintenance, triage or one-off pull request handling. Those
belong to Issue Radar crews, or to the team's own coder, without Avoozl.
Rule of thumb: if the work fits in one pull request, it is not an Avoozl
job. If it needs a plan with an order, it is. Avoozl can still hand each task
of an epic to any coder (RC14).

This is a spec only. Approving it, creating issues and starting agents are
separate acts that a person does later. Nothing in it changes code, GitHub
repositories or settings. It sits beside `.kiro/specs/avoozl/`, which stays
the product spec; where this spec changes a rule there, the criterion says
which one.

Every claim carries one label:

- **Verified**: read in code or docs, or seen live. The source is named.
- **Inferred**: follows from verified facts, not observed.
- **Proposed**: this spec's recommendation.

### Sources

- `docs/proposals/avoozl-experience.md` and `docs/proposals/experience/`
  (the agreed experience: screens, side panel, Trace, projection preview,
  quick goal, crews and rules, flow and retro).
- `docs/research/radar-spec-tasks.md` sections 1-10 (live crew results).
- `docs/research/radar-setup-from-avoozl.md` (Radar is read-only for apps;
  every write is owner-only; an app-shipped agent works as a crew agent).
- `docs/research/radar-handoff-and-crew-list.md` (the `plan me` routing and
  the cross-machine crew list, built in PR 67).
- `docs/research/runner-mode-ssh.md`, `machine-conductors-2026-11-13.md` and
  `kirocrew-bot-heartbeats-2026-11-13.md` (what Avoozl's own relay, foreman
  and bot paths can and cannot do).
- `.kiro/specs/avoozl/` (requirements, design and tasks it builds on) and
  `AGENTS.md`.

### Facts this spec rests on

| #   | Fact                                                                                                                                                                                                                                                  | Label    | Source                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------- |
| 1   | A crew took a spec-linked feature issue, a blocked issue only after its blocker merged, and a three-task batch as one PR. It skipped a plain feature request.                                                                                         | Verified | `radar-spec-tasks.md` sections 2, 4                     |
| 2   | A crew does not tick checklist boxes, does not merge, and does not arm auto-merge on its own PRs in Kiro Crew 0.12.2.4.                                                                                                                              | Verified | `radar-spec-tasks.md` sections 4, 10                    |
| 3   | A crew re-read `AGENTS.md` and steering files before each new issue, and followed a rule change on the next issue.                                                                                                                                    | Verified | `radar-spec-tasks.md` section 7                         |
| 4   | A one-paragraph Additional prompt made a crew check approver permission, task IDs in the spec and the commit before building. It refused an approver with no permission and a task ID not in the spec, and named the failed check.                    | Verified | `radar-spec-tasks.md` section 8                         |
| 5   | A crew read an approved spec from a private plans repo with its owner's `gh` login. A login without access gets 404.                                                                                                                                  | Verified / Inferred | `radar-spec-tasks.md` section 9                  |
| 6   | The `updated=` time in a crew's claim marker ran 15 to 27 minutes ahead of GitHub's time.                                                                                                                                                             | Verified | `radar-spec-tasks.md` section 5                         |
| 7   | An app token reads Radar's repo and crew lists. Connecting a repo, creating or editing a crew, its agent, its Additional prompt, pause and settings are owner-only.                                                                                   | Verified | `radar-setup-from-avoozl.md` table                      |
| 8   | A crew whose agent is app-shipped (`avoozl-crew`) can call Avoozl MCP tools and see Avoozl skills. An agent name no app ships falls back to the default agent with no error. A narrow tool list also removes Radar's own two crew tools.            | Verified | `radar-setup-from-avoozl.md`                            |
| 9   | Skip scope is not in Radar's claim marker. It is in the comment's second line when the crew writes it. A crew pauses and asks with the needs-human label.                                                                                              | Verified | `radar-handoff-and-crew-list.md`                        |
| 10  | Crews pick at random among eligible issues. The only order is how many issues carry the crew's scope label at once.                                                                                                                                   | Verified | `docs/proposals/avoozl-experience.md` finding 4         |
| 11  | A crew's own GitHub writes use its owner's `gh` login, so Avoozl cannot tell a crew's action from the owner's by actor. It tells them by label and by the claim marker.                                                                               | Verified | `.kiro/specs/avoozl/design.md` section 6.4              |

### Words

- **Crew**: an Issue Radar crew. **Radar**: the Issue Radar app.
- **Planning label**: the label that asks Avoozl to plan an issue (input to
  Avoozl). **Needs-human label**: Radar's own label for a crew asking a
  person (output of a crew). **Ready label**: Avoozl's release label and the
  crew's label scope. **Claim label**: Radar's `crew: in progress`.
- **Provenance marker**: the `<!-- avoozl v=1 ... -->` line in an issue body.
- **Task ID**: an ID in `tasks.md`, kept apart from the issue number.

## Requirements

### Requirement RC1: The coder is Issue Radar, and Avoozl never triages

**User story:** As the owner, I want crews to do the triage and the coding,
and Avoozl to plan only what I ask it to, so that nothing is planned twice
and no stranger's issue reaches a plan.

#### Acceptance criteria

1. A repository SHALL have `coder: issue-radar` (default for a repository
   with Issue Radar connected), `coder: worker` or `coder: remote` (RC14,
   RC15). `worker` SHALL keep
   today's behavior, for local-only mode and repositories without Radar
   (RC11.3). The setting SHALL be per repository and SHALL apply in both
   GitHub modes. This changes `.avoozl.json` validation, which today refuses
   `issue-radar` in plans-repo mode (design 4.4).
2. For a repository with `coder: issue-radar`, Avoozl SHALL NOT triage. The
   Untriaged list (Requirement 49) SHALL be off for it. Avoozl SHALL plan an
   issue only when it carries the **planning label** and the person who added
   the label passes the repository's actor check (`allowedActors`,
   `minimumPermission`, Requirement 10), or when a person starts planning from
   a row in Intake.
3. The planning label SHALL be configurable per repository and SHALL differ
   from the needs-human label, the claim label and the ready label. A
   configuration where any two are equal SHALL be refused naming both.
   Defaults: planning `avoozl:plan`, ready `avoozl:ready` (RC21), claim
   `crew: in progress`, and the needs-human label as Radar shows it. The
   Settings page SHALL show each name, what it does and who writes it.
4. Avoozl SHALL NOT write Radar's claim or needs-human labels (Requirement
   17.4, 52), except the one claim at approval (RC19). It SHALL write the planning label only to remove it after a plan
   is projected, and only when the person set the repository's
   `radar.clearPlanLabel` to on. Default: off.
5. The `plan me` hand-off SHALL route as PR 67 built it: a trusted author, or
   the marker path, or `acceptedLabel` added by an allowed person. A
   `new-feature`, `architecture` or `needs-design` skip SHALL go to Intake. Any
   other scope, or no scope found, SHALL go to Needs you. An untrusted issue
   SHALL be left alone. This spec SHALL NOT change that routing.
6. WHEN a planned issue is the source of a spec, the source issue SHALL become
   the parent of the projected issues (sub-issue link) and SHALL carry no ready
   label, so a crew with an empty label scope does not take it. The Set up
   screen SHALL require the crew's label scope to be the ready label (RC7).
7. Radar's needs-human label on the source issue SHALL be cleared by the
   person. A Needs you row SHALL say so once and SHALL NOT repeat.
8. Avoozl SHALL keep reading `radar.crews` (cross-machine In flight, PR 67)
   and the hand-off. Both are reads from GitHub. Neither SHALL need a Radar
   grant.

### Requirement RC2: Projection from spec to issues

**User story:** As the owner, I want an approved spec to become a graph of
GitHub issues that crews can build, with nothing written before I see it.

#### Acceptance criteria

1. Projection SHALL create, from an approved spec: one epic or plan issue per
   spec (sub-issues under it), one issue per task or batch, native
   blocked-by links for every `requires` edge, the repository's phase and
   epic structure (Requirement 59), and Project fields (Release, Wave;
   Status is GitHub's, Requirement 33). It SHALL run only through one
   **Project to GitHub** preview and SHALL write nothing before the person
   confirms.
2. **Single-repo mode.** The spec lives in the code repository. The issues
   live in the same repository. A pull request closes its issue with
   `Closes #N`, and GitHub closes it.
3. **Plans-repo mode with `coder: issue-radar`.** The spec lives in the
   private plans repository. The issues live in the **code** repository, so
   crews read and write one repository. The marker holds
   `plans=<owner>/<repo>` and the plans commit (RC3.1). Avoozl closes the
   issue when the closing pull request merges, as the plans-repo rule says
   today, unless the pull request body carries `Closes #N`, in which case
   GitHub closes it. This changes design 6.6 and Requirement 28, where the
   issues live in the plans repository.
4. WHEN the code repository is public AND the plans repository is private,
   the marker SHALL name the plans repository only after the person turns on
   **Show the plans repository name in issues** for that repository. The
   switch SHALL default to off for a public code repository and on for a
   private one. WHILE it is off, plans-repo projection to that repository
   SHALL be refused with the reason. Content rules (Requirement 40) SHALL
   screen the name before it is written.
5. **Batching.** Projection SHALL combine small ready tasks into one issue
   with a checklist when ALL hold: each task has `size: "small"` in its
   manifest entry; the tasks share a phase and a repository; they share a
   file overlap when `flow.batch.by` is `files`; none has an open blocker
   at projection time; there is no edge between them; they have no
   `human` or `person` completion. The cap SHALL be `flow.batch.max`
   (default 3, at most 5; Requirement 46). A task with an open blocker SHALL
   never be batched. The default mode SHALL be **Suggest**: Avoozl proposes
   batches in the preview and the person edits them. **Off** and **Auto**
   (batches with no edit) SHALL also exist, chosen by one radio fold-out.
6. Each task ID SHALL stay a separate node in the graph, with its own
   acceptance, timing and evidence (Requirement 46.7). A batch issue SHALL
   list its task IDs in its marker and its checklist. WHEN the pull request
   that closes the batch issue merges, Avoozl SHALL close every task in it as
   done. It SHALL NOT read the checklist boxes (fact 2).
7. The issue body SHALL stand alone for a crew: the goal, the task text and
   acceptance, the requirement and design section references, the marker, and
   the managed marker of design 3.4. It SHALL NOT hold a local path, a token or
   a private name (Requirement 10.7).
8. A spec edit SHALL re-project through a **Spec changed** diff, never
   silently (Requirement 15). An unclaimed issue SHALL be updated after the
   person approves. A claimed issue SHALL NOT be edited: Avoozl SHALL comment
   and open one Needs you row. A removed task SHALL close its issue as not
   planned.
9. WHEN the approved spec's `Status` line is not `Approved` in the files a
   marker would pin, or the pinned commit is not on the default branch,
   projection SHALL refuse and say which. Preflight SHALL also check that the
   repository's merge path works (RC5.1) and show the result.
10. Every issue the projection writes SHALL carry the provenance marker
    (RC3) and the managed marker. Neither SHALL carry a name of a company,
    an internal tool or the owner's employer.

### Requirement RC3: Provenance, and `avoozl verify-issue`

**User story:** As a person who lets crews build from issues, I want a crew to
prove an issue came from an approved plan by running one command, so that a
label or a line of text from a stranger is never enough.

#### Acceptance criteria

1. The provenance marker SHALL be one HTML comment line:
   `<!-- avoozl v=1 spec=<name> tasks=<id>[,<id>...] commit=<40 hex> approved-by=<login> plans=<owner>/<repo> -->`.
   `plans=` SHALL be present only in plans-repo mode (RC2.3, RC2.4). A reader
   SHALL ignore a key it does not know and SHALL refuse a version it does not
   know. A task ID SHALL match the task-ID rule of the workspace. The line is
   separate from the managed marker (design 3.4), which keeps the namespace and
   the applied hashes.
2. `avoozl verify-issue <owner>/<repo>#<n>` SHALL be a CLI command and an MCP
   tool (`plans_verify_issue`, read-only, observe class). It SHALL run
   without an Avoozl workspace, using the caller's `gh` login, and SHALL write
   nothing anywhere.
3. It SHALL run these checks in code, in this order, and report each as
   `ok` or `FAIL <name>: <reason>`:
   1. `marker`: the issue body has exactly one provenance marker, with a
      known version and every key but `plans` present.
   2. `approver`: `GET /repos/{o}/{r}/collaborators/{approved-by}/permission`
      for the repository that holds the spec returns `admin`, `maintain` or
      `write`. An error, a 403, a 404 or `none` SHALL fail the check.
   3. `author`: the issue's author has the same permission on the code
      repository. A stranger who opens an issue and pastes an owner's login
      SHALL fail here. (This check goes beyond the three the live test
      used. Proposed.)
   4. `spec`: the spec at `commit` has `requirements.md` or `bugfix.md`,
      `design.md`, `tasks.md` and `avoozl/manifest.json`; `tasks.md` lists
      every ID in `tasks=`; each of the three prose files has a line
      `Status: Approved`. The spec is read from the code repository, or from
      `plans=` when present.
   5. `commit`: the compare API for `<default branch>...<commit>` reports
      `behind` or `identical`, in the repository that holds the spec.
4. The command SHALL exit 0 only when every check is `ok`. It SHALL exit 1
   when a check failed, 2 when it could not run (no `gh` login, rate limit,
   network, a repository it cannot read), and 64 for a wrong argument. A read
   that fails SHALL count as a failed check, never as ok. It SHALL print one
   line per check, and `--json` SHALL print the same as JSON with the issue's
   task IDs and, when all pass, the brief (RC6.3).
5. Output SHALL NOT quote the issue's text, the spec's text or any secret. It
   SHALL name checks, logins, repositories, task IDs and the commit.
6. Avoozl's **Approve** SHALL make the pinned commit real: it SHALL open a pull
   request in the repository that holds the spec that sets `Status: Approved`
   in the three prose files (and, with `approval.decisionRecord` on, adds the
   decision record of RC3.8), and it SHALL record the commit only after that pull
   request has merged to the default branch. The `Status` line SHALL be outside
   the revision hash, so approving does not change the spec's revision
   (like checkbox marks, `withoutMarks`).
7. The crew **Additional prompt** SHALL be this one line, shipped verbatim and
   shown by Set up with a Copy button:

   ```
   For any issue with an <!-- avoozl --> marker, run `avoozl verify-issue OWNER/REPO#N` (or the plans_verify_issue tool) first; build only if it exits 0, otherwise skip it with scope needs-decision and say which check failed.
   ```

   A crew with no Additional prompt, or a crew on another person's
   machine with a different one, SHALL NOT be trusted to check. The Set up
   screen and the docs SHALL say plainly that this is a prompt a crew follows
   and not a gate GitHub enforces (fact 4).
8. WHEN `approval.decisionRecord` is on (default on for `coder:
   issue-radar` until RC12.7 is answered), the approval pull request SHALL
   add `docs/decisions/<spec>.md` with `Status: Accepted` and a sentence that
   automation may build the spec, in the repository crews read. The record SHALL
   name no private repository.
9. A marker SHALL NOT be a signature. The docs SHALL say it stops accidents
   and edits by people without write access, not a person who can write to the
   repository and edit issues.

### Requirement RC4: Release in graph order

**User story:** As the owner, I want the order of work to come from the plan,
because crews pick at random among what is eligible.

#### Acceptance criteria

1. The tick SHALL add the ready label to issues in graph order: a task or
   batch is eligible when every `requires` blocker is complete at its
   required level (Requirement 17.2, 33) and the repository's phase rule
   (criterion 4) holds.
2. At most **N** issues SHALL carry the ready label at once per repository, or
   per crew label scope when `release.scopes` names several (each entry a
   label and its own N). A task MAY name its scope in its manifest entry.
   Open issues with the ready label count, claimed or not, until their pull
   request merges or the issue closes. N SHALL default to 2 and be set by one
   number on Set up ("crews working this repository").
3. WHEN a repository's Stop the line is open for its scope, a reopen occurs, or
   a blocker reopens, the tick SHALL remove the ready label from every issue
   in the scope that has no claim label, and SHALL NOT touch a claimed issue.
   It SHALL comment once on each claimed issue that the line is stopped, and
   say what only Radar's own pause can stop (Requirement 64).
4. A phase SHALL release only after every task of the previous phase of the
   same spec has merged (not only closed by a person). WHEN a phase finishes,
   the tick SHALL release the next one on its next pass.
5. Release mode SHALL be one radio fold-out: **Automatic** (default),
   **Step** (wait for a click per phase or wave) and **Hold** (release by
   hand). The release queue (Up next) SHALL show what is next and why
   anything is held.
6. WHEN a ready label is added or removed by someone else, Avoozl SHALL treat
   it as an order only where Requirement 11 and the repository policy allow
   it, and SHALL otherwise re-apply its own computation on the next tick.
7. The tick SHALL be idempotent: a pass that sees what the last pass saw
   writes nothing.

### Requirement RC5: The merge path

**User story:** As the owner, I want crew pull requests to merge when checks
pass, without a person clicking, while I keep the right to merge by hand.

Fact 2: Kiro Crew 0.12.2.4 does not arm auto-merge for a crew.

#### Acceptance criteria

1. A repository's **merge path** SHALL be ready when: the repository allows
   auto-merge; the default branch has a rule that requires the CI check
   (named); and `delivery.ship` is set. Preflight and Set up SHALL show each
   item as ok or not, and **Create and release** SHALL be refused while it is
   not ready for `auto-merge` (a warning for `manual`).
2. WHEN `delivery.ship` is `auto-merge` (Requirement 80), the tick SHALL arm
   GitHub auto-merge on a pull request that: is open, is not a draft, comes
   from a branch in the same repository (not a fork), has an author that
   passes the repository's actor check, and closes at least one issue that
   carries an Avoozl provenance marker from this workspace. It SHALL use the
   merge commit method. It SHALL arm each pull request once.
3. WHEN `delivery.ship` is `manual`, the tick SHALL arm nothing and SHALL show
   one **Ready to merge** row in Needs you per pull request whose required
   checks pass (Requirement 80.3).
4. WHILE a Stop the line is open for the pull request's scope, the tick SHALL
   NOT arm auto-merge. A pull request already armed SHALL be listed in the
   banner with **Disarm**, a person's action.
5. Avoozl SHALL NOT merge a pull request itself, use `--admin`, or bypass a
   rule. GitHub merges when its own rules pass.
6. The tick SHALL label a pull request that has a merge conflict with the
   conflict label (configurable, default `avoozl:merge-conflict`, RC21) and remove it when
   the conflict is gone. It SHALL open one Needs you row per conflicted pull
   request. It SHALL NOT resolve conflicts, and SHALL NOT write Radar's labels.
7. Completion SHALL follow Requirement 16: the closing pull request's merge
   completes the task, never the label or the checklist.
8. A pull request that closes an issue for which `verify-issue` would fail
   (for example an edited marker) SHALL NOT be armed. Avoozl SHALL run the same
   checks in the tick, once per issue per marker hash.

### Requirement RC6: The `avoozl-crew` agent

**User story:** As the owner, I want crews to carry Avoozl's tools, skills and
hooks, and I want to know when they do not.

#### Acceptance criteria

1. The Avoozl app SHALL ship `kirocrew-app/agents/avoozl-crew.json`, listed in
   `app.json`. An agent name no app ships falls back to the default agent
   with no error (fact 8), so Avoozl SHALL ship it, never ask the person to
   write one by hand.
2. Its spec SHALL mount `avoozl:avoozl`; list `@avoozl:avoozl/plans_verify_issue`
   and `@kirocrew-core/skill_search`; list Radar's two crew tools
   (`issue_radar_crew_read` and `issue_radar_crew_record`), because a narrow
   tool list removes them (fact 8); list the Avoozl skills as `skill://`
   resources; and carry the Avoozl hooks of RC6.4.
3. A worker SHALL read the task brief through Avoozl. `plans_verify_issue`
   SHALL return, when all checks pass, the issue's task IDs, acceptance and
   references from the issue body, with no workspace needed. Plans-repo mode
   SHALL therefore need no plans-repository access to *build*. Check
   `spec` of RC3.3 needs read access to the repository that holds the spec;
   a crew without it SHALL fail that check and skip the issue (fact 5). Set up
   SHALL say which crews need that access. A crew's chat has no workspace, so
   no tool the agent lists SHALL need a default workspace.
4. Hooks: for a public repository the agent SHALL carry the scan-before-send
   hook of **Crews on public repositories** in `.kiro/specs/avoozl/`
   (RC10). Avoozl SHALL add no other hook that blocks a crew until a proof
   shows it works on a crew's chat.
5. **Set up** SHALL verify that `avoozl-crew` is a choice in Radar's Agent
   list (by reading the crew list through the grant, or, without it, by
   reading the installed agent files) and SHALL mark the item **Not verified**
   where neither is possible. A crew that shows another agent SHALL be shown
   as not covered, with a note that changing the agent of an existing crew is
   unreliable (Radar's `PUT /crew` did not move an existing slot).
6. The app SHALL be built before it is installed. A build with no `bin/lib`
   SHALL be refused by Set up, naming `npm run build:kirocrew-app`.

### Requirement RC7: Set up and the team pack

**User story:** As the owner, I want Avoozl to do every step it can and show
me the exact values for the steps only I can do.

#### Acceptance criteria

1. Avoozl SHALL do what `gh` can, each as one previewed step with a confirm:
   create the planning, ready and conflict labels; add a branch rule that
   requires the CI check; turn on the repository's auto-merge setting; create
   the Project and its fields; open a pull request that adds review rules to
   `AGENTS.md`. A step the person's permission cannot do SHALL be shown as
   such with the permission it needs, and SHALL change nothing.
2. For Radar's owner-only steps (fact 7), Set up SHALL show one screen of
   exact values with a Copy button each: the repository to connect; crew
   name, agent `avoozl-crew`, model, label scope (the ready label), the
   needs-human label name, the claim time limit; and the one-line Additional
   prompt of RC3.7. It SHALL give a link to Radar's page. Avoozl SHALL NOT claim
   to write them.
3. WHEN the grant is approved, Set up SHALL re-read Radar and tick each item
   it can confirm (repository connected, a crew with the agent and the scope).
   Without the grant, each is a checkbox the person ticks, marked
   "cannot verify".
4. A **team pack** (for example `sdk-team`) SHALL be a settings pack
   (Requirement 55) with a `crews` section: crew count, models, agent, the
   Additional prompt, the four label names, review rules (text for
   `AGENTS.md`), and a task template (Requirement 61). It SHALL carry no
   private name, path or token, and SHALL be screened by content rules
   before it is saved or shared.
5. Applying a pack SHALL show a preview of every setting it changes and what
   it leaves, and SHALL write only after a confirm. A pack SHALL NOT create
   crews. It SHALL fill Set up's screen.
6. Settings SHALL follow the app's rules: titled boxes with a few plain
   fields and the default shown; advanced values folded away; a value a level
   inherits says where it comes from and what it is ("Use the workspace
   default (2)"), never "same as above"; a mode (release, batching, ship) is one
   radio fold-out; edits happen in modals; no field asks for a model price.

### Requirement RC8: Observe

**User story:** As the owner, I want to see where every task is, on every
machine, and what to change, without opening a crew's chat.

#### Acceptance criteria

1. The screens SHALL be the experience proposal's: Home (Needs you, On the
   line, Release queue, Progress by goal), Specs, Graph, Delivery, Flow, Intake,
   Activity and Settings with **Crews and rules**. Conflicts SHALL fold into
   Needs you. **Build for Variant B first** (GitHub only). Variant A (Radar's
   crew list through one grant) SHALL be a later upgrade behind that grant.
2. **Trace** SHALL be a drawer and a page per task or goal, deep-linkable and
   in the Back history (Requirement 60). Its steps SHALL be Spec approved,
   Issue created, Ready, Claimed, PR opened, CI, Merged, Retro, with times from
   GitHub, never the marker's `updated=` (fact 6).
3. One side-panel tab, **Avoozl**, SHALL change with the open chat: spec check
   and **Approve** in a Spec Builder chat, the task a crew is on in a crew
   chat the owner's browser can open, and a recap elsewhere. It SHALL open by
   itself only in a Spec Builder chat with an unapproved `tasks.md`.
4. **On the line** SHALL list one row per claimed issue across every machine
   from claim markers (`radar.crews`, PR 67), with crew id, phase, PR, last
   update from GitHub and a Stale badge. It SHALL NOT claim to know a crew's
   machine, paused state or chat unless Variant A or the owner's machine map
   says so.
5. Flow SHALL come from GitHub data: Ready to Claim, Claim to PR, PR to green,
   green to merge, and flow efficiency. Stop the line SHALL keep its meaning in
   RC4.3.
6. **Retros** SHALL propose rule changes with a target. A change to
   `AGENTS.md` or a file under `.kiro/steering/` SHALL land as a pull request
   Avoozl opens or as a one-task issue a crew builds. Crews re-read both before
   each issue (fact 3), so no restart is needed. A change to a crew's
   Additional prompt SHALL be shown as the full new text with Copy and a link
   to Radar's crew page, because the edit is owner-only. Each applied change
   SHALL get a check after N issues, and an offer to undo (Requirement 47,
   68, 78).
7. Avoozl SHALL NOT repeat views Issue Radar or Kiro Crew's pull request review
   already provide (issue and PR lists, CI, PR review). It SHALL link to them.
   Review drafts by label (RC20) are the one exception.
8. UI SHALL follow the app's rules: edits in modals, boxed filters, themed
   tooltips, confirm destructive actions, 100 rows a page, one Back history.

### Requirement RC9: Quick goals

**User story:** As the owner, I want to type "Make tests faster" and get a
small set of issues I approve once, without writing a spec first.

#### Acceptance criteria

1. **Quick goal** SHALL open a modal: repository, depth (**Look**,
   read-only, or **Measure**, which runs the repository's test command in a
   scratch worktree), and a budget in turns and time (default 20 turns and 15
   minutes). A planner chat that Avoozl owns SHALL investigate and propose 1 to
   8 tasks with edges, batches, risks, questions, and evidence for each task
   (file and line, or a measured time).
2. The person SHALL Approve, Edit, Promote to spec or Discard once. Nothing
   SHALL be written to GitHub before Approve. The confirm SHALL list every
   issue to be written.
3. On Approve, Avoozl SHALL write a **mini-spec** in the spec layout
   (`.kiro/specs/goal-<slug>/` with requirements, design, tasks and
   `avoozl/manifest.json`; Requirement 30), with the goal quoted verbatim
   and the evidence, and SHALL carry it through the same approval pull
   request as any spec (RC3.6). The marker is therefore the same, and
   `verify-issue` needs no second path. This differs from the experience
   proposal, which kept a quick goal in SQLite until promoted: the layout
   mandate (Requirement 30) and the check of RC3.3 both need files at a
   commit. Proposed.
4. The goal SHALL be offered **Promote to spec** instead of Approve WHEN it has
   more than 8 tasks, more than 3 dependency levels, an open design question,
   or a change to a public interface. Promote SHALL also always be available.
   Promote SHALL open the mini-spec in Spec Builder, keep every issue linked
   by task ID, and change the goal's badge from Quick to Spec.
5. Issue bodies SHALL stand alone (RC2.7) and SHALL end with the original
   prompt quoted, with private data removed first.
6. Auto-approve for small goals SHALL be a setting, off by default.

### Requirement RC10: Public repositories

**User story:** As the owner of a public repository, I want crews to work it
without leaking private names, using the layers already specified.

#### Acceptance criteria

1. A repository whose visibility cannot be read SHALL count as public.
2. For a public repository, Avoozl SHALL NOT send an issue to a crew path
   (release, RC4) until the sign-off of **Crews on public repositories** in
   `.kiro/specs/avoozl/` is complete. That requirement's layers (clean crew
   home, scan before send, audit on the tick, sign-off, Stop public crews)
   SHALL apply unchanged. This spec SHALL NOT restate, renumber or change
   them, and SHALL link to them by that name.
3. `verify-issue` output SHALL follow RC3.5, so it is safe to post.
4. Public docs, tests and examples of this spec's work SHALL use fake terms
   only and SHALL describe the private side as internal names and company
   hosts.

### Requirement RC11: Retirement of Avoozl's own coder, as a separate last epic

**User story:** As the owner, I want the old worker machinery removed only
after the Radar path has worked on a real repository, and I want nothing
that other tools call removed by accident.

#### Acceptance criteria

1. Retirement SHALL be a final, separate epic of this spec. No task in it
   SHALL start before the proof that the Radar path works on a real
   repository (RC12 tests 1 and 2, proof rc-p11) is accepted by a person.
2. It SHALL list, as removals for Radar-coded repositories: Avoozl's own
   worker dispatch, crew routing and placement (Requirements 41, 42), runner
   mode (Requirement 84), the remote relay (Phase 32), per-task budgets for
   workers (Requirement 67; budgets stay for planner, retro and quick-goal
   chats), and the workers' Files and diff fold (Requirement 81). The machine
   foreman (one conductor per machine on a shared queue,
   `machine-conductors-2026-11-13.md`) and a bot heartbeat were research only
   and are not built, so nothing is removed for them. They SHALL stay unbuilt:
   crews on each machine replace them (RC11.8). Each removal task SHALL name the code
   and the tests it removes and SHALL pass `npm test`.
3. `coder: worker` SHALL stay available, with its dispatch, verification,
   review and integration, for local-only mode and for repositories without
   Radar. It is frozen (RC14.4): upkeep only, no new features. The removals SHALL apply to a repository only when its `coder` is
   `issue-radar`, until every repository the workspace knows is on it.
4. These SHALL stay: the `plans_*` MCP names, the `NUPP_WORKSPACE` and
   `AICOMMANDER_*` environment aliases, the `aicommander` command and the
   `aicommander.*` editor settings (AGENTS.md).
5. Plan approval, implementation, integration and whole-head acceptance SHALL
   stay four separate things. The Radar path SHALL map them as: approval =
   RC3.6; implementation = the crew's pull request; integration = the merge
   (RC5); whole-head acceptance = the default branch's checks after the merge,
   recorded by Requirement 16. A crew's "resolved" SHALL NOT count as
   acceptance.
6. A disconnected crew SHALL NOT be replaced solely because its claim time
   limit passed (AGENTS.md). Avoozl SHALL flag the claim as stale and raise one
   decision.
7. Retirement SHALL move no data: existing workspaces, receipts and evidence
   SHALL stay readable, and `docs/research/` and `docs/evidence/` SHALL NOT be
   rewritten.
8. The remote foreman conductor (one conductor per machine on a shared queue,
   with the bot heartbeat meant to keep it awake) is **superseded by Radar
   crews**. Where `docs/research/` describes it as a remote path, this spec is
   the current statement, and those documents SHALL NOT be rewritten
   (AGENTS.md). Remote work SHALL go through a Radar crew on that machine (RC1)
   or through a remote coder (RC15).

### Requirement RC12: Open questions, each with the test that answers it

**User story:** As the owner, I want every unknown to carry the test that
settles it, so that I know what the design waits on.

#### Acceptance criteria

1. Each open question in `design.md` section D16 SHALL name the test, what a
   pass shows, what a fail changes, and the proof task that runs it.
2. The questions SHALL be at least: (1) a real repository with slow CI; (2)
   two people sharing a repository; (3) a request to Kiro Crew for a `scope=`
   key in the claim marker; (4) the `updated=` timestamp bug in a future
   release; (5) a crew without access to the plans repository; (6) a crew taking
   a mini-spec issue; (7) whether the one-line prompt makes the decision record
   unnecessary; (8) the plans repository name in a public marker; (9) the
   label names.
3. No question SHALL block the draft. A question SHALL block only the task
   that names it as a dependency.
4. Nothing SHALL be filed upstream by this spec. A request for Kiro Crew SHALL
   be written as a note in `docs/` for a person to file.

### Requirement RC13: The work split, and what Avoozl does not take

**User story:** As the owner, I want Avoozl to take only work that needs a
plan with an order, so that maintenance and one-off pull requests stay with
the tools built for them.

#### Acceptance criteria

1. The scope statement in the Introduction SHALL appear in the README, in the
   Set up screen and in the quick goal modal, in the same words. It SHALL say
   that Avoozl is for epics, that maintenance, triage and one-off pull request
   handling belong to Issue Radar crews or to the team's coder, and that
   Avoozl can hand each task to any coder.
2. The rule of thumb SHALL show beside the statement: fits in one pull
   request, not Avoozl; needs a plan with an order, Avoozl.
3. WHEN a quick goal or a planned issue produces one task and no edge, Avoozl
   SHALL show one line: "This fits one pull request. A crew or your coder can
   take it without a plan." The line SHALL offer **Plan it anyway** and SHALL
   NOT refuse the goal or the plan.
4. Avoozl SHALL NOT add a maintenance, triage or one-off pull request feature
   to serve this split, except review drafts by label (RC20). The Untriaged list stays off for Radar-coded
   repositories (RC1.2).
5. The statement SHALL NOT change what an existing plan does. It is
   guidance, not a gate.

### Requirement RC14: The coder is pluggable per repository

**User story:** As the owner, I want to choose, per repository, who writes the
code for each task, so that Avoozl plans and gates the same way whichever
coder I pick.

#### Acceptance criteria

1. A repository SHALL name one coder: `issue-radar` (a Radar crew, shown as
   "Radar crew"; default on GitHub), `worker` (Avoozl's own worker, shown as
   "Avoozl worker"; for local-only repositories) or `remote` (a managed
   remote harness, shown as "Remote coder"; RC15). The setting SHALL be per
   repository. No coder name SHALL be read outside the adapters.
2. Every coder SHALL sit behind the same three calls: **hand over** a ready
   task or batch, **read state** (waiting, working, pull request open, merged,
   failed, needs a person) and **count as done**. A task counts as done only
   when its pull request has merged on the repository's remote (RC5.1,
   RC11.5). A coder's own "resolved" SHALL NOT count.
3. Plan approval, provenance, release order, Stop the line, the merge path and
   whole-head acceptance SHALL be the same for every coder. Switching a
   repository's coder SHALL NOT change a plan, a task ID or an approval.
4. `worker` SHALL be frozen: upkeep only (security fixes, bug fixes, keeping
   `npm test` green on the three systems, the compatibility names of RC11.4).
   No new feature SHALL be added to it. The Settings page SHALL say so.
5. WHEN a repository changes coder while tasks are in flight, Avoozl SHALL
   leave those tasks with their current coder and use the new one for tasks
   not yet handed over. It SHALL show the split once.
6. Adding a coder SHALL need one new adapter and its tests, and no change to
   planning, projection or release.

### Requirement RC15: A managed remote harness as coder

**User story:** As the owner, I want to give tasks to a managed remote harness
when a repository's work should run off my machines, and I want Avoozl to
count a task done only when the public pull request merges.

#### Acceptance criteria

1. Everywhere in the repository (code, docs, examples, tests, issue text and
   markers) the harness SHALL be called only "a managed remote harness" or "a
   remote coder". No internal service, company tool, internal host or team
   name SHALL appear anywhere in the repository. The release scan SHALL carry
   a check for this, and the scan SHALL run before every push.
2. For a repository with `coder: remote`, Avoozl SHALL file one code task per
   ready task, or one per batch (RC2.5), through the harness's own app or MCP
   interface. The filed task SHALL carry the task ID, the spec reference, the
   provenance marker text and the approved task text, and SHALL NOT carry
   anything the repository's content rules mark private.
3. Avoozl SHALL store the harness's task reference with the task, watch its
   state on the tick, and show the state in In flight and in Trace. A read
   failure SHALL fail closed: the task keeps its last state and shows the age
   of the read. Filing SHALL be idempotent: a retried tick files nothing twice.
4. A task SHALL count as done only when its pull request on the public
   repository has merged (RC14.2). A "complete" state in the harness SHALL NOT
   count. Merge, whole-head acceptance and release of dependents then follow
   the same path as for any coder (RC5).
5. Avoozl SHALL assume the harness needs a person to open or publish each
   pull request. WHEN a task's harness state is finished but no public pull
   request exists, Needs you SHALL show one row: "Waiting for a person to
   publish the pull request for <task>", with a link to the harness's task and
   the age of the wait. The row SHALL clear when the pull request appears.
6. Because each publish costs a person's time, batching SHALL matter. For a
   remote coder the default batch size SHALL be larger than for a crew, the
   preview SHALL show how many publishes the plan needs, and a batch SHALL
   NOT split a chain of dependent tasks that fits in one batch.
7. Avoozl SHALL NOT assume the harness can read a private plans repository
   (RC12 question 5). The filed task SHALL carry the text the harness needs.
8. Avoozl SHALL NOT arm auto-merge on a harness pull request before
   `verify-issue` passes (RC3, RC5.8).
9. The adapter SHALL use only a documented interface of the harness and SHALL
   need no setting beyond a connection the person makes in the harness's own
   app. Avoozl SHALL NOT store the harness's credentials.
10. The tick SHALL start the harness's MCP server as a local child process,
    the way an existing Kiro Crew app starts its own, and SHALL call only its
    create-code-task tool and its get-task-statuses tool. It SHALL start no
    other process and open no listening socket for this.
11. Avoozl SHALL file each task under the **approving person's own identity**,
    on purpose: that identity is the provenance. The receipt (RC3, Requirement
    15) SHALL record the approver, the harness task ID and the Avoozl task IDs
    it covers. Avoozl SHALL NOT file under any other identity.
12. WHEN the person's sign-in has expired, Avoozl SHALL open one Needs you item
    ("Sign in again") and hold all new filing for that person. It SHALL NOT
    retry in a loop: it SHALL try again only after the person says they signed
    in, or on a later tick after one cheap check passes. Tasks already filed
    keep being watched when the harness allows it. The item SHALL clear when
    filing works again.

### Requirement RC16: Integration branches for rewrites

**User story:** As the owner, I want a rewrite to land as many small pull
requests into a long-lived branch, with one person-approved step to land the
branch in main, so that a rewrite never half-lands in main.

#### Acceptance criteria

1. An epic MAY name an **integration branch** (`integrationBranch` in its
   manifest). Avoozl SHALL create no branch on its own. It SHALL check that
   the branch exists, is not the default branch and is protected, and say what
   is missing.
2. WHILE an epic names an integration branch, every projected task SHALL
   target that branch. A task pull request merges into the branch after CI and
   light review (the repository's rule for the branch), and auto-merge MAY be
   armed on it (RC5.2). The branch's rule SHALL be separate from the default
   branch's rule.
3. **Whole-head checks** SHALL run on the integration branch's head: the
   checks the default branch runs, plus any the epic adds. Whole-head
   acceptance for the epic SHALL be recorded from those checks on the branch
   head (RC11.5, Requirement 16), not from the task pull requests.
4. Landing the branch in the default branch SHALL be **one separate step**
   that a person approves. Avoozl SHALL NOT merge the branch into the default
   branch on its own. It SHALL show a Needs you row when whole-head acceptance
   is green and the branch is up to date with main, and SHALL record who
   approved and which head. An approval for an older head SHALL NOT count.
5. Plan approval, implementation (the task pull requests), integration (a
   task's merge into the branch, and the branch's merge into main) and
   whole-head acceptance SHALL stay four separate records (AGENTS.md). A task
   merged into the branch SHALL NOT mark the epic accepted.
6. Avoozl SHALL bring the default branch into the integration branch on a
   schedule (default weekly, set per epic, off allowed). It SHALL do so as a
   merge commit and push normally. It SHALL NOT rebase and force push the
   branch (AGENTS.md). A rebase SHALL happen only when a person does it and
   says so. WHEN the merge conflicts, Avoozl SHALL stop the sync, label it,
   and show a Needs you row with the files.
7. **Stop the line** SHALL work for the branch. WHILE one is open for the
   branch's scope (a red whole-head check, a failed sync, a person's stop),
   the tick SHALL release no new task for the epic and SHALL NOT arm
   auto-merge on its pull requests (RC4.3, RC5.4). The row SHALL say why.
8. The branch SHALL appear in Trace, In flight and Progress with the number of
   tasks merged into it, how far behind main it is and the state of its
   whole-head checks.
9. An epic without an integration branch SHALL behave as before. No epic
   SHALL need a branch.

### Requirement RC17: Epic types beyond rewrites

**User story:** As the owner, I want templates and docs for the common large
changes, so that each one starts from the right shape.

#### Acceptance criteria

1. Avoozl SHALL ship templates and docs for four epic types, each with the
   scope statement of RC13 and generic wording only: a **rewrite** (RC16), a
   **cross-repository migration**, a **large codegen change** and a
   **cross-repository proposal** (criteria 4 to 6).
2. A **cross-repository migration** template SHALL give the usual order: a
   tool or compatibility layer first; then one task per repository, each
   behind its own check; then removal of the old path. Edges SHALL run from the
   first stage to every per-repository task and from all of them to removal.
3. A **large codegen change** template SHALL give the usual order: change the
   generator and its tests; regenerate one sample and review the diff;
   regenerate the rest in batches; then remove the old output. Each
   regeneration task SHALL name the command it runs and the check that
   compares the output.
4. A **cross-repository proposal** SHALL be one parent spec with one **sub-spec
   per repository**. Each sub-spec SHALL have its own requirements, design,
   tasks and manifest, and SHALL be approved and released on its own. The
   parent SHALL hold the shared requirements and the list of sub-specs, and
   SHALL NOT hold repository tasks.
5. A cross-repository edge (a task in one repository that needs a task in
   another) SHALL be named in the sub-spec as a `requires` on the other
   repository's task ID, and SHALL be refused when the other sub-spec is not
   approved or does not hold that ID.
6. A proposal MAY take an **external gap report**: a document that lists, per
   repository, which of the proposal's requirements it still fails. Avoozl
   SHALL read it from a path or an issue the person names, SHALL show it as a
   table (repository by requirement), and SHALL turn each failing cell into a
   proposed task in that repository's sub-spec. Nothing SHALL be added to a
   spec until a person accepts it. A passing cell SHALL produce no task. A
   report Avoozl cannot parse SHALL be refused naming the line.
7. Docs and templates SHALL use generic terms only: repositories,
   requirements, a generator, a gap report. They SHALL name no internal tool,
   service, host or team (RC15.1).

### Requirement RC18: Approve on the issue

**User story:** As a trusted person, I want to approve a drafted plan by
adding a label on the issue that asked for it, and I want an approval made in
Avoozl or in a chat to show up on that issue, so that the issue always tells
the truth.

#### Acceptance criteria

1. The **approval label** SHALL be configurable per repository. Default name:
   `avoozl:plan-approved` (RC21). It SHALL differ from the planning, needs-human, claim,
   ready and conflict labels; two equal names SHALL be refused naming both
   (RC1.3).
2. WHEN the approval label is added to the issue that asked for a plan, and
   that issue has a drafted plan whose lint has 0 errors, the tick SHALL check
   the person who added it with the same check the trigger labels use
   (`allowedActors`, `minimumPermission`; Requirement 10). A person who passes
   SHALL approve the plan, and Avoozl SHALL record the approval (RC3.6).
3. An untrusted labeler, or one whose login cannot be read, SHALL be ignored:
   Avoozl SHALL remove the label, approve nothing, and show one Needs you row
   naming the login and the issue, once.
4. WHEN a plan is approved in Avoozl, or in a chat or the CLI (`plans_*` tool),
   Avoozl SHALL write the approval back to the issue that asked for it: add
   the approval label, and post one comment with a hidden marker holding the
   approver's login, the spec path, the commit and the time. The comment text
   SHALL NOT quote the spec.
5. Both paths SHALL end in **one approval record**. A second approval of the
   same revision, from any path, SHALL do nothing: no second record, no second
   comment and no second label write.
6. The label write-back SHALL be a best effort that never blocks the approval:
   WHEN it fails, the approval stands and one Needs you row says the issue was
   not updated.
7. WHEN the approval label is removed after approval, Avoozl SHALL NOT revoke
   the approval. A revoke SHALL be an explicit act in Avoozl.
8. Plan approval SHALL stay separate from implementation, integration and
   whole-head acceptance (AGENTS.md). The approval label SHALL mean the first
   and nothing else.
9. WHEN the approved plan has no source issue (a plan started in Avoozl), the
   write-back SHALL be skipped without a row.

### Requirement RC19: Claim at approval

**User story:** As the owner, I want the parent issue marked as taken the
moment its plan is approved, so that no crew picks up the parent itself while
its sub-issues wait for release.

#### Acceptance criteria

1. WHEN a plan is approved and its source issue is the parent of the projected
   issues (RC1.6), Avoozl SHALL post the crew claim marker on the parent, in
   the format Radar's claim comment uses, and SHALL add Radar's in-progress
   label. This is the one case where RC1.4 lets Avoozl write the claim label.
2. WHEN a Radar crew already holds a claim on the parent, Avoozl SHALL leave it
   and SHALL write nothing there, and SHALL note it once in the plan's Trace.
3. The marker SHALL say it is held by Avoozl for the plan and SHALL NOT claim
   any crew id of a real crew. A crew reading it SHALL see the parent as taken.
4. Sub-issues SHALL be released later with the ready label in graph order
   (RC4), never by this claim.
5. WHEN the plan is superseded or the parent closes, Avoozl SHALL remove its
   own claim label and SHALL leave a claim that is not its own.
6. The claim SHALL be written once per approval. A second approval is a no-op
   (RC18.5).

### Requirement RC20: Review drafts by label

**User story:** As a person who reviews pull requests, I want to add one label
to a pull request and find a draft review waiting for me on GitHub, with line
comments I can edit, so that I review faster and still submit every review
myself.

Owner decision 2026-11-14: this is a pull request feature Avoozl takes on
purpose. It changes RC8.7 (Avoozl does not repeat pull request review) and
RC13.4 (no one-off pull request feature) for this one case, and for no other.

Facts: GitHub creates a review as `PENDING` when the create call has no
`event`; only `APPROVE`, `REQUEST_CHANGES` or `COMMENT` submit it; a pending
review can be deleted, a submitted one cannot (Verified: GitHub REST docs,
"Pull request reviews", 2022-11-28). A pending review is seen only by the
account that made it, and an account holds at most one pending review per
pull request (Inferred from GitHub's review page and its "one pending review"
refusal; checked live in proof rc-p20).

#### Acceptance criteria

1. The **review label** SHALL start a draft, and nothing else SHALL. WHEN the
   review label is on an open pull request in a registered repository, the
   tick SHALL read who added it last (the issue events) and check that person
   with the trigger-label check (`allowedActors`, `minimumPermission`,
   Requirement 10). A person who fails it, or whose login cannot be read,
   SHALL get the same treatment as RC18.3: the label is removed, nothing is
   drafted, and one Needs you row names the login and the pull request.
2. The draft SHALL be posted under the login of the person who added the
   label, because only that account can see it. Avoozl SHALL read the
   machine's GitHub login (`GET /user`) before it opens the chat and again
   before it posts. WHEN that login is not the labeler's, Avoozl SHALL open no
   chat and post nothing, SHALL leave the label, and SHALL show one Needs you
   row that names both logins and says the draft can only be made on that
   person's machine. The row SHALL clear when the label is removed or the
   logins match.
3. For a pull request that passes, Avoozl SHALL open **one** read-only review
   chat (Avoozl's reviewer role for pull requests, agent `avoozl-review-draft`)
   per label add, on the head commit at that time. The chat SHALL read the pull request, its
   files and the linked issues with read-only `gh` commands, and SHALL have one
   way to GitHub: `plans_post_review_draft`. It SHALL NOT edit files, push,
   label, comment, approve, request changes or submit.
4. `plans_post_review_draft` SHALL take the calling chat's binding, never an
   input, to pick the pull request. It SHALL create a GitHub review with no
   `event` (a pending review) on the head commit the brief named, with a body
   and line comments (`path`, `line`, optional `start_line` and `side`). It
   SHALL screen the body and every comment with the reply screen and content
   rules (as `plans_post_reply` does) and post nothing when a screen refuses.
   A GitHub refusal (for example a line outside the diff) SHALL be returned to
   the chat with nothing posted, so it can fix and call again. It SHALL post
   at most one draft per request.
5. WHEN the draft is posted, Avoozl SHALL remove the review label and add the
   **drafted label**, and SHALL show one Needs you row "Your draft review is
   waiting" with the pull request link and the time it was drafted.
6. People SHALL find what waits on them in three ways: the Needs you row; a
   **Review drafts** list in Avoozl (open, stale and submitted drafts, with a
   filter by repository and by state); and the GitHub search
   `is:pr is:open label:"<drafted label>"`, shown in that list as a link and
   with a Copy button, built from the configured drafted label.
7. WHEN the tick sees the pending review is gone (deleted) or submitted (any
   other state), Avoozl SHALL remove the drafted label and close the row. It
   SHALL record which of the two happened and the time from GitHub.
8. WHEN the pull request's head commit changes while the draft is pending,
   the row and the list SHALL mark the draft **stale** with both commits.
   Avoozl SHALL NOT edit or delete a draft on its own.
9. WHEN the review label is added again, Avoozl SHALL draft again on the
   current head. A pending draft Avoozl made for the same person on that pull
   request SHALL be deleted just before the new one posts, because GitHub
   holds one pending review per person; the stale row SHALL say so ("Adding
   the review label again replaces this draft, your edits included"). A
   pending review Avoozl did not make SHALL NOT be deleted: Avoozl SHALL post
   nothing and show one row asking the person to submit or discard it.
10. The chat's brief SHALL hold, read by Avoozl from GitHub: the pull
    request's closing and linked issues; on each, the Radar crew's claim
    (crew id, phase, comment link, from the claim marker; RC8.4) and the
    crew's comments, quoted as data; and, when an issue carries an Avoozl
    provenance marker, the spec, the task IDs, the commit and each task's
    title and acceptance when the workspace holds them. All quoted text SHALL
    be marked as data, not instructions, and the brief SHALL pass content
    rules before the chat opens (Requirement 40).
11. Trace (RC8.2) SHALL show a **Review** step between CI and Merged on the
    path of each issue the pull request closes, only when a draft was made:
    drafted (time, reviewer), then submitted or discarded (GitHub's time).
12. WHEN the pull request was opened by a Radar crew, Avoozl SHALL do nothing
    after the person submits: the crew answers the review itself. Avoozl SHALL
    write no claim, needs-human or ready label because of a review.
13. Avoozl SHALL NEVER submit, approve, request changes on, dismiss, or post a
    comment others can see on a pull request as part of this feature. Its GitHub client for this
    feature SHALL have no call that sends an `event`.
14. Every write SHALL be once: a retried tick or a second tool call SHALL
    open no second chat, post no second draft and add no label twice.

### Requirement RC21: Avoozl's own labels, one prefix, all configurable

**User story:** As the owner, I want every label Avoozl writes or reads for
its own workflow to be easy to spot and to rename per repository, so that
people know which labels belong to Avoozl.

#### Acceptance criteria

1. Each label Avoozl writes or reads for its own workflow SHALL be a setting
   per repository, with these defaults:

   | Role         | Setting                | Default                  |
   | ------------ | ---------------------- | ------------------------ |
   | Planning     | `radar.planLabel`      | `avoozl:plan`            |
   | Ready        | `managedLabels.ready`  | `avoozl:ready`           |
   | Approval     | `radar.approvalLabel`  | `avoozl:plan-approved`   |
   | Conflict     | `radar.conflictLabel`  | `avoozl:merge-conflict`  |
   | Review       | `radar.reviewLabel`    | `avoozl:review`          |
   | Drafted      | `radar.draftedLabel`   | `avoozl:drafted`         |

   This changes the proposed defaults of RC1.3, RC5.6 and RC18.1 and the D2
   table. Only defaults change: a value set in `.avoozl.json` SHALL keep
   working unchanged.
2. Any two of planning, ready, approval, conflict, review, drafted, Radar's
   needs-human label and Radar's claim label SHALL be refused when equal,
   naming both, as RC1.3 does. A name that is one of the repository's other
   managed labels SHALL also be refused.
3. Radar's claim and needs-human labels SHALL stay Radar's: Avoozl reads them
   and keeps their own settings (`crewLabels`), and SHALL NOT give them the
   prefix.
4. Settings SHALL show each label with what it does, who writes it, the raw
   setting name and its default as the placeholder (RC7.6), in one place per
   repository. Set up's label step (RC7.1) SHALL create the review and drafted
   labels with the others.
5. Settings and Set up SHALL say, once, that a repository relying on the old
   defaults (`to plan`, `ready`, `plan approved`, `merge conflict`) now reads
   the new names, and that setting the old name keeps it, and that a crew's
   label scope must match the ready label (RC1.6).

### Requirement RC22: The Workflow map in Settings

**User story:** As the owner, I want one picture in Settings that shows how work
flows through a repository with its real label names, coder, release number and
merge setting, so that I see the whole path and where each setting is.

This is display only. It writes nothing and starts nothing.

#### Acceptance criteria

1. Settings SHALL show a **Workflow map** for each repository, drawn from that
   repository's saved settings (and the workspace's `delivery.ship`), never from
   a fixed picture. A short muted line at the top SHALL say what the map shows
   and that it is read from settings.
2. The map SHALL have up to three lanes, each a row of step cards joined by
   arrows that wrap on narrow widths: **Maintenance** (issue, crew label, crew
   fixes, merge closes the issue; Avoozl is not in it), **Epic** (request, crew
   asks for a person, planning label, draft, approval, claim and sub-issues,
   ready labels in graph order, build, merge) and **Review draft** (pull
   request, review label, review chat, pending review, drafted label, the
   person submits, the crew answers).
3. Each card SHALL carry a **who** tag: You, Radar crew, Avoozl or GitHub, each
   with its own theme-variable color and a text word, so color is never the only
   cue.
4. A card SHALL show the repository's actual values: label names (set, or the
   default and that it is the default), the coder, allowed actors or minimum
   permission, the release number N and release mode, and the merge setting.
   Clicking a value SHALL move focus to the field that sets it, opening the
   Settings sub-tab and any folded group that holds it. A value set outside the
   repository dialog (the merge setting, on the Delivery tab) SHALL name where it
   is set.
5. The lanes SHALL follow the coder. With `issue-radar`, the Epic lane builds
   with crews and releases `ready` labels. With `worker`, Avoozl starts ready
   tasks up to the repository's tasks-at-once number and opens worker chats.
   With `remote`, the build step names a managed remote provider. Maintenance
   needs a Radar crew and is muted for the other coders.
6. A step that does not apply SHALL show muted with its reason in words (for
   example "no review label is set", "the coder is not Issue Radar"). Local only
   mode SHALL show only a local-worker lane (ready task, worker chat, checks and
   reviewer chats, merge into the landing branch) and one line saying the GitHub
   lanes are hidden in this mode (the settings-follow-mode rule).
7. A step not built, or built and not proven on a real repository, SHALL carry a
   small tag ("not built", "fake-tested", "not proven live"). The tags SHALL
   come from one table in code that is keyed by step, so no card hand-writes
   one, and the table SHALL be updated when a step's proof passes.
8. A **Labels** table SHALL list each label, who writes it, and a link to its
   setting. Labels the settings do not yet hold (review, drafted, until RC20 and
   RC21 land) SHALL show as a placeholder that says so, and the review lane SHALL
   be muted with that reason until a later change reads the setting.
9. The map SHALL use theme variables only, read at 320 px, need no animation,
   and turn off any it has under `prefers-reduced-motion`.

### Requirement RC23: Tracker gates

**User story:** As the owner, I want a task in an epic to wait on something
outside GitHub and outside the coder, such as a team review, a code review
that must ship to a live release, a ticket in another tracker, or a managed
remote harness task, so that the epic holds its order without a person
watching that outside item.

A tracker gate is a graph node that no crew builds. Avoozl reads the outside
item through a plugin and releases the dependents when it is done.

#### Acceptance criteria

1. A task whose manifest entry has `completion: "tracker"` SHALL be a **gate**,
   alongside `person` (or `human`) and `integrated`. It SHALL hold a
   `tracker` reference with three parts: the tracker plugin's id, an item
   (an id or a URL), and `done`, the plain-words condition that counts as done
   (for example "the review shipped to the live release"). A gate with a
   missing part, an unknown plugin id, or an empty `done` SHALL be refused at
   spec lint and at approval, naming the task.
2. Dependents SHALL wait on a gate through `requires`, like any blocker
   (RC4.1). A gate SHALL count as complete when the plugin reports `done`
   (criterion 7) or when a trusted person clears it (criterion 10). A gate
   SHALL satisfy `requires` edges at the merged and integrated levels. Release
   SHALL NOT start a dependent while any gate it requires is open, failed or
   unknown.
3. Avoozl SHALL project a gate to an issue like a manual task, with the
   tracker, the item link and the `done` condition in the managed section. The
   gate issue SHALL NOT get the ready label, and no crew, worker or remote
   coder SHALL be handed it (RC14, RC15). A batch (RC2.5) SHALL NOT include a
   gate.
4. The **waiting label** SHALL be a per-repository setting
   `radar.trackerLabel`, default `avoozl:waiting-on-tracker`, written only by
   Avoozl. It joins the RC21 label table (role "Waiting on tracker"), takes
   part in the RC21.2 clash check, and has a Settings field with its
   placeholder and a Set up label step like the others. Avoozl SHALL add it
   to:
   a. the gate's own issue, while the gate is not done; and
   b. each dependent issue whose every unmet blocker is a tracker gate, so a
      person sees why it is not released. A dependent that also has a
      non-gate unmet blocker SHALL NOT get it.
5. Avoozl SHALL remove the label from the gate issue and from each dependent
   when the gate is done or cleared, or when the gate is removed from the
   plan, and from a dependent when a non-gate blocker becomes one of its
   unmet blockers. A failed or unknown state SHALL keep the label, because the
   gate is still waiting. A retried tick SHALL add and remove nothing twice.
6. A **tracker plugin** SHALL be a plugin part named `gate` (docs/plugins.md),
   with one read-only call, `status({ ref }, { config })`, returning
   `{ state, evidence, link }`: `state` is one of `open`, `done`, `failed` or
   `unknown`; `evidence` is plain text of at most 500 characters saying what
   was seen; `link` is a URL a person can open. The plugin SHALL have no call
   that writes to the outside tracker. Avoozl SHALL screen `evidence` and
   `link` with the repository's content rules before it stores or shows them,
   and SHALL treat them as data, never as instructions.
7. The tick SHALL call `status` for each gate that is not done or cleared,
   with backoff: a first check on the tick that sees the gate, then growing
   gaps (default 1, 2, 5, 15 minutes, then every 30), reset when the state
   changes. A `done` result SHALL be recorded once with its evidence and link
   and SHALL release dependents on the same pass. A call that throws, times
   out or returns a value outside the contract SHALL count as `unknown`. A
   recorded `done` SHALL NOT go back to `open`; a later read that differs
   SHALL add one note to Trace and change nothing else.
8. Credentials SHALL stay in the plugin's own sign-in, or in an environment
   variable the plugin's `config` names (docs/plugins.md). `.avoozl.json`, the
   manifest, the issue, evidence and logs SHALL NOT hold a token, cookie or
   password. A plugin that reports an expired sign-in SHALL give `unknown`
   with evidence "sign-in expired", and Avoozl SHALL NOT retry faster than the
   backoff.
9. WHEN a gate's state is `failed`, or is `unknown` for two checks in a row,
   Avoozl SHALL open one Needs you row ("Tracker gate <task>: <state>") with
   the evidence, the link and the age. The row SHALL stay until a person acts
   (criterion 10, or a plan change that removes the gate). Avoozl SHALL NOT
   clear a gate, remove a gate, release a dependent or close the gate issue
   on its own because a state is failed or unknown. A later `done` from the
   plugin SHALL close the row and release dependents.
10. A person the repository policy allows (the trigger-label check) SHALL be
    able to **clear** a gate by removing the waiting label from the gate
    issue, or by an Avoozl chat, CLI or MCP command naming the gate and giving
    a reason. The clear SHALL be recorded as an order, like an allowed close
    without merged code: who, how, when, the last known state and the reason,
    in the receipt and the issue's marker. It SHALL NOT count as verified
    completion. Each released dependent's brief SHALL say the gate was cleared
    by a person and not seen done. WHEN the actor is not allowed, or cannot be
    read, the gate SHALL keep waiting, the label SHALL be put back and one row
    SHALL say who tried. WHEN a plugin later reports `done` for a cleared
    gate, Avoozl SHALL add the evidence to the record and change nothing else.
11. The UI SHALL show a gate wherever a task shows:
    a. Release queue (Up next) SHALL list each gate and each held dependent
       with the tracker's name, the state, the time of the last check, the
       next check, the evidence line and the link, and a Clear control with a
       reason field for an allowed person.
    b. Trace SHALL show a **Tracker** step for a gate, and for a held
       dependent a line saying it waits on the gate, with the same fields.
    c. Waiting on you SHALL list each gate whose state is `failed` or has
       been `unknown` for two checks, with a link to the gate's row. A gate
       that is open and healthy SHALL NOT be listed there.

    The same rows SHALL be readable through the CLI and MCP. Colors SHALL use
    theme variables, and the state SHALL also be a word.
12. The public spec, docs and examples SHALL describe tracker plugins only by
    role: a ticket tracker, a code-review-shipped check for a private code
    host, and a managed remote harness task. They SHALL NOT name an internal
    tool, host, team or product, and the repository's release scan SHALL stay
    clean. The only plugins in the repository SHALL be fakes.
13. Every write SHALL be once: a second tick, a second tool call or a second
    clear SHALL NOT add a second label, post a second comment, open a second
    row or record a second order.
