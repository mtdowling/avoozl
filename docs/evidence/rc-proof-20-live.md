# Radar-coder Proof 20, live: a review draft from a label

Receipt for task `rc-p20`.

- Recorded: 2026-11-15, Linux, Kiro Crew 0.12.2.4 harness (own home, port
  5692), Avoozl from `main` at `30f9cbd` plus PR #220.
- GitHub: private scratch repository `mtdowling/avoozl-scratch-6`, PR #13
  (opened by crew `p6-crew`, closes the marked, crew-claimed issue #10). The
  machine's `gh` login is the person who adds the label.
- Verdict: **FAIL (blocked).** The label opens one read-only review chat, but
  the chat cannot post the pending review: the tool gets no caller identity.

## Commands

```
gh pr edit 13 -R mtdowling/avoozl-scratch-6 --add-label avoozl:review
# then wait for the harness tick; to redraft: --remove-label, then --add-label
avoozl review drafts --json
```

## Observation

| Try | What happened |
| --- | --- |
| 1 | One chat "Review draft: ...#13" opened with the brief, read the PR with `gh pr view/diff`, called `plans_post_review_draft`. The call waited for a tool approval and was declined after 180 s. Cause: the agent did not allow its one post tool, and the tick opens the chat with nobody watching. Fixed in PR #220 |
| 2 | A new label event made a second receipt, but its chat had the same title, so the same slot. First 403 `not_creator` (the slot belonged to the cron job from before a reinstall), then `plans_bind_session` refused: "already bound to ... attempt 1". Every tick failed and the cron paused itself after five. Fixed in PR #220: the title names the label event |
| 3 | The backend logged "Kiro Crew refused the session read (403)" for every review chat. The app may read only `avoozl_*` slots, and these titles did not start with `avoozl:`, so the tick waited forever to observe them and dispatched nothing new. Fixed in PR #220 for review draft, code review and conflict fix chats |
| 4 | Chat `avoozl:review-draft ...#13 (label ...)` opened, and the tool ran without a prompt. It answered "plans_post_review_draft needs the calling session's identity from the Kiro Crew gateway" twice. Nothing was posted. Labels stayed `avoozl:review` |
| 5 | `avoozl:avoozl` routed through Kiro Crew's MCP broker (`mcp_gateway.stub_overrides`, restart). The broker logged the session key for the call, but the request Avoozl received had no `kirocrew.caller` block, and this backend never logged `initialize_succeeded`. Same refusal |

No pending review was created, so the label swap, submit, Trace Review step,
stranger and wrong-login steps were not reached.

## Next

Find why the broker does not mark the Avoozl backend as caller-aware. It
advertises `kirocrew.caller-identity` in its `initialize` reply (checked by
hand with the gateway's init id). Until that works, every `plans_*` post tool
that needs the caller (review drafts, replies, conflict fix, reports, relay)
fails the same way in a crew chat.
