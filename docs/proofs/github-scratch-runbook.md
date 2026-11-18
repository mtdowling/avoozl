# Runbook: live GitHub proofs on a scratch organization

This runbook covers the open live GitHub proofs in
`.kiro/specs/avoozl/tasks.md`: P7, P8, P10, P11, P13, P16, P17, P18, P24,
P25, P54 and P67. It says what each proof needs on GitHub, what only the
owner can do, and the rules every run follows. It does not run anything and
creates nothing on GitHub.

Checked against `origin/main` at `f8464140` on 2026-11-17.

## Verdicts

Every proof is **live**. None is superseded and none is blocked.

- **Retired in the plan but still running on main.** Phase 56, R102.20,
  45.4 and §4.32.14 plan to remove per-task projection, Project sync,
  issue close and completion, and linked-branch delivery. None of that
  removal has shipped. 45.4 is unchecked, and it waits on P53, P54 and P66.
  `githubStep`, `intakeStep` and `projectStep` in `src/app/tick.mjs` still
  call `reconcileGitHubCompletion`, `refreshProjectedReadiness`,
  `ensureLinkedBranches`, `syncGitHubIssues` and `syncProject` on every
  cron tick.
- **Retirement is opt-in per workspace.** The only switch is 56.5's
  `task-issue-retirement.mjs`. It holds ticks (`ticksHeld`), and once a
  workspace is retired, projection refuses (`taskIssuesRetired` in
  `github-projection.mjs`). A fresh scratch workspace is not retired, so it
  runs the old path.
- **What this means.** P7 to P25 prove code that is still live but slated
  for deletion in 45.4. Their results matter only until 45.4 lands. 42.2
  ("Do not create task labels, Project or issue types") covers the new
  `avoozl setup REPO` path. 42.7 keeps the old `github setup` wizard "as it
  is", so P24 still has a subject.
- **Ready label.** One partial change affects P8, P10 and P16: the ready
  label. Since 56.13 (R103.4), `RADAR_HANDOVER.paused` is true, which means
  `issueRadarAdapter.handOver` adds no ready label. In single-repo mode the
  default `issue-radar` coder's leaves now go to a worker on a linked branch
  (`github-plans-repo.mjs:42`). So when a proof's Expected says "the ready
  label only on the unblocked leaf", check `dispatch.ready` in the issue
  marker and the linked branch. Record the absent label as expected, not as
  a failure.
- **Phase 44.** 44.1 to 44.6 are all checked, so P54 is not blocked.
- **P67.** All of P67's prerequisites are checked: P66, 42.1, 42.2, 56.9
  and 56.10.

## Names

- Org A: `avoozl-scratch` (free plan, created by the owner).
- Org B: `avoozl-scratch-b` (free plan, created by the owner). Only P18
  needs it, because P18 runs across two orgs. Forks stay in org A with a
  `-fork` suffix: `avoozl-scratch/p54-code-fork` is a real fork of
  `avoozl-scratch/p54-code` (`fork: true`), so forking inside one org
  works.
- Second account: a new GitHub user the owner creates (suggested
  `mtdowling-test`). The script uses it only through its own
  `GH_CONFIG_DIR` (see the owner steps).
- On GitHub Free, rulesets and protected branches work only on public
  repos ([GitHub docs](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository)).
  So every repo that needs a required check is public. Private repos hold
  only plans.
- A "CI check" below means one small workflow, `.github/workflows/check.yml`,
  with one job named `check`. The script pushes it with the `workflow` scope.

## What the org allows

Read-only checks of `avoozl-scratch` on 2026-11-18:

| Check | Result |
|---|---|
| Plan | `free` |
| Base permission | `read`: every member can read every repo, private ones too |
| Issue types | `Task`, `Bug`, `Feature`; no `Epic` yet |
| Projects | 0; free orgs can make Projects |
| Repos | `p54-code`, `p54-code-fork` (P54's chat) |
| Rulesets on private repos | Not on Free ([GitHub docs](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository)) |

So P25's "no access to the planning repo" needs the base permission set to
`none` first. P25's script does that with `admin:org`. P24's first run
must not find `Epic`, so nothing creates it before P24.

## Per proof

| Proof | Verdict and reason | Scratch repos | Repo settings | Org needs | gh scopes (mtdowling) | Second account / org B | Test Kiro Crew home | Owner-only steps |
|---|---|---|---|---|---|---|---|---|
| P7 label intake [R10, R11, R27.1] | live. `syncGitHubIssues` runs in `intakeStep` whenever a repo has rules. 56.8's new intake is added alongside it and replaces nothing. | `avoozl-scratch/p07-label-intake` (public) | Issues on; five labels: two trigger, one pause, one respond, managed | none | repo | Second account with **triage** on the repo, not in `allowedActors` | Yes. The `respond` rule opens a responder session | none |
| P8 projection [R13] | live. `refreshProjectedReadiness` runs in `githubStep`. Read the ready-label check as `dispatch.ready` (see Ready label above) | `avoozl-scratch/p08-projection` (public, spec folder inside) | Issues on | `Epic` issue type (made in P24) | repo, read:org | none | No (CLI) | none |
| P10 managed-field conflicts [R15] | live. The conflict paths in `github-projection.mjs` and `syncProject` still run | reuses `p08-projection` | as P8 | Project `P10 conflicts` with Status (Todo, In progress, Done, Deferred) and Release; Auto-close issue on | repo, project | none | Yes, to resolve in the Conflicts view by headless browser | Set the Project's built-in workflows in the browser |
| P11 exact PR completion [R16, R33] | live. `reconcileGitHubCompletion`, `github-close.mjs` and `ensureLinkedBranches` still run | Single-repo run: `p11-single` (public). Plans-repo run: `p11-plans` (private), `p11-code` (public). Plus `p11-offbase` (public) for the non-default-base merge. Fork: `avoozl-scratch/p11-code-fork` | CI check required on default branch via a ruleset (the script turns it off for A's failing-check step, then on again); a second branch `release` in `p11-offbase`; auto-merge allowed | Project `P11 completion` with Auto-close issue on | repo, project, workflow | Second account with **write** on the p11 repos and Project write, not allowed by policy | Yes. G's worker session must be running | Set the built-in workflows in the browser |
| P13 automatic PR merge, plans-repo half [R18] | live. `plansRepoSteps` in `delivery.mjs` still tells the worker to turn on auto-merge. The single-repo half passed (`9f62a7a`). Runs inside P17's run | reuses P17 repos | as P17 | as P17 | as P17 | none | Yes (as P17) | none beyond P17 |
| P16 Project sync [R29, R31.3, R33] | live. `projectStep` runs `syncProject` whenever the policy names a Project | `p16-sync-a`, `p16-sync-b` (public) | Issues on; CI check required; auto-merge allowed | Project `P16 sync`: Status (Todo, In progress, Done, Deferred), Release, Wave (number), Iteration; recommended workflows, Auto-close issue on | repo, project, workflow; then one run with a login **without** `project` | Second account with **write** on both repos and Project write, not in policy | Yes. Kiro Crew notifications and Settings' "Project sync unavailable" | Set the built-in workflows; run the no-`project` step with a separate owner login (`GH_CONFIG_DIR` without `project`) |
| P17 plans-repo mode, one org [R28.6–R28.11, R31.2] | live. Plans-repo delivery (linked branch, leak screen, close through the linked branch) still runs | `p17-plans` (private), `p17-code` (public) | Code: CI check required, auto-merge allowed, squash allowed. Plans: issues on | Project `P17 plans`, recommended workflows | repo, project, workflow | none | Yes. Crew Mode runner worker sessions | Set the built-in workflows; start and sign in to the test harness |
| P18 plans-repo mode, two orgs [R28.10, R31.1] | live, for the same reasons as P17. The result settles design F39 | Org A: `p18-plans` (private) and Project. Org B: `avoozl-scratch-b/p18-code` (public), `avoozl-scratch-b/p18-deps` (public) | As P17 on `p18-code`; issues on in `p18-deps` | Project `P18 plans` in org A; mtdowling owns both orgs | repo, project, workflow, read:org | **Org B** | Yes (as P17) | Create org B; set the built-in workflows |
| P24 Set up GitHub wizard [R32, R33.6] | live. `github.setup` and `avoozl github setup` still exist (42.7 keeps them) | Org: `p24-code` (public, **issues off**). The wizard creates `p24-plans` (private). Second account: `<second>/p24-user` (public) with a spec folder (two milestones) and one label named like a managed label | As the Setup says; nothing set ahead of time | **Run first, on the fresh org**: no Project, no `Epic` type, no managed labels. A second Project from a built-in template (Status: Todo, In progress, Done only) with one item at In progress. Instead of nupp-lang Project #2, use one scratch Project with Auto-close on | T1: repo, read:org, project, admin:org | Second account as the user-account run, with T2 = its login with repo and read:org but **no** `project` | No (CLI) | Make the template Project in the browser; run the fix command `gh auth refresh -s project` on the second account's login |
| P25 linked-branch close and leak check [R31.5, R33.4] | live. `ensureLinkedBranches` and close-through-linked-branch completion still run | `p25-plans` (private, issues on), `p25-code` (public) | Code: ruleset on default branch with one required CI check, auto-merge allowed | Org base permission **No permission**, so the second member cannot read `p25-plans`; Project `P25 close`, recommended workflows | repo, project, workflow, admin:org (base permission to `none`) | Second account as an **org member** with **write** on `p25-code` only, watching `p25-code` with email on; it merges the second PR | No (gh and tick only) | Set the built-in workflows; second account accepts the invite; owner reads the second account's notification email |
| P54 links and landing queue [R92, R102.7, R102.12] | live. 44.1–44.6 are checked; nothing is unbuilt | `p54-target-a`, `p54-target-b` (public); `p54-plans` (private, for the private-spec case); fork `p54-target-a-fork`; a scratch Radar-style issue in `p54-target-a` (no Radar crew) | Targets: CI check required, squash allowed (landing `pr`) | none | repo, workflow | none | Yes. Screenshots at 390 and 1280 px, light and dark, by headless browser | Start and sign in to the test harness; approve the screenshots |
| P67 fork source and upstream permissions [R102.7, R102.8, R102.12, R102.19, R102.21] | live. Prerequisites P66, 42.1, 42.2, 56.9 and 56.10 are checked | `p67-upstream` (public), fork `p67-upstream-fork`, `p67-spec-public` (public), `p67-spec-private` (private), `p67-mirror` (private) | Upstream: CI check required, one approving review required, squash allowed | none | mtdowling: repo, workflow (the maintainer) | Second account as the **contributor**: write on the fork, **read only** on `p67-upstream` | No (process executor) | Merge the upstream PR in the browser as maintainer; run the person-only `avoozl spec export-issues SPEC --confirm` twice |

Order: P24's org runs first, because they need an org with no Project, no
`Epic` type and no managed labels. P8 needs the `Epic` type that P24
creates. Then P7, P8, P10, P11, P16, P25,
P17 with P13, P18, P54 and P67.

## What the owner must do

1. Done on 2026-11-18: the organization `avoozl-scratch` exists on the
   free plan, with `mtdowling` as admin.
2. Done on 2026-11-18: the `mtdowling` login has `project` and
   `admin:org`. On a new machine, add them in fish:

   ```fish
   gh auth refresh -h github.com -s project,admin:org
   ```

   `project` is for P10, P11, P16, P17, P18, P24 and P25. `admin:org` is for
   P24 (the `Epic` issue type) and P25 (org base permission).
3. Create a second GitHub account (suggested `mtdowling-test`) in the
   browser. Sign it in to its own gh config, so no token is ever pasted into
   a chat:

   ```fish
   env GH_CONFIG_DIR=$HOME/.config/gh-avoozl-second gh auth login -h github.com -p https -s repo,read:org,workflow
   ```

   Proof scripts run its calls with
   `GH_CONFIG_DIR=$HOME/.config/gh-avoozl-second`. Leave out `project` at
   first, because P24's T2 run needs a login without it. P24's fix step then
   adds it:
   `env GH_CONFIG_DIR=$HOME/.config/gh-avoozl-second gh auth refresh -h github.com -s project`.
4. Accept, as the second account, the invitations the scripts send to
   `avoozl-scratch`.
5. In the browser, create the second organization `avoozl-scratch-b` on the
   free plan. Only P18 needs it.
6. For P16's no-scope step, make a second `mtdowling` login without
   `project`:

   ```fish
   env GH_CONFIG_DIR=$HOME/.config/gh-avoozl-noproject gh auth login -h github.com -p https -s repo,read:org,workflow
   ```

7. When a proof's Project exists, set its built-in workflows in the browser
   from the wizard's checklist. There is no API for this.
8. On macOS, start the test Kiro Crew and sign in to it once, in your own
   terminal:

   ```fish
   scripts/live-harness/harness.sh start
   scripts/live-harness/harness.sh signin
   ```

   See `docs/live-proof-harness.md`.
9. Do the person-only steps the table names. These are: P24's template
   Project, P25's email check, P54's screenshot approval, and P67's
   maintainer merge and export commands.

## Rules for every proof run

- **Where to write.** Write only inside `avoozl-scratch` and
  `avoozl-scratch-b`, plus the second account's own `p24-user` repo for P24.
- **What never to touch.** Never change `mtdowling/*` repos or their
  settings. Never touch `nupp-lang` or any other org, and do not read
  `nupp-lang` Project #2 for P24.
- **Run once.** Each proof runs once. A failure is recorded as a failure in
  its receipt. It is not rerun until it passes.
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
- **Cleanup.** Deleting scratch repos, Projects or orgs is a separate step
  that the owner approves.
