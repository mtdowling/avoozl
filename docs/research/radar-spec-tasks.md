# Do Issue Radar crews build spec-linked feature tasks?

Date: 2026-11-14. Kiro Crew 0.12.2.4, Issue Radar built-in app.

Question: Avoozl wants to hand approved spec tasks (new features) to a Kiro Crew
Issue Radar crew as GitHub issues. The crew rules say to skip brand-new
features, architecture changes and work that needs a design. Does a crew take
a feature issue when the issue links an approved spec and a decision record, or
does its scope gate skip it?

Short answer: it takes it. With an approved spec in `.kiro/specs/` and an
accepted entry in `docs/decisions/`, the crew read both, said no decision was
open, claimed the issue, opened one PR and got CI green on the first round.
It did this even when the issue only linked the spec (no decision text in the
issue). No prompt change was needed, so round 2 (a custom crew prompt) was not
run.

Labels:

- **Verified**: seen on GitHub in the test repo (comments, labels, PRs,
  timeline events, CI runs).
- **Inferred**: read in the crew rules (`crew_brief.md`, `crew_ledger_spec.md`
  under the installed `kiro_crew/apps/builtins/issue_radar/backend/`).
- **Not measured**: could not be read from where the test ran.

## 1. Setup

- One private scratch repo with a tiny Node project, `npm test`, and one
  GitHub Actions job.
- An approved spec at `.kiro/specs/greeter/` (requirements, design, tasks, all
  `Status: Approved`) and `docs/decisions/0001-greeter.md`
  (`Status: Accepted`, "may be built by anyone, including automation").
- One isolated test Kiro Crew home and gateway, started by the owner from their
  own shell. Issue Radar on, one crew ("Draco"), label scope empty, run
  unattended on, no extra prompt, needs-human label set to `plan me`.
- Merges were done by a person (or the conductor), not the crew.

| Issue | Kind                                                                                                      | Expected     |
| ----- | --------------------------------------------------------------------------------------------------------- | ------------ |
| A #2  | Plain feature request, no spec link                                                                       | skip         |
| B #3  | Spec task T1, links task and requirement IDs                                                              | ?            |
| C #4  | Spec task T2, links spec and decision, "Accepted, approved by maintainer", label `accepted`, blocked by B | ?            |
| D #5  | Plain bug (`divide(1, 0)`)                                                                                | fix          |
| E #9  | Batch: T3, T4, T5 in one issue, checklist, `accepted`, hidden Avoozl marker                               | ? (batching) |

## 2. Results

| Issue | Outcome                                    | Skip scope         | PR                               | CI rounds | Labels the crew wrote               |
| ----- | ------------------------------------------ | ------------------ | -------------------------------- | --------- | ----------------------------------- |
| A #2  | Skipped                                    | `duplicate` (of B) | none                             | -         | none                                |
| B #3  | Claimed, built, resolved                   | -                  | #7, merged                       | 1 (green) | `crew: in progress`, then removed   |
| C #4  | Waited for B, then claimed, built          | -                  | #10, merged                      | 1 (green) | `crew: in progress`, then removed   |
| D #5  | Built, then handed to a person on conflict | not public (see 4) | #6, open, conflicts              | 1 (green) | `crew: in progress`, then `plan me` |
| E #9  | Claimed, built all three tasks             | -                  | #11 (one PR, one commit), merged | 1 (green) | `crew: in progress`, then removed   |

All Verified. The crew opened no new issues: every issue in the repo was
opened by the test. It wrote only the two labels the rules allow
(`crew: in progress` and the needs-human label).

### Timing (GitHub timestamps)

| Event                                | Time (UTC) |
| ------------------------------------ | ---------- |
| A-D opened                           | 04:27      |
| D claimed (first claim)              | 04:54:35   |
| B claimed                            | 04:55:56   |
| A skip comment                       | 04:56:47   |
| B's PR #7 merged                     | 04:59:07   |
| D handed back with `plan me`         | 05:01:40   |
| C claimed (blocker merged 3 min ago) | 05:02:02   |
| E opened                             | 05:02:15   |
| C's PR #10 merged                    | 05:13:16   |
| E claimed (93 s after #10 merged)    | 05:14:49   |
| E's PR #11 opened                    | 05:15:35   |
| E closed by `Fixes #9` on merge      | 05:20:40   |

The crew start time was not recorded, so "time to first claim" is not
measured. E waited about 12 minutes because the crew was holding C in
`awaiting-merge`. It claimed E within two minutes of C merging.

Turns and credits per issue: **Not measured.** The crew's own ledger lives in
the test gateway's data home, which the test agent could not read from its
sandbox.

## 3. Why the scope gate let B, C and E through

The brief tells a crew to skip "a brand-new feature", "an architecture change"
and anything that "would need a design document, an RFC, or whatever this
project calls the step that comes before implementation". It then gives one
test: can the change be justified by the issue as reported, or does it need a
decision nobody has made yet (Inferred, `crew_brief.md`, "The scope gate").

The brief also tells the crew to grep `docs/decisions/` and read any entry
that matches. An accepted entry plus an approved spec answers the gate's
question: the decision was made, and the design step already happened. The
crew said so in its own words on each issue (Verified):

- B #3: "this is task T1 of `.kiro/specs/greeter/` (Status: Approved), and
  `docs/decisions/0001-greeter.md` (Status: Accepted) says T1 and T2 may be
  built by automation. So no product or design question is open."
- E #9: "T3, T4 and T5 of `.kiro/specs/greeter/` (Status: Approved) are
  accepted in the 2026-11-14 amendment to `docs/decisions/0001-greeter.md`,
  for automation too. So no decision is open."

B did not mention the decision record in its body; the crew found it in the
repo on its own. So the issue wording mattered less than what the repo holds.
Inferred: a feature issue whose spec is not marked approved, or with no
accepted decision entry, would likely be skipped as `new-feature` or
`needs-design`. The control A was not a clean test of that, because the crew
matched it to B first and skipped it as a duplicate.

## 4. Dependencies, batching, conflicts

**Blocked-by.** C carried a native GitHub blocked-by link to B and the text
"Blocked by #3". The crew did not claim C until B's PR merged, then claimed it
three minutes later and wrote "Its blocker #3 (T1) merged in PR #7" (Verified).
The brief does not name blocked-by links (Inferred), so this came from the
crew's own reading. Whether a wake on B's merge or a normal patrol turn
started it is Not measured.

**Batching.** One issue with three tasks gave one branch, one commit and one
PR that did all three, in the order `design.md` gave, with 8 new tests
(Verified). The PR body said `Fixes #9`, so GitHub closed the issue on merge.
The crew did not tick the checklist boxes in the issue body: all three stayed
`[ ]` after close. Avoozl cannot use the boxes as a done signal.

**Merge.** The crew does not merge. On C and E it wrote "Auto-merge is off in
this repo, so a maintainer needs to merge", even though the repo allowed
auto-merge. A person merged every PR.

**Conflict.** After #7 merged, D's PR #6 conflicted in `src/index.js`. The
crew did not resolve it. It posted the cause and a recommended resolution,
applied `plan me`, removed its claim label and released the issue. The brief
says crews do not resolve conflicts inside source code (Verified on GitHub,
rule Inferred). PR #6 is still open and conflicting.

## 5. What the `plan me` hand-off looks like

The hand-off is one crew comment, edited in place, plus the label. On D #5
(Verified):

```
👻 **Draco** · Kiro Crew Issue Radar
skipped · #6 · updated 05:17 UTC

**Finding:** `divide` in `src/index.js` is `return a / b;` with no check, ...
**Now blocked on a person:** PR #7 (merged) also changed `src/index.js`. ...
**Recommended resolution:** keep both sides. ...

<details><summary>progress</summary> ... </details>

<!-- kirocrew-crew v=1 id=c_022aea7f phase=skipped pr=6 updated=2026-11-14T05:17:00Z -->
```

What Avoozl can read from it:

| Field               | Where                       | Reliable?                                    |
| ------------------- | --------------------------- | -------------------------------------------- |
| needs a person      | the needs-human label       | yes, but the label name is per install       |
| crew id             | marker `id=`                | yes                                          |
| phase               | marker `phase=` (`skipped`) | yes                                          |
| PR                  | marker `pr=`                | yes                                          |
| skip scope          | header line, sometimes      | no: A showed `duplicate`, D showed only `#6` |
| updated time        | marker `updated=`           | no: see below                                |
| the decision needed | comment prose               | prose only                                   |

The skip scope (`needs-decision`, `new-feature`, ...) is a field of the crew's
local ledger, not of the public marker (Inferred, `crew_ledger_spec.md`,
"Claim marker"). Avoozl would have to read it from the header line or the
prose, which is not a stable format.

The `updated=` times were wrong. The crew writes them itself into the comment
body. They ran 15 to 27 minutes ahead of GitHub's own times: C's comment was
edited at 05:14:37 but says `updated=2026-11-14T05:36:00Z`. Avoozl must not use
`updated=` for staleness; use GitHub's comment `updated_at`.

## 6. What this means for Avoozl

1. Spec tasks can go to an Issue Radar crew as GitHub issues, as long as the
   spec in the code repo says Approved and `docs/decisions/` holds an accepted
   entry. In plans-repo mode the spec is in another repo, so the crew would not
   see it. That case was not tested.
2. Native blocked-by links were respected, so Avoozl's graph edges carry over.
3. One issue per task or one per batch both work. The crew builds a whole
   batch in one PR and does not tick boxes.
4. Someone still has to merge. Avoozl would need to merge on green or rely on
   repo auto-merge being turned on per PR.
5. A `plan me` hand-off gives crew id, phase and PR in a versioned marker, but
   no machine-readable skip scope and no trustworthy time.

Not checked: turns and credits, the crew's start time, an unapproved spec
(true control for the scope gate), plans-repo mode, and more than one crew.
