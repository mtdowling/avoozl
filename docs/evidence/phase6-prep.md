# Phase 6 prep: frozen copy, kinds, baseline, checklist mapping

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 6
tasks 6.1–6.4 [R23.1, R23.2, R23.5, R23.6, R23.8] (design §10.2 steps 1, 3, 4).

- Tool: `scripts/migration-prep.mjs` over `src/app/migration-prep.mjs`
- Recorded: 2026-11-12 15:25–15:35 UTC, Node v26.13.0, macOS
- Source workspace: the live Nupp planning workspace (plans repository
  checkout, `.avoozl/local/workspace.sqlite`), read only
- Verdict: done; counts match the requirements table (141 / 61 / 451)

## 6.1 Freeze

| Step | Result |
|---|---|
| Source state | No process held the database open (`lsof` empty). Journal mode `delete`; no WAL or `-shm` file, so a plain copy is consistent |
| Copy | `.avoozl.json`, `.avoozl/config.json` and `workspace.sqlite` copied with `cp -p`, then made `0444`. Every read below opens the copy; `Store` opens a non-writable file read-only and skips schema statements (P3 fix) |
| Plans repository commit | `3efad7cea590b3f12c19efb75a966b7fc5183c41` on `main`. One uncommitted change (`AGENTS.md`) was in the checkout; documents are read from the commit with `git show`, not the working tree |

| File | SHA-256: source before, source after, copy after |
|---|---|
| `.avoozl.json` | `cbeea976fb820e811d9bc03c53a2358df1a48333f34bd7b6e052e10ff84b4c08` |
| `.avoozl/config.json` | `b1acfea9b5188c360875fdbd68b87cb668e0db5ecc062bd5d997ce8be3e78f1e` |
| `.avoozl/local/workspace.sqlite` | `d911fc62e01b6deb10b07ecc9f824492b157f162f740b86d2bde496261e90a2b` |

All three hashes are the same before and after on the source and on the
copy. The database hash differs from P3's because the source's WAL was
checkpointed into the main file between P3 and this freeze (P3 copied a
database plus WAL; there is no WAL now). Opening the copy created empty
`-wal` and `-shm` files beside it; the database bytes did not change.

## 6.2 Kinds

IDs and edges are copied, not changed: the 141 task IDs and the 130 edge IDs
with kinds equal an independent `sqlite3` query of the copy.

| Kind | Count | Rule |
|---|---|---|
| epic | 7 | W1–W7, the snapshot epics that are not catalog epics |
| milestone | 3 | stored milestones; they become Release values, not issues (§10.1). 1 finished, 2 planned |
| package | 73 | 1 has child tasks; 41 partial, package until reconciled (6.5); 31 unfinished with no acceptance criteria, so not bounded (R5.5) |
| leaf | 65 | 60 finished; 4 unfinished with acceptance criteria; 1 in review |

| Edge kind | Count |
|---|---|
| requires | 80 |
| sequence | 21 |
| supports | 29 |

Leaf candidates do not name a target repository yet (no W task stores one);
6.5 and 6.8 set it. The 31 unbounded packages are 6.6's input.

## 6.3 Finished-task baseline

61 finished W tasks (58 `implemented`, 3 `accepted`), the same IDs as the
copy's complete statuses. Each baseline row keeps status and authority,
source pin, evidence paths, dedup receipts, runs, commit hashes named in its
text, last activity, and a SHA-256 of its stored body for later
byte-for-byte checks. 15 carry evidence paths, 51 name commits, 4 have runs;
3 are status only (`compiler-duplicates`, `worker-main`,
`maintain-plan-report`, authority `database`). 32 edges run from a finished
task to an unfinished one (20 `requires`, 1 `sequence`, 11 `supports`); the
baseline records them as met. Edges point from prerequisite to dependent, as
in `delivery.mjs`.

## 6.4 Checklist mapping

451 entries: 94 from `todo/nupp-compiler-runtime-rewrite.md`, 185 from
`todo/nupp-native-runtime-handoff.md`, 150 from
`reports/native-runtime-plan-before-consolidation-2026-10-28.md`, 22 from
`todo/nupp-native-runtime-ledger.md`. 0 new tasks.

| Result | Count |
|---|---|
| acceptance (open entry, unfinished task) | 69 |
| context | 13 |
| unmatched | 369 |

Structural matching found nothing: no entry's source or merge-receipt source
shares a document, line range, or text hash with a W task or an epic context
range, and no entry's line text appears verbatim in the epic document. So
matches are lexical proposals: TF-IDF cosine over the entry's lines and
section headings against each W task's text, kept when the score is at least
0.25 and leads the next task by 0.05. None is applied; design §10.2 step 4
applies a match only after the owner accepts it. Every unmatched entry is
listed with its top three candidates in
[phase6-checklist-mapping.md](phase6-checklist-mapping.md). 230 of the 369
unmatched entries are already checked (`recorded`) in their documents.
Local paths in entry text are cut to `~/` and `/tmp/`.

## Checks

- `npm test` and `git diff --check` before landing (see commit).
- Independent `sqlite3` queries of the copy match the task IDs, edges with
  kinds, finished IDs, and entry IDs in the reports.

## Not done here

No critique session reviewed the proposals; the owner review and that pass
come before cutover (§10.3 needs zero unreviewed unmatched entries).
