# Radar-coder Proof 20, live: a review draft from a label

Receipt for task `rc-p20`. Run 2 (below) passed. Run 1, blocked, is kept
after it as recorded.

## Run 2: PASS

- Recorded: 2026-11-15 07:17 to 07:45 UTC, Linux, Kiro Crew 0.12.2.4 harness
  (own home `/tmp/avoozl-live-p20`, port 5698), Avoozl from `main` at
  `e46cc5a` plus PR #240 copied into the installed app.
- GitHub: private scratch repository `mtdowling/avoozl-scratch-r1`. Issue #1
  carries an `<!-- avoozl v=1 ... approved-by=mtdowling -->` marker and a
  `kirocrew-crew v=1 id=p20-crew phase=implementing` claim comment. PR #2
  (`Closes #1`) changes `src/greet.js`. The machine's `gh` login is
  `mtdowling`, the person who adds the label.
- Verdict: **PASS.** One stand-in: the stranger is the same account taken out
  of the allowed actors, as in Proof 18.

### Why run 1 was blocked

Two causes, both fixed.

1. Avoozl bug, fixed in PR #240. `mcp --kirocrew` answered
   `server/discover`. kiro-cli 3.3.0 then spoke the 2026-07-28 revision and
   never sent `initialize`. The gateway learns that a backend takes a caller
   only from its `initialize` reply (`kirocrew.caller-identity`), so it
   forwarded every call with no `kirocrew.caller` block. Kiro Crew's own
   servers answer `server/discover` with -32601, so the client falls back to
   `initialize`. Avoozl now does the same.
2. Harness gap, fixed in this PR. Setting `mcp_gateway.stub_overrides` is not
   enough. The gateway wraps a stubbed server only for a launch the owner
   approved, and logs `stubbed server 'avoozl:avoozl' ... resolves to a launch
   the operator has not approved; leaving it unwrapped`. Unwrapped, the chat
   starts the server itself and no broker sits in between. New command
   `harness.sh route-avoozl` sets the override, restarts, approves the refused
   launch through `POST /api/mcp-gateway/servers/stub` with its
   `expected_launch`, and restarts. `KIRO_HOME` and app agent registration
   were checked and were fine (`<home>/kiro/agents/avoozl--avoozl-review-draft.json`).

What the backend received, logged from stdin in the harness copy only:

| | Frames from the gateway |
| --- | --- |
| Before PR #240 | `server/discover`, `tools/list`, ..., `tools/call` with `_meta` holding only `io.modelcontextprotocol/*` keys |
| After PR #240 | `server/discover` (refused), `initialize`, then `tools/list` and `tools/call` with `kirocrew.caller` (`sessionKey dashboard:avoozl_review-draft_..._36177208185_`) and `kirocrew.tenant` |

### Commands

```
harness.sh start; harness.sh route-avoozl
avoozl init <ws> --name p20; avoozl workspace add p20 --root <ws>; avoozl workspace set-default p20
avoozl project configure code --root <scratch checkout> --branch main --as-person
avoozl github configure mtdowling/avoozl-scratch-r1 --project code --allowed-actors mtdowling --as-person
# .avoozl.json github.mode set to single-repo; harness.sh restart (see below)
gh pr edit 2 --add-label avoozl:review                     # as mtdowling
gh api -X POST repos/.../pulls/2/reviews/5909669138/events -f event=COMMENT   # submit, as mtdowling
# allowed actors set to octocat, then:
gh pr edit 2 --add-label avoozl:review
# allowed actors set to mtdowling and github-actions[bot], then a
# workflow_dispatch job adds the label as github-actions[bot]
avoozl review drafts --json; avoozl radar.trace --json '{"repository":"...","number":1}' --as-person
```

### Observation

| Step | Result |
| --- | --- |
| Label by `mtdowling` (07:37) | One chat `avoozl:review-draft mtdowling/avoozl-scratch-r1#2 (label 36177208185)` on `avoozl-review-draft`. It read the PR with `gh pr view/diff/checks` and called `plans_post_review_draft` once, with no prompt |
| Pending review | Review 5909669138, state `PENDING`, user `mtdowling`, two line comments on `src/greet.js` (missing-name default, no tests) |
| Labels | `avoozl:review` swapped for `avoozl:drafted`; draft row `waiting` with the review link |
| Submit in GitHub (07:40) | Next tick: `avoozl:drafted` removed, draft row `submitted`, `closedAt 07:40:39Z` |
| Trace for issue #1 | Review step `done`: "Drafted 2026-11-15T07:39:04.520Z, submitted by mtdowling" |
| Stranger (allowed actors `octocat`) | Label removed; no draft; one Needs you row "mtdowling added "avoozl:review" to ...#2 and was ignored" |
| Allowed person on another login (`github-actions[bot]`) | Label kept; no draft, no review (count stayed 1); one Needs you row "Draft review for ...#2 needs github-actions[bot]'s machine", naming this machine's login `mtdowling` |

Avoozl never submitted, approved or requested changes. The only review on
PR #2 is the one `mtdowling` submitted by hand.

### Found on the way

- The app backend chooses the workspace whose chats it reads when it starts
  or when the Avoozl page calls it. A workspace made later from the CLI was
  not read, so the tick held with `"held":{"reason":"unobserved"}` until
  `harness.sh restart`. Noted in `docs/live-proof-harness.md`. In normal use
  the Avoozl page makes this call, so this was not treated as a product bug.
- The two chats from before the fix stay `queued`/`chat` in `review drafts`:
  they ended without posting. Nothing was posted for them.

Not covered: Windows and macOS harnesses; a second human GitHub account (the
bot account stands in for "another login").

## Run 1: FAIL (blocked)

- Recorded: 2026-11-15, Linux, Kiro Crew 0.12.2.4 harness (own home, port
  5692), Avoozl from `main` at `30f9cbd` plus PR #220.
- GitHub: private scratch repository `mtdowling/avoozl-scratch-6`, PR #13
  (opened by crew `p6-crew`, closes the marked, crew-claimed issue #10). The
  machine's `gh` login is the person who adds the label.
- Verdict: **FAIL (blocked).** The label opens one read-only review chat, but
  the chat cannot post the pending review: the tool gets no caller identity.

### Commands

```
gh pr edit 13 -R mtdowling/avoozl-scratch-6 --add-label avoozl:review
# then wait for the harness tick; to redraft: --remove-label, then --add-label
avoozl review drafts --json
```

### Observation

| Try | What happened |
| --- | --- |
| 1 | One chat "Review draft: ...#13" opened with the brief, read the PR with `gh pr view/diff`, called `plans_post_review_draft`. The call waited for a tool approval and was declined after 180 s. Cause: the agent did not allow its one post tool, and the tick opens the chat with nobody watching. Fixed in PR #220 |
| 2 | A new label event made a second receipt, but its chat had the same title, so the same slot. First 403 `not_creator` (the slot belonged to the cron job from before a reinstall), then `plans_bind_session` refused: "already bound to ... attempt 1". Every tick failed and the cron paused itself after five. Fixed in PR #220: the title names the label event |
| 3 | The backend logged "Kiro Crew refused the session read (403)" for every review chat. The app may read only `avoozl_*` slots, and these titles did not start with `avoozl:`, so the tick waited forever to observe them and dispatched nothing new. Fixed in PR #220 for review draft, code review and conflict fix chats |
| 4 | Chat `avoozl:review-draft ...#13 (label ...)` opened, and the tool ran without a prompt. It answered "plans_post_review_draft needs the calling session's identity from the Kiro Crew gateway" twice. Nothing was posted. Labels stayed `avoozl:review` |
| 5 | `avoozl:avoozl` routed through Kiro Crew's MCP broker (`mcp_gateway.stub_overrides`, restart). The broker logged the session key for the call, but the request Avoozl received had no `kirocrew.caller` block, and this backend never logged `initialize_succeeded`. Same refusal |

No pending review was created, so the label swap, submit, Trace Review step,
stranger and wrong-login steps were not reached.

### Next

Find why the broker does not mark the Avoozl backend as caller-aware. It
advertises `kirocrew.caller-identity` in its `initialize` reply (checked by
hand with the gateway's init id). Until that works, every `plans_*` post tool
that needs the caller (review drafts, replies, conflict fix, reports, relay)
fails the same way in a crew chat.
