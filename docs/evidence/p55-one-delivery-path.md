# P55: after removal there is one delivery path

Run 2026-11-19 on branch `task/45-4-delete-task-issues` at `d0559573`,
after 45.4 deleted per-task GitHub issues. Node 24, Linux. No real
workspace, no GitHub.

## Setup

A temporary workspace on the built app (`npm run build`), with its own
Avoozl config and state home, made by the nk-p2 script's offline mode:

```sh
node scripts/proof-nk-p2-live.mjs --root <tmp>/root1 --agent fake --offline
```

Every role runs as a `process` child with a fake harness. The checkout is a
local bare repository.

## Action and result

| Check | Result |
| --- | --- |
| One task through the loop | `nkp2-notes.1.1` planned, plan-reviewed, approved, investigated, coded, verified and landed. `report.json`: `pass: true`, every expected line true. |
| Roles that ran | planner 1, plan review 1, worker 1, falsifier 1; none refused |
| Kiro Crew requests | none written; `status` shows nothing waiting on Kiro Crew |
| App agents (`kirocrew-app/agents/`) | `avoozl-code-review`, `avoozl-conflict-fix`, `avoozl-falsifier`, `avoozl-plan-answer-read`, `avoozl-plan-review`, `avoozl-planner`, `avoozl-responder`, `avoozl-retro`, `avoozl-review-draft`, `avoozl-reviewer`, `avoozl-task-summary`, `avoozl-verifier`. No crew, relay, router or remote coder agent. |
| Relay, router and remote coder modules | none in `src/app` |
| Task-issue modules | none: projection, Project sync, issue close, completion, linked branches, rebuild from GitHub, export, breakdown and issue planner are deleted |
| Kept names (R91.4) | `node --test src/app/test/compatibility.test.mjs`: 4 pass. Only `AVOOZL_*` variables name the workspace and its paths, `package.json` names only the `avoozl` command, the old plan-file MCP tools are not listed, and an unknown top-level config key fails to load. The owner removed the older aliases on 2026-11-18 (#698). |

## Limits

- The worker is a fake harness: this proves the loop's plumbing, not a
  model's work.
- Radar modules remain. Most serve what Requirement 91.6 keeps: Radar
  intake (56.8), Radar asks in Triage (56.14), back-links (44.6) and
  Settings › Issue Radar. The Radar coder leftovers (`radar-coder-queue`,
  `radar-flow`, `radar-merge-path` and the operations that read them) stay
  for their own cleanup by owner decision 2026-11-18. None of them makes a
  task issue.
