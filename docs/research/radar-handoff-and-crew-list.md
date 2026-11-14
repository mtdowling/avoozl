# Issue Radar crews beside Avoozl: the plan-me hand-off and one list of live crews

Observed 2026-11-14 on Avoozl `main` (f6ec0cd) and Kiro Crew 0.12.2. Real
GitHub reads against a scratch repository, `mtdowling/avoozl-radar-test`. The
workspace used was a temporary directory with a fresh database, not a real one.
The scratch repository had one account, so some "untrusted" cases below are
that account's issues judged under a policy that does not list it. Each place
that happens is named.

## Short answers

1. **Skip scope is not in Radar's claim marker.** The marker is
   `<!-- kirocrew-crew v=1 id=… phase=… pr=… updated=… -->` and holds nothing
   else. A skip scope is stored in Radar's own ledger on the crew's machine.
   On GitHub it is only in the comment's second visible line, when the crew
   writes it there (`skipped · duplicate · updated 05:04 UTC`). A crew that
   names the PR in that slot (`skipped · #6 · …`) leaves no scope on GitHub.
   The routing below reads that line and falls back safely when it is missing.
2. **Before this change** Avoozl sent every `plan me` issue the same way, with
   no check of who opened it and no use of the scope. The change adds the
   routing you described. It needs no change to Radar.
3. **One list of live crews** can be read from GitHub alone (crew id, name,
   phase, issue, PR, last update, stale flag). GitHub cannot show whether a
   crew is paused, which machine it runs on, or its chat. Radar's local API
   shows paused and the crew's chat, and the scope, but only for crews on the
   same machine.

## What was observed

### Radar's wire format

From `crew_ledger_spec.md` and `crew_brief.md` in the installed app:

- The marker has `v`, `id` (crew id, never the name), `phase`, `pr`,
  `updated`. A reader ignores keys it does not know and treats a `v` it does
  not know as a live claim.
- A marker in `resolved`, `skipped`, `yielded`, `handed-back` or `preempted`
  is history. The live claim is the oldest marker in any other phase.
- Only `claimed`, `investigating` and `implementing` age toward the claim TTL
  (48 hours by default). That value is a setting on each crew's machine, so
  another machine can use a different one. A missing or bad `updated` counts
  as expired.
- Needs-human skips carry the scopes `needs-decision` or `needs-investigation`
  by Radar's own rule. The `new-feature`, `architecture` and `needs-design`
  scopes come from the scope gate. Whether a crew also adds the needs-human
  label for those is up to its settings and prompt, which is why `plan me`
  and the scope can differ.

Real comments on the scratch repository (a crew named Draco) show both
second-line forms: `skipped · duplicate · updated 05:04 UTC` on #2 and
`skipped · #6 · updated 05:17 UTC` on #5. The recorded payloads are in
`src/app/test/fixtures/radar-scratch.json`.

### What Avoozl did before

Setup: single-repo mode, `coder: issue-radar`, `minimumPermission: write`.
Issues #5, #12, #13, #14 and #15 carry `plan me`.

| `crewLabels.needsHuman` | Intake | With Issue Radar | Needs you |
|---|---|---|---|
| default (`crew: needs human`) | #5, #12, #13, #14 (all, plus #2, #6) | none | none |
| `plan me` | #2, #6 only | #5, #12, #13, #14 | #5, #12, #13, #14 |

So `plan me` was either unknown (the issues sat in Intake with every other
open issue) or every one of them went to Needs you. The author and the scope
changed nothing, so an issue from a stranger got the same route as the
owner's.

### What Avoozl does now

Same setup plus `crewLabels.needsHuman: "plan me"` and `acceptedLabel:
"accepted"`. The hand-off read runs with the Untriaged read (every 10
minutes, and on Check now). For each cached issue that carries the needs-human
label in an `issue-radar` repository it reads the issue, its comments, and,
when needed, its label events and the author's permission.

| Case | Route |
|---|---|
| Not trusted | Left alone: not in Intake, not in Needs you. Listed under With Issue Radar with nobody asked. |
| Trusted, scope `new-feature`, `architecture` or `needs-design` | Intake |
| Trusted, any other scope, or no scope found | Needs you |
| The hand-off read failed | Needs you, as before. The next read tries again. |

Trusted means any one of:

1. The author passes the repository's actor check: `allowedActors` and
   `minimumPermission`, the same check used for trigger labels.
2. The body carries this workspace's own `avoozl-task` marker (same
   namespace).
3. The repository's `acceptedLabel` is on the issue and the person who added
   it passes the actor check. `acceptedLabel` is new, optional, and off when
   unset.

A permission GitHub will not show (HTTP 403) is not trusted.

Live check on the scratch repository, same workspace, three policies:

| Policy | #5 (no scope) | #12 new-feature | #13 new-feature | #14 needs-decision | #15 architecture, `accepted` |
|---|---|---|---|---|---|
| `minimumPermission: write` (owner trusted) | Needs you | Intake | Intake | Needs you | Intake |
| `allowedActors: [octocat]` (owner not trusted) | left alone | left alone | left alone | left alone | left alone |

The tests (`src/app/test/radar-plan-me.test.mjs`) also cover: an author with
no permission (`octocat`, using GitHub's real answer, `none`) becoming trusted
through `accepted` added by the owner, and not trusted when `octocat` added it;
the marker from this workspace and from another one; a stranger whose
permission cannot be read.

### Limits

- **No scope on GitHub means Needs you.** A trusted issue with no scope in the
  second line goes to Needs you, never Intake. Radar's local API can supply it
  (see below); this change does not call it.
- **The scope line is prose.** Radar does not promise it. If Radar adds a
  `scope=` key to the marker (a writer may add keys within `v=1`), reading it
  is a one-line change in `skipScope`.
- **The marker path can be forged.** The `avoozl-task` marker is public text,
  so anyone who can edit an issue body can paste one with the right namespace.
  The first and third paths do not have this gap. The route says which path
  trusted the issue (`planMe.trust`), so a person can see it. Dropping the
  marker path is a safe default if that matters more than reusing old issues.
- **Intake is a list, not an action.** Nothing starts on its own.
- Untrusted issues are hidden from Needs you, not removed. They remain under
  With Issue Radar.

## One list of live crews

`radar.crews` (read-only, an app operation) and the Dashboard's In flight
section. The read runs when the Dashboard asks, and GitHub is read at most
every 2 minutes however often it asks (Refresh forces it). For every registered
repository it lists open issues with the claim label (`crewLabels.claim`) and
reads each one's comments for the live marker. One row per issue:

| Field | From |
|---|---|
| crew id | marker `id` |
| crew name | first line of the claim comment (`👻 **Draco** …`), best effort |
| phase, PR, last update | marker `phase`, `pr`, `updated` |
| issue, PR links | the issue, and `<repo>/pull/<pr>` |
| stale | a `claimed`, `investigating` or `implementing` claim whose `updated` is older than 48 hours or unreadable; or a claim label with no live marker |

In flight shows these under an **Issue Radar** badge with links to the issue
and the PR, and a Stale badge. A claim label with no live marker shows as
stale with no crew, because Radar's own protocol says that label keeps every
other crew away until someone clears it.

Cost: one list call per repository plus one comments call per claimed issue,
every 2 minutes. A repository that fails keeps its last rows and shows its
error.

### What GitHub cannot show

| Not on GitHub | Where Radar keeps it |
|---|---|
| A crew is paused (`enabled: false`, with no open item) | the crew record on its machine |
| Which machine runs it | not recorded anywhere shared |
| Its Kiro Crew chat | the live session on its machine |
| The skip scope, reliably | the crew's ledger |
| The claim TTL a crew uses | settings on its machine |

A paused crew with no open claim has no label and no marker, so it is not in
the list at all. A crew that is working but has not written its claim yet is
missing too, for up to a few minutes.

### Would Radar's own API add it?

Yes, for the crews on the same machine. `GET /api/apps/issue-radar/crews`
(already used by Send to Issue Radar) returns each crew's `status`
(`idle`, `working` or `paused`) and counts, and `GET /crew` returns its open
work items and `recent_skips` with scope. That adds the paused state, the
scope and the chat for local crews. It does not add other machines, so it
cannot replace the GitHub read. The two together would show local crews in
full and remote crews from GitHub. Merging them needs a way to match a
crew's `id` in both, which the marker already carries. Not built.

## Not done, not checked

- A live crew was not run for this. The skip and claim comments on #12 to #17
  were written by hand in Radar's format, and say so in their text. #2 to #5
  are real crew comments.
- `accepted` and the marker path were exercised by tests and the live run
  with the owner as the only account; no second real GitHub user was involved.
- Radar's local API was read from source, not called.
- The Intake tab shows no badge saying a Radar crew asked for planning. The
  data is on the item (`planMe`).
