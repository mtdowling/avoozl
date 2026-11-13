# Proof P29: crew placement with fake crews

Receipt for the Kiro Crew-native spec (`assess-avoozls-future-as-a`), Phase 11,
proof P29 (tasks.md; design §4.10, §8.3; R41, R42).

- Base: `kirocrew-native` at `112fe19` (Phase 11: `943d25e`, `83f96b2`,
  `ad5a8d9`, `8e94207`, `f51d641`, `112fe19`)
- Recorded: 2026-11-13, macOS
- Result: **pass** with fake crews; the live checks wait on Kiro Crew's MC-10

## What ran

Automated tests, `src/app/test/proof-p29.test.mjs` and
`src/app/test/handback.test.mjs`, with the test-only crew driver
`src/app/test/fixtures/crews/driver.mjs` and the shared workspace
`src/app/test/fixtures/crews/workspace.mjs`. No real crew, no real host, no
network.

- Workspace: a temporary directory with its own SQLite store, `.avoozl.json`
  (`delivery.concurrency: 10`), machine settings in a temporary
  `XDG_CONFIG_HOME`, and a sample repository `app` whose `origin` is
  `https://git.example.test/o/app.git`, rewritten by `insteadOf` to a local
  bare repository, so its host reads as `git.example.test`.
- Crews: `local` (`os:macos`, limit 2), `fake-linux` (`os:linux`,
  `trust:remote`, `gitHosts: ["git.example.test"]`, limit 2), `fake-windows`
  (`os:windows`, same host, limit 1). The driver records Kiro Crew's instance
  list, headroom readings with their age, the remote dispatch switch, MC-10,
  and an attach link pattern.
- Plan: a spec folder with leaves `c1` (label `compliance`), `t1` (type
  `test`, paths `src/win/**`), `w1`–`w4`, and `u1` (type `test`, label
  `needs-arm-linux`). `kinds` match the manifest `type`, because the
  manifest `kind` holds only epic, package, or leaf (design §4.10, changed
  2026-11-13).
- Remote sessions: a remote worker commits in its own clone and pushes its
  task branch to the bare remote (`push`), or leaves it in its folder for this
  machine to fetch over a fake ssh command (`handback`).

## Expected items

| # | Expected | Result |
|---|---|---|
| 1 | No `routing` key: every session on `local`, at most 2 at once | pass. Two workers open with no `crew`, agent `kirocrew-worker`, no model; the next tick opens none. |
| 2 | Preview opens nothing; `c1` local though its rule is last; `t1` on `fake-windows`; `w*` spread within limits; `u1` one no-fit decision naming every crew | pass. Preview writes no binding. Tick: `c1` local, `t1` `fake-windows`, two on `local`, two on `fake-linux`, one waits. Remote briefs name the clone URL and base commit, never the local checkout. Conflicts lists one `no-fit` item for `u1` naming all three crews and `arm-linux requires`; a second tick keeps one. Adding `arch:arm64` to `fake-linux` closes it by itself. |
| 3 | A stale `fake-windows` is unavailable and `t1`'s retry waits without a decision | pass. Reading 180 s old: no worker dispatch, no `no-fit` item, the Routing view says `stale reading`. Fresh again: attempt 2 opens on `fake-windows`. |
| 4 | The router's pick is ignored when rules forbid it and recorded when they allow it; silent and malformed models fall back | pass. One `avoozl-router` session on the owner's model, brief with the machine-local instructions, `w1` shows placing. A `fake-windows` pick under a Linux-only rule records `router: fallback (... which the rules do not allow)`; under `on: any` it runs there with `router: fake model says so`. No reply after 91 s: `fallback (no reply within 90 s)`. Malformed: `fallback (the reply was not a list ...)` on the next tick. |
| 5 | A base only on this machine keeps the task local with "work not fetchable" | pass. `fake-linux` removed with `work not fetchable (the base commit is only on this machine)`. |
| 6 | A crew id in the repository's settings is refused | pass. `projects.app.routing.rules[0].on` naming `fake-linux` makes the policy `invalid`, named in the error. |
| 7 | An unreachable crew keeps its binding and shows it; nothing re-places it; it reconciles first; Retry places afresh; a pushed branch integrates | pass. With `fake-linux` unreachable and its slot off the roster, the tick does not hold other work and opens nothing for `w2`; Delivery shows `crewUnreachable`. Back again, the roster lists it and the tick reconciles before dispatch. `w3`'s attempt 2 is placed afresh. `w2`'s pushed branch is fetched, its tip checked against the report, verified, and integrated; the remote commit is on `main`. A report naming a commit that was never pushed is refused in-call. |
| 8 | A `diff` content-rule set keeps sessions in that repository off remote crews | pass. Every worker local; `fake-linux` removed with `content rule set fake-diff forbids remote crews`. |
| 9 | Remote dispatch off: every session local | pass. Two on `local`, remote crews removed with `remote dispatch is off`. |
| 10 | `fake-linux` limit 1 and stale 60 s; cleared back to 2 and 120 s | pass. One session on `fake-linux`; a 70 s reading is stale. Sessions are refused the write. After clearing, the view shows limit 2 and `staleSeconds: null` (placeholder 120). |
| 11 | Router instructions in `.avoozl.json` are refused, naming the key | pass. `routing.router.instructions may live only in this machine's settings`. |
| 12 | A public remote changes nothing; the `diff` boundary checks a remote branch at `done` | pass. With `remote: "allow"` on `fake-diff` and the repository recorded public, `w1` runs on `fake-linux`; a pushed commit adding a fake term is refused at `done` in-call, the fixed commit is taken. |
| 13 | Attach opens a local chat and, through MC-10, a remote one | pass for the links. A local session links `/chat?sid=…`; a remote one links the MC-10 pattern from the driver (`/crews/fake-linux/chat?sid=…`). Without that pattern the page shows "Attach waits on Kiro Crew". Typing into a real chat was not run. |
| 14 | No MC-10: every session local, Preview still shows remote picks, the page says so | pass. Preview puts `t1` on `fake-windows`; the tick runs two on `local` and leaves `t1` waiting, since its rules do not allow `local`. The Routing view reports `mc10: false` and shows the waits-on-Kiro-Crew line. |

### Hand-back over SSH (R41.15, task 11.13)

`handback.test.mjs`: a `fake-linux` crew with `delivery: handback`, an
`sshHost` on a fake `.example.test` name, and a temporary `worktreeRoot`. The
brief names the folder and says not to push or write to GitHub. At `done`
the fake ssh command pins the host key (`accept-new`), the branch is fetched
and fast-forwarded, and the task integrates. With a changed key the next
fetch runs with `StrictHostKeyChecking=yes`, is refused, and the report
fails in-call. The bare remote has only `main`: nothing was pushed.

## Checks

| Check | Result |
|---|---|
| P29, P33, hand-back, placement, and routing settings tests | 32 of 32 pass |
| `npm test` (build, all tests) | 817 tests: 815 pass; the 2 failures (an MCP route and a release-scan placeholder) were fixed in `112fe19` and pass alone |
| UI tests (`kirocrew-app/ui`) | 265 pass, 0 fail |
| `git diff --check` | clean |

## Not covered

- No real remote crew. Kiro Crew's MC-10 (filed as kirodotdev/KiroCrew#36335)
  is not shipped, so the live part of 11.1 (`session_create` with `crew` from
  the cron and the app backend, with its refusal codes) did not run, and F78
  stays Inferred. Remote placement stays inert until it ships.
- The app backend does not yet read `GET /api/instances` or headroom: the app
  is not granted those routes. Only `local` appears on a real install.
- The MC-10 attach link pattern and `open_session(..., crew=)` are Inferred.
- A rule's `route` shows on the Routing page and in Preview; the tick still
  delivers by each task's own route.
- Checks and review sessions always run on this machine.
- Hand-back for a pull-request leaf (a local chat that pushes) is not built.
