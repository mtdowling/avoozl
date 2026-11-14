# Design: Avoozl plans and gates, Issue Radar crews code

Status: Approved

Requirements are in `requirements.md` (RC1 to RC12). Sections here are
numbered D1 to D17 so they are not confused with the sections of
`.kiro/specs/avoozl/design.md`, which this design builds on and sometimes
changes (each change is named).

## D1. Thesis

Scope. Avoozl is for epics: approved goals that need many ordered changes.
Maintenance, triage and one-off pull requests belong to Radar crews or to the
team's coder (RC13). Fits in one pull request: not Avoozl. Needs a plan with
an order: Avoozl.

Avoozl does the work that needs memory of the whole plan: the spec, the graph,
the order, the proof of approval. Crews do the work that needs a clean context
and a shell: triage, code, tests, a pull request. GitHub holds the shared
state: issues, labels, blocked-by links, pull requests, merges. No part of the
loop needs Avoozl's own workers.

```text
person ──▶ spec / quick goal ──▶ approve (a merged PR) ──▶ Project to GitHub
                                                                │
        ┌───────────────────────────────────────────────────────┘
        ▼
 issues + marker ──▶ tick adds `ready` (graph order, N at a time)
        ▼
 crew (any machine): verify-issue ─ ok ─▶ claim ─▶ PR ─▶ CI
                          │ fail                         ▼
                          └▶ skip, needs-decision   tick arms auto-merge (or person merges)
                                                         ▼
                                              merge ─▶ close ─▶ dependents released
```

### Who owns what

| State or act                                   | Owner                                                     |
| ---------------------------------------------- | --------------------------------------------------------- |
| Spec text, graph, approval, release order      | Avoozl (SQLite for execution state, Markdown for prose)   |
| Issues, sub-issues, blocked-by, labels, PRs    | GitHub                                                    |
| Triage, claim, code, PR, CI rounds             | The crew (Radar)                                          |
| Crew creation, agent, Additional prompt, pause | The owner, in Radar (owner-only, fact 7)                  |
| Auto-merge on a crew PR                        | Avoozl's tick (fact 2), or the person                     |
| Rules the crew follows                         | `AGENTS.md`, `.kiro/steering/`, the one-line prompt       |

## D2. Labels

Avoozl's own labels share the `avoozl:` prefix (RC21). Avoozl never writes
Radar's two (needs-human, claim), except the claim at approval (RC19).

| Label            | Job                                            | Written by          | Default name             |
| ---------------- | ---------------------------------------------- | ------------------- | ------------------------ |
| Planning         | "Avoozl, plan this"                            | A trusted person    | `avoozl:plan`            |
| Needs-human      | "Crew stopped and wants a person"              | The crew            | as set in Radar          |
| Claim            | "A crew has this"                              | The crew            | `crew: in progress`      |
| Ready            | "Eligible for a crew"; the crew's label scope  | Avoozl's tick       | `avoozl:ready`           |
| Conflict (on PRs)| "This PR has a merge conflict"                 | Avoozl's tick       | `avoozl:merge-conflict`  |
| Approval         | "This plan is approved" (RC18)                 | A trusted person, or Avoozl's write-back | `avoozl:plan-approved` |
| Review (on PRs)  | "Draft a review for me" (RC20)                 | A trusted person    | `avoozl:review`          |
| Drafted (on PRs) | "A draft review waits for its person" (RC20)   | Avoozl's tick       | `avoozl:drafted`         |

The defaults changed from `to plan`, `ready`, `plan approved` and
`merge conflict` (RC21.1). A name set in `.avoozl.json` keeps working; only
an unset name reads the new default.

The crew's label scope is the ready label (Radar picks only issues with a
label in scope; an empty scope means every open issue). Set up requires it
(RC7.2). This is the **Proposed** split, which follows the rule that an
input label and an output label never share a name. **Not checked:** the
exact names Kiro Crew's own repository uses were not readable for this
spec. The names are settings, not code, so they are confirmed in question
Q9 (D16) before the first Set up.

Names are validated together: any two equal are refused (RC1.3), and a name
that is a managed label of another rule is refused (existing rule in design
4.4). They stay configurable per repository and per workspace; no behavior
needs a prefix.

## D3. Planning input and the plan-me hand-off (RC1)

Avoozl reads three things in a Radar-coded repository, and only these:

1. Issues with the planning label whose labeler passes the actor check.
2. Issues with the needs-human label ("plan me"), through PR 67's read
   (`radar-plan-me`): trusted author, own marker, or `acceptedLabel` by an
   allowed person; scope from the comment's second line; a `new-feature`,
   `architecture` or `needs-design` scope goes to Intake, anything else to
   Needs you, and an untrusted issue is left alone. Unchanged.
3. Claim labels and claim markers, for **On the line** (`radar.crews`).

It does not read or list other open issues for that repository (the
Untriaged list is off). That is what "Avoozl never triages" means in code: no
list call for plain open issues.

When a plan is projected from a source issue, the source becomes the parent
in the sub-issue tree and gets no ready label. The person clears the
needs-human label. The planning label is removed by Avoozl only when
`radar.clearPlanLabel` is on (default off), so Avoozl's write list stays
short.

## D4. Projection (RC2)

### D4.1 Two modes, one code path

| Part            | Single-repo                              | Plans-repo with `coder: issue-radar`                     |
| --------------- | ---------------------------------------- | -------------------------------------------------------- |
| Spec            | `<code repo>/.kiro/specs/<name>/`        | `<plans repo>/.kiro/specs/<name>/`                       |
| Issues          | code repo                                | **code repo** (changed from design 6.6)                  |
| Marker `plans=` | absent                                   | `plans=<owner>/<repo>`, only if shown (below)            |
| Commit pinned   | code repo commit                         | plans repo commit                                        |
| Closing         | `Closes #N`, GitHub closes               | `Closes #N` in the PR; if absent, Avoozl closes on merge |
| Crew reads spec | from the checkout                        | brief in the issue; `verify-issue` reads the plans repo  |

Plans-repo mode with a worker coder stays as design 6.6 says (issues in the
plans repository, public pull request text hides its name). Only the
`issue-radar` coder moves the issues, because a crew reads and writes one
repository. The policy check that refuses `issue-radar` in plans-repo mode is
removed (task rc-2.1).

The plans repository name appears in a public issue only with the repository
setting **Show the plans repository name in issues**. For a private code
repository it is on. For a public one it is off, and projection is refused
with the reason until the person turns it on or moves the spec into the code
repository. This is a deliberate exception to design 3.4's "the marker never
names the planning repository". Content rules screen the name either way.

### D4.2 Batching

```text
for each phase, in graph order:
  candidates = tasks with size "small", no open blocker, no human completion
  group candidates by (repository, phase [, overlapping paths if by=files])
  drop any pair joined by an edge
  cut each group into batches of at most flow.batch.max (default 3, hard cap 5)
  a group of one stays a plain issue
```

- A task that has any unmet `requires` at projection time never batches, so
  only the first wave of a phase can batch. **Shortcut:** later waves are
  single issues. Upgrade when real data shows many small blocked tasks; a
  later **Batch now** action could merge two unreleased issues.
- A batch issue has one marker listing every task ID and one checklist. Its
  node in the graph shows the member tasks. Each task ID keeps its own node,
  acceptance, evidence, timing and edges. Edges between members do not exist
  by rule; external blockers of the members are the union placed on the one
  issue as native blocked-by links (none, by the rule above, at projection).
- The crew's one pull request carries `Closes #<batch>`. Avoozl closes each
  member task when it sees that merge (Requirement 16's exact-pull-request
  check, with the batch issue as the link). The checklist is for the crew's
  reading, never Avoozl's (fact 2).
- The modes are one radio fold-out: Off, Suggest (default), Auto.

### D4.3 Preview and Spec changed

The **Project to GitHub** modal (mockup `04-projection.html`) lists every issue
Avoozl would write, with include, batch edit, wave and release mode. **Create
issues (held)** writes issues with no ready label. **Create and release**
writes them and lets the tick release wave 1. Both are refused when preflight
fails (RC2.9). **Spec changed** is the same modal in diff form.

Preflight list: spec on the default branch with `Status: Approved`; decision
record present when required; merge path ready (D7); the crew label scope
equals the ready label (cannot verify without the grant: shown as "cannot
verify"); and, for a public repository, the public sign-off (D12).

## D5. Provenance and `verify-issue` (RC3)

### D5.1 The marker

```html
<!-- avoozl v=1 spec=radar-coder tasks=rc-2.3,rc-2.4 commit=0123456789abcdef0123456789abcdef01234567 approved-by=octocat plans=octo-org/octo-plans -->
```

Keys are `key=value` pairs separated by one space, values with no spaces.
`tasks` is a comma list. `plans` is optional. It is on one line, after the
managed marker, so a crew can find it with one pattern. The managed marker
(design 3.4) is unchanged and carries namespace, edges and applied hashes.
The provenance marker carries only what a stranger-proof check needs.

Writer and parser live in one module (`src/app/github-provenance.mjs`).
Unknown keys are ignored; an unknown `v` is refused.

### D5.2 Approval makes the commit real

Today an Avoozl approval is a receipt in SQLite. A crew cannot read that. So
**Approve** now ends in a commit a crew can read:

1. Avoozl checks the lint (0 errors) and the Kiro layout (Requirement 30).
2. It opens a pull request in the repository that holds the spec. The pull
   request sets `Status: Approved` in `requirements.md` (or `bugfix.md`),
   `design.md` and `tasks.md`, and, with `approval.decisionRecord` on, adds
   `docs/decisions/<spec>.md` (`Status: Accepted`, "may be built by
   automation").
3. A person merges it. Avoozl watches for the merge and records the commit
   (the merge commit) and the approver (the person who approved in Avoozl,
   whose login passes the actor check).
4. Only then may projection run. The approval receipt of Requirement 15 and the
   four-gates rule (D15) are unchanged.

The `Status:` line is excluded from the revision hash, the way checkbox marks
already are (`withoutMarks` in `spec-plans.mjs`), so approving does not look
like a spec edit. The line is any line equal to `Status: <Word>` in the first
20 lines of the file. This spec's own files say `Status: Draft`.

In a decision record the crew reads, no private repository is named.

### D5.3 The command

```text
avoozl verify-issue <owner>/<repo>#<n> [--json]

  marker    ok
  approver  ok  octocat has write on octo-org/octo-plans
  author    ok  octocat has write on octo-org/octo-code
  spec      ok  tasks.md at 0123456 lists rc-2.3, rc-2.4; all three files say Approved
  commit    ok  0123456 is identical to the default branch
exit 0
```

| Check      | GitHub reads (all through `gh api`)                                                                 | Fails when                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `marker`   | `GET repos/{o}/{r}/issues/{n}`                                                                      | no marker, two markers, unknown `v`, a required key missing                |
| `approver` | `GET repos/{so}/{sr}/collaborators/{approved-by}/permission`, where `{so}/{sr}` holds the spec      | not admin, maintain or write; any read error                               |
| `author`   | the same call for the issue's author, on the code repo                                              | not admin, maintain or write; any read error                               |
| `spec`     | `GET repos/{so}/{sr}/contents/.kiro/specs/{spec}/{file}?ref={commit}` for each file                 | a file missing, a task ID not in `tasks.md`, a file without `Status: Approved` |
| `commit`   | `GET repos/{so}/{sr}/compare/{default}...{commit}` (default from `GET repos/{so}/{sr}`)             | status other than `behind` or `identical`                                  |

- Exit 0 all ok; 1 a check failed; 2 could not run; 64 bad argument. A failed
  read is a failed check. When a check fails, later checks still run so one
  run reports every failure, except that `spec` and `commit` are skipped as
  `skipped` when `marker` fails.
- Output names checks, logins, repositories, task IDs and the commit. It never
  quotes issue or spec text (RC3.5), so a crew can paste it into a comment.
- No workspace, no network except GitHub, no writes. The operation is
  `issue.verify`, read-only, observe class (so MCP and app tokens may call it),
  exposed as the CLI `verify-issue` and the MCP tool `plans_verify_issue`. The
  tool count stays small (Requirement 56): this is the one new tool.
- `author` goes beyond the live test, which checked three things. It closes the
  case where a stranger opens an issue on a public repository and pastes an
  owner's login. Crews share the owner's login (fact 11), so the author of a
  crew-written or Avoozl-written issue is the owner.
- **Limits.** A marker is not a signature. Anyone who can edit an issue body
  and has write permission can write a valid marker. The check stops
  accidents, strangers, and a changed task list. A person who can write can
  also push code, so a signature would add nothing against them.
- Needs `gh` on the crew's machine, logged in as an account that can read the
  spec's repository (fact 5). Without it the command exits 2 or 1 and says why.

### D5.4 The Additional prompt

One line, shipped verbatim in Settings, in the team pack, and in a test that
compares it with the text Set up shows:

```
For any issue with an <!-- avoozl --> marker, run `avoozl verify-issue OWNER/REPO#N` (or the plans_verify_issue tool) first; build only if it exits 0, otherwise skip it with scope needs-decision and say which check failed.
```

This replaces the paragraph of the live test (fact 4), which carried the
checks in prose. The checks now live in code, so a rule change ships as a code
change, not a prompt edit on every crew. Honest limit: it is a prompt. A crew
with no prompt, an old prompt, or another owner's prompt does not run it. The
repository's rules (`AGENTS.md`) SHOULD say the same sentence, because crews
re-read them each issue (fact 3); Set up offers that as one review-rules pull
request. The same line in two places is the only duplication this design
allows.

## D6. Release (RC4)

```text
every tick, per repository:
  for each scope S (default: one scope = the ready label, capacity N):
    open = issues in S carrying the ready label, not yet merged
    free = N - |open|
    candidates = eligible tasks/batches in graph order whose scope is S
    add the ready label to the first `free` candidates
  if a stop is open, an issue reopened, or a blocker reopened:
    remove ready from every unclaimed issue in the scope
    comment once on each claimed issue
```

- **Eligible:** all `requires` blockers complete at the required level; the
  spec's previous phase fully merged; not held; not Deferred; no stop in
  scope.
- **Count:** claimed issues keep their ready label, so they use a slot until
  they merge or close. This keeps N a real cap on work in flight.
- **Order inside a scope:** graph order, then wave, then task ID. Crews pick
  at random among the labeled ones, so order holds only because N is small.
- **Per crew label scope:** `release.scopes: [{label, capacity}]`. A task's
  manifest entry may set `scope`. This lets a docs crew and a code crew share a
  repository.
- **Phases:** a phase is released only when every task of the previous phase
  of the same spec has a merged closing pull request. "Closed" by a person's
  order does not count here (it does for dependents under Requirement 33).
- **Mode:** a radio fold-out, Automatic, Step, Hold. Step waits for a click per
  phase.
- **Default N:** 2. Set up asks one question: "How many crews work this
  repository?" and sets N to that number. Radar's own `max_open` (default 3)
  is a per-crew limit Avoozl cannot read in Variant B.

## D7. Merge path (RC5)

Kiro Crew 0.12.2.4 does not arm auto-merge for a crew (fact 2). So:

```text
tick, per repository with ship = auto-merge:
  for each open, non-draft PR from a branch in this repo whose author passes
  the actor check and whose closing references include a marked issue:
     if not already armed and verify(issue) still passes:
         enablePullRequestAutoMerge(method: MERGE)        # GitHub merges later
  for each PR with mergeable = CONFLICTING:
     add the conflict label; one Needs you row
  for each PR whose conflict is gone: remove the label
tick, ship = manual:
  one Ready to merge row per PR with required checks green
```

- The merge method is a merge commit, as the owner's standing practice and the
  no-force-push rule need.
- It uses GitHub's mutation, so the rules the repository set (required checks,
  required reviews) are what decide. Avoozl never merges, uses `--admin` or
  skips a rule (RC5.5).
- The merge path is ready when: the repository allows auto-merge; the default
  branch has a rule requiring the CI check by name; `delivery.ship` has a
  value. Without a required check GitHub would merge at once or refuse; Avoozl
  refuses to release instead.
- A forged pull request cannot be armed: fork pull requests, authors outside
  the actor check and pull requests that do not close a marked issue are
  skipped. The tick re-runs `verify` once per issue per marker hash, so an
  edited marker stops arming.
- `delivery.ship` resolves as Requirement 80 says: task, spec, repository,
  workspace.
- Conflicts: a crew hands a conflicted pull request to a person with the
  needs-human label (fact in `radar-spec-tasks.md` section 4). The conflict
  label is Avoozl's own, on the pull request, so Delivery can filter on it.
  Avoozl does not resolve conflicts here; merging main into a branch is the
  crew's or person's act, never a force push.

## D8. The `avoozl-crew` agent (RC6)

`kirocrew-app/agents/avoozl-crew.json`, added to `app.json`:

| Part       | Content                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Name       | `avoozl-crew` (materialized as `avoozl--avoozl-crew.json`; the name then binds, per the live test)                             |
| MCP        | `avoozl:avoozl`                                                                                                                |
| Tools      | `@avoozl:avoozl/plans_verify_issue`, `@kirocrew-core/skill_search`, `@kirocrew-core/issue_radar_crew_read`, `issue_radar_crew_record` |
| Skills     | `skill://` resources for the Avoozl skills crews need (`avoozl`, `avoozl-rules`)                                                |
| Hooks      | For a public repository only: the scan-before-send hook of "Crews on public repositories". No other blocking hook until proven |
| Prompt     | Short: verify first; one issue, one PR; follow `AGENTS.md`; say the stage in the claim comment                                  |

- A crew chat has no default workspace, so no tool in the list may need one.
  `plans_verify_issue` reads only GitHub.
- It returns the brief when every check passes (task IDs, acceptance, section
  references, taken from the issue body the projection wrote, plus the spec text
  it already read for check `spec`). So building in plans-repo mode needs no
  more access than verifying does. Verifying `spec` still needs read on the
  plans repository, or the spec mirrored into the code repository (Q5).
- Unknown agent names fall back silently, so Set up checks that the name is in
  Radar's Agent list. It reads the list through the grant, or the installed
  agent files, and otherwise shows "Not verified".
- A crew must be **created** with this agent. Changing the agent of an existing
  crew did not move the slot in the live test.
- The app must be built before it is installed, or the MCP server fails at
  start; Set up detects a missing `bin/lib`.

## D9. Set up and the team pack (RC7)

Set up is one page with three groups:

| Group                           | Does                                                                                         | Verified by                     |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------- |
| **Avoozl does it** (gh)         | Labels; a branch rule requiring the CI check; the repository's auto-merge setting; the Project and fields; a pull request adding review rules to `AGENTS.md` | Reading the repository back     |
| **You do it in Radar**          | Connect the repository; New Crew (name, agent `avoozl-crew`, model, label scope = ready); the needs-human label; claim time limit; the Additional prompt | The grant's read, or "cannot verify" with a checkbox |
| **Avoozl checks**               | The app is built; the agent is in Radar's Agent list; the CI check exists; the merge path; the public sign-off if public | Reads                           |

Every value shown has a Copy button and says what it controls. Each `gh` step
is a preview and a confirm (Requirement 32's wizard rules). Nothing asks for a
model price. Defaults show; advanced values fold away; an inherited value says
where it comes from.

**Team pack.** A pack is the existing settings pack (Requirement 55) with a
`crews` section:

```json
{
  "name": "sdk-team",
  "crews": {
    "count": 2,
    "agent": "avoozl-crew",
    "models": ["model-a", "model-b"],
    "labels": { "plan": "to plan", "ready": "ready", "conflict": "merge conflict" },
    "prompt": "<the one line of D5.4>",
    "reviewRules": "<text for AGENTS.md>",
    "template": "<a workflow template name>"
  }
}
```

Applying a pack fills Set up and the settings after a preview. It creates no
crew (owner-only). Content rules screen a pack before it is saved or shared.

## D10. Observe (RC8)

Follows `docs/proposals/avoozl-experience.md`. The decisions that proposal
leaves to this spec:

- **Variant B first.** Everything from GitHub: claim markers, labels, pull
  requests, checks, timeline. Variant A (Radar's crew list: status, open
  counts, cost) is one grant and a later task, marked manual until the owner
  wants it.
- **Home.** Needs you; **On the line** (one row per claimed issue, with a rail
  Ready, Claimed, PR, CI, Merge); **Release queue**; Progress by goal.
- **Trace.** The eight steps of the experience proposal. Times come from
  GitHub events and comment `updated_at`, never `updated=` (fact 6). Cost per
  stage is Variant A only.
- **Side panel.** One tab. Matches the open chat from the URL, as the proposal
  says; the contract is **Inferred** and the first task includes a test that
  fails if the URL shape changes.
- **Flow.** Stage waits from GitHub times. The retro joins them to the
  provenance marker, the claim marker's crew id and the PR.
- **Retro targets.** A rule change to `AGENTS.md` or a steering file goes as a
  pull request. The crews re-read both on the next issue (fact 3). A change to
  the crew's Additional prompt is shown as full text with Copy and a link,
  since the edit is owner-only.
- **No repeated views.** Avoozl links to Issue Radar's lists and to Kiro
  Crew's own pull request review for anything they already show.
- **Cross-machine In flight** is PR 67's `radar.crews`: crew id, name, phase,
  issue, PR, last update and a stale flag from GitHub alone. Paused state,
  machine and chat are not on GitHub (see `radar-handoff-and-crew-list.md`).

## D11. Quick goals (RC9)

```text
"Make tests faster"
  ▼ modal: repository, depth (Look | Measure), budget (20 turns, 15 min)
planner chat (Avoozl-owned slot): read, optionally measure in a scratch worktree
  ▼ proposal: 1-8 tasks, edges, batches, risks, questions, evidence each
person: Approve | Edit | Promote to spec | Discard
  ▼ Approve
mini-spec `goal-<slug>` written in the Kiro layout ─▶ approval PR ─▶ merge ─▶ projection
```

The mini-spec is the change from the experience proposal (RC9.3). The reason
is mechanical: `verify-issue` check `spec` reads files at a commit, and the
layout mandate refuses a plan with no files. A quick goal therefore has files
too, small and generated: requirements hold the goal and the evidence, design
the approach, tasks the tasks. **Promote to spec** is then only "open this
folder in Spec Builder and keep going", with the same task IDs and the same
issues. Whether a crew builds from a mini-spec with a one-sentence "approval" is
Q6.

Promote rules (any one): more than 8 tasks, more than 3 dependency levels, an
open design question, a public interface change. Auto-approve is a setting, off.

## D12. Public repositories (RC10)

This design adds nothing to the public-crew layers. It gates on them and
links to them by name: **Crews on public repositories** in
`.kiro/specs/avoozl/` (clean crew home, scan before send, audit on the tick,
sign-off, Stop public crews). Where this spec writes to a public repository
(projection, labels, auto-merge, the marker), it routes the text through content
rules first (Requirement 40), and `verify-issue` prints no text from issues.
Release in D6 does not run for a public repository until the sign-off is
complete (task rc-10.1, a manual task that waits for that other work to land).

## D13. Retirement (RC11)

A separate last epic. Nothing starts before the real-repository proof
(rc-p11) is accepted by a person.

| Removed for Radar-coded repositories                | Where today                              | Kept for `coder: worker`? |
| --------------------------------------------------- | ---------------------------------------- | ------------------------- |
| Own worker dispatch (tick opens a worker)          | `kirocrew-app/crons/tick.py`, `delivery.mjs`, `runner.mjs`  | Yes                       |
| Crew routing and placement, router prompt           | Requirements 41, 42                      | Yes (placement), router off |
| Runner mode over SSH                                | Requirement 84, `remote-runner.mjs`      | Removed (crews replace it) |
| Remote relay                                        | Phase 32                                 | Removed                   |
| Per-task budgets for workers                        | Requirement 67                           | Stay for planner, retro, quick goal |
| Workers' Files and diff fold                        | Requirement 81                           | Removed with the worker UI |
| Verifier, falsifier, reviewer, responder roles      | `kirocrew-app/agents/*`                  | Yes for `worker`          |
| Foreman, bot heartbeat                              | research only, not built; superseded by Radar crews (RC11.8) | Stay unbuilt |

Rules for the removal:

- Remove by repository `coder`, behind the setting, in the first tasks; delete
  the code only when no repository in any known workspace is on `worker`, which
  the owner decides (rc-12.1). This keeps `coder: worker` honest.
- Keep these names and files working: `plans_*` MCP names, `NUPP_WORKSPACE`
  and `AICOMMANDER_*` variables, the `aicommander` command, the
  `aicommander.*` editor settings (AGENTS.md). A compatibility test asserts each
  still resolves (rc-12.8).
- Do not rewrite `docs/research/` or `docs/evidence/`.

## D14. Four gates stay four

| Gate                | Radar path                                                              | Worker path (kept)          |
| ------------------- | ----------------------------------------------------------------------- | --------------------------- |
| Plan approval       | Approve in Avoozl, then a merged approval PR (D5.2)                     | Receipt (Requirement 15)    |
| Implementation      | A crew's pull request, claim marker `implementing` to `resolved`        | A worker's report           |
| Integration         | The pull request merges (armed auto-merge or a person)                  | Rebase integrate            |
| Whole-head acceptance | The default branch's required checks after the merge; recorded by Requirement 16 | The head's checks |

A crew's `resolved` is implementation only. A task completes at the merge
(integration) and is accepted when the head's checks pass. A disconnected crew
is never replaced for an expired claim alone (AGENTS.md): the claim shows
stale and one decision opens.

## D15. Failure modes

| Failure                                         | What happens                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `verify-issue` cannot read the plans repository | Check `spec` fails, the crew skips as `needs-decision`, Needs you opens "crew cannot read plans" |
| Crew has no Additional prompt                   | Not caught by Avoozl; Set up marks "cannot verify"; the audit of claim comments shows a crew that built with no verification line |
| Auto-merge refused (no required check)          | The tick shows the repository's merge path as not ready; no release                          |
| CI red on a crew PR                             | The crew drives CI rounds (fact 1); after its limit it hands back; Needs you                 |
| A reopened closed issue                         | Ready removed from unclaimed dependents (RC4.3); reapplied when closed again                 |
| Stale claim (no marker update past the TTL)     | One Needs you row; Avoozl does not replace the crew                                          |
| Marker edited by someone                        | `marker` or `spec` check fails; the tick does not arm; a Needs you row                       |
| GitHub rate limit                               | Reads fail closed; the tick skips the repository, backs off, shows the age of its data       |

## D16. Open questions and the test that answers each

| Q   | Question                                                         | Test                                                                                                                                         | Pass shows                                            | Fail changes                                        | Task      |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- | --------- |
| Q1  | Does the loop hold on a real repository with slow CI?            | Run a 10-task spec on a real repository whose CI takes 20 minutes or more (the nupp repository), N=2, auto-merge on; record the Flow stage times and idle crew time | Crews stay busy; N=2 is enough; PR-to-green dominates | Raise default N; add a CI-aware release rule        | rc-p11    |
| Q2  | Do two people sharing one repository interfere?                  | Two owners, each with a crew, one repository; one planner; both set `allowedActors`                                                          | No double claim; approver and author checks pass for both | Per-owner scopes become required; document the limit | rc-p11    |
| Q3  | Will Kiro Crew put `scope=` in the claim marker?                 | Write the request note (`docs/`), a person files it; on each new release, read a skip comment's marker                                       | Skip scope is readable without prose                  | Keep reading the second line                         | rc-q3     |
| Q4  | Is the `updated=` time still wrong in a later release?           | On each release, compare a claim's `updated=` with GitHub's `updated_at` over 5 comments                                                     | If equal, stale detection may use it                  | Keep GitHub's time only                             | rc-q4     |
| Q5  | What does a crew without plans-repository access do?             | Run a crew under an account with no read on a private plans repo, on a marked issue                                                          | It fails `spec` and skips with the reason             | Mirror the approved spec into the code repo (new task) | rc-q5   |
| Q6  | Does a crew take a mini-spec issue (quick goal)?                 | A quick goal with a generated mini-spec and no decision record; one marked issue; one crew                                                  | Claims and builds                                     | Mandate a decision record, or Promote for every goal | rc-q6     |
| Q7  | Does the one-line prompt make the decision record unnecessary?   | Marked issue, approved spec, no `docs/decisions/` entry, one-line prompt                                                                     | Builds: set `approval.decisionRecord` default off     | Keep it on by default                               | rc-q7     |
| Q8  | May a public marker name a private plans repository?             | Owner decision after seeing a sample marker; test the content-rules screen with the name                                                      | Owner turns the switch on, or moves the spec          | Spec in the code repository only                    | rc-q8     |
| Q9  | Are the default label names right?                               | Read the label set Kiro Crew's own repository uses and compare with D2                                                                       | Names kept, or changed to match                       | Rename defaults before Set up ships                 | rc-q9     |

No question blocks drafting. A question blocks only the tasks that list its
task as an edge.

## D17. Proofs

Each proof has setup, action, expected result, what failure means, and the
next decision (as `tasks.md` states). A proof is a task that requires its
phase's tasks. `rc-p11` is the gate for retirement.

| Proof   | Proves                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| rc-p1   | Avoozl lists only planning-label and plan-me issues for a Radar-coded repo; label clashes refused            |
| rc-p2   | Single-repo and plans-repo projection; batching rules; Spec changed                                          |
| rc-p3   | `verify-issue` passes a good issue and fails each bad one, live, with a real crew and the one-line prompt    |
| rc-p4   | Release respects N, scopes, phases and Stop the line                                                         |
| rc-p5   | Auto-merge armed only on the right PRs; manual leaves them; conflict label                                   |
| rc-p6   | A crew on `avoozl-crew` verifies and builds; Set up detects a missing agent                                  |
| rc-p7   | Set up does the `gh` steps, shows Radar's values, applies a pack                                             |
| rc-p8   | Home, On the line, Trace, side panel, Flow, a retro rule that a crew follows next issue                      |
| rc-p9   | A quick goal becomes issues with one approval; Promote past the rule                                         |
| rc-p10  | Public repository: no release before sign-off; no text in `verify-issue` output                              |
| rc-p11  | The whole path on a real repository, Q1 and Q2                                                               |
| rc-p12  | After retirement, `coder: worker` and every compatibility name still work                                    |

## D18. The work split (RC13)

One statement, shown in the README, Set up and the quick goal modal, from one
source string so the three never differ. The one-pull-request hint reads the
proposal: one task and no edge. It is a line with **Plan it anyway**, never a
refusal. No code path in Avoozl handles triage, maintenance or a single pull
request for a Radar-coded repository.

## D19. The coder adapter (RC14)

```text
tick -> release (graph order, N at a time) -> adapter.handOver(task or batch)
                                                |
              +---------------------------------+------------------------+
              v                                 v                        v
      issue-radar adapter                worker adapter            remote adapter
  (ready label; a crew claims)     (Avoozl opens a worker)    (files a task in the harness)
              +-------------> adapter.readState() <----------------------+
                                        |
                     done = the public pull request merged (RC14.2)
```

| Call          | issue-radar                       | worker (frozen)                | remote                                |
| ------------- | --------------------------------- | ------------------------------ | ------------------------------------- |
| handOver      | add the ready label               | open a worker chat             | file one task per task or batch       |
| readState     | issue, claim marker, PR (GitHub)  | session state, worktree        | the harness's task state, then the PR |
| countsAsDone  | PR merged                         | PR merged or local integration | PR merged on the public repository    |

The adapter is a small object with those three functions. The tick, the
release queue, Stop the line and the merge path call the adapter and never a
coder's name. `worker` keeps its code and tests; a change to it needs a bug or
a security reason (RC14.4). Changing a repository's coder affects only tasks
not yet handed over (RC14.5).

Defaults chosen here: the setting values stay `issue-radar`, `worker` and
`remote`; Settings shows "Radar crew", "Avoozl worker" and "Remote coder".

## D20. The remote coder (RC15)

Avoozl keeps these states per task: `filed`, `working`,
`finished-unpublished`, `pr-open`, `merged`, `failed`. The harness's own words
map onto them in the adapter only.

```text
ready -> filed -> working -> finished-unpublished -> (person publishes) -> pr-open -> merged
                                   |                                                   |
                      Needs you: "Waiting for a person                     dependents released
                      to publish <task>"
```

- Done is `merged` only (RC15.4). `finished-unpublished` is not done; it is the
  state that makes the Needs you row (RC15.5).
- Batching: the default batch is larger than for a crew, so a person publishes
  fewer pull requests. The preview counts publishes. A batch does not split a
  chain of dependent tasks that fits in one batch (RC15.6).
- The filed task is built from the approved task text, so the harness needs no
  read on a private plans repository (RC15.7).
- The adapter talks to the harness through its own app or MCP interface and
  keeps no credentials (RC15.9). A read failure keeps the last state and shows
  its age (RC15.3).
- Naming: "a managed remote harness" or "a remote coder" is the only name.
  The release scan reads its forbidden-name patterns from an environment
  variable or the person's local config, so the repository never contains the
  names it forbids (RC15.1).

- **Process.** The tick starts the harness's MCP server as a local child
  process, the way an existing Kiro Crew app does, calls `create-code-task` and
  `get-task-statuses`, and stops it after the tick. It opens no socket (RC15.10).
- **Identity.** Tasks are filed under the approving person's own sign-in. That
  is the provenance. The receipt holds the approver, the harness task ID and
  the Avoozl task IDs (RC15.11).
- **Expired sign-in.** One Needs you item, "Sign in again". New filing is held
  for that person. No retry loop: the next try needs the person's word or one
  cheap check that passes (RC15.12).

| Failure                                    | What Avoozl does                                                  |
| ------------------------------------------ | ----------------------------------------------------------------- |
| Harness unreachable                        | Keep the last state, show its age, release no dependents          |
| Finished but no public PR for a long time  | One Needs you row shows the age; no replacement task is filed     |
| PR opened with a different task ID         | `verify-issue` fails; no arming; a Needs you row                  |
| Task filed twice (tick retried)            | The stored harness reference makes filing idempotent              |

## D21. Integration branches (RC16)

```text
main ------------------------------------------------> (one person-approved landing)
  |  merge main into the branch weekly (merge commit, no force push)   ^
  v                                                                    |
rewrite/<epic> -- task PR -- task PR -- task PR -- whole-head checks --+
```

Four records, kept apart (AGENTS.md):

| Record                 | Where it comes from                                          |
| ---------------------- | ------------------------------------------------------------ |
| Plan approval          | The approved spec revision (RC3.6)                           |
| Implementation         | The task pull requests                                       |
| Integration            | A task's merge into the branch; the branch's merge into main |
| Whole-head acceptance  | Checks on the branch head (Requirement 16)                   |

- **Projection.** A task issue and its pull request target the epic's branch.
  `verify-issue` checks that the marker's base equals the branch (a new check).
- **Merge path.** Same checks and arming as RC5, with the branch's own rule
  (CI, light review). Auto-merge MAY be armed.
- **Whole head.** The tick reads the branch head's check runs and records an
  acceptance row naming the head. A task merge moves the head, so the record
  names the head it covers.
- **Landing.** A Needs you row appears when the head is green and up to date
  with main. A person approves; Avoozl records who and which head. Avoozl never
  merges the branch into main.
- **Sync.** On the schedule, Avoozl merges main into the branch as a merge
  commit and pushes normally. On conflict it stops, labels the branch, shows a
  Needs you row listing the files and opens Stop the line for the branch. It
  never rebases and never force pushes; a person MAY rebase and say so.
- **Stop the line.** The existing stop (D6, D7) takes the branch as a scope.
  While it is open: no release, no arming.
- **No branch.** An epic without `integrationBranch` behaves as before.

Default chosen here: the sync runs weekly, and it is off when the epic says so.

## D22. Epic types (RC17)

| Type                        | Shape                                                                             | Template gives                                      |
| --------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| Rewrite                     | Integration branch (D21); tasks as small pull requests                            | Branch checks, sync schedule, landing step          |
| Cross-repository migration  | Tool or compatibility layer, then one task per repository, then remove old path   | Edges from stage one to every repository task       |
| Large codegen change        | Generator change, one sample reviewed, batches of regeneration, remove old output | A command and a compare check for each regeneration |
| Cross-repository proposal   | Parent spec, one sub-spec per repository, optional gap report turned into tasks   | Parent index, sub-spec skeleton, gap report import  |

```text
parent spec (shared requirements, list of sub-specs)
   +-- sub-spec, repo A (requirements, design, tasks, manifest): approved and released alone
   +-- sub-spec, repo B
   +-- sub-spec, repo C
gap report (repository x requirement) -> proposed tasks per sub-spec -> a person accepts
```

- A cross-repository `requires` names the other sub-spec's task ID. The check
  refuses an ID the other sub-spec lacks, or an unapproved sub-spec (RC17.5).
- The gap report is read from a path or an issue the person names. A failing
  cell becomes one proposed task, a passing cell none, and an unreadable line
  is refused by number (RC17.6).
- All wording is generic (RC17.7, RC15.1).

## D23. Approve on the issue (RC18)

```text
label added on the issue ----> tick: labeler passes the actor check? --no--> remove label, one Needs you row
                                       | yes
                                       v
Avoozl / chat / CLI approve ---> ONE approval record (a second one is a no-op) ---> write back to the issue:
                                                                                     label + one marker comment
```

- The same check as trigger labels: `allowedActors`, `minimumPermission`.
- The marker comment holds the approver login, the spec path, the commit and
  the time, hidden in a comment, with no spec text.
- Write-back is best effort. A failure leaves the approval and raises one row.
- Removing the label later revokes nothing. Revoke is an act in Avoozl.
- Approval stays one of four records: approval, implementation, integration,
  whole-head acceptance (D15, D21).

## D24. Claim at approval (RC19)

On approval the parent issue gets the claim comment in Radar's format and the
in-progress label, so no crew takes the parent. The marker names Avoozl as the
holder and no real crew id. If a Radar crew already holds a claim, Avoozl
writes nothing and notes it in Trace. Sub-issues are released with `ready`
in graph order (D6). Avoozl removes only its own claim when the plan is
superseded or the parent closes.

## D27. The Workflow map (RC22)

```text
saved settings --> buildWorkflowMap(input) --> lanes -> cards -> values (+ jump target, + tag)
(repository form,    pure, no React            |                          |
 delivery.ship)                                |                          '-- tag from WORKFLOW_STATUS (one table)
                                               '-- Settings draws it: Repository dialog tab, and a Local only box
```

- **One pure function** (`kirocrew-app/ui/src/workflow-map.ts`) turns the
  repository form and the ship mode into lanes. The page only draws what it
  returns, so unit tests check the logic and one page test checks the drawing.
- **Values** are `{ text, source: 'set' | 'default' | 'placeholder', jump? }`.
  `jump` names a Settings sub-tab and an element id. The page switches the
  sub-tab, opens any closed `<details>` around the element, then focuses it.
- **Tags** come from `WORKFLOW_STATUS`, keyed by step key. A key that is
  absent has no tag. No card holds its own tag text.
- **Who colors** are `--accent` (You), `--tile-purple` (Radar crew), `--ok` (Avoozl) and
  `--tile-orange` (GitHub), each with an existing theme variable as fallback, with the word beside each, so color is never the only cue.
- **Lanes by coder**: `issue-radar` gets all three; `worker` replaces the
  release steps with "the tick starts ready tasks, N at once" and the build step
  with worker chats; `remote` names a managed remote provider and tags the step
  not built. Local only draws one lane.
- **Review lane**: its labels come from `radar.reviewLabel` and
  `radar.draftedLabel` once RC21 lands. Until then they read from the form's
  untouched `radar` keys and, when absent, show as placeholders with the lane
  muted. A later small change wires the real fields.
- **Where it lives**: a **Workflow map** sub-tab of the repository dialog, and a
  box in the Local only repository view. It reads the dialog's current form, so
  an edit shows at once; Save still writes the file.
- **Not in scope**: editing from the map, live status of running work (Delivery
  and Trace show that), and the merge setting's own jump (it lives on a tab
  outside the dialog; the card names the tab).

Proofs added to D17:

| Proof  | Proves                                                                                       |
| ------ | -------------------------------------------------------------------------------------------- |
| rc-p13 | The scope statement shows in three places; the hint offers Plan it anyway                    |
| rc-p14 | The same plan runs through the Radar and worker adapters; a coder switch keeps tasks in flight |
| rc-p15 | A remote coder: filed, waiting-for-publish row, done only on merge                           |
| rc-p16 | An epic on an integration branch: small merges, whole-head checks, sync, stop, one landing   |
| rc-p17 | Templates produce valid specs; sub-specs and a gap report become tasks                       |
| rc-p18 | Approval by label and by Avoozl end in one record and one issue write-back; an untrusted labeler is removed |
| rc-p19 | The parent is claimed at approval; an existing crew claim is left alone |

## D25. Review drafts by label (RC20)

```text
person adds `avoozl:review` on a PR
   └▶ tick: labeler passes the actor check? ──no──▶ remove label, one Needs you row
          │ yes
          ▼
      machine login (GET /user) == labeler? ──no──▶ keep label, one Needs you row, no chat
          │ yes
          ▼
      receipt `review-draft:<repo>#<n>:<labeled event id>` (queued, head sha)
          ▼
      read-only chat `avoozl-review-draft` (brief: PR, linked issues, crew claims, spec tasks)
          ▼
      plans_post_review_draft ─▶ POST /pulls/{n}/reviews, no `event` (PENDING)
          ▼
      remove `avoozl:review`, add `avoozl:drafted`, Needs you "Your draft review is waiting"
          ▼
 tick: GET /pulls/{n}/reviews/{id}
   PENDING, head moved ─▶ row says stale (both commits)
   other state ─▶ submitted;  404 ─▶ discarded  ─▶ remove `avoozl:drafted`, close row
```

- **Module.** `src/app/review-draft.mjs` holds the step, the brief, the tool
  and the rows, apart from `pr-review.mjs` (the button-started chat that
  posts nothing). It reuses that file's binding shape and the respond step's
  posting guard (bound slot, state marked before the call).
- **Finding labeled pull requests.** One search per repository per tick for
  open pull requests with the review or drafted label
  (`searchOpenIssues(..., { pullRequests: true })`); no list of every pull
  request.
- **Who.** The last `labeled` event for the review label names the labeler.
  The actor check is `actorAllowed` with the repository's settings, as for
  approval labels (D23).
- **Login.** `currentUser()` is read once per tick and again inside the tool.
  A mismatch is a row, never a post. The receipt records the reviewer login.
- **One per label add.** The receipt ID holds the label event's ID, so a
  retried tick finds the receipt and opens no second chat; a new label add is
  a new event and a new draft (RC20.9).
- **Brief.** Read through GitHub: the pull request (title, author, head,
  base), closing issues (GraphQL `closingIssuesReferences`), the claim marker
  and crew comments on each (`radar-claims.mjs`), and the provenance marker
  (`radar-provenance.mjs`), with task titles and acceptance from the store.
  Quoted text is fenced as data. The brief passes content rules (`brief`
  boundary) before the receipt is queued.
- **Agent.** `kirocrew-app/agents/avoozl-review-draft.json`: the read tools
  and the `gh` read allowlist of `avoozl-code-review`, plus
  `@avoozl:avoozl/plans_post_review_draft`. No write tool.
- **Tool.** Input `{body, comments: [{path, line, start_line?, side?, body}]}`
  (at most 50 comments). It screens every text with the reply screen and
  content rules, checks the login again, deletes Avoozl's own earlier pending
  draft for that pull request (RC20.9), and calls create review with
  `commit_id` and no `event`. A 422 is returned to the chat with nothing
  posted (GitHub's create is all or nothing).
- **Never submits.** The GitHub client gains three calls only:
  `createPendingReview` (refuses an `event`), `pullRequestReview` and
  `deletePendingReview`. A test greps the module for the submit and dismiss
  paths.
- **Rows.** Kept in workspace meta as `reviewDraftRows`, keyed per cause, so
  each shows once: untrusted labeler, login mismatch, someone else's pending
  review, draft waiting (with stale), tool refusal after three tries.
- **List.** A `review.drafts` view (page, CLI `avoozl review drafts`, MCP
  read) lists drafts with repository, pull request, reviewer, state (queued,
  chat open, waiting, stale, submitted, discarded), times and the GitHub
  search link `is:pr is:open label:"<drafted>"`.
- **Trace.** `readTrace` takes the draft for a pull request from the store
  and adds a Review step after CI only when one exists.
- **Crew pull requests.** Nothing after submit: the crew reads the review on
  its next round (fact 1). Avoozl writes no Radar label for a review.

| Failure                                          | What happens                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| Labeler not allowed, or unreadable               | Label removed, one row, nothing drafted                            |
| Machine login is someone else                    | No chat, no post, label kept, one row naming both logins           |
| Someone else's pending review exists for the login | Nothing posted, one row: submit or discard it                    |
| A comment line is outside the diff               | GitHub's 422 goes back to the chat; it fixes and posts again       |
| Chat ends without a draft                        | The review label stays; one row "No draft was posted"; re-add to retry |
| Head moves before submit                         | Row and list say stale with both commits; nothing deleted          |
| GitHub read fails                                | The tick keeps the last state and tries next tick                  |

## D26. Avoozl's label names (RC21)

- `RADAR_DEFAULTS` and `READY_LABEL_DEFAULT` in `github-policy.mjs` move to
  the `avoozl:` names, and `reviewLabel` and `draftedLabel` join them. Every
  reader keeps using the resolved value, so a set name wins.
- The clash check runs over planning, needs-human, claim, ready, conflict,
  approval, review and drafted, plus the repository's other managed labels.
- Settings › Crews and rules shows the six Avoozl labels in one box, each
  with its job, who writes it, the raw key and the default as placeholder,
  with one line about the changed defaults. Set up's label step creates the
  review and drafted labels.

Proofs added to D17:

| Proof  | Proves                                                                                       |
| ------ | -------------------------------------------------------------------------------------------- |
| rc-p20 | A label gives one pending review under the labeler's login; submit clears it; a wrong login or a stranger drafts nothing |

## D28. Tracker gates (RC23)

### D28.1 The node

A gate is a manifest leaf with `completion: "tracker"` and
`tracker: { plugin, item, done }`. `spec-manifest.mjs` and plan-quality accept
it and refuse a missing part or an unknown plugin id. It is a manual-style
leaf: it projects to an issue, never gets the ready label, and the coder
adapter (D19) and batching (D4.2) skip it, the way they skip `human` tasks.
Release (D6) reads it as one more blocker kind: complete when its record says
`done` or `cleared`.

```
plugin status --> gate record --> release (D6) --> ready label on dependents
 (read only)      open/done/       waits while          ^
                  failed/unknown   open/failed/         |
                                   unknown        person clears (an order)
```

### D28.2 The record

SQLite holds one row per gate: state, evidence, link, last check, next check,
the count of `unknown` reads in a row, and, once cleared, the order (actor,
how, time, reason, last known state). The issue's marker repeats the state and
the order, as for an allowed close, so the record survives a rebuild. Evidence
is screened and cut to 500 characters before it is stored.

### D28.3 The plugin part

`gate` joins the parts table in docs/plugins.md: it runs code, needs no
capability, and has one method, `status({ ref }, { config })`. Avoozl passes
`ref` (`item`, `done`) and the plugin's `config`; credentials come from the
variables `config` names with a `...Env` key, or from the plugin's own
sign-in. The method must not write. Avoozl calls it under a timeout (30
seconds) and treats a throw, a timeout and a bad shape as `unknown`. Only
fake plugins ship in this repository.

Example plugins, named by role only. Each is a separate package, outside this
repository:

| Role                                 | `item` is               | `done` means                                    |
| ------------------------------------ | ----------------------- | ----------------------------------------------- |
| A ticket tracker                     | A ticket id or URL      | The ticket is in a resolved state               |
| A review-shipped check, private code host | A code review id or URL | The review merged and its change is in a live release |
| A managed remote harness task        | The harness task id     | The task finished and its change is published   |

### D28.4 The tick step

One step, `gateStep`, runs before the release step in the same tick:

1. List gates that are not done or cleared and are due (`next check` passed).
2. Call `status` for each, a few at a time, and store the result.
3. On `done`, record the evidence once; the release step then sees the
   blocker as complete and releases dependents on this pass.
4. Set the next check from the backoff table (1, 2, 5, 15 minutes, then 30),
   reset on a change of state.
5. Apply labels (D28.5) and rows (D28.6).

A read that fails keeps the last state and shows its age, like D20. A gate
whose `done` was recorded is read once more at most, to write the one Trace
note if the tracker now differs.

### D28.5 The label

`radar.trackerLabel`, default `avoozl:waiting-on-tracker`, joins the six
labels of D26, and the clash check there covers it. Placement:

| Issue                                          | Has the label while                           | Loses it when                                                 |
| ---------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| The gate issue                                 | The gate is open, failed or unknown           | Done, cleared, or the gate leaves the plan                    |
| A dependent whose unmet blockers are all gates | Any of those gates is open, failed or unknown | All its gates are done or cleared, or a non-gate blocker joins its unmet set |

A failed or unknown gate keeps the label: the work is still waiting. The
dependent's label is for a person who opens that issue and asks why nothing
happens; it triggers nothing. Removal of the label from the gate issue is the
clear order (D28.7).

### D28.6 Rows

Needs you gets one row per gate that is `failed`, or `unknown` for two reads
in a row, keyed by gate and state so a retried tick opens no second row. It
stays until a person clears the gate, the plan removes it, or the plugin
reports `done`. Nothing in this step closes, removes or clears a gate.

### D28.7 Clearing

Two routes, one path: remove the label from the gate issue, or use the clear
command (`avoozl gate clear <task> --reason ...`, the matching MCP call and
the Clear control). The actor passes the trigger-label check (D2). The clear is
written as an order with who, how, time, reason and last known state; the
dependents are released on the next pass, and each brief says the gate was
cleared by a person. It is never counted as verified completion, and the
Delivery view says "cleared by <person>". An actor who is not allowed, or
cannot be read, gets the label put back and one row. Reopening is by plan
change only; dependents already released are left alone.

### D28.8 UI

| Place          | Shows                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------- |
| Release queue  | Gate and held dependents: tracker, state word, last check, next check, evidence, link, Clear  |
| Trace          | A Tracker step on the gate; a "waits on <gate>" line on a held dependent, same fields         |
| Waiting on you | Only gates `failed` or `unknown` twice, linked to the gate's row                              |
| Settings       | The label field in the RC21 box; the plugin in the existing plugin list                       |

### D28.9 Failure modes

| What happens                              | What Avoozl does                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| Plugin not installed or not approved      | `unknown`, evidence says so; one row after two reads; nothing released    |
| Sign-in expired                           | `unknown`, evidence "sign-in expired"; backoff holds; one row             |
| Tracker says `failed`                     | One row; label stays; dependents stay held; a person clears or edits plan |
| Tracker says `done`, then reopens         | Dependents stay released; one Trace note                                  |
| Person clears, plugin later says `done`   | Evidence added to the record; nothing else changes                        |
| A stranger removes the label              | Label put back; one row naming the actor                                  |
| Evidence holds a private name or a token  | Content rules screen it; a hit stores "withheld by content rules"         |

Proof added to D17:

| Proof  | Proves                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| rc-p22 | With a fake plugin, a gate holds dependents, carries the label, releases on `done`, raises one row on `failed`, and a person's clear is an order |
