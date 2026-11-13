# Phase 4 broad issues and dependency text: tasks 4.4 and 4.6

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 4.

- Implementation commit: `fafda83` ("Break down broad issues and approve dependency text")
- Base: `kirocrew-native` at `fec95fc`, fast-forwarded under `<avoozl-checkout>/.git/avoozl-landing.lock`
- Recorded: 2026-11-12, Node v26.13.0, macOS
- Requirements: R12.3–R12.6, R27.5, R27.8; design §6.2

## Checks

| Check | Result |
|---|---|
| `npm test` at `fafda83` (typecheck, build, all tests) | exit 0; 787 tests, 787 pass, 0 fail |
| New tests, `src/app/test/github-breakdown.test.mjs` | 9 of 9 pass |
| `git diff --check` | clean |

`npm test` rebuilds `canvas-app/extension.js` with different output. That file
was restored and is not part of the change. No live GitHub call was made; all
GitHub behavior below is against the in-memory fake.

## What landed

| Part | Change |
|---|---|
| `src/app/github-breakdown.mjs` | Classification, draft, preview, approval and publishing for one matched issue; `depends on` parsing. State lives on the `github_issues` row as `breakdown`; no new table |
| Classify | `github.breakdown.classify` (`plans_classify_issue`): `{repository, number, kind: bounded\|broad, reason}` for an authorized deliver or execute match. Recorded as evidence with the snapshot hash. Broad holds the task (`dispatch.state` `planning`) and makes it an epic. Bounded keeps the issue as its own leaf |
| Draft | `github.breakdown.draft` (`plans_draft_children`): names the spec folder. Its one top-level epic item stands for the source issue; every other item nests under it |
| Critique | The spec is linted with `lintSpec`; a preview needs an `avoozl/critique.md` whose `Reviewed:` hash equals the folder's current hash |
| Preview | One comment on the issue (hidden `avoozl:breakdown-preview` marker), screened for secrets, plus the configured `decision` managed label. The comment is edited, not reposted, when the proposal changes |
| Approval | An allowed actor's `labeled` event for a deliver or execute rule, newer than the preview comment and not the event the preview was made under. The rule's actor and permission check (`evaluateRules`) decides who is allowed. `autoPublishChildren` approves children with no preview only when lint passes, the critique has no findings, and no dependency text is pending |
| Publish | The child graph becomes an approved plan (the spec folder minus its root epic). Top-level children get `parent` = the source task, then `projectPlanIssues` creates the issues with v2 markers and blocked-by edges. Avoozl links each top-level child as a sub-issue of the source issue and re-reads the links, copies the source's assignees to every child, removes the decision label, and edits the comment to say what was published. The approval is stored before any write, so a retry publishes the same preview |
| Parent | The source task stays an epic; the existing `completeParents` and `closeGitHubParents` close the source issue when every child completes (R12.6, reused, not changed) |
| Dependency text | With the repository's `dependencyText` on, `depends on #N` and `depends on owner/name#N` in the frozen body (outside code spans and fences) are proposed edges. The issue is held (`awaiting-approval`), shown in the preview, and written as native blocked-by edges only after a re-label approval. A blocker that is an Avoozl task also gets a local `requires` edge; any other blocker is read each sync until it closes, and the issue waits (`blocked`) until then |
| Sync | `syncGitHubIssues` carries `breakdown` across syncs, starts it over on a new snapshot, never resets a published one, and applies the hold to `dispatch`. `github.sync` then runs `github.breakdown.advance` when any row has a proposal; `autoStart` skips held issues |
| Wiring | `safety.mjs`: classify and draft are `draft`; advance is `protect`, like `github.sync`. Three MCP tools. The avoozl skill describes the flow. The planner agent is unchanged: its tools stay read-only |

## Cases tested

| Case | Test | Result |
|---|---|---|
| Nothing is published before approval: no child issue, sub-issue link or edge after preview, and none after a second sync | broad issue | pass |
| No preview without a current critique | broad issue | pass |
| A disallowed actor's re-label approves nothing | broad issue; dependency text | pass |
| Allowed re-label: two children become sub-issues of the source; the dependent child is blocked by the other, as in the draft; local `requires` edge; root epic not created as a task | broad issue | pass |
| Re-sync after publishing writes nothing | broad issue | pass |
| A re-label that came before the preview changed approves nothing; a later one does | stale preview | pass |
| `autoPublishChildren` publishes without a comment when lint and critique pass | auto | pass |
| `autoPublishChildren` with a critique finding falls back to the preview | auto with findings | pass |
| Bounded issue stays one leaf, no new issue, no comment; drafting is refused | bounded | pass |
| Same-repo `#5` and cross-repo `other/repo#9` become native edges only after approval | dependency text | pass |
| Self-reference `#7` and missing `#99` are shown as not linked | dependency text | pass |
| `depends on` inside inline code and a code fence is ignored | dependency text | pass |
| Issue waits on untracked blockers until both close, then is ready | dependency text | pass |
| `dependencyText` off: no hold, no comment, no edge, no proposal row | off | pass |
| A reference that would close a cycle (`#5` already blocked by `#7`) is never linked and posts nothing | cycle | pass |
| Parser: lists with `,` and `and`, duplicates, cross-repo, self | parser | pass |

## Limits

- shortcut: an issue reads as bounded until a planner classifies it broad, so
  an unclassified broad issue is dispatchable as today. Upgrade when the tick
  opens a planner session for each new deliver match.
- shortcut: in plans-repo mode a broad issue must be filed in the planning
  repository; copying a code-repository issue into a new planning issue (§6.2)
  is refused with a reason, not built.
- The cycle check reads the blocker's direct GitHub blockers and the local
  graph, not GitHub's transitive chain.
- Children are not re-projected by the tick here; later fan-out of ready
  labels is the existing projection's job.
