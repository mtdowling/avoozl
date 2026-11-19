# P42 live: prompt proposals from a retro

Proof P42 (Requirement 68, design §4.18) steps 1 to 4 and 10, run on
2026-11-19 from 07:17 to 08:40 UTC on the throwaway P50 test Kiro Crew
(0.12.2.4, port 5698), in workspace `p39b`, at Avoozl `d98c7ec3` plus the
fixes below. Workers, verifiers and the retro were Kiro Crew chats with the
crew's default model. Page steps were headless Chrome clicks by the proof
chat; the agent step was a test-crew chat calling the Avoozl MCP tools.
Screenshots were checked, not kept in git. Steps 5 to 9, 11 and 12 went with
the lessons store, and 13 and 14 with sharing (#228, #619).

**Verdict: pass for what a live retro can produce. P42 is ticked.** The parts
a live run cannot reach by design are listed under Superseded below; they
stay covered by `src/app/test/proof-p42.test.mjs`, which passes.

## Setup

- A scratch repository `r5` with a bare remote and `landing: "direct"`. Its
  `CONTRIBUTING.md` says every commit message starts `note: `, and its check
  enforces that for every commit since `origin/main`. A worker that runs the
  check before it commits sees it pass, then fails at verification.
- Ten leaves `p42-01` to `p42-10`, then ten more `p42-11` to `p42-20`, each
  writing one note. This machine's lanes at 4.
- The check first refused Avoozl's own `Land <task>` commits and then its
  `Merge main into avoozl/<task>` commits, so tasks bounced at landing. The
  declared check moved to `p42/check-r5.mjs` outside the repository, which
  skips those two, and the stuck tasks were retried (`delivery.retry`).

## Expected, item by item

| #   | Expected | Seen | Pass |
| --- | --- | --- | --- |
| 1   | A low first-pass window; the retro proposes a `brief.worker` diff; bad proposals are dropped with their reasons | Every one of the first ten failed its first attempt (`check exited 1`); first-pass rate 0.23. Retro 3 named the merge stage and proposed nothing: the brief holds numbers, not failure text, so it could not see why. With retro instructions set on Settings › Flow ("workers run node check.mjs before they commit, and the check reads the commit messages"), retro 4 proposed a Steps diff, which was dropped: "evidence gives the metric's current value" (its `value` was a 300-character sentence). After the retro prompt fix below, retro 5 proposed `brief.worker` § steps: commit first, then run the checks. | yes |
| 2   | An agent cannot approve; the owner's approval writes override version 1 outside the app's files; sessions after it show the override's version | The agent chat found no `plans_*` action that approves a proposal (`flow.retro.decide` is person-only in `mcp-policy.mjs`). Approve on Retros › Proposals wrote version 1 to `<crew home>/avoozl/prompts/<workspace id>.json`, not under the app. Every later attempt recorded `brief.worker@a6f61834+o1`. | yes |
| 3   | Ten tasks on the new version raise the first-pass rate; PDCA marks it helped | `p42-11` to `p42-20` all passed their first attempt. Retro 7's PDCA on the proposal: before 0, after 1, over 10 tasks each, `helped`; the page reads "PDCA: first-pass rate 0% → 100%, helped." | yes |
| 4   | Revert brings the shipped text back, recorded and revertible | Revert on Prompt versions: version 2 (`revert`, by Michael Dowling); the version read `brief.worker@a6f61834` again. Revert once more: version 3 restored version 1. | yes |
| 10  | A shipped change under the override flags it with a three-way diff; sessions keep the override with a warning; a locked section's new text is used at once | A copy of the app whose shipped Steps and Untrusted data sections changed was loaded with the backend restart. `flow.proposals` gave `drift` on steps with the old, new and override texts and both diffs, `conflict: true`; the page says "The built-in brief.worker § steps changed under your override. Sessions keep your override until you approve the rebase." A new task `p42-21` got the override's Steps text and the new locked Untrusted data text, version `brief.worker@f10fa753+o3`. The normal build was loaded again after. | yes |

## Superseded: what a live retro cannot produce by design

- A proposal against a locked section (step 1): the retro brief carries only
  unlocked sections (`memoryBrief`), so a live retro has no text to diff.
- Repository and plugin skill proposals (steps 1 and 2): a skill is in the
  brief only when the window's attempts recorded loading it, and Kiro Crew
  worker chats report no skills, so the brief had none.
- A stale base and blocked text (step 1): a live model chooses what it
  writes; nothing makes it send a stale hash or a banned word.
- The "mixed" second window (step 3): it needs a second override taking
  effect inside the window, which the retro must propose first.

## Bugs found and fixed in this change

| Bug | Fix |
| --- | --- |
| The retro prompt did not say what `value` is; a sentence there dropped a good proposal. | `prompts/retro.md`: `value` is the metric's current number, `effect` one sentence of at most 300 characters. |
| An approved proposal and its override version recorded the approver as `dashboard`. | `flow.retro.decide` takes the signed-in operator's name (`operations.mjs`); the P42 test asserts it. |

## Also seen

- Avoozl's own commits (`Land <task>`, `Merge main into avoozl/<task>`)
  ignore a repository's commit message convention, so a check that enforces
  one refuses Avoozl's landings.
- Retros 2 and 6 failed (no session opened in 11 minutes; a reply with no
  valid bottleneck). Each later retro ran.
- Retro 7 proposed a second Steps change on top of the override; it was left
  open.
