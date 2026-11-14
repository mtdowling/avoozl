# Side panel and driver link, live check (2026-11-14)

Avoozl from `main` at `d2b4a1b` (PR #148 side panel, PR #160 driver session),
built with `npm run build:kirocrew-app` and installed in the isolated test
Kiro Crew home (release build 0.12.2.4, Linux). No GitHub repository was read
or written. An agent has no dashboard sign-in and no computer-use tool, so the
panel was not opened in the host's own page. What was live and what was not:

| Check                                                            | Verdict              | Evidence                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App installs and enables with the `avoozl-driver` agent          | Pass                 | 12 agents registered; the agent file was materialized as `avoozl--avoozl-driver.json`                                                                                                                                                     |
| A chat on `avoozl-driver` loads and its tools work               | Pass                 | A script cron opened a chat on the agent; it called `plans_next` and answered with the counts. The audit log shows the caller as `dashboard:<slot>`                                                                                       |
| `agentSpawn` and `stop` hooks fire and reach the right workspace | Pass                 | The driver read went from none to `running` with `openedAt` from `agentSpawn` and `lastSeenAt` from `stop`, 5 seconds apart, in the test home's workspace. The hook ran sandboxed with the hook environment allow-list                    |
| Start button opens a driver chat                                 | Not run live         | The button calls the host's `openChat`, which needs the page. The same agent opened and ran from a cron                                                                                                                                   |
| Panel rows, refresh on interval and focus, no dead recap         | Pass on real replies | `panel-real.test.mjs` renders the built panel in Chrome on replies the sample workspace's own operations gave: waiting rows, crews, queue, recent merges, driver link. Interval and focus refresh are covered by `panel-browser.test.mjs` |
| Normal, Spec Builder, crew and Avoozl chats                      | Pass on real replies | One test per chat kind in `panel-real.test.mjs`                                                                                                                                                                                           |
| Attach opens the right chat                                      | Link checked only    | The href is `/chat?sid=crew-<id>`, the slot Issue Radar names; opening it needs the page                                                                                                                                                  |

## Not checked

- The panel in the host's own side panel, and clicks on Start and Attach.
- The `workflow-map.test.mjs` test "a value jumps to its field" fails on this
  machine's Chrome and on `main`, but passed in CI for PR #160. It belongs to
  the Workflow map work.
