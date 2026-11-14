# Avoozl experience under the Radar-based direction

Status: proposal, 2026-11-14. No code. Mockups are in
[`experience/`](experience/index.html); open `index.html` in a browser. Every
mockup has a light/dark switch and, where the answer depends on it, a
**Variant A / Variant B** switch.

How claims are marked:

- **V** (verified): read in code or docs, or seen live. The source follows, as
  `path:line`. Kiro Crew paths are inside `kiro_crew/` of release 0.12.2.4.
  Avoozl paths are in this repo.
- **A** (assumed): inferred or not checked. The reason follows.

---

## 1. One-page summary

**The direction.** Kiro Crew's Issue Radar crews do the triage and the coding on
every machine. Avoozl stops running workers and becomes the **planner and the
gate**: it owns specs, the task graph, the projection to GitHub, the order in
which work is released, the proof that an issue came from an approved plan, and
the retros that tune the rules.

**What the owner does in the app, in one line each.**

| Moment | The owner | Avoozl |
| --- | --- | --- |
| Plan | Types a quick goal, or writes a spec in Spec Builder | Investigates (quick goal) or lints the spec; shows a plan |
| Gate | Approves once | Records the approval; refuses to project an unapproved spec |
| Project | Reviews a preview | Creates issues, sub-issues, blocked-by links, Project fields; batches small tasks |
| Release | Nothing, or steps wave by wave | Adds `ready` in graph order, within the crews' capacity |
| Build | Nothing | Watches; crews claim, build, open PRs, drive CI |
| Observe | Opens one **Trace** per task or goal | Joins spec, issue, claim, PR, CI, merge, retro on one page |
| Intervene | Needs you, Stop the line | Stops releasing, pulls unclaimed `ready` labels, says what only Radar can stop |
| Improve | Approves a retro proposal | Opens a PR for repo rules; hands over text for the crew prompt |

**Recommendations.**

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | Screens | Eight tabs: Home, Specs, Graph, Delivery, Flow, Intake, Activity, Settings. Conflicts folds into Needs you. Routing, Delivery settings, per-task budgets, the file/diff viewer and runner mode go. New: **Trace** (a drawer and a page), a **Crews and rules** settings section. Build for Variant B first, add Variant A as an upgrade behind one permission. |
| 2 | Side panel | One `panelTabs` entry, "Avoozl". It changes with the chat that is open: spec check in a Spec Builder chat, the task a crew is on in a crew chat, a recap everywhere else. |
| 3 | Observe | **Trace**: one page per task or goal, deep-linkable, in the Back history. Attach works for Avoozl's own chats (read and send) and, for the owner's browser, for local crew chats (link only). Remote crew chats get a link set per crew. Other apps cannot read crew chats. |
| 4 | Spec Builder | An Avoozl side-panel tab next to Spec Builder, plus a spec lint and an Avoozl approve gate. Spec Builder has no plugin or hook point and no setting for another agent, so a hand-off agent is not possible today. |
| 5 | Spec to issues | Avoozl owns it, in a **Project to GitHub** preview that opens from a spec. Batching is proposed by Avoozl and edited by the owner. All tasks get issues. Release is graph order. Spec edits re-project through a diff, never silently. |
| 6 | Quick goals | A planner chat investigates read-only (optionally measures in a scratch worktree), then proposes tasks. The owner approves once. Issues carry Avoozl's marker plus an approval hash. A goal that grows past a size rule is offered **Promote to spec**. |

**Findings that shape the proposal.**

1. **Avoozl can read less of Radar than the brief assumes.** An app token may
   reach `/api/apps/issue-radar/crews` and `/pipeline/*`, but the per-crew work
   items (`/crew`, `/crew/fabric`) sit on the internal-path list that app
   tokens fail. So Variant A shows crews, status, open counts, cost and
   session counts. Per-issue phase and PR still come from GitHub in both
   variants. (V: `dashboard/server_internal_paths.py:391`; V:
   `apps/builtins/issue_radar/backend/crew_routes.py:602-625`; A: that `GET
   /crew` is refused like the `PUT` that was tested live in
   `docs/research/radar-setup-from-avoozl.md`.)
2. **Every Radar write is owner-only.** Avoozl cannot create a crew, change its
   agent, or edit its Additional prompt. It can only show the exact text to
   paste. (V: `crew_routes.py:474-495`.)
3. **Crews do not merge by themselves.** The crew brief says never to merge,
   and to arm auto-merge. In the live test every PR was merged by a person
   because auto-merge was off. "Crews merge" holds only where the repo allows
   auto-merge, so Avoozl needs a merge-path check. (V:
   `apps/builtins/issue_radar/backend/crew_brief.md:577,649`; V:
   `docs/research/radar-spec-tasks.md`, section 4.)
4. **Crews pick at random among eligible issues.** Order comes only from how
   many issues carry `ready` at once. That makes Avoozl's release logic the
   scheduler. (V: `crew_brief.md:100-110`; V: `.kiro/specs/avoozl/design.md`
   section 6.4.)
5. **Spec Builder's hand-off runs the whole spec in one session**, "task by
   task, in order". That is the behavior Avoozl replaces. (V:
   `apps/builtins/spec_builder/backend/orchestration/execution_state.py:462-470`.)

---

## 2. Ground truth used

| Fact | Status | Source |
| --- | --- | --- |
| Avoozl's tabs today: Dashboard, Specs, Graph, Delivery, Flow, Conflicts, Intake, Activity, Settings | V | `kirocrew-app/ui/src/App.tsx:40-52` |
| Settings sections today: Workspaces, Repositories, Where tasks live, Plugins, Content rules, Flow, Delivery, Budgets, Routing | V | `kirocrew-app/ui/src/SettingsView.tsx:76-86` |
| Dashboard sections today: In flight, Progress by epic, Needs you, Up next | V | `kirocrew-app/ui/src/DashboardView.tsx:401,424,483,504` |
| Task drawer folds: Summary, Description, Edges, Links and notes, Delivery, Files, Timing, Evidence, Timeline | V | `kirocrew-app/ui/src/TaskDrawer.tsx:417-597` |
| Avoozl's app grant reaches only its own API, `avoozl_*` chat slots, reveal, usage, models and Spec Builder's spec list | V | `kirocrew-app/app.json:68` |
| Avoozl already links chats as `/chat?sid=<slot>` | V | `kirocrew-app/ui/src/task-api.ts:379` |
| The managed issue marker (version 2) carries task ID, namespace, source commit and manifest hash, edges, applied hashes | V | `.kiro/specs/avoozl/design.md` section 3.4 |
| Radar handoff design: scope label equals `ready`; Avoozl limits `ready` to capacity; Avoozl never writes the claim or needs-human labels | V | design section 6.4 |
| Radar's crew list route, plus settings, are registered and allowed for apps; the crew record holds `agent`, `model`, `extra_prompt` | V | `crew_routes.py:1372,1375`, `crew_store_records.py:168-179` |
| A crew's chat slot is `crew-<crew id>`; the Radar page opens it by `slot_key` and navigates to `/chat` | V | `crew_store_records.py:428,650`; `static/dist/assets/IssueRadarPage-CzLvclRt.js` (`slot_key`, `sid=`) |
| A crew opens its slot with `agent=<crew's agent>`, default `kirocrew` | V | `crew_runtime_session.py:198` |
| An app agent's hooks (`agentSpawn`, `userPromptSubmit`, `preToolUse`, `postToolUse`, `stop`) fire in chats Avoozl opens; `preToolUse` exit 2 blocks a tool; a Stop hook can keep a worker going | V | `docs/research/kirocrew-hooks-and-wake-paths-2026-11-13.md`, section A |
| Hooks fire in a **crew's** chat when the crew's agent is an app agent | A | The crew slot uses the crew's `agent` (above) and the hook runner is the turn loop. Not tried with a crew. |
| Another app cannot act on a slot it does not own; the answer is a uniform 404 | V | `dashboard/slot_ownership.py:270-289` |
| A side-panel tab is declared in `contributes.panelTabs`, mounted as an ESM entry, keyed `app:<name>:<id>`, at most 8 per app | V | `apps/manifest_contributes.py:173,573-640` |
| A panel tab gets no chat context object. An installed panel reads the chat from the page URL (`?sid=` or `/embed/chat/<slot>`) | V (one installed panel) / A (as a stable contract) | that panel's `currentChat()`, which says it relies on the URL shape |
| Ultra Mode's Crew panel: Recap ("N of M done"), Needs you, Milestones with now/next/stuck, Status and Workers views, "Done when" line | V | `static/dist/assets/t-CuQrT1gq.js` keys `ultra_*`; `dashboard/handlers/work_ledger_board.py` |
| Spec Builder has no panel tab, no hook, no agent setting. Its settings hold `base_path` and `model`. It records approvals per phase against a document version | V | `apps/builtins/spec_builder/app.json`; `backend/repository.py:182-212`; `backend/orchestration/controls.py:52-57` |
| Spec Builder's list route returns name, dirs, type, title, status, phase, running. Its detail route returns `slot_key` | V | `backend/handlers.py:292-326,449` |
| A crew builds a feature issue when it links an approved spec and an accepted decision record; blocked-by links are honored; a batch issue yields one PR; checklist boxes are not ticked; `updated=` in the marker is unreliable | V | `docs/research/radar-spec-tasks.md` |
| The crew's claim comment is one edited comment with a versioned marker `<!-- kirocrew-crew v=1 id=<crew id> phase=<phase> pr=<n> updated=<time> -->` | V | `crew_brief.md:286-300`; research above, section 5 |
| Crews write only their claim label and the needs-human label | V | `crew_brief.md:122,646` |
| glorp: the unit is one issue; default pick-up filter is "authored by me and assigned to me"; `gh-create` files an issue with the original prompt quoted and an agent marker; `gh-fix` splits only when the issue states separable tasks, uses the sub-issue API, and reads blocked-by links | V | glorp `README.md` (How it works), `.agents/skills/gh-create/SKILL.md`, `.agents/skills/gh-fix/SKILL.md` ("Split a multi-part issue", "Stack on an open blocking issue") |

---

## 3. Screens and views, in two variants

**Variant A**: Avoozl may read Radar's API (crews, status, open counts, cost,
session counts). It needs one new grant in `permissions.api`, which the owner
approves in Kiro Crew under Apps (V: the approval flow in
`kirocrew-app/ui/src/spec-builder-api.ts` for the Spec Builder grant).

**Variant B**: Avoozl sees only GitHub (issues, comments, labels, PRs, checks,
timeline) and what the owner types into Settings.

Per-issue phase and PR are the same in both, because both read the crew's claim
comment marker.

### 3.1 Tab by tab

| Tab | Shows (both variants) | Only in A | Only in B |
| --- | --- | --- | --- |
| **Home** | **Needs you** (decisions, plan-me hand-offs, spec drift, proposals, stuck claims). **On the line**: one row per issue with a five-step rail (Ready, Claimed, PR, CI, Merge) and its age. **Release queue** (was Up next). **Progress by goal** (was by epic). | A **Crews** strip: name, working/paused/waiting, open count. Credits and turns per row. | The crew column shows the crew ID from the claim marker. A quiet card: "Connect Radar to see crews and cost." |
| **Specs** | Spec and quick-goal list, reader, lint result, **Approve**, **Project to GitHub**, **Quick goal**, **New spec** (opens Spec Builder). | Capacity line in the projection preview read from crews. | Capacity is a number the owner sets. |
| **Graph** | Task graph colored by GitHub-derived stage; batches drawn as one node with its member tasks. | Node badge with the crew name. | Node badge with the crew ID. |
| **Delivery** | One table of issues and PRs by stage, 100 a page, boxed filters, link to Trace and to Radar's PR view. | Cost column. | none |
| **Flow** | Stage waits from GitHub timestamps (Ready to Claim, Claim to PR, PR to green, green to merge), flow efficiency, **Stop the line**, retro proposals. | Credits per stage; crew idle time. | Times only. |
| **Intake** | Untriaged issues, Ideas, **plan-me hand-offs** from crews (trusted people only), quick-goal candidates. | none | none |
| **Activity** | Unchanged: who did what. | none | none |
| **Settings** | Workspaces, Repositories, Where tasks live, Plugins, Content rules, Flow, **Crews and rules** (new), Budgets (planner only). | Crews are read, with a check list. | Crews are typed in, with the same check list marked "cannot verify". |

Mockups: [Home](experience/01-home.html), [Trace](experience/02-trace.html),
[Crews and rules](experience/06-crews-and-rules.html),
[Flow and retro](experience/07-flow-retro.html).

### 3.2 What goes away

| Today | Fate | Why |
| --- | --- | --- |
| **In flight** (Avoozl's own worker chats) | Replaced by **On the line** | Workers are crew sessions now. |
| **Conflicts** tab | Folds into Needs you as a filter chip | Same decisions, one place. Fewer tabs. |
| **Routing** settings, crew placement, router prompt, relay agents | Removed | Radar owns placement. |
| **Delivery** settings (agent and model per task), verifier, falsifier and reviewer roles | Removed. The `avoozl-crew` prompt carries the verification rules | Crews run the whole loop. |
| **Investigate before coding** (design 4.21) | Moves into quick goals only | Crews investigate their own tasks. |
| **Per-task budgets**, **Switch model** (for workers) | Budgets and Switch model stay for planner, retro and quick-goal chats only | Avoozl cannot cap a crew's spend (crew settings are owner-only, V above). |
| **Files/diff** fold in the task drawer | Removed. A PR link and a Radar link replace it | Radar's Review button covers PR review. |
| **Runner mode over SSH** (merged in PR 62) | Removed | Crews on each machine replace it. |
| **Demo** | Stays, retargeted to fake crews and a fake claim comment | Still the only safe first run. |
| **Stop the line** | Stays, with a changed meaning (section 3.4) | See below. |

### 3.3 What is new

- **Trace**: a drawer from any row and a full page (section 5).
- **Project to GitHub** preview and **Spec changed** diff (section 6).
- **Quick goal** (section 7).
- **Crews and rules** settings: Radar check list, exact values to paste, trusted
  people, machine map.
- **Plan me** rows in Intake and Needs you.
- **Merge path** check on each repository: auto-merge allowed, required checks
  present. Crews cannot merge without it (finding 3).
- **avoozl-crew** agent (section 3.5).
- **Rules proposals** with a target: `AGENTS.md`, a steering file, or the crew
  Additional prompt (section 3.6).

### 3.4 Stop the line, honestly

Radar's pause is owner-only, so Avoozl cannot stop a running crew (V:
`crew_routes.py:474-495`). Avoozl can:

1. stop releasing, and take `ready` off every issue no crew has claimed;
2. comment on each claimed issue ("the line is stopped; finish or yield");
3. if crews use `avoozl-crew` (below), let a `preToolUse` hook refuse edits
   while a stop signal exists (A: hooks on a crew slot; the signal must be
   readable from every machine, so it is a GitHub label or issue, not a local
   file);
4. show the owner a button that opens Radar's Crews page for the real pause.

Two choices, **Stop the line** (new work in a scope) and **Stop all**, keep
today's confirm dialog and wording.

### 3.5 The `avoozl-crew` agent

A crew's agent field defaults to `kirocrew` and the crew opens its chat with
whatever agent is named (V: `crew_runtime_session.py:198`). Recommendation:
ship an app agent `avoozl-crew` and ask the owner to choose it in each crew.

| Part | Content | Status |
| --- | --- | --- |
| System prompt | How to treat an issue with an Avoozl marker: read the spec section, verify the marker, report the stage | A: that an app agent can be a crew agent (not tried) |
| Avoozl MCP | Read-only tools: `plans_task`, `plans_verify_marker`, `plans_plan_me` | A |
| Skills | `avoozl-crew-rules` (rules a retro approved) | A |
| Hooks | `preToolUse` and `postToolUse` timestamps for Flow; `preToolUse` block for Stop the line; `stop` for turn budgets | V that hooks fire in app-agent chats; A on crew chats |
| Stop all and budgets | Turn and time budgets enforced by the Stop hook | A |

Alternative: no agent, only text in the crew's Additional prompt. That works
today with no unknowns, but gives no timing data, no hard stop, and no budgets.
Recommend shipping both; the prompt text alone is the fallback and the Crews
and rules page shows it either way.

### 3.6 Retros that propose rule changes

Retro proposals keep today's typed, evidence-first shape, with new targets:

| Target | How a change lands | Why |
| --- | --- | --- |
| `AGENTS.md` or a steering file | A one-task spec, projected as an issue; a crew opens the PR | The repo owns the rule. Crews already read both. |
| Crew Additional prompt | Avoozl shows the new full text and a Copy button, then a link to the crew's page in Radar | Edits are owner-only (V). |
| Avoozl settings | Applied after a click | Local. |

PDCA stays: each applied change gets a check after N issues and is offered for
undo if flow did not improve (V: design 4.11, 4.18).

---

## 4. Side panel

**Recommendation: one tab, "Avoozl", that adapts to the chat.** It is declared
in `contributes.panelTabs` (V: `apps/manifest_contributes.py:573-640`). Ultra
Mode's Crew panel is the model: a recap line, then what needs the person, then
now and next (V: the `ultra_*` strings above). Mockup:
[03-side-panel.html](experience/03-side-panel.html).

| Chat that is open | Panel shows | Links to |
| --- | --- | --- |
| Any chat | Recap ("5 of 12 done"), Needs you (count and top 3), next release, Stop the line state | Home, the item |
| A Spec Builder chat | **Spec check**: files present, task IDs unique, manifest present, decision record found, spec on the default branch. Buttons: **Approve for Avoozl**, **Preview issues** | Specs, Project to GitHub preview |
| A crew chat (owner's browser) | The issue and batch the crew is on, its task and spec section, rules version, line state | Trace, the issue, the PR |
| An Avoozl planner, retro or quick-goal chat | The proposal the chat produced, with Approve and Reject | Specs or Flow |

**When it shows.** The tab sits in the "+" launcher at all times (the host
mounts it only when opened). It opens by itself only in a Spec Builder chat
that has `tasks.md` and no Avoozl approval, and in an Avoozl-owned chat that is
waiting on the owner. It never opens by itself otherwise.

**How it knows the chat.** The panel reads the chat ID from the URL (V on one
installed panel, A as a contract). It matches that ID against: Spec Builder's
detail `slot_key` (V: `handlers.py:449`), the `avoozl_*` slots Avoozl owns, and
`crew-<id>` (V: `crew_store_records.py:650`).

**What it cannot do.** It receives no context object (V: no panel context type
in the manifest code or the SDK types). It cannot send a message into a crew
chat (V: `slot_ownership.py:270-289`). Opening the Avoozl page from the panel
needs a hand-off through the page's storage, as Spec Builder's own deep link
does today (A: same-origin storage works across the panel and the page).

Alternatives:

- **No panel; only the app page.** Zero unknowns, but the owner leaves the chat
  to approve a spec. Rejected: the approval belongs next to the spec.
- **One panel per chat kind (several tabs).** The limit is 8 per app (V), but
  each tab clutters the launcher. Rejected.

---

## 5. Observe end to end

**Recommendation: Trace.** One page per task or goal. It opens as a drawer from
any row (replaces today's task drawer) and as a page with its own URL state in
the Back history (V: Requirement 60). Mockup:
[02-trace.html](experience/02-trace.html).

### 5.1 The stages

```text
Spec approved ─▶ Issue created ─▶ ready ─▶ Claimed ─▶ PR opened ─▶ CI ─▶ Merged ─▶ Retro
 (Avoozl)         (Avoozl)       (Avoozl)  (crew)      (crew)     (CI)  (auto-merge) (Avoozl)
```

Each step has a time from GitHub (never the marker's `updated=`, which the live
test showed running 15 to 27 minutes ahead; V: research section 5) and a link.
A step the crew skipped is drawn dashed. A step in a loop (CI round 2, review
round 2) shows the count.

### 5.2 Jumping in

| From | One click goes to |
| --- | --- |
| Home row, Graph node, Delivery row, Needs you row | The task's Trace drawer |
| A Trace drawer | Its page; the goal's Trace; the spec section; the issue; the PR; the CI run |
| A GitHub issue (Avoozl marker) | Avoozl cannot add a link to GitHub. The issue body carries the goal ID so a search finds it. |
| Side panel in a crew chat | The same Trace |

A goal's Trace is the sum of its tasks' traces: a stage heat strip, then the
task list. The retro step shows the retro chat and its proposals.

### 5.3 Attaching to chats

| Chat | Can Avoozl read or send? | Can the owner open it from Avoozl? | Status |
| --- | --- | --- | --- |
| Planner, retro, quick-goal chats (Avoozl-owned `avoozl_*` slots) | Yes, both | Yes: `/chat?sid=<slot>` | V (`app.json:68`, `task-api.ts:379`) |
| Local Radar crew chat | **No** (another app's slot returns 404) | **Yes**, as a link the owner's browser follows. Avoozl needs the slot: `crew-<id>`, and `<id>` is in the claim marker (B) or the crews list (A) | V on the 404 (`slot_ownership.py:270-289`); V on the slot name; A that following the link works for the owner |
| Remote crew chat | No | Only if the owner records the machine for that crew. Avoozl shows the crew ID, the machine label and the owner's saved dashboard link. The Remote Crew hub embeds a remote dashboard but this work found no per-chat deep link | V on the hub (`docs/remote-crew.md`); A that no deep link exists |

How Avoozl knows a crew is local: in Variant A, the crew is in the local Radar
list. In Variant B it cannot tell; it shows the link and a note ("opens here
only if this crew runs on this machine"). The crew's brief forbids host names in
public comments (V: `crew_brief.md:35,656`, "never put ... a host name"),
so the machine cannot come from GitHub. The owner's **machine map** in Settings
fills the gap.

### 5.4 Reading a crew without its chat

The crew's own progress comment is public and structured (V: research section
5). Trace quotes it: finding, progress list, the "needs a person" text. This is
the closest thing to a transcript, and it is already on GitHub.

### 5.5 Checking on planner and retro agents

Avoozl owns those chats, so their rows show live state (running, waiting on
you, done), turns used against budget, and an **Open chat** link, like today.
They sit in a small **Avoozl agents** box on Home, below Needs you, and only
when one exists.

### 5.6 Cross-checks

- Variant A adds cost per stage from `/pipeline/item/sessions` (V:
  `pipeline_routes.py:341-343`, credits and turns in `pipeline_fold.py`).
- Variant B shows times only and says why cost is missing, with an info icon.

---

## 6. Spec Builder integration

What Spec Builder exposes (all V):

- Routes: create, list, get, messages, message, approve, handoff/execute, stop,
  task, title, archive, duplicate, delete (`backend/routes.py:77-103`).
- Avoozl's grant reaches only the list route today (`app.json:68`), and the UI
  code is tested never to call another route (`spec-builder-api.ts` header).
- No panel tab, no hook, no plugin point. The only settings are `base_path` and
  `model` (`repository.py:182-212`).
- Hand-off runs one session through every unchecked task
  (`execution_state.py:462-470`).
- Approval is recorded per phase against the document version
  (`orchestration/controls.py:52-57`).

| Option | What it is | Verdict |
| --- | --- | --- |
| **A. Avoozl panel tab next to Spec Builder** (recommended) | The side panel of section 4 in a Spec Builder chat: lint, approve for Avoozl, preview issues | Works with nothing from Spec Builder. Reads the list route (already granted) and the files on disk. |
| **B. Only the Avoozl app** | Specs view opens Spec Builder to write, then does everything on its own page | Today's behavior. Fine, but the owner leaves the chat to approve. Keep as the fallback. |
| **C. An Avoozl agent that Spec Builder hands off to** | Replace the build session | Not possible: no agent setting (V). Needs a Kiro Crew change; list it as a request, not a plan. |
| **D. A Spec Builder plugin or hook** | Run Avoozl's lint on save or approve | No such point exists (V). Same request. |

The owner never presses Spec Builder's **Execute**. The panel says so when it
sees `tasks.md` is approved, and Avoozl's gate replaces it. (A: that the owner
follows this; Avoozl cannot disable the button.)

**Layout rule.** Avoozl keeps its refusal of plans without the Kiro layout
(requirements or bugfix, design, tasks, and `avoozl/manifest.json`) and
duplicated task IDs (V: design 6.8). The lint in the panel is that same check,
shown early.

---

## 7. Spec to issues: who controls it, and where

**Control sits in Avoozl's Specs view.** Nothing reaches GitHub except through
one preview. Mockup: [04-projection.html](experience/04-projection.html).

```text
Spec Builder / quick goal
   │ lint (panel or Specs)
   ▼
Approve (Avoozl gate)  ── spec must be on the default branch, Status: Approved
   ▼
Project to GitHub… (preview modal)  ◀── re-opened by "Spec changed"
   │ owner edits: include, batches, waves, release mode
   ▼
Create issues (held)  or  Create and release wave 1
   ▼
tick: release by graph order ─▶ `ready` ─▶ crews
```

| Decision | Who | Default | Alternatives |
| --- | --- | --- | --- |
| Which tasks get issues | Avoozl proposes, owner edits | All tasks. A task marked `human` gets an issue with no `ready` and an assignee. | Only tasks marked `agent`. Rejected: hidden tasks break the graph. |
| Batching | Avoozl proposes, owner edits per batch | **Suggest**: batch tasks that share a wave, a directory and a linear chain, at most 5 per batch, never across a decision task | **Off**; **Auto** with the cap. The live test shows one issue of three tasks gives one PR and unchecked boxes, so Avoozl never reads the boxes (V: research section 4). |
| Release order | Avoozl | Graph order; at most as many `ready` issues as capacity (A: crews' open slots; B: the number set in Crews and rules) | **Step**: wait for a click per wave. **Hold**: release by hand. |
| Sub-issues | Avoozl | A batch issue is the parent of its tasks only when tasks keep their own issues; otherwise the tasks are checklist lines | Always sub-issues. Rejected: a crew builds a whole batch in one PR, so sub-issues would close early. |
| Blocked-by | Avoozl | Native links for every `requires` edge (V: design 3.4) | none |
| Re-projection on spec edit | Avoozl detects, owner approves the diff | See the Spec changed dialog in the mockup | Auto-apply for unclaimed issues only (offered as a setting) |

**Spec changed rules.** An unclaimed issue gets its body updated after the
owner approves. A claimed issue is never edited silently: Avoozl comments, opens
a Needs you row, and the crew's next patrol reads the comment. A removed task
closes its issue as not planned. Edits by a person to a managed issue stay
conflicts, as today (V: design 6.5).

**Preflight, shown in the preview:**

1. The approved spec is on the repo's default branch, with `Status: Approved`.
   Crews read the repo, not Avoozl (V: research section 3). In plans-repo mode
   the crew cannot see the plans repo, which was **not tested** (V: research
   section 6, item 1).
2. A decision record for the spec exists and says automation may build it (V:
   same).
3. The crew's scope label equals `ready` (A in Variant B: cannot verify).
4. The repo's merge path works (finding 3).
5. The crew prompt carries the Avoozl rules version (A in both variants:
   Avoozl can read the crew's `extra_prompt` in A only if the crews list
   returns it; the record holds it, V `crew_store_records.py:179`).

**Provenance a crew can verify.** Marker version 2 (V: design 3.4) plus an
`approval` block: who approved, when, and a hash of the issue body and the spec
section. The `avoozl-crew` prompt tells a crew to rebuild the hash and stop if
it differs. Honest limit: a hash is not a signature. It stops accidents and
edits by a person who did not re-approve. It does not stop a forger who can
write issues. For that, the rule also requires the author of the issue and of
the `ready` label to have write permission, which a crew can check with the
GitHub API. (A: that a crew follows an extra rule; nothing in its brief
requires it.) Public repos need that permission rule; a private repo with one
writer can skip it.

---

## 8. Quick goals

### 8.1 What glorp does (read from its repo)

| Question | glorp | Source |
| --- | --- | --- |
| Who plans? | Nobody up front. The one issue is the plan. | README, "How it works" |
| Creating the issue | `gh-create`: expand the request into a structured issue, quote the original prompt verbatim in a collapsed block, apply only existing labels, assign `@me`, scrub private data | `.agents/skills/gh-create/SKILL.md` |
| Investigation | Optional and light: read files, search duplicates, never run builds, never delay filing | same, "Research, optionally" |
| Provenance | A last line, `Created by Glorp: /glorp:<id>, <agent> (<model>)`, only when a glorp run made it | same, "Mark issues created by a glorp agent" |
| Trust | Default filter: issue authored by me and assigned to me. Someone else assigning you an issue cannot start a run. | README, "How it works" |
| Splitting | At pick-up, by the fixing agent, only when the issue itself states separable tasks. Sub-issues through the sub-issue API; the parent becomes a tracking issue. Never twice. | `gh-fix/SKILL.md`, "Split a multi-part issue" |
| Order | Reads blocked-by links; may stack PRs on an open blocker | `gh-fix/SKILL.md`, "Stack on an open blocking issue" |
| Approval | Authoring and assigning is the approval. No separate gate. | README |

What to borrow: the verbatim prompt block, existing labels only, the scrub step,
"never delay filing", conservative splitting, the author-plus-assignee trust.
What not to copy: no up-front plan (Avoozl's point is the graph), and no
approval that is only authorship (crews share the owner's login, V: design 6.4,
so authorship cannot tell a crew from the owner).

### 8.2 Avoozl's version

Mockup: [05-quick-goal.html](experience/05-quick-goal.html).

```text
"Make tests faster"
   ▼ Quick goal modal: repo, depth, budget
Planner chat (avoozl-planner, quick brief, Avoozl-owned slot)
   ├─ Look: read code and CI config, find the slow parts (read-only)
   └─ Measure (opt-in): run the suite in a scratch worktree, with timings
   ▼
Proposal: findings with evidence, 1–8 tasks, edges, batches, risks, questions
   ▼ owner: Approve │ Edit │ Promote to spec │ Discard
Issues + sub-issues + blocked-by (marker v2 + approval) ─▶ ready in order
```

| Question | Recommendation | Alternatives |
| --- | --- | --- |
| **What agent?** | `avoozl-planner` with a quick-goal brief, in an Avoozl-owned chat. Avoozl can read and send, and the owner can attach (V: `app.json:68`). | Run it in a crew: rejected, crews skip features and cannot be read. |
| **How much to investigate?** | **Look** by default (read-only). **Measure** is a per-goal switch that runs the repo's own test command in a scratch worktree. Budget: 20 turns and 15 minutes by default (turns and time first, V: owner's earlier choice). The proposal must cite evidence for each task (file and line, or a measured time). | Look only, or Measure always. "Make tests faster" is hollow without a measurement, so Measure is offered up front, off by default because it runs code. |
| **Provenance for crews** | The marker v2, plus `goal` and `approval` (section 7). The issue body ends with the original prompt, quoted, as glorp does. | Plain issue text. Rejected: a crew cannot tell it from noise. |
| **How the owner approves** | One proposal screen. **Create issues** (held) or **Create and release**. Edits happen in modals. The confirm lists every issue that will be written. Nothing is written before it. | Auto-create when the goal has up to N tasks and no open question. Offered as a setting, off by default. |
| **How it grows** | Rules shown in the proposal and enforced: more than 8 tasks, more than 3 dependency levels, any open design question, or any change to a public interface. Then the button is **Promote to spec** and **Create issues** is replaced by the question. Promote is also always available. | Never promote; make the owner start over. Rejected. |

**Promote to spec** writes `requirements.md` (the goal and findings),
`design.md` (the planner's approach), `tasks.md` (the tasks, with the same IDs)
and `avoozl/manifest.json` into a draft spec, opens it in Spec Builder, and
keeps every existing issue linked by task ID. The goal's row in Specs changes
badge from Quick to Spec. (A: that Avoozl may write a draft spec folder before
the owner commits it; the layout is V from design 6.8.)

A quick goal is stored in SQLite as a goal with tasks, so it shows in Graph,
Home and Trace like a spec. Its spec files do not exist until promoted. Crews
therefore read its context from the issue body, which must stand alone: goal,
evidence, the task's acceptance, and the marker. (The live test used an approved
spec and a decision record. A quick goal has neither; whether a crew takes the
issue was **not tested**. The first proof for this proposal is that test. If
crews skip it, the fallback is **Promote to spec** for every quick goal, which
costs one more step.)

---

## 9. Owner preferences applied

| Preference | Where it shows |
| --- | --- |
| Edit in modals | Projection preview, Quick goal, Spec changed, retro review, machine map, Stop the line |
| Boxed filter panels | Delivery, Intake, Activity (existing) and Trace's goal list |
| Themed tooltips | Every icon button and info icon; the mockups use `data-tip` |
| Confirm destructive actions | Create issues, Stop the line, Promote, Discard, remove a machine |
| Settings that explain themselves | Each Crews and rules field shows what it controls, where the value comes from, and the exact text to paste |
| Paginate at 100 | Delivery and the Trace goal list |
| Back button everywhere | Trace page, drawers and modals join one Back history (V: Requirement 60) |
| Info icon for details | Cost, merge path and crew-machine cells |

---

## 10. Build order

1. **Home and Trace on Variant B.** GitHub only: claim-marker parser, stage rail,
   timeline. No new permission.
2. **Projection preview and Spec changed.** Needs batching and the preflight.
3. **Side panel.** Needs the URL-based chat match.
4. **Quick goal.** Needs the live proof that a crew takes a spec-less issue.
5. **Variant A.** One grant, then the Crews strip and cost.
6. **`avoozl-crew` agent and Stop the line hook.** Needs the crew-agent proof.
7. **Retro targets** beyond Avoozl settings.

---

## 11. Open questions

1. Does a crew take an issue that has no spec and no decision record (quick
   goal)? Not tested. Decides whether Promote is optional or mandatory.
2. Can an app agent be a crew's agent, and do its hooks fire there? The code
   path suggests yes (V: `crew_runtime_session.py:198`); not run.
3. Can the owner's browser open `/chat?sid=crew-<id>` for a crew chat? The
   Radar page does the same through its own route; the direct URL was not tried.
4. Is there a deep link into a remote crew's chat? None found.
5. Does `GET /crew` refuse an app token like `PUT /crew` did? Likely, not run.
6. Plans-repo mode: a crew cannot read the plans repo. Do specs get mirrored to
   the code repo, or is single-repo the only mode for crew-built work?
7. Should the repository merge path check be a hard stop or a warning? The
   recommendation is a hard stop on Create and release, a warning on Create.
8. How many `ready` issues per crew slot? Each crew record has `max_open`, default 3
   (V: `crew_store_records.py:168`), which suggests Avoozl should
   use it, but only in Variant A.
