# Proof ec-p1: epic context reaches the owner's own spec task and nothing else

Run 2026-11-20T06:48:04.318Z on linux with `node scripts/proofs/ec-p1.mjs`.

Setup: an isolated home and workspace, scratch repository acme/widgets with an approved one-task spec, the example `team-context` plugin with a fake stdio MCP server `research`, a fake GitHub, and a scripted harness CLI. Avoozl's gate, supervisor, broker, relay, content rules and Activity are the real code. This machine has no sandbox, so the harness ran under the per-machine opt-in; the sandbox profile itself is covered by unit tests only.

| # | Expected | Result |
| --- | --- | --- |
| 1 | the approval view lists both skills, the read and the research alias with its command and env name | observed |
| 2 | the session read the note, quoted the skill's phrase, called research once; Activity shows three passed tests and the given items; the row shows Epic context | observed |
| 3 | the fake server's environment holds the marker variable and the worker's does not | observed |
| 4 | the intake task, the coworker's spec and the repository that names epicContext or declares the plugin get none, and Activity names why | observed |
| 5 | text from a login without write access starts a new session without context | observed |
| 6 | a diff with an acme-terms term is blocked for the context task and not for another task | observed |
| 7 | editing servers.json turns the plugin changed and the next session gets nothing | observed |
| 8 | no new TCP listener appeared | observed |

Details:

- (1) {"skills":["error-messages","module-layout"],"server":{"alias":"research","about":"Answers questions from the team's design archive","command":["node","mcp/research.mjs"],"env":["RESEARCH_TOKEN"],"replaced":false,"mapped":true}}
- (2) Started sample-task: approved passed; approver passed; you-drive passed. Given: skill error-messages, skill module-layout, read team-notes, mcp research
- (3) 
- (4) Unknown setting "epicContext" in repository Avoozl configuration at <tmp>/tools/.avoozl.json. Remove it. | Started intake-0123456789abcdef: approved failed: An intake task is not part of an approved spec.; approver failed: No approved revision.; you-drive passed
- (5) {"sawText":false,"hasText":true,"hasCtx":false}
- (6) {"blocked":true,"other":true}
- (7) 
- (8) []

Expected result observed.
