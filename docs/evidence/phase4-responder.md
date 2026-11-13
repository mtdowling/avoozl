# Phase 4 task 4.3: responder agent and plans_post_reply

Recorded 2026-11-12. Requirements R27.2 and R27.3; design §4.7 and §6.2.
Code commit `dd80c99` on branch `task/p4-responder`.

## What shipped

- `kirocrew-app/agents/avoozl-responder.json`: tools are `fs_read`, `grep`,
  `glob`, `thinking` and `@avoozl:avoozl/plans_post_reply`. No shell, no file
  writes, `allowedTools` empty, `includeMcpJson` false. The old tool ref
  `@avoozl/plans_post_reply` did not resolve; it now uses the `<app>:<server>`
  name Kiro Crew registers.
- `src/app/github-respond.mjs`:
  - `respondStep` (run by the cron's tick): for each authorized issue snapshot a
    `respond` rule matched, it adds the repository's configured
    `managedLabels.responding` label, records one `github_responses` row, and
    dispatches one `avoozl-responder` session until it is bound. It removes the
    label when the reply is posted, when the session is closed or lost, or when
    the issue stops matching before a session binds. A tick with no change
    writes nothing.
  - `postReply` (`reply.post`, MCP `plans_post_reply {body}`): only the bound
    responder session may call it; the issue comes from its binding. The reply
    is screened; any finding refuses it with 422 and posts nothing. The message
    names each finding's kind and line, never the matched text. One reply per
    snapshot: the row is marked `posting` before the GitHub call, so a crash
    cannot post twice. After posting, Avoozl removes the label.
- A responder binding names its response row, not a task
  (`session-bindings.mjs`).
- Policy: a repository with a `respond` rule must name
  `managedLabels.responding`. Any label name works; no prefix is required.

## Screen

Refused: GitHub tokens (`ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`, `github_pat_`), AWS
access key IDs, private key blocks, Slack tokens, `sk-` API keys, Google API
keys, JSON web tokens, bearer headers, URLs with `user:password@`, credential
assignments (`password = ...`, `api_key: ...`), absolute paths under machine
roots (`/Users`, `/home`, `/private`, `/tmp`, `/var`, `/etc`, `/opt`,
`/Volumes`, ...), Windows drive and UNC paths, home-relative paths (`~/`,
`~user/`, `$HOME/`, `%USERPROFILE%`), and this machine's home, workspace and
project roots. Code fences are screened like any other text.

Passed: repository-relative paths (`src/app/x.mjs`, `./scripts`, `../app`),
HTTPS and localhost URLs, API routes such as `/api/command`, the words
"token" and "password" in prose, and `${{ secrets.GITHUB_TOKEN }}`.

## Tests

`src/app/test/github-respond.test.mjs` (8 tests) covers:

- label added once and one dispatch per snapshot, repeated until bound, none
  after;
- clean reply with a fenced command, relative paths, a URL and a route posts
  once, label removed, second post refused (409), next tick changes nothing;
- 19 refused replies, each with nothing posted and the label kept: the token
  formats above, a token inside a code fence, a URL with credentials, macOS,
  Linux, temporary, home-relative, `$HOME`, Windows paths, this machine's home
  and the project checkout; then a fixed reply posts;
- no caller identity, an unbound slot and a worker binding are refused (403);
- closed and lost sessions remove the label; a new body snapshot opens a new
  response; a withdrawn issue removes its label;
- a respond rule without a responding label is refused; any label name works;
- the responder agent's exact tool list.

`kirocrew-app-package.test.mjs` also checks that the packaged MCP server lists
`plans_post_reply`.

`npm test`: 778 of 778 passed. `git diff --check` clean. `npm test` rebuilds the
app package (`pretest` runs `build`).

## Live check

Against the private test repository `mtdowling/avoozl-e2e-code-20261111`, issue
#15, using the real GitHub client and `gh` as mtdowling:

| Step | Result |
| --- | --- |
| `github.sync` | issue 15 matched rule `ask`, action `respond`, authorized |
| tick | one `avoozl-responder` dispatch in `Avoozl/code`; label `kc43-answering` added |
| 5 bad replies (token, fenced token, `/Users/<name>/...`, `~/...`, URL with password) | each 422, 0 comments, label kept |
| clean reply | posted (issuecomment-6824884210), label removed |
| second reply | 409 |
| next tick | no dispatch, labels unchanged |

The issue was closed after the check.

## Not covered

- The tick does not run issue intake (`github.sync`) itself; a respond issue is
  answered once a sync records its match. Intake on the tick belongs to the
  intake tasks.
- No real Kiro Crew session ran the responder agent here; the session was bound
  by hand. The script cron path is the same one workers and verifiers use.
- A repository with no local checkout or no responding label gets no responder,
  silently.
