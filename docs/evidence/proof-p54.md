# Proof P54: links and the landing queue on real GitHub

> Screenshots for this receipt were checked and are not kept in git.

Date: 2026-11-18, 04:40 to 08:30 UTC, on a Mac. Requirements R92, R102.7
and R102.12 (design §4.27). Tasks 44.1 to 44.6 (PRs #492 to #496).

**Verdict: pass, waiting for the owner's screenshot approval.** The live run
found five bugs. Each was fixed in its own PR and merged after Linux, macOS
and Windows passed. Then only the affected steps ran again. One item needs
the owner's decision: opening Home makes a Radar crew-strip read. It is not
part of the link views (see Call counts).

## Setup

Every repository is in the scratch organization `avoozl-scratch`:

| Repository | Visibility | Role |
| --- | --- | --- |
| `p54-code` | public | Target 1 (project `code`). Radar-coded (`coder: issue-radar`). Required check `build`. Landing `pr` |
| `p54-lib` | public | Target 2 (project `lib`). Required check `build`. Landing `pr` |
| `p54-code-fork` | public | A fork of `p54-code` inside the same organization. GitHub allows this through the fork API's `name` field. Registered as a repository |
| `p54-plans` | public | Public spec home |
| `p54-plans-private` | private | Private spec home |

- Both targets got their CI workflow from `avoozl setup … --checks build
  --landing pr --yes`. The workflow's `build` job fails when a file named
  `FAIL` exists. Setup wrote the ruleset, the merge methods and
  `AVOOZL_LANDING=pr`.
- The workspace was made with `avoozl init`. It was added to the catalog of
  a throwaway test Kiro Crew (its own home, loopback port, saved sign-in
  cookie, the test crew from P60). The test crew ran Avoozl `main`, updated
  in place after each fix. The real workspace and the real Kiro Crew home
  were not read or written. No real workspace was ticked. New dispatch was
  paused (`workspace concurrency 0`) except while claiming, so the test crew
  opened no chats.
- Person steps ran with `--as-person` in this throwaway workspace.
- Workers were driven by hand, as in P52. `avoozl claim`, a commit in the
  task worktree, then `avoozl report --kind done`. Each round ran one
  `workspace.tick` with `cron: true` and then `drainCheckRuns`.

**Radar-style issues → specs.** `avoozl-scratch/p54-code#1` and `#2` were
filed and labeled `avoozl:plan`. Both showed in Intake. Plan this
(`untriaged.plan`) was run on each. The planner chat was emulated: its spec
folder was written by hand. Then the tick imported each folder with the
issue as its source. Each spec was approved through an approval pull request
on `p54-code`, as approval works on a protected branch.

| Spec | From | Home | Tasks |
| --- | --- | --- | --- |
| `issue-avoozl-scratch-p54-code-1` "Greeting and version note" | `p54-code#1` | `p54-plans#1` (public) | `.1.1` greeting (code), `.1.2` version + `FAIL` (lib), `.1.3` fork.txt from the fork (code) |
| `issue-avoozl-scratch-p54-code-2` "Changelog entry" | `p54-code#2` | `p54-plans-private#1` (private) | `.1.1` CHANGELOG (code), `.1.2` NOTES (code) |

The workspace is single-repo mode, so both spec folders live in the public
`p54-code`. "Private" here means the spec's journal home and spec issue.

**The fork PR.** The tick lands only from a project's own repository. So the
fork portion went through Avoozl's own modules, the way a fork
contributor's work does (R102.7, R102.8). `pushHead` pushed the verified
commit to `p54-code-fork` (scanned, never forced). `enqueueLanding` queued it
with the fork as its source. Then `landNext` with `pullSteps` opened the PR
from the fork. Two more steps landed it, and `markLanded` recorded the merge,
as the tick does.

## Final state, from GitHub

| Item | Task | Result |
| --- | --- | --- |
| `p54-code` PR #7 | `…-1.1.1` | **landed**, head `5638b347`, merge `e9ea246e` |
| `p54-code` PR #9, head `p54-code-fork:avoozl/issue-avoozl-scratch-p54-code-1.1.3` | `…-1.1.3` | **landed from the fork**, head `5dd21268`, merge `15bd3d73` |
| `p54-code` PR #6 | `…-2.1.1` | landed, head `07b13fbc`, merge `7dd0c543` (before #555, readable names) |
| `p54-lib` PR #1 | `…-1.1.2` | **held**: `build` failed twice (heads `03003fa9`, `50971a8a`). Checks failed round 2, back with the worker, then Needs you |
| `p54-code` PR #12, branch `avoozl/t-1e3d7c505274af86ab40e4dd` | `…-2.1.2` | **held**: line stopped on repository `code`, head `6ce0c3b7` |

Target heads at the end: `p54-code` `8147a732`, `p54-lib` `ade1f65d` (the
held PR never merged), `p54-plans` `26291974`, `p54-plans-private`
`bad6962d`. Avoozl `main` for the screenshots: `a6faa856`.

## Expected, item by item

| Expected | Seen | Pass |
| --- | --- | --- |
| Every link reaches the right GitHub item | All 18 distinct GitHub URLs on the five surfaces were read back in one GraphQL query. Each reached the item it names. Examples: PR #9 is the merged PR whose head is `p54-code-fork:avoozl/…-1.1.3`. The fork task's branch link is that branch on the fork. Landed `15bd3d7` is the merge commit. The checks links are `pull/N/checks` | yes, after #555 and #563 |
| …in a new tab | All 116 GitHub anchors captured over the four variants has `target="_blank"` and `rel="noopener noreferrer"` (checked on the live DOM; the URLs were resolved by API, not by clicking through) | yes |
| Held items show the right reason | Landing queue: `p54-code → main`: "Line stopped: P54: held for review." with PR #12 and its opaque branch. `p54-lib → main`: "Checks failed round 2: back with the worker." with PR #1. Task details: "Failed on 50971a8 · 1 h ago" | yes |
| Opening and refreshing the views adds zero calls | The views alone add 0 calls: the Landing queue with Refresh pressed three times, both spec panels, the held task's Links and its Graph modal (807 → 807). See Call counts for Home | yes for the views. Home: owner decision |
| The Radar issue shows the spec link only when the spec is public | `p54-code#1`: the intake status comment says `Spec: avoozl-scratch/p54-plans#1`. The public journal's generation record says `Source: avoozl-scratch/p54-code#1`, so GitHub shows a cross-reference from `p54-plans#1`. `p54-code#2`: the status comment names no spec, and there is no cross-reference. The private journal's generation record carries no `sources` | yes, after #544 |
| No private spec reference, host name, username or path on a public surface | A scan of 78 public texts (issue titles, bodies and comments, branch names, commit messages) on `p54-code`, `p54-lib`, `p54-plans` and the fork. It looked for the private home, private issue references, instance IDs, home paths, this machine's username and host name, and internal domains. Hits were only the three approval write-backs made before #566 (`instance=`). The write-back made after #566 has none | yes, after #555 and #566 |
| Usable at 390 and 1280 px, light and dark | Screenshots below. Rows stack full width at 390. Chips fit | yes (see notes) |

## Bugs found and fixed

| PR | Merge | Found |
| --- | --- | --- |
| #530 | `06bd5336` | Plan this on a Radar-coded Intake issue failed with "avoozl-scratch/p54-code is not a registered repository". It passed the GitHub name, but Settings › Repositories gives a repository an id like `code` |
| #544 | `2371366e` | A spec with a **public** home could not be taken over: "Journal record has an invalid spec". Public journals require opaque spec and task IDs (§4.32.4), and nothing wrote them. Now `appendRecord` encodes them and replay maps them back. Live: `p54-plans#1` generation record has spec `2f9d6e34172778060ec0a6f8` |
| #555 | `5efc9172` | A private-home spec's task landed on the public target with a branch, PR title and trailer that named its readable task ID (PR #6). Now it goes by `avoozl/t-<24 hex>` (live: PR #12, `Land t-1e3d7c505274af86ab40e4dd`). The task's Links branch is now the branch that was pushed, so the fork task links the fork's branch. Before, it linked a branch name on the target that does not exist there |
| #563 | `6b10fdb3` | A failed or held PR portion kept no PR number on its queue entry. Its Links box, In flight chip and queue row showed the PR as none (live: `p54-lib#1`, fork PR #9). Rerun: round 2 of `…-1.1.2` now shows `p54-lib#1` everywhere |
| #566 | `e6888778` | The approval write-back on a public issue carried `instance=inst-…` (`p54-code#1`, `#2`). Rerun: a new approval of spec 1 wrote a marker with no instance |

Also found by the run and fixed in another chat's PR, not this proof's:
GitHub refused a same-organization fork PR with `head: owner:branch` and
`head_repo: name`. It needs the bare branch with `head_repo: owner/name`
(#554, merged before the fork step ran again).

## Call counts

Counts come from the workspace's own GitHub call record (`github-rate`).
`calls` is every request Avoozl made. `notModified` is the conditional ones
GitHub answered with 304. Each run's URLs come from the workspace's HTTP
cache.

| Window | calls | URLs |
| --- | --- | --- |
| No page open, 6 minutes | 720 → 720 | none |
| Views alone (above), page already open | 807 → 807 | none |
| Full screenshot run, 4 variants (pass 1) | 775 → 783 (all 8 were 304) | the 8 below |
| Full screenshot run, 4 variants (pass 2, over 2 min) | 783 → 799 (all 16 were 304) | the 8 below, twice |

Those 8 are Home's Issue Radar crew strip (`radar.crews`). For each
registered repository, it reads the issues labeled `crew: in progress` and
the Actions variables. It reads at most once every 2 minutes, conditionally.
The link sets, Landing queue, spec panel, task details and Graph modal made
none.

**Owner decision.** In flight sits on Home, so opening it also loads
Home's Radar strip. The strip predates 44.x and goes with the Radar removal
(Phase 45). Either accept it as outside P54, or keep Home from reading it
when no crew is connected.

## Screenshots

All shots are under `docs/evidence/proof-p54/`. They come from the test crew's full app shell, at
1280×900 and 390×844, light and dark. The red banner is the line stop that
holds PR #12. The home folder in the worktree path is shown as `~`: the path
shows only in the local app (R92.10), and these files are public.

| Surface | Files |
| --- | --- |
| In flight (Home) | `inflight-1280-light.png`, `inflight-1280-dark.png`, `inflight-390-light.png`, `inflight-390-dark.png` |
| Landing queue | `landing-1280-light.png`, `landing-1280-dark.png`, `landing-390-light.png`, `landing-390-dark.png` |
| Spec details, public home | `spec-public-1280-light.png`, `spec-public-1280-dark.png`, `spec-public-390-light.png`, `spec-public-390-dark.png` |
| Spec details, private home (local surface) | `spec-private-1280-light.png`, `spec-private-1280-dark.png`, `spec-private-390-light.png`, `spec-private-390-dark.png` |
| Held task's details › Links | `task-held-1280-light.png`, `task-held-1280-dark.png`, `task-held-390-light.png`, `task-held-390-dark.png` |
| Graph modal (same task) | `graph-1280-light.png`, `graph-1280-dark.png`, `graph-390-light.png`, `graph-390-dark.png` |
| Fork task's details › Links | `task-fork-1280-light.png` |

Owner screenshot approval: **approved** (relayed by the conductor, 2026-11-18).

Follow-up, 2026-11-18: the first `graph-390-*.png` were byte copies of
`task-held-390-*.png`. At 390 px the earlier task drawer was still open when
O was pressed, so no Graph modal opened. They were reshot from a fresh page:
the spec's Focus tree by its deep link, O on the `…-1.1.2` card, then the
Links tab. The Graph page was behind the drawer, and no drawer was open
before O. At 390 px the Graph opens the same task view as task details.

## Noted, not fixed

- **Task Files box.** In the `task-held-*` and earlier Graph shots, the
  task drawer's Files box still says "Reading the task's branch…". The shot
  was taken about 2 seconds after the Links tab opened, before that read
  came back. In the 390 Graph reshoot, taken later, the same box shows
  "2 files changed · +2 −0". No wrong state, but the box gives no sign of
  progress while it reads. Follow-up: show its age or a spinner, or have
  shots wait for it.
- **Spec panel layout.** In the spec panel's Links column at 1280, a
  two-digit PR number wraps one character per line (`#1` / `2`).
- **Driver label.** The spec header says "Driver: nobody" for both specs,
  though both were taken over (generations 1, drivers `f33567c1c6efa403`
  and `5b310052d69756ff`).
- **Landed tasks still show as running.** In flight and the spec's task
  list show the landed tasks as running. Their command-line claims were
  never closed (no real chat), so this may be an artifact of driving
  workers by hand.
- **Fork task check state.** The fork task's check state shows "not the
  current head". The task never had a delivery record, because its work was
  never reported done, so there is no current head to compare. The safe
  side of R92.3.
- **Approval PR needs the folder committed first.** The approval pull
  request writes only the prose files. A new spec whose folder was never
  committed (manifest included) merged a different revision. Its approval
  then failed for good, with "Reload the spec", until the spec text changed.
  Here the manifests were landed first by a normal PR.
- **Tasks waited for projection.** Tasks created in a GitHub-mode workspace
  default to GitHub authority and wait for a task issue. Task issues are
  retired, so this run set `github.defaultAuthority: "local"` and moved the
  four existing tasks to local authority in the scratch store.
- **The tick lands no fork portion.** Fork portions need the module path
  (`registryOf` names only the project's repository).
- **Retries finished cleanly.** Two GitHub hiccups (a 504 opening an
  approval PR, and GitHub search lag) were retried. Each retry finished with
  no duplicate write.
