# Runbook: live GitHub proofs on a scratch organization

This runbook covers the open live GitHub proofs in
`.kiro/specs/avoozl/tasks.md`: P7, P8, P10, P11, P13, P16, P17, P18, P24,
P25, P54 and P67. It says which proofs still run, what each live one needs
on GitHub, what only the owner can do, and the rules every run follows.

Checked against `origin/main` at `f8464140` on 2026-11-17.

## Verdicts

| Proof | Verdict | Why |
|---|---|---|
| P7 label intake | live | Label rules are not part of task-issue projection; `syncGitHubIssues` runs in `intakeStep` |
| P8 projection | superseded | Per-task issue projection |
| P10 managed-field conflicts | superseded | Conflicts on projected task issues and Project fields |
| P11 exact PR completion | superseded | Task completion by issue close and linked-branch close |
| P13 automatic merge, plans-repo half | superseded | Needs P17; closes a task issue through a linked branch |
| P16 Project sync | superseded | Per-task Project sync |
| P17 plans-repo, one org | superseded | Plans-repo task issues, linked branches, Project status |
| P18 plans-repo, two orgs | superseded | The same, across two orgs |
| P24 Set up GitHub wizard | superseded | Creates task labels, a Project and `Epic`, which the Phase 56 model does not use; the new setup (42.2, 42.7) was proved by P52 |
| P25 linked-branch close in an org | superseded | Linked-branch close of a private task issue |
| P54 links and landing queue | live | 44.1–44.6 are merged (#492–#496) |
| P67 fork source and upstream permissions | live | Prerequisites P66, 42.1, 42.2, 56.9 and 56.10 are checked |

The retiring text is the Phase 56 intro ("No record branch, task issues or
GitHub Project task state"), R102.20, §4.32 and §4.32.13, and 45.4 ("Remove
per-task projection, Project sync, issue close/completion/rebuild"). Each
superseded proof's `- Open:` line in `tasks.md` now says so. Its box stays
unchecked.

### The superseded code still runs

The superseded proofs are skipped by rule, not because their code is gone.
On `origin/main`:

- 45.4 is unchecked. It waits on P53, P54 and P66.
- `githubStep`, `intakeStep` and `projectStep` in `src/app/tick.mjs` still
  call these on every cron tick:
  - `reconcileGitHubCompletion`
  - `refreshProjectedReadiness`
  - `ensureLinkedBranches`
  - `syncGitHubIssues`
  - `syncProject`
- Retirement is opt-in per workspace. 56.5's `task-issue-retirement.mjs`
  holds ticks (`ticksHeld`). Once a workspace is retired, projection
  refuses (`taskIssuesRetired` in `github-projection.mjs`). A fresh scratch
  workspace is not retired.
- Since 56.13 (R103.4), `RADAR_HANDOVER.paused` is true. So
  `issueRadarAdapter.handOver` adds no ready label, and single-repo leaves
  go to a worker on a linked branch (`github-plans-repo.mjs:42`).

These proofs would test live code until 45.4 lands, but their results stop
mattering after it does.

## What the org allows

Read-only checks of `avoozl-scratch` on 2026-11-18:

| Check | Result |
|---|---|
| Plan | `free` |
| Base permission | `read`: every member can read every repo, private ones too |
| Issue types | `Task`, `Bug`, `Feature`; no `Epic` |
| Projects | 0; free orgs can make Projects |
| Repos | `p54-code`, `p54-code-fork` (P54's chat) |
| Forks inside one org | Work: `p54-code-fork` is a fork of `p54-code` (`fork: true`) |
| Rulesets on private repos | Not on Free ([GitHub docs](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository)) |

So every repo that needs a required check is public, and private repos hold
only plans. Forks stay in `avoozl-scratch` with a `-fork` suffix. No second
org is needed.

A "CI check" below means one small workflow, `.github/workflows/check.yml`,
with one job named `check`. The script pushes it using the `workflow`
scope.

## Second account

The second account is `avoozlbot`. The owner signed it in with
`GH_CONFIG_DIR=~/.config/gh-avoozl-test`.

- It is **not** a member of `avoozl-scratch`.
- It gets repo access only through a repo collaborator invite. The script
  sends the invite as `mtdowling`, then accepts it as `avoozlbot`:

  ```fish
  env GH_CONFIG_DIR=$HOME/.config/gh-avoozl-test gh api -X PATCH user/repository_invitations/ID
  ```

- Every `avoozlbot` call sets `GH_CONFIG_DIR` like that.
- Never make it the default login. Never print, copy or log its token.

## Live proofs

| Proof | Scratch repos | Repo settings | Org needs | gh scopes (mtdowling) | avoozlbot | Test Kiro Crew home | Owner-only steps |
|---|---|---|---|---|---|---|---|
| P7 label intake [R10, R11, R27.1] | `avoozl-scratch/p07-label-intake` (public) | Issues on; labels: two trigger, one pause, one respond, managed | none | repo | Collaborator with **triage**, not in `allowedActors` (the disallowed account) | Yes. The `respond` rule opens a responder session | none |
| P54 links and landing queue [R92, R102.7, R102.12] | Its chat uses `p54-code` and `p54-code-fork` (public). It adds a second target and a private spec home as the proof needs. A scratch Radar-style issue goes in a target (no Radar crew) | Targets: CI check required, squash allowed (landing `pr`) | none | repo, workflow | none | Yes. Screenshots at 390 and 1280 px, light and dark, by headless browser | Approve the screenshots |
| P67 fork source and upstream permissions [R102.7, R102.8, R102.12, R102.19, R102.21] | `p67-upstream` (public); `p67-upstream-fork`; `p67-spec-public` (public); `p67-spec-private` (private); `p67-mirror` (private) | Upstream: CI check required, one approving review required, squash allowed | none | repo, workflow (maintainer) | The **contributor**: collaborator with **write** on `p67-upstream-fork` only. Upstream is public, so it can read but not push or merge there | No (process executor) | Merge the upstream PR in the browser as maintainer. Run the person-only `avoozl spec export-issues SPEC --confirm` twice |

P7 and P67 can run now, and P54's chat is already running.

## What the owner must do

1. Done: the org `avoozl-scratch` exists on the free plan, with `mtdowling`
   as admin.
2. Done: the `mtdowling` login has `project` and `admin:org`. The live
   proofs need only `repo` and `workflow`.
3. Done: `avoozlbot` is signed in at `~/.config/gh-avoozl-test`.
4. If a test Kiro Crew is needed (P7, P54), start it and sign in once, in
   your own terminal. On macOS a chat cannot do this:

   ```fish
   scripts/live-harness/harness.sh start
   scripts/live-harness/harness.sh signin
   ```

   See `docs/live-proof-harness.md`.
5. Approve the P54 screenshots.
6. For P67, merge the upstream PR as maintainer in the browser.
7. For P67, run the export command twice. The script prints the exact
   command.

## Rules for every proof run

- **Where to write.** Write only inside `avoozl-scratch`.
- **What never to touch.** Never change `mtdowling/*` repos or their
  settings. Never touch `nupp-lang` or any other org.
- **avoozlbot.** Use it only through its own `GH_CONFIG_DIR`.
- **Run once.** Each proof runs once. A failure is recorded in its receipt.
  It is not rerun until it passes.
- **Isolation.** Use isolated scratch workspaces (`avoozl init` in a temp
  folder) and test Kiro Crew homes from `scripts/live-harness`. Never tick a
  real workspace. Never use the real Kiro Crew.
- **Harness flags.** Use no permission-skipping harness flags
  (`bypassPermissions`, `danger-full-access`, `--dangerously-*`).
- **Pushes.** Never force push. Always push a named branch to a named
  remote.
- **Polling.** Check GitHub at most every 10 minutes, with one batched query
  (one `gh api graphql` or one `gh pr list --search`) for all repos in the
  proof.
- **Person-only steps.** A person-only step (export, takeover, reanchor,
  resume, a maintainer merge) does not count as done when an agent runs it
  with the owner's login. The script stops and names the exact command for
  the owner.
- **Receipts.** Write each receipt as a new file under `docs/evidence/`.
  Never edit an existing receipt or `docs/research/`. Tick a proof in
  `tasks.md` only from its live receipt, never from tests or fakes.
- **Cleanup.** Deleting scratch repos, Projects or the org is a separate
  step that the owner approves.
