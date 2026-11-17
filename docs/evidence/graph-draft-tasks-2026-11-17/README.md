# Graph: draft spec tasks (2026-11-17)

Dashboards › Graph now also draws the tasks of specs that are not approved
yet. graph.view returns them apart, in `drafts`, with state `draft`; they are
never ready, never in `tasks`, and never released. The Graph draws them faded
with a dashed border and a Draft label. The left nav's Graph block has
**Show draft tasks** (on by default) with the draft count.

The scratch workspace is `kirocrew-app/ui/test/browser/graph-chains.ts`
(`&graph=drafts`): the three approved specs from the Focus tree shots plus a
draft spec, Meal plans (M1-M4). M1 waits only on done work, and the Frontier
still does not list it as newly unlocked.

- `before/`: `origin/main` at 0b4de367, the same scratch workspace (the old
  page ignores `drafts`).
- `after/`: this branch.

| File | What it shows |
| --- | --- |
| `1-frontier-*` | Frontier: still 2 newly unlocked; M2-M4 wait |
| `2-all-tasks-*` | All tasks with the four draft tasks dashed and faded |
| `3-tree-M2-*` | Focus tree of the draft task M2 |
| `4-modal-M2-*` | M2's modal: the spec is a draft, with Open Specs |
| `5-drafts-off-1280-*` | All tasks with Show draft tasks off |
| `5-menu-390-*`, `6-menu-drafts-off-390-*` | The phone menu's toggle, on and off |

Remake them:

```sh
cd kirocrew-app/ui
AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host stylesheet> \
  node test/browser/graph-draft-shots.mjs <out dir> [--before]
```
