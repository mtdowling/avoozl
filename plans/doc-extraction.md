# Agentic extraction of work from design prose

**Status:** Proposed design  
**Date:** November 10, 2026  
**Project:** Avoozl  
**Audience:** Avoozl maintainers, operators, and reviewers

## Summary

Avoozl should derive executable work from design prose. An author writes a
design however they write designs. Avoozl reads it, lists what it found and
where it found it, and the operator approves. Tasks, dependencies, acceptance
gates, and GitHub issues follow from that.

Today the author must hand-write fenced `task` JSON inside the document, commit
it, usually open a pull request for it in a repository that holds no code, and
satisfy a linter that has opinions about heading names. All of that goes away.

This plan is mostly a deletion. The parts it adds are an extraction agent, a
list of derived facts with their sources, and a comment back to GitHub.

## What this removes

| Removed | Today |
| --- | --- |
| Hand-written `task` JSON | Required before any work is executable |
| The planning commit and its pull request | Required to carry that JSON |
| The document write on approval | `src/app/plans.mjs:470` writes a projection back over the author's document |
| Required heading names | Ten diagnostics fire on heading spelling (`src/app/plan-quality.mjs:116`) |
| "Add at least one fenced task block" | A hard error that blocks approval (`src/app/plan-quality.mjs:200`) |
| Duplicate conflicts raised at approval | `requireDistinctTask` throws a 409 mid-approval (`src/task-identity.mjs:84`) |
| Skill guidance to write blocks and justify near-duplicates | `src/app/skills/avoozl/SKILL.md:85` and `:66` teach both |

Nothing replaces these with a stricter version of itself. A document with no
headings, no sections, and no JSON is a valid input.

## Product decisions

1. Prose is the authoring format. Fenced `task` JSON stays readable for
   existing plans and is never required.
2. Derived facts live in the database, never in the document.
3. Every fact cites one exact passage, so the operator can check it.
4. A fact the extractor inferred says so, and a fact the document never stated
   is reported as a gap rather than invented.
5. Facts arrive accepted. The operator's job is to reject what is wrong, not to
   confirm what is right.
6. Duplicate and coverage evidence is advisory. It is shown, with reuse one
   click away, and never blocks.
7. Fact identity is derived from the cited prose, so extraction reproduces
   across computers.
8. Approving an extracted design writes no document and opens no pull request.
9. Avoozl comments the derivation back to GitHub as a best-effort pointer.
10. A repository tells the extractor how its designs work through the existing
    checked-in agent instructions, not through a hand-edited prompt.
11. Extraction is part of the bundled skill, so the Driver can run it when
    asked, through the CLI and MCP rather than the web interface.

## Goals

1. Approve and execute work described only in prose.
2. Show every derived fact with the passage it came from.
3. Make the common case one look and one button.
4. Show what already covers a fact before a task is created.
5. Keep extraction reproducible from the document alone.
6. Keep fenced-block plans working unchanged.

## Non-goals

1. Replacing the approval receipt. Receipts stay hash-bound and immutable.
2. Automatic approval, however confident the extractor is.
3. Proving that code implements a fact. Coverage is evidence for a person.
4. Closing or merging anything automatically.
5. Grading documents. Avoozl reports what it derived, not how well written the
   input was.
6. Replacing the design review pipeline.

## End-to-end workflow

### 1. A design arrives untriaged

A document appears in the planning root, synced from a repository or written
locally, and shows up in the Queue as an untriaged `design` item. The Queue
knows `issue`, `pull-request`, and `task` today (`src/app/github-queue.mjs:41`,
`src/app/github-queue.mjs:75`, `src/app/github-queue.mjs:313`); `design` joins
them.

### 2. Triage

Two actions: **Extract**, or **Not a plan**, which keeps the document as
context and removes it from the Queue. Research and evidence documents take the
second.

### 3. Extraction and coverage

Extraction runs and reports progress: the round, the provider, how many facts
so far, how many gaps. Each task fact is then scored against work that already
exists. Coverage fills in per fact.

The review pipeline already has this shape and already streams
(`src/app/operations.mjs:568`).

### 4. The fact sheet

Facts grouped by kind, each with its cited passage. Gaps listed separately.
Coverage shown on the facts that have it. Everything is already accepted.

### 5. Look and approve

The operator reads down the list, rejects or edits whatever is wrong, reuses
anything that already exists, and approves. A clean extraction is one button.

### 6. Act

A parent issue with its task issues attached as sub-issues, then a comment on
the pull request or commit that introduced the design.

## Fact model

```text
{
  id,                 # derived from the cited prose, see Identity
  planId,
  revisionHash,
  kind,               # task, acceptance, dependency, constraint, resource,
                      #   decision, non-goal, risk, rollout, validation
  text,
  quote,              # exact passage; absent facts have none
  lineStart, lineEnd, # resolved from quote by the server
  derivation,         # "stated" | "inferred" | "absent"
  reasoning,          # why, when inferred
  relatesTo,          # acceptance to its task, dependency endpoints
  coverage,           # scored existing work, advisory
  status,             # "accepted" | "reused" | "edited" | "rejected"
  taskId,             # the existing task, when reused
  edit,
  extractionIds
}
```

`task` facts become tasks. `acceptance` facts become their acceptance criteria.
`dependency` facts become `requires`, `sequence`, or `supports` edges.
`constraint` and `resource` facts become tags and resources. The rest are
recorded on the receipt and carried into implementation prompts.

`validation` facts are plan-level gates, kept separate from task `acceptance`
because plan approval, implementation, integration, and whole-head acceptance
are distinct.

### Identity

```text
id = "fact-" + digest(kind + "\0" + quote + "\0" + normalize(text)).slice(0, 20)
```

The same approach `src/app/plan-reviews.mjs:57` uses for review comments.
Identity comes from the document, so the same cited sentence yields the same
fact on any computer against an empty database. A clone plus one extraction
rebuilds the fact set — the document stays the portable artifact without
carrying machine bookkeeping.

`normalize` lowercases, collapses whitespace, and drops terminal punctuation,
so incidental rewording does not mint a second fact.

### Anchoring

The agent supplies `quote`. The server resolves it with the exact-match,
ambiguity-refusing resolver already used for review anchors
(`src/app/plan-reviews.mjs:16`) and derives the line range itself. A quote that
is missing or appears twice is rejected at submission. An extractor that cannot
cite the document cannot propose work.

### Derivation and gaps

- **stated** — the passage says it.
- **inferred** — the passage implies it; `reasoning` is shown.
- **absent** — the document does not say it. No quote, no task.

Absent facts are the gap list: what the design never settled. They are
information, not a checklist. The operator fixes the document and re-extracts,
or ignores them and approves anyway.

This is what lets extraction run on a sparse document. A thin design yields a
short task list and an honest gap list, instead of a plausible task list with
invented acceptance criteria — which would quietly corrupt the receipt chain,
because a task's `approvedSource` would cite prose that never made the claim.

## Extraction runs

Extraction runs like the review pipeline (`src/app/operations.mjs:670`):
background, read-only, bound to one `revisionHash`, one
`plans_submit_extraction` call per round, and unable to approve. If the document
changes mid-run the extraction goes stale.

Extraction is triggered by triage, by explicit request, and by a revision
change to an already-extracted design.

Several rounds with different providers cross-check each other for free. Facts
every round found need less attention than facts only one found, which is the
sort order on the fact sheet. A round that adds no new fact ends the pipeline,
matching the review pipeline's existing stop rule.

### Custom extraction instructions

Extraction is an agent workflow, so it uses the instruction mechanism the other
workflows already use: checked-in rules in `.avoozl.json` with an `appliesTo`
category, `when` selectors, an enable toggle, and a source hash
(`src/app/agent-instructions.mjs:4`).

This is where a repository says how its designs actually work: that acceptance
criteria live in a table called "Checks", that anything under `docs/rfc/` is a
design, that this project's "Open questions" sections are gaps rather than
tasks. It replaces fiddling with the extraction prompt per document.

Four changes:

1. Add `plan.extract` to the categories. Because `inheritedCategories`
   (`src/app/agent-instructions.mjs:238`) splits on dots, existing `plan` and
   `all` rules already apply to extraction with no configuration.
2. Add a `plan.extract` branch to `workflowCategory`
   (`src/app/agent-instructions.mjs:281`), keyed off the run's extraction
   binding the way `plan.review` is keyed off `run.review`.
3. Pass the design's project context when matching, so a repository-scoped
   rule applies. `selectorMatches` rejects a repository-scoped rule when the
   subject has no `projectId` (`src/app/agent-instructions.mjs:252`), and an
   extraction has no task to carry one.
4. Add a `paths` selector, so a rule can apply to the documents it is about.

The `paths` selector also decides what reaches the Queue: a repository can
declare `docs/research/**` and `docs/evidence/**` as never a design, so those
documents never arrive as untriaged work in the first place.

Instructions shape how the extractor reads. They cannot approve, cannot waive a
citation, and cannot create a fact — every fact still cites its passage and
still carries its derivation.

### Re-extraction is a diff

Dispositions persist by fact ID across runs and revisions:

- an unchanged fact keeps its disposition;
- a new fact arrives accepted;
- a fact no longer produced is kept and marked withdrawn, because it may
  already have made a task.

Editing the cited passage changes the fact ID, so a rejected fact can return.
A secondary match on `kind + normalize(text)` notes "you rejected something
like this" without reapplying the decision, because carrying it across changed
prose would claim the operator reviewed text they never saw.

## Coverage

Prose describes work that is already tracked, already open as a pull request,
or already shipped. Every task fact therefore carries scored evidence of what
covers it.

| Candidate | Source |
| --- | --- |
| `task` | The local task graph, including historical tasks |
| `plan` | Other designs proposing the same deliverable |
| `issue` | `github_issues` records and Queue issue items |
| `pull-request` | Queue pull-request items |
| `code` | The execution project's repository contents |

### Scoring

`src/app/github-overlap.mjs` already does this in the opposite direction:
it scores an incoming GitHub item against local tasks and plans with project
and repository gating, explicit-reference detection, title and body term
overlap, and a weighted reason list the UI can display
(`src/app/github-overlap.mjs:231`, `src/app/github-overlap.mjs:314`).

Three changes let a fact be the query instead:

1. Make the scorer symmetric, so query and candidate are both reduced to a
   normalized title, terms, projects, and repositories.
2. Index `github_issues` records and Queue pull-request items as candidates,
   which today are only ever the query side.
3. Add a code candidate source: a bounded search of the project worktree for
   the fact's distinctive terms and any identifiers quoted in the document,
   returning file and line hits.

Code is the weakest signal and is labeled as such. A matching filename means a
related area, not a finished deliverable.

### Coverage never blocks

Coverage changes what the fact sheet shows and how it sorts. That is all.

- It never rejects a fact.
- It never merges tasks. `mergeTasks` stays explicit (`src/app/task-dedup.mjs:71`).
- It never closes or edits an issue or pull request.
- It never requires the operator to justify keeping two similar things apart.

`requireDistinctTask`'s 409 (`src/task-identity.mjs:84`) becomes one of these
advisory candidates. Raising a conflict in the middle of approval, after the
author already wrote the thing, is the behavior this plan removes.

An extractor that dropped real work because a filename matched would be worse
than one that proposes a duplicate the operator can see and reuse in a click.

### Reuse

Reuse binds a fact to an existing task instead of making one. It sets the
fact's `taskId`, so the existing approval path takes over: the document joins
that task's `contextDocuments` and `sourceReferences` and no task is created
(`src/app/plans.mjs:339`). That path already works across plans.

Reusing a fact whose candidate was a GitHub issue also records the Queue
association through the existing confirmation path
(`src/app/github-overlap.mjs:425`), so the Queue stops offering that issue as
unlinked intake.

## Approval

Facts arrive accepted, so approval needs the revision hash and nothing else
from the operator. The change to `approvePlan` is one parameter:

```text
proposals = extractionId
  ? proposalsFromFacts(store, extractionId)
  : extractPlan(plan.text)
```

Everything downstream is untouched: canonical ID mapping through
`resolveTaskId`, duplicate detection, edge construction, cycle rejection, and
the receipt. A task fact with no acceptance fact fails the existing schema
check, which is correct — that is a real gap, visible on the fact sheet before
approval.

Two obstacles have to come out for a prose-only document to approve at all:

- `task.missing` must not fire for an extraction-backed plan. It is currently a
  hard error, and `plan.approve` refuses on any error
  (`src/app/operations.mjs:2081`).
- The heading diagnostics go away entirely. They are not replaced by a
  derived-coverage checker; gaps already appear on the fact sheet, and the
  linter does not need a second opinion about them. What remains of `lintPlan`
  is the task-level checks that catch real problems: cycles, unknown
  references, self-dependencies, placeholder acceptance.

### Provenance

Each task records the fact that produced it, and `approvedSource` cites that
fact's quote. `source.hash` stays the revision digest, so editing the document
still marks dependent tasks `needsReview`.

### No document write

For an extracted approval, the projection and outbox insert at
`src/app/plans.mjs:420` and `src/app/plans.mjs:470` are skipped. Approval makes
tasks, edges, and a receipt, and touches nothing in the planning root.

Fenced-block plans keep their current projection, because existing approved
plans depend on it.

## Acting on an approved extraction

`projectPlanIssues` (`src/app/github-sync.mjs:540`) already cuts and updates one
issue per task with a managed body, readiness label, and recorded mapping. It is
reused unchanged, with three additions:

1. A parent issue per design, with each task issue attached as a sub-issue, so
   GitHub mirrors the shape the local graph already has.
2. No wait on a planning pull request, because there is no planning commit.
3. One managed comment on the pull request or commit that introduced the
   design, naming the extracted revision, the parent issue, and each task
   issue. Re-approving updates that comment in place, reusing the managed-body
   replacement already used for issue bodies (`src/app/github-sync.mjs:580`).

The GitHub client can list comments but not write them
(`src/app/github.mjs:178`). Pull-request comments use the issue comments
endpoint; commit comments are separate and matter once the design's pull request
has merged.

Finding the anchor is a history lookup: the commit that added the document's
path, and the pull request containing it. When neither resolves, the comment is
skipped. Approval and issue projection do not depend on it.

## Durability

Three layers that fail independently.

| Layer | Carries | Survives |
| --- | --- | --- |
| The document | The prose every fact cites | Any clone, any computer, no database |
| Issues and sub-issues | The approved work and its state | Anyone with repository access |
| The design comment | The link between them | As long as its pull request or commit exists |

The document is portable because extraction reproduces from it. The issues are
the record of what was approved. The comment makes the derivation discoverable
from GitHub by someone with no Avoozl database, and timestamps which revision
was extracted.

## Operation surface

| Operation | MCP name | Purpose |
| --- | --- | --- |
| `queue.design.triage` | `plans_triage_design` | Extract an untriaged design, or set it aside as context |
| `plan.extract` | `plans_extract` | Extract a revision, with coverage |
| `plan.extract.get` | `plans_extraction` | Pipeline state, rounds, facts, coverage |
| `plan.extraction.submit` | `plans_submit_extraction` | One fact list from one round |
| `plan.extraction.dispose` | `plans_dispose_fact` | Reject, edit, or reuse a fact |
| `plan.preview` | `plans_preview` | Extended with `extractionId` |
| `plan.approve` | `plans_approve` | Extended with `extractionId` |

Existing `plans_*` names and behavior are unchanged.

## Driver skill

The Driver learns Avoozl's workflow from the bundled skill
(`src/app/skills/avoozl/SKILL.md`), templated and printed by `{{CLI}} skill`
(`src/app/skill.mjs:4`). Extraction belongs there, so that asking the Driver to
"pull the tasks out of this design" finds a documented path instead of an
improvised one.

This extends the existing skill rather than adding a second one. Its frontmatter
`description` is what makes an agent reach for it, so that line has to name
design documents and extraction alongside the planning and task workflow it
already names.

A new section covers starting an extraction, reading the facts and their
coverage, disposing a fact, and approving a revision — all through the CLI and
MCP, because the Driver does not use the web interface.

Three passages become wrong and are corrected in the same change:

- "Draft a new plan in one Markdown document with design, proposed fenced
  `task` blocks" (`src/app/skills/avoozl/SKILL.md:85`) — blocks are no longer
  how work is proposed.
- The duplicate guidance to "supply `distinctReason` explaining the difference"
  (`src/app/skills/avoozl/SKILL.md:66`) — coverage is advisory and asks the
  agent for nothing.
- The mid-implementation disposition that appends a proposed block
  (`src/app/skills/avoozl/SKILL.md:54`) — that becomes the fact-shaped
  `plan.propose`.

Installed copies refresh the way they already do, by replacing `SKILL.md` with
the output of `{{CLI}} skill`.

## Storage

Two tables, following the single-body convention in `src/app/store.mjs:42`:

- `extractions` — one row per run: design, revision hash, sequence, rounds,
  state, run IDs, error.
- `plan_facts` — one row per fact, keyed by its content-addressed ID, holding
  the fact, its coverage, and its disposition. Durable across runs and
  revisions.

Neither holds authoritative task state. Tasks stay in the task graph; facts are
the derivation record behind them.

## User interface

The Queue gains untriaged `design` items with their two actions. Extracting
opens a guided view carrying rounds, coverage, and the fact sheet as ordered
steps, each a summary line that expands.

The fact sheet:

- facts grouped by kind, each showing its derived statement, cited quote, a
  line link into the document, and its derivation;
- inferred facts show their reasoning; facts only one round found sort first,
  because they need the most attention;
- gaps as a separate list;
- coverage inline on the facts that have it, each candidate linking to the
  task, issue, pull request, or file and line, with the reasons that scored it;
- reject, edit, and reuse per fact, since everything starts accepted;
- the existing `plan.preview` output as the final confirmation of what approval
  creates.

Leaving and returning lands on the current step, or on the fact sheet once
extraction has finished.

## Failure handling

| Situation | Behavior |
| --- | --- |
| Quote missing or ambiguous | Fact rejected at submission, with the quote reported |
| Inferred fact with no reasoning | Fact rejected at submission |
| Document changes mid-run | Extraction goes stale |
| Run fails or stops | Earlier rounds' facts are kept |
| No task fact derived | Nothing to approve; the gap list says why |
| Reused task no longer exists | Reuse rejected at approval |
| GitHub unavailable while scoring | Local task and plan coverage still returned, unscored scope reported |
| No commit or pull request for the design | Comment skipped; approval and issues unaffected |
| Comment fails or lacks permission | Kept on a receipt for retry; blocks nothing |
| Design deleted while untriaged | Queue item withdrawn, extraction stales |

## Compatibility

- `extractPlan` and fenced blocks keep working, and stay the escape hatch when
  extraction is wrong.
- `plan.propose` gains a fact-shaped form, so discovered work no longer edits
  the document. The block-appending form remains.
- Approved fenced-block plans keep their projected document and task links.
- `plans_*` MCP names and the `AVOOZL_*`, `AICOMMANDER_*`, and
  `NUPP_WORKSPACE_*` environment aliases are unchanged.
- Existing agent instruction rules keep their behavior. `plan.extract` and the
  `paths` selector are additions, and a configuration without them extracts
  with the defaults.

## Validation

Every increment must run:

- isolated temporary workspace tests with a deterministic fake extraction
  provider;
- a prose-only approval test: a document with no fenced block, no conventional
  headings, and no JSON produces tasks, edges, and a receipt;
- a layout-independence test: renaming, reordering, and renesting a document's
  sections derives the same facts, and no diagnostic names a heading;
- instruction tests: a `plan.extract` rule reaches the extractor, inherited
  `plan` and `all` rules apply unconfigured, a repository-scoped rule applies
  to that repository's designs, a `paths` rule scopes to its documents, and an
  excluded path never reaches the Queue;
- a cross-machine identity test: the same document against an empty database
  yields identical fact IDs;
- a re-extraction diff test over kept, new, withdrawn, and
  similar-but-changed facts;
- anchoring tests for missing, ambiguous, and absent quotes;
- a no-document-write test for extracted approval;
- a provenance test proving each task cites the fact and passage behind it;
- coverage tests for each candidate kind, proving none of them blocks approval;
- a reuse test proving no task is minted, the document joins the existing
  task's references, and the Queue association is recorded;
- a degradation test with GitHub unavailable;
- a comment test over pull-request anchor, commit anchor, no anchor, and a
  second approval updating the same comment;
- a compatibility test proving fenced-block plans approve and project
  unchanged;
- a skill test proving the printed skill names extraction and no longer
  instructs an agent to write fenced blocks or supply a near-duplicate
  justification;
- `npm test`;
- `git diff --check`.

Tests must never use real workspace databases, provider credentials,
transcripts, personal plans, or public repository mutations.

## Relationship to other designs

Review improves a revision; extraction derives work from it. Both bind to one
revision hash, both stale on change, and they compose in either order.

GitHub-backed team coordination governs how an approved design reaches other
people and computers. Extraction reduces what has to be published for that:
prose plus issues, with no committed task bookkeeping.

## Final product shape

Write the design. Avoozl reads it and shows what it found, what it inferred,
what the document never settled, and what already exists. Reject what is wrong,
approve, and the work appears in the graph and in GitHub.

Writing a better design is the way to get a better extraction. Nothing else is
required of the author.

## Implementation plan

The first increment is proposed with fenced blocks because the extractor that
replaces them does not exist yet. Later revisions of this design can be
extracted by the mechanism it describes.

### Increment 1: facts derived from cited prose

```task
{
  "id": "doc-extraction-facts",
  "project": "avoozl",
  "title": "Add design facts identified by the prose they cite",
  "summary": "Introduce the fact model, the plan_facts table, content-addressed fact identity, and server-side quote anchoring that refuses missing and ambiguous passages.",
  "acceptance": [
    "Fact identity derives only from kind, quote, and normalized text, so the same document yields identical IDs against an empty database.",
    "Quote anchoring resolves line ranges server-side and rejects passages that are missing or appear more than once.",
    "An inferred fact with no reasoning and an absent fact carrying a quote are both rejected at submission.",
    "Facts persist across revisions with their dispositions and are never written into the design document.",
    "Incidental rewording of the same derived statement does not mint a second fact."
  ],
  "requires": []
}
```

### Increment 2: extraction from untriaged designs

```task
{
  "id": "doc-extraction-pipeline",
  "project": "avoozl",
  "title": "Extract facts from a design revision and triage designs in the Queue",
  "summary": "Add the design queue kind with its two triage actions, and a read-only extraction pipeline modeled on the review pipeline with multi-round cross-checking and staling on revision change.",
  "acceptance": [
    "A design appearing in the planning root becomes an untriaged Queue item without deriving any fact or task.",
    "Triage either starts extraction or keeps the document as context and removes it from the Queue.",
    "An extraction binds to one revision hash and goes stale when the design changes mid-run.",
    "The extraction run is read-only and cannot approve a plan or write the design document.",
    "Rounds from different providers merge by fact ID, and a round adding no new fact ends the pipeline.",
    "A failed round preserves facts submitted by earlier rounds.",
    "Checked-in plan.extract instructions reach the extractor, existing plan and all rules apply without configuration, and repository-scoped rules apply to a design in that repository.",
    "A paths selector scopes a rule to the documents it concerns, and a path a repository excludes never appears as an untriaged design.",
    "An instruction cannot waive a citation, change a derivation, or create a fact.",
    "Existing Queue triage, intake, and claim behavior is unchanged."
  ],
  "requires": ["doc-extraction-facts"]
}
```

### Increment 3: coverage against work that already exists

```task
{
  "id": "doc-extraction-coverage",
  "project": "avoozl",
  "title": "Show what already covers a fact without blocking on it",
  "summary": "Make the GitHub overlap scorer symmetric so a fact can be the query, index issues and pull requests as candidates, add bounded code search, and attach advisory coverage to each task fact.",
  "acceptance": [
    "One scorer serves both queue intake and fact coverage, and existing queue overlap results are unchanged.",
    "A task fact is scored against local tasks, other designs, issue records, pull-request items, and repository code, each candidate carrying its reasons.",
    "Code evidence cites file and line and is labeled the weakest signal.",
    "No coverage result prevents approval, rejects a fact, merges a task, or requires the operator to justify keeping two facts apart.",
    "Scoring with GitHub unavailable still returns local coverage and names the scope it could not score.",
    "Coverage is recomputed on every extraction while dispositions persist by fact ID."
  ],
  "requires": ["doc-extraction-pipeline"]
}
```

### Increment 4: approve prose, and delete what blocked it

```task
{
  "id": "doc-extraction-approval",
  "project": "avoozl",
  "title": "Approve a prose design from its facts",
  "summary": "Build proposals from facts, default every fact to accepted with reject, edit, and reuse available, skip the document projection for extracted approvals, and remove the heading diagnostics, the fenced-block requirement, and the duplicate conflict raised during approval.",
  "acceptance": [
    "A document with no fenced block, no conventional headings, and no JSON approves into tasks, edges, and a receipt.",
    "No diagnostic refers to the presence, spelling, ordering, or nesting of a heading, and the three existing plans in this repository lint without structural complaint.",
    "Facts are accepted on arrival, and approval needs only the revision hash from the operator.",
    "A reused fact mints no task, joins the document to the existing task's references, and records a Queue association when its candidate was an issue.",
    "Duplicate candidates surface as advisory coverage instead of raising a conflict during approval.",
    "Materialized tasks, edges, mapping, and cycle rejection behave identically to the fenced-block path.",
    "Each task records the fact and passage that produced it, and editing the document still marks it for review.",
    "Approving an extracted design writes nothing to the planning root and inserts no outbox row.",
    "Fenced-block plans still approve with their projected document unchanged.",
    "Cycle, unknown-reference, self-dependency, and placeholder-acceptance diagnostics still fire.",
    "The bundled skill describes extraction in its description and its body, and no longer instructs an agent to write fenced blocks or justify a near-duplicate.",
    "An agent can triage a design, extract, read facts and coverage, dispose a fact, and approve entirely through the CLI and MCP."
  ],
  "requires": ["doc-extraction-coverage"]
}
```

### Increment 5: the guided view

```task
{
  "id": "doc-extraction-ui",
  "project": "avoozl",
  "title": "Carry the operator from extraction to approval in one surface",
  "summary": "Add the guided view holding rounds, coverage, and the fact sheet as ordered expandable steps, with per-fact reject, edit, and reuse, gaps listed separately, and the existing preview as final confirmation.",
  "acceptance": [
    "Rounds, coverage, and the fact sheet appear as ordered steps in one surface, each a summary line that expands.",
    "Round summaries name the provider, facts produced, facts new since the previous round, and gaps, and coverage fills in per fact.",
    "Every fact shows its derived statement, cited quote, line link, and derivation, and inferred facts show their reasoning.",
    "Facts only one round produced sort first, and gaps render as a separate list.",
    "Coverage appears inline with links to the task, issue, pull request, or file and line that scored it.",
    "Reject, edit, and reuse are available per fact, and a clean extraction can be approved without touching any fact.",
    "Leaving and returning lands on the current step, or on the fact sheet once extraction has finished.",
    "The guided view is usable at desktop and responsive widths."
  ],
  "requires": ["doc-extraction-approval"]
}
```

### Increment 6: issues, sub-issues, and the design comment

```task
{
  "id": "doc-extraction-github",
  "project": "avoozl",
  "title": "Project an approved extraction to GitHub and comment it back",
  "summary": "Add a parent issue with task sub-issues, project extracted approvals without waiting on a planning pull request, and comment the derivation onto the pull request or commit that introduced the design.",
  "acceptance": [
    "One parent issue per design carries its summary and links each task issue as a sub-issue.",
    "Reprojecting updates the parent and its sub-issue set without duplicating issues.",
    "Extracted approvals project without a planning pull request, while fenced-block plans keep their existing merge gate.",
    "The comment names the extracted revision, the parent issue, and each task issue, resolving its anchor from the commit or pull request that added the document.",
    "A second approval updates the same comment in place rather than adding another.",
    "A design with no resolvable anchor, a failing comment, or missing permission still approves and still projects its issues.",
    "Existing managed bodies, readiness labels, assignments, and issue records are unchanged.",
    "Projection remains refused for repositories that are not private."
  ],
  "requires": ["doc-extraction-approval"]
}
```
