# Proof P3: workspace picker loads real SQLite data

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 1,
proof P3 [R3.1].

- App source: `kirocrew-native` at `b3c6dcc`
- Kiro Crew: installed app bundle CLI (`kirocrew` in the user's Kiro Crew bin)
- Recorded: 2026-11-12 02:15–02:26 UTC, Node v26.13.0, macOS
- Verdict: pass, after one fix

## Setup

| Step | Result |
|---|---|
| Source | The real workspace's `.avoozl.json`, `.avoozl/config.json`, `workspace.sqlite`, and `workspace.sqlite-wal`. Hashed before and after; only `cp` read them. Nothing in this proof opened them with SQLite |
| Copy | Copied to a temporary root. Every copied file is mode `0444`. The root and `.avoozl` directories are `0555`. The database directory stays writable (see Notes) |
| Clean profile | New temporary `HOME`, `KIROCREW_HOME`, `KIRO_HOME`, `KIROCREW_WORKSPACE`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME` and `XDG_DATA_HOME`. The active profile and the real machine catalog were not used |
| Build and install | `npm run build:kirocrew-app` exit 0; `kirocrew app install <worktree>/kirocrew-app` -> `installed avoozl v0.1.0`. Trust was set after install: `agent.apps_trusted = ["avoozl"]`, then `kirocrew app enable avoozl` |
| Gateway | `kirocrew gateway --test-mode --no-crons --no-tunnel`; the backend listened only on `127.0.0.1:9103` |

## Action

Each call went through the gateway's `/apps/avoozl/api/command` as the
signed-in owner. That is the path `useAppApi()` takes.

1. `workspaces.add {id: "nupp", root: <copy>}` -> 200. The copy's
   `.avoozl.json` names portable identity `nupp`, so any other ID is refused
   (400). That refusal is correct.
2. `workspaces.list` -> one item, `nupp`, default workspace.
3. `state` with `workspaceId: "nupp"`. This is the snapshot the Graph view
   draws: tasks, epics and edges.

## Expected results

| Expected | Observed | Result |
|---|---|---|
| 141 W tasks across 7 epics | 141 tasks in epics W1–W7: W1 33, W2 27, W3 22, W4 9, W5 12, W6 21, W7 17 (4,075 tasks in total, revision 2010) | pass |
| 130 edges | 130 edges with both ends in W1–W7 (142 edges in total) | pass |
| 3 milestones | `six-workload-execution` (W1), `compiler-on-core` (W6), `runtime-flip` (W6) | pass |
| Source unchanged byte for byte | Before and after hashes match (table below) | pass |
| Copy unchanged byte for byte | Before and after hashes match. The backend held the copy's database, WAL and shared-memory index open read-only (`lsof` mode `r`) | pass |

| File | SHA-256, before and after |
|---|---|
| `.avoozl.json` | `cbeea976fb820e811d9bc03c53a2358df1a48333f34bd7b6e052e10ff84b4c08` |
| `.avoozl/config.json` | `b1acfea9b5188c360875fdbd68b87cb668e0db5ecc062bd5d997ce8be3e78f1e` |
| `.avoozl/local/workspace.sqlite` | `2d902df9964dbd628170dead8202f31fe4682932cc6067b0f56e88011edff24b` |
| `.avoozl/local/workspace.sqlite-wal` | `8a921de74ac42788308d828a0577368b156cd55d0e976464c5129517f2ed84e9` |
| `.avoozl/local/workspace.sqlite-shm` (source only) | `f65214a24a6a1c1dd187b5add82bfba62de93dad9d8ad277d9d0ce5dc0890685` |

## Failure found and fixed

The first run returned 500 from `state`, with `unable to open database file`
and then `attempt to write a readonly database`. That is a schema-read bug:

- `Store` opened every database read-write. It ran `PRAGMA journal_mode=WAL`
  and `CREATE TABLE IF NOT EXISTS` for every table. The real database predates
  `session_bindings` and `session_requests`, so those statements write.
- `Safety`'s constructor wrote `safetyEpoch` and `safetyAuthorityPolicy` to
  `meta`.

`b3c6dcc` makes `Store` open a database file that is not writable with
`readOnly: true` and skip the schema statements. `Safety` skips its two meta
writes on a read-only store. Writes to such a store still fail. New test: a
catalog workspace whose database is `0444` and lacks `session_requests` is
added and read through the backend, and its bytes do not change.

## Checks

- `npm test` 593 passed, 0 failed; `git diff --check` clean.

## Notes

- SQLite reads a WAL database only through its `-shm` index. It must create
  that index when it is missing, so the database directory has to be writable.
  With the directory `0555`, SQLite cannot open the copy even read-only.
  Opening with `immutable=1` would skip the WAL, and this WAL holds committed
  changes to `meta`, `plans` and `events`, so the read would be stale. The copy
  has a new `workspace.sqlite-shm`. Its database and WAL bytes are unchanged.
- `kirocrew-app` has no Graph view yet. P3 read the same snapshot the web
  Graph view uses, through the app API's `state` operation.
- As in P1, the installed app's three agents did not register in the
  temporary profile ("agent source missing or unreadable"). P3 does not use
  them.
- Kiro Crew refused `app install` while `agent.apps_trusted` already named
  the app ("execution trust predates repository binding"). Installing first,
  then trusting, worked.
