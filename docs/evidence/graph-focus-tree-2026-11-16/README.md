# Graph: Frontier, Focus tree and drill-in (2026-11-16)

Dashboards › Graph on a scratch workspace with chains across three specs
(`kirocrew-app/ui/test/browser/graph-chains.ts`), rendered with Kiro Crew's
own stylesheet at 1280 and 390 px, light and dark.

| File | What it shows |
| --- | --- |
| `1-frontier-*` | Frontier: 2 newly unlocked, 7 still waiting, S3 opened to its blockers |
| `2-tree-S3-*` | Focus tree of S3, its met blockers S1 and S2 faded and struck |
| `3-drill-B3-*` | Two levels down: S3, then a click on Y3, then Enter on B3 |
| `4-back-Y3-*` | Back from B3 lands on Y3; Forward is lit |
| `5-modal-Y3-*` | O on Y3 opens it in the modal over the graph |
| `6-spec-billing-*` | The jump box rooted on the spec Billing |
| `7-all-tasks-*` | All tasks: the whole graph; a click drills into that task's tree |
| `side-by-side-*-1280-dark` | Issue Radar's Graph (the owner's captures) beside Avoozl's |

Remake the Avoozl shots:

```sh
cd kirocrew-app/ui
AVOOZL_CHROME=<chrome> AVOOZL_HOST_CSS=<host stylesheet> \
  node test/browser/graph-tree-shots.mjs <out dir>
```
