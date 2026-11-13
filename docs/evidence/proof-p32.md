# Proof P32: incoming items from a fake plugin source and a fake MCP caller

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase
14, proof P32 (tasks.md; design §4.12, §8.5; R50).

- Base: `kirocrew-native` at `7a6d3ec`
- Recorded: 2026-11-13, macOS
- Result: **pass**

## What ran

An automated test, `src/app/test/proof-p32.test.mjs`, part of `npm test`.

- Workspace: a temporary directory with its own SQLite store and a real
  `.avoozl.json` in single-repo mode. Repository `o/app` (workspace
  repository `code`), managed labels `avoozl:managed` and `avoozl:ready`,
  allowed actor `owner` with `write`. Rules: `deliver` `label:go
  source:tickets`, `pause` `label:hold source:script`, `deliver` `label:go
  source:script`, and `deliver` `label:go` (GitHub).
- Sources: `tickets` is the fake tracker plugin from
  `src/app/test/fixtures/plugins/fake-tracker/`, copied to the temporary
  folder, declared in a temporary machine `plugins.json` and approved by its
  hash; its `poll` reads a JSON file the test edits and returns items changed
  since the cursor. `labelFields: ["component"]`, `minimumPermission:
  write`. `script` has `via: mcp`.
- Content rules: set `intake-terms` with `boundaries: ["intake"]`, one fake
  term in its workspace terms file.
- Fake GitHub: issue 1 (`go`, labeled by `owner`) and issue 2 (no labels);
  it answers every read and records and refuses every write.
- Clock: `Date` is mocked. Ticks are `workspace.tick` with `cron: true`; the
  page's reads are `untriaged.view` and `intake.view`; MCP calls go through
  the app's MCP handler, `plans_intake` action `submit_items`.

## Expected items

| # | Expected | Result |
|---|---|---|
| 1 | `T1`, `T5`, `T6` each one pinned local leaf in `o/app`; `T2` untriaged (eve lacks `write`); `T3` untriaged; `R1` untriaged with Code review and no leaf; issue 1 delivers and issue 2 is untriaged, as before | pass. Each leaf is `authority: local`, repository `code`, ready, with the item's body as its approved source. `T2`'s reason reads "eve needs write permission." `R1` has no task. Issue 1's `github_issues` row is authorized and points at its `github` item; its task goes to the planner as before (`classifying`). Intake lists `o/app#2`, `R1`, `T2`, `T3`. |
| 2 | Nothing written on a tick with no change | pass. `incoming_items`, `intake_sources` and the intake tasks are byte for byte the same. |
| 3 | A failed poll keeps the cursor and items and shows the error; the rest of the tick runs; after restore nothing is duplicated | pass. The source row shows "tracker is down" with the old cursor, all six items stay, the tick returns its intents, and the next tick clears the error with six items still. |
| 4 | Through MCP: `S1` listed, not delivered; `S2` paused; the `javascript:` link refused naming the field; a replay `unchanged`; an older one `stale` | pass. Results `created` untriaged, `created` paused, `refused` "item 2 link ...". `S1`'s author and trigger are stored as claims; its record has no trigger. |
| 5 | Submits to `tickets` and `github` refused | pass. Both are MCP errors saying only an mcp source takes items this way; nothing is stored. |
| 6 | `T4` quarantined with a decision naming the set and rule, not the term | pass. Route `quarantined`, findings `intake-terms`/`codename`, an open content decision for target `intake:tickets/T4`; the decision, the route and the tick's notices never contain the term. |
| 7 | The tab lists `github`, `tickets`, `script` with a Source filter; non-GitHub rows link to their items and show no Issue Radar; the page's Deliver this makes one pinned leaf; MCP gets 403 | pass. Sources `github`, `tickets`, `script`; every non-GitHub row has `links.item` and no `issueRadar` or `github` link; `R1` offers Code review and neither start. `intake.deliver` from the page makes `S1`'s leaf, pinned and marked `by: person`; the same call from MCP and from a session caller is refused with 403. A person's Deliver this on `R1` is refused. |
| 8 | `T1`'s task quarantined after a body change | pass. Dispatch `quarantined`, not ready, approved text unchanged. |
| 9 | `T5` closed by bob is an order; `T6` closed by eve holds `d6` with a decision and is not reopened; the reopen lifts the hold | pass. `T5`'s leaf has `intakeVerdict.state: order` by bob, reaches `integrated` for `d5` without an integration commit or GitHub verdict, and `d5`'s blocker notes say it closed without merged code. `T6`'s leaf has a decision naming eve; `d6` is not ready; the item stays closed at the source; after the reopen the decision and hold are gone. |
| 10 | A closed untied item is gone after 30 days; tied ones stay | pass. After 31 days `T3` is deleted and `T5` stays. |
| 11 | P31's expectations hold and `untriaged.json` is not written | pass. The GitHub read is the `github:o/app` source row with keys 1 and 2; no `untriaged.json` exists; no GitHub write was attempted. `proof-p31.test.mjs` runs unchanged in the same suite and passes. The release scan of plugin docs and fixtures finds nothing. |

## Not covered

- Code review of a `review` item still opens Code Review Sage's page; a
  `review` rule action waits on MC-15 (task 14.11).
- The page was not drawn at three widths in this run; the UI tests check
  the Intake tab's wiring, labels and confirm steps.
