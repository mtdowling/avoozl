# P8b live: Avoozl views render and act inside a chat

Proof P8b (Requirement 20, design §8.1), run on 2026-11-19 from 09:44 to
09:56 UTC on the throwaway P50 test Kiro Crew (0.12.2.4, port 5698, its own
home), with Avoozl built from `main` at `84367233` and loaded with
`harness.sh reload-app`.

Every browser step was a headless Chrome session run by the proof chat,
signed in with the test crew's saved cookie. The chat was an ordinary test
crew chat with the default `kirocrew` agent. Its tool cards were approved by
a script, as the person at that dashboard would. Screenshots were checked,
not kept in git.

**Verdict: pass, for the views that exist. P8b is ticked.** The Approve
half of the proof is superseded: no view has an Approve button, because
plan approval is a person's and is refused over MCP (`mcp-views.mjs`,
`src/app/test/mcp-views.test.mjs`). The decision view's Settle button is
the view write that carries an expected revision, so it stands in for
Approve in the steps below.

## Setup

- A scratch workspace `p8b` (`/private/tmp/p8b-run/ws`), added to the test
  crew's catalog and made its default. It holds one draft spec,
  `p8b-config` (three tasks, from the test spec fixture, loaded with
  `plan.create`), and one task, `p8b-pick`, with the open decision
  "JSON or TOML for config files?". Delivery off, no repository.
- `avoozl:avoozl` is routed through Kiro Crew's MCP gateway
  (`stub_overrides`, approved launch), which is what renders `ui://` views.
- An unbound chat is served from the MCP server's launch workspace, so the
  test chat `p8b-views2` was bound to `p8b-pick` as its responder. The
  shared server then serves it from `p8b`.

## Expected, item by item

| #   | Expected | Seen | Pass |
| --- | --- | --- | --- |
| 1   | The preview renders in the chat | Asked in the chat to preview `p8b-config`. The agent called `plans_preview`; the chat shows the view in a frame titled `avoozl:avoozl / plans_preview` (sandbox `allow-scripts allow-forms`): the three tasks, Checks (0), "Approval is a person's. Approve this revision in the Avoozl app.", and Refresh. `plans_decision` showed the decision view: title, question, an answer box, Settle and Refresh | yes |
| 2   | A write from a view that is out of date is refused, and nothing is written | After the view was drawn at revision 2, another window renamed `p8b-pick` (revision 3). Typed `json` and pressed Settle in the view: it showed "Database changed. Reload and review before saving." The decision was still open at revision 3 | yes |
| 3   | A current write records against the exact revision | Pressed Refresh: the view redrew with the new title. Typed `json` and pressed Settle: "Settled." The workspace moved to revision 4 and `p8b-pick` has no open decision | yes |
| 4   | The chat shows the result | Each result shows in the view's own status line, in the chat | yes |
| 5   | Approve from a view | Superseded: there is no Approve button (see above) | n/a |

## Found on the way, not fixed here

- `harness.sh reload-app` updated the app, but the shared `avoozl:avoozl`
  MCP backend kept running the old build. That old process opened the new
  scratch database and wrote an old-schema table into it, so the new code
  then failed with "there is already another table or index with this
  name: repositories". The proof chat stopped the old backend, made a new
  workspace and the gateway started the new build. A live proof after an
  app update has to check which build the MCP server runs.
- A workspace in the catalog whose `.avoozl.json` holds a retired key
  (`delivery.concurrency`, in the old P39 workspace) stops the MCP server
  during `initialize` when that workspace is the launch default. Every chat
  and the tick cron then lose Avoozl until the default changes. With no
  backward compatibility this is expected, but one bad workspace takes the
  whole server down.
- Kiro Crew mounts a view only from a live render event. Opened later, the
  same chat says "The avoozl:avoozl app from this step is not viewable
  here. Ask the agent to show it again." The proof watched the chat while
  the agent called the tools.

## Not checked

- The graph view (`plans_graph`) in the chat.
- Phone width and dark mode.
