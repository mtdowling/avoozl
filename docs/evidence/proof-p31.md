# Proof P31: the Untriaged list with a fake GitHub, then a live read-only count

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 13,
proof P31 (tasks.md; design §8.5; R49).

- Base: `kirocrew-native` at `6d83f83` (Phase 13: `c551205`, `58ac891`, `43f2744`)
- Recorded: 2026-11-12, macOS
- Result: **pass**, after one code repair (`f60cd3f`, below)

## What ran

The fake part is an automated test, `src/app/test/proof-p31.test.mjs`. The
live part is `scripts/proof-p31-live.mjs`, run by hand once; it is not part
of `npm test`.

- Workspace: a temporary directory with its own SQLite store on disk (the
  cache `untriaged.json` sits beside it) and a real `.avoozl.json` in
  single-repo mode. Repository `o/app`, one `deliver` rule `label:go`,
  managed labels `avoozl:managed` and `avoozl:ready`, triage label
  `triaged`.
- Task: `t4` owns issue 4 and records pull request 8.
- Fake GitHub: answers the search with the items below, answers other reads
  empty, and records and refuses every method whose name writes and every
  GraphQL mutation.
- Clock: `Date` is mocked; ticks are `workspace.tick` with `cron: true`, as
  the script cron runs it, and the page's read is `untriaged.view`.
- Items: issue 1 (no labels), 2 (`go`), 3 (`triaged`), 4 (`avoozl:managed`,
  t4's issue), 5 (100 days old), pull request 6 (draft, checks failing), 7
  (closes issue 4), 8 (recorded on t4). Issue 9 and 10 are added later.

## Expected items

| # | Expected | Result |
|---|---|---|
| 1 | Two ticks within 10 minutes make one search | pass. Ticks at 0 and 5 minutes; one search, `repo:o/app is:open -label:triaged`. |
| 2 | Items 1, 5, and 6 only; 6 shows draft and failing checks; GitHub, Issue Radar, and Code review links with fallback tooltips | pass. `untriaged.view` lists 1, 5, 6. Each item links to its GitHub URL; Issue Radar goes to `/issue-radar` with `exact: false` and the tooltip "... Pick o/app #N there."; pull request 6 also has Code review to `/code-review-sage` with its tooltip; issues have no Code review. No body, comment text, log, or finding is in the view. |
| 3 | `ignoreOlderThanDays` 30: item 5 leaves | pass. The next tick, one minute later, searches again with `created:>=2026-10-13`, and the view lists 1 and 6. |
| 4 | GitHub fails after 10 minutes: items stay, the error shows with the checked time | pass. One more search, which fails; the view keeps 1 and 6, shows `GitHub could not be read: API rate limit exceeded`, and keeps the checked time of the last good read. |
| 5 | `notify` on and issue 9 added: one notice naming the count, none more within the hour | pass. The next tick sends one `untriaged` notice, "Untriaged on GitHub: 3 in o/app". With issue 10 added, a tick 10 minutes later sends none; a tick an hour after the first notice sends one, "4 in o/app". Neither names an item number. |
| 6 | Select 1 and 6: the bulk link opens Issue Radar and its tooltip names #1 and #6 | pass. The page's `selectionHandOff` (kirocrew-app/ui/src/untriaged-api.ts) gives `/issue-radar`, `exact: false`, tooltip "... Pick these there: o/app #1, #6." **Check now** (`refresh: true`) makes one more search. |
| 7 | Local only: the tab and Dashboard count are hidden and nothing is read | pass. With no `github` section, a tick and `untriaged.view` with `refresh: true` search nothing, and the view returns `enabled: false`, which the page reads to hide the tab and the Dashboard count. |
| 8 | The owner's real repositories with `gh`: counts per repository, no GitHub write | pass (below). |
| — | No GitHub write at any step | pass. The fake recorded no write call. |

## Repair

Step (3) failed on the first run: setting only `ignoreOlderThanDays` did not
search again until the 10 minutes passed, against R49.6 ("a changed ...
age SHALL be read again on the next tick"). The cache compared queries
without their `created:>=` date, since that date moves every day, so a new
age looked like the same query. `f60cd3f` stores the age in days beside the
cached query and compares it too; `untriaged.test.mjs` covers the case.

## Live read-only count (8)

`node scripts/proof-p31-live.mjs --workspace <the Nupp plans workspace>
--repository nupp-lang/nupp --repository <private plans repo>`

The script copies the workspace's `.avoozl.json`, keeping only the named
repositories, and backs up its SQLite database with `sqlite3 -readonly` into
a temporary directory, then runs `untriaged.view` with `refresh: true` there
with the owner's `gh` login. Every request passes a guard that lets out only
`POST /graphql` searches, with no mutation, whose query starts with one of
the named repositories; anything else is refused before it is sent.

| Repository | Open, searched | Untriaged | Issues | Pull requests | Cut short | Error |
|---|---|---|---|---|---|---|
| nupp-lang/nupp | 8 | 8 | 1 | 7 | no | none |
| <private plans repo> | 0 | 0 | 0 | 0 | no | none |

- Mode: `plans-repo`; neither repository sets `untriaged` yet, so the
  queries are `repo:<name> is:open`.
- Requests: 2 searches, 0 refused, 0 writes; 1.5 seconds.
- The workspace's `.avoozl.json` and `workspace.sqlite` have the same
  SHA-256 before and after (`619316a0…` and `f8d1018e…`).

## Not checked

- The real page in a running Kiro Crew was not opened; the UI's own
  behavior is covered by `kirocrew-app/ui/test/untriaged.test.mjs` and the
  screenshots from the Untriaged task.
- Exact links into Issue Radar and Code Review Sage wait on MC-14
  (kirodotdev/KiroCrew#36431); P31 checks the fallback.
