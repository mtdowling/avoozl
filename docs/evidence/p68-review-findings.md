# P68 live: a person reads, decides and approves a reviewed spec

> Screenshots for this receipt were checked and are not kept in git.

Proof P68 (Requirement 104, design §4.33), run 2026-11-17 16:59–19:35 UTC
on a Mac, with real Kiro Crew chats in a throwaway Kiro Crew 0.12.2.4 (own
home and port), on Avoozl `main` at `01c5b9f9` plus the fixes below. The
writer was `claude-sonnet-4.6` and the reviewer `gpt-5.6-sol`, with
`planReview = {mode: auto, rounds: 1}`. Nothing was written to GitHub.

**Verdict: partial. P68 is not ticked.** Run 3 (below) ran every action
live on unpatched `main` at `b9e143ce`, and every expected result was
seen except one:

- No reviewer produced an `info` finding in any of the 8 live rounds
  across three specs (all were `blocker` or `warn`). So the grey border
  was never seen live. The red and yellow borders were seen. A planted
  naming slip meant as an `info` finding in run 3 was not raised at all.

Runs 1 and 2 also needed hand patches for bugs found here. Review anyway
first ran in run 2, with #437's backend half patched in. Run 3 needed no
patches.

The screenshots also still need the owner's approval.

## Setup

- A scratch workspace `p68` in the throwaway Kiro Crew's own catalog. The
  scratch code repository `app` has only a local bare remote, so no
  GitHub repository is configured. `src/cache/store.mjs` exists. No
  `watch-config*` file exists.
- Two New spec requests, made from the CLI as the person:
  - `cache-reset` (run 1). The planner left out the planted defects. A chat
    message from the person then asked for them, as deliberate test
    defects.
  - `cache-reset-2` (run 2). The request itself named the three defects:
    a missing helper `src/cache/watch-config-helper.mjs`, the prose order
    "1.2 must wait until 1.1 is merged." with no `requires` edge, and the
    criterion "The cache reset SHALL be fast enough."
- The tick opened every chat: the planner, the reviewers and the planner
  answer chats.
- Each planner answer chat was set to trust mode in the test Kiro Crew
  (`POST /api/chat/mode`), as in P63 and `docs/live-proof-harness.md`.
  This changes the chat's tool approval, not plan approval.
- In run 1 the owner clicked in his own browser. For run 2, a newer owner
  rule moved the person's clicks to the agent. The agent drove the real
  Avoozl page in headless Chrome over CDP, signed in as the person to the
  test Kiro Crew only. The same CDP driver took every screenshot.

## Results

| Expected | Seen |
|---|---|
| (1) Findings with severities, categories and quote anchors | Run 2, round 1 (revision `c59a4ee190d6`): 8 findings, 4 `blocker` and 4 `warn`, with the 6 kinds as categories. All three planted defects were found at the exact quoted line: `wrong-reference design.md:10` (the missing helper), `hidden-order tasks.md:6` (the prose order) and `untestable requirements.md:11` ("fast enough"). Run 1 found the same three at `design.md:15`, `tasks.md:7` and `requirements.md:20`. |
| (2) Borders by severity | `blocker` red (rgb 217 37 68 light, 249 67 89 dark), `warn` yellow (rgb 183 121 31). **Grey not seen**: every round had Info 0. |
| (2) Filters | The Blocker, Warn and Info chips filtered the rail to that severity, and the choice stayed in the address (`&severity=blocker`). |
| (2) The rail lines up and each click lights its lines | At the reviewed revision, each card sat level with its anchor. A card click set `data-selected` and lit exactly the anchored source lines, for example `requirements.md:11` → line 11 "The cache reset SHALL be fast enough." and `requirements.md:9-10` → lines 9 and 10. At later revisions, fixed passages listed first under **Moved or removed**. |
| (3) History shows the person and revision | Each card's history reads, for example, "Accepted by <owner> at 56a57767ae1a". The decisions are appended with `by`, `at`, `revisionHash` and the note: reject "Test: rejected on purpose.", defer "Later.". |
| (3) The deferred one is a follow-up with no task | A `review_followups` row (finding, spec, note, person, revision). Run 2 approved `cache-reset-2` with 2 tasks, the same as its manifest. No task came from the follow-up. |
| (4) The dialog updates in place, with no error, and the accepted finding gets fixed | The Accept started a person-triggered planner turn (attempt 2) outside `planReview.rounds`. Its new revision moved the open dialog to "Changed while open: 56a57767ae1a → 31be3ca71dc7 · design.md +1 −0 · Approve now applies to 31be3ca71dc7. Press it again", with 0 page errors. The accepted `hidden-order` finding is now answered `fixed` at `31be3ca71dc7`, with a `requires: ["1.1"]` edge. In run 1, the owner saw "fe282417e436 → adeb3f069f8e, requirements.md +1 −1" in his own dialog. |
| (5) One more round that does not repeat the rejected finding | With #437's backend half patched in, the dialog offered Review anyway at the cap. One press started pass 2 round 2 at `31be3ca71dc7` (`unproven` false): 6 findings, none of them the rejected `wrong-reference`. Its planner answer turn then stored `48b7dff2e9d1`, and the dialog updated in place again (3 files changed). Review anyway then showed again for the new revision, one round at a time. The rejected quote was already gone from the text, so this round did not exercise the same-pass drop count. |
| (6) Approval at the revision on screen, as with no review, with zero GitHub calls | One Approve spec press approved exactly `48b7dff2e9d1`, the revision the dialog showed (19:35:21 UTC, one `approvals` row). Run 1: the owner approved `adeb3f069f8e` at 18:50:09 UTC. Blockers did not hold approval. `outbox` and `github_issues` are empty. |

The Approve dialog's counts are per severity and per state over the same
findings, as Requirement 104.12 says. "4 blocker · 4 warn · 1 accepted ·
5 fixed · 1 rejected · 1 deferred" describes 8 findings twice. It does not
list 8 open findings.

## Screenshots

From the real Avoozl page in the throwaway Kiro Crew.

| | Light | Dark |
|---|---|---|
| Review view, 1280 | checked, not kept in git | checked, not kept in git |
| A card click lights its lines, 1280 | checked, not kept in git | checked, not kept in git |
| Review view, 390 (cards inline) | checked, not kept in git | checked, not kept in git |
| A card click, 390 | checked, not kept in git | checked, not kept in git |
| After decisions and approval, 1280 | checked, not kept in git | checked, not kept in git |
| After decisions and approval, 390 | checked, not kept in git | checked, not kept in git |

Desktop light, in order:
1. Blocker filter: checked, not kept in git
2. Warn filter: checked, not kept in git
3. Decided: checked, not kept in git
4. Approve open: checked, not kept in git
5. Changed while open: checked, not kept in git
6. Review anyway pressed: checked, not kept in git
7. Settled after round 2: checked, not kept in git
8. Approved: checked, not kept in git

The Approve dialog's in-place update was captured at desktop light only.

## Run 3: unpatched main

Run 2026-11-17 20:10–20:38 UTC. The test Kiro Crew's installed app was
brought to `main` at `b9e143ce` in place: every fix below is in it, and no
hand patch. The app backend was restarted, and the tick's cron job was
unchanged. The spec was `cache-reset-3`, with the same planted defects
plus a naming slip. The person's clicks were driven by the agent in
headless Chrome, as in run 2.

| Action | Seen |
|---|---|
| 1. Round and planner answer | One round, with no unknown-writer skip first (#428). It found 8 findings: the planted `wrong-reference design.md:10`, `hidden-order tasks.md:6` and `untestable requirements.md:9`, plus 5 more (5 `blocker`, 3 `warn`). The planner answered all 8 `fixed` at `309e172d10bf`. |
| 3. Decide | Reject `wrong-reference` "Test: rejected on purpose.", Defer `untestable` "Later." (a follow-up row, no task), Accept `hidden-order`. Each is recorded with the person and `309e172d10bf`. |
| 4. In-place update | With Approve open, the person-triggered turn (chat title "… attempt 2", #430) stored `abf7435e2733` and answered the accepted finding `fixed` there. The dialog showed "Changed while open: 309e172d10bf → abf7435e2733 · design.md +1 −0", with 0 page errors. |
| 5. Review anyway | The dialog offered it at the cap with "The round limit is reached for this revision. Review anyway runs one more round." (#437). One press stored a `review` choice, and round 2 ran at `abf7435e2733` (`unproven` false, writer `claude-sonnet-4.6`). It found 3 `conflict` findings, none of them the rejected `wrong-reference`. Its planner answer stored `6676720728fb`. The dialog moved again in place (manifest.json +10 −3, design.md +3 −2) and offered Review anyway once more. |
| 6. Approve | One Approve spec press approved `6676720728fb`, the revision on screen (20:38:35 UTC). `outbox` and `github_issues` are empty. |

| | Light |
|---|---|
| Changed while open, 1280 | checked, not kept in git |
| Review anyway pressed | checked, not kept in git |
| Round limit note, second update | checked, not kept in git |
| Approved | checked, not kept in git |

## Bugs found

| PR | Bug | State |
|---|---|---|
| #428 | A review started before the writer chat's model was known, recorded an unknown-writer skip, and was replaced a minute later by a second pass. | merged `4ecbc5e8` |
| #430 | A person's Accept asked for planner attempt 2 with attempt 1's chat title. Kiro Crew handed back the first chat, binding refused it, and the turn never started. | merged `ada794ce` |
| #437 | Review anyway was never offered at the rounds cap, because it covered only the unknown-writer skip. | merged `959ff379` |
| #438 | A pasted `?view=review` link opened Home, not the Review view. | merged `56aca705` |

Hand repairs in the test Kiro Crew only, with a `.before` copy of each file
kept:
- #430's title change and #437's backend half were copied into the
  installed app, and the app backend was restarted.
- One stuck attempt-2 start request was set back to pending. Its claim had
  opened no new chat.

#428 was not patched in. Each run therefore shows one extra skipped round
at the start, the bug #428 fixes.

## Not shown

- The grey `info` border (no `info` finding in any live round).
  On 2026-11-17 the owner accepted grey on UI test coverage
  (`kirocrew-app/ui/test/browser/review-fixture.ts`,
  `kirocrew-app/ui/test/browser/plan-review-summary.tsx`), because 8 live
  rounds produced no `info` finding.
- An MCP or agent session trying to decide a finding. Live, the planner and
  reviewer chats only ever used `plans_answer_review` and
  `plans_submit_review`. MCP has no decide tool, and the refusal is
  covered by 57.3's tests, not by this run.
- The same-pass drop count for a repeated rejected finding.

Next decision (from P68): search other files for moved quotes, or keep
same-file anchoring. Every moved finding seen here was text fixed in the
same file, so this run gives no reason to search other files.
