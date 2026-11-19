---
repo: avoozl
---
# Tasks: GitHub sign-in from a plugin

Explicit `after` lists and each task's `after` fact govern execution; phase
numbers alone do not impose a dependency. Requirement numbers are in
brackets (`PC1` to `PC13`, in `requirements.md`); `D` sections refer to
this spec's `design.md`, `R` numbers to `.kiro/specs/avoozl/requirements.md`.

Phase 1 adds the part, the built-in providers, the job table and the
client that asks per job. Phase 2 adds the confirm for high-risk jobs.
Phase 3 moves Avoozl's own git calls to the helper. Phase 4 splits the
person's login from the token's, counts per login, shows it and documents
it. `pc-p1` proves the whole path against a fake GitHub.

Rules for every task: work in a task worktree; tests use isolated temporary
workspaces, real git with a bare remote, a fake GitHub over a fake `fetch`
or on `127.0.0.1`, and only fake plugins kept in the test tree (R34.11); no
real workspace data, machine configuration, credentials or personal plans
in the repository (AGENTS.md); never force push any branch. Public files
name no company-internal tool (R34.10); examples use neutral names such as
`acme-github` and `acme-bot[bot]`. No token appears in a fixture except a
fake one the test made. Screen changes need phone and desktop, light and
dark screenshots for owner approval before merge (R92.12); screenshots are
shown to the owner and never committed (AGENTS.md).

Approval lives in Avoozl, not in these files. Approving the spec, creating
issues and starting agents are separate acts. Task IDs start with `pc-` so
they never collide with the IDs of the other specs.

## Phase 1: Providers, jobs and the client

- [ ] pc-1.1 The credentials part and its reply [PC1.1 to PC1.6, PC2.2, PC11.3] (§D1, §D3, §D5)
  - $done: Tests: D1's manifest validates and `inspectPlugin` carries `credentials.hosts`; `credentials` without `provides: credentials`, an entry outside the folder or with `..`, an empty or duplicate host, an uppercase host, 11 hosts, an empty `owners`, a duplicate owner (in any case), 101 owners and an unknown key are each refused naming the key; a credentials plugin declared in `.avoozl.json` is `invalid` with a reason naming `.avoozl.json plugins.0`, cannot be approved, is reported by `avoozl check` with that file and key, and Add plugin refuses the repository scope for it; the child's `hello` loads the credentials entry for kind `credentials` only, in a child apart from the plugin's intake child; `credentialsReplies.token` accepts D5's good reply and refuses a token with a space or line break, one of 8,193 characters, an `expiresAt` 30 seconds or 25 hours away, a login with a space, `person` with `[bot]`, an unknown key, and a `granted` narrower than asked (naming the missing permission); `"all"` and broader replies come back marked `broader`; the existing plugin tests pass unchanged.
  - `PARTS` and `PART_KIND` gain `credentials`; `validateManifest` checks the key; `plugin-child.mjs` lists the kind; `plugin-contract.mjs` gains `credentialsReplies` and routes it in `checkReply`.
- [ ] pc-1.2 Choosing a provider per owner; `gh` and `env` built in, after pc-1.1 [PC1.7, PC2.1, PC2.4 to PC2.7, PC3, PC7.2, PC11.1, PC11.6] (§D3, §D4)
  - $done: Tests with fake plugins and a fake `gh` on `PATH`: with no plugin, `AVOOZL_GITHUB_TOKEN` set picks `env` and unset picks `gh`, which is run as `gh auth token --hostname github.com` and never blocks the event loop; `GH_TOKEN` alone is not read by Avoozl; a missing `gh` refuses with PC3.5's text; an approved claiming plugin wins over both; with `owners: ["acme"]` it serves `acme/api` and `octo/tools` uses `gh`; a never-approved one claims nothing; a changed one refuses every call for its owners and `gh` is never run for them, while an unlisted owner still uses `gh`; two approved claims on one owner refuse with the clash until `credentialsPick` names one, two plugins with disjoint `owners` do not clash, and a pick of a removed plugin is dropped; removing or disabling the only claim, or approving a version that drops an owner, moves the next call for those owners to the built-in; the credentials child outlives a tick session, is restarted after a crash at most once a minute, and is stopped when its local folder's hash changes; `localToken` no longer exists (a test greps for it).
  - $after: pc-1.1
  - `src/app/github/github-credentials.mjs`: `chooseProvider(host, options)`, the `gh` and `env` providers, `credentialHost`; `PluginProcess` exported from `plugins.mjs`; `credentialsPick` read and written in `readPluginSettings` / `writePluginSettings`.
- [ ] pc-1.3 The job table and the method guard [PC4] (§D6)
  - $done: `JOBS` holds D6's rows with `risk`; each permission name marked A in D6 is checked against GitHub's "Permissions required for GitHub Apps" page and the check's date and result are written beside the table in a comment; tests: a call outside `withJob` throws before any token call, naming the method; a job lacking a method's permission throws naming method, job and permission; every operation entry has a `github` field that is `null` or a job in `JOBS`; every tick step passed to `under()` names one; every job in `JOBS` is named at least once; a range touching `.github/workflows/` lands as `land-workflows` and any other as `land`; every existing GitHub suite that uses a fake `fetch` passes with the guard on.
  - `src/app/github/github-jobs.mjs`: `JOBS`, `METHOD_NEEDS`, `withJob`, `currentJob`; the `github` field on every entry in `src/app/ops/`; `withJob` beside `withSource` in the dispatcher and in `under()`; the app backend's queues wrap their runners.
- [ ] pc-1.4 The client asks per job; the token cache; failure, after pc-1.2, pc-1.3 [PC5, PC7, PC11.4, PC11.5, PC11.7] (§D8, §D10)
  - $done: Tests with a fake `fetch` and a recording fake provider: two calls of one job on one repository make one provider call; two jobs with the same permission set share it; another repository or permission set makes a new call; a token is reused until 5 minutes before `expiresAt`, and a `null` expiry for one hour; concurrent misses on one key make one call; a 401 drops the key, asks once more and retries once, and a second 401 fails; a token minted for `acme/api` is never sent on an `acme/web` call; a refusal, a timeout and a bad reply each fail the call with status 503 and one Needs you item per provider, host and job that clears on the next success, and no other provider is called; the reason is redacted (a held token and a `ghp_` value become `[redacted]`) and cut to 500 characters; the token is in no store row, log line, Activity row, error or child environment (a test searches each for the fake token); `http` is refused for a non-loopback host; Settings data marks a `broader` job.
  - $after: pc-1.2, pc-1.3
  - `GitHubClient({credentials})`; `token`, `discoverToken`, `gitHeader` and `github.token` removed; `fixedCredentials` helper in the test tree replaces `token:` in tests; `available()` and asynchronous `signedIn()` per D3.

## Phase 2: High-risk jobs ask first

- [ ] pc-2.1 Grants and the confirm, after pc-1.4 [PC13.1, PC13.2, PC13.4 to PC13.7, PC13.9, PC8.4] (§D7)
  - $done: Tests: every `high` job without a grant fails as person-only before a token call, with `gh`, `env` and a plugin provider alike; every `low` job runs without one; `github.job.confirm` is refused over MCP and for an app token; a grant serves one step once and expires after 10 minutes; a `permissionsHash` that no longer matches `JOBS` or the target is refused; Cancel writes nothing (the fake GitHub records no write) and the next step still runs; the CLI asks `Allow? [y/N]` on a terminal, takes `--yes`, refuses without a terminal and without `--yes`, and refuses `--yes` when the agent markers are set; the modal shows repository, action and each permission (UI test from a fixture preview); the tick path to every `high` job fails as person-only.
  - $after: pc-1.4
  - `github.job.confirm` in `src/app/ops/github.mjs` with `person` policy; grants in `github-jobs.mjs`; the confirm modal on the shared `Modal`; the CLI prompt shared by setup commands.
- [ ] pc-2.2 Setup flows name their jobs; refusals list the manual steps, after pc-2.1 [PC4.1, PC13.3, PC13.8, PC13.9] (§D6, §D7)
  - $done: Tests: every write in a Set up GitHub, landing setup and triage setup preview names a `high` job and its permissions, and the existing confirm lists them with no second popup; a provider refusing `landing-setup` skips that write, shows the reason and a manual list (the ruleset to add, or the permission to grant), and setup still applies its other writes; `createIssue` in a `low` job creates no label and a missing label opens one Needs you item whose **Create labels** runs `repo-setup` through the confirm; a settled grant's branch is deleted from the tick as `own-branch-delete` with no confirm; that job refuses a branch outside the grant prefix and one whose head is not the commit Avoozl pushed, and such a branch is listed in Needs you with **Delete branches**, which deletes it as `branch-delete` after one confirm.
  - $after: pc-2.1
  - Write descriptions in `github-setup.mjs`, `setup-landing.mjs` and the triage setup flow gain `job` and `permissions`; `ensureLabel` leaves `createIssue`; `worker-release.mjs` deletes through `own-branch-delete`.

## Phase 3: Git

- [ ] pc-3.1 One network git function and the helper, after pc-1.4 [PC6] (§D9)
  - $done: Tests with real git and a fake smart-HTTP remote on `127.0.0.1` that checks Basic auth: a push and a fetch through `remoteGit` authenticate with the provider's token for that repository, owner and job, and a repository of an owner the plugin does not list authenticates with `gh`'s; an `origin` written `git@<host>:owner/name.git` is rewritten for that command and its remote-tracking ref updates; the helper answers nothing and fails for another `path`, another host, `http` to a non-loopback host, and with agent markers set; `store` and `erase` do nothing; a pre-push hook and the git process's environment hold no token (the hook writes its environment to a file the test searches); `sandboxEnv`, `checkEnvironment` and `withoutPushCredentials` output holds no `AVOOZL_CREDENTIAL_` helper or token; a scan finds no `push`, `fetch`, `ls-remote` or `clone` git call in `src/app` outside `remoteGit` and `plugin-git.mjs`; `repo-files` no longer builds a header, and nothing in `src/app` names `gh auth git-credential`; the helper refuses a high job.
  - $after: pc-1.4
  - `remoteGit` in `git.mjs`; the `credential` command entry in `src/app/commands/machine.mjs`; every row of D9's table but `plugin-git.mjs` and the mirror rows calls `remoteGit`. The mirror modules are not changed here: `spec/drop-mirror` deletes them, and until it lands the scan names them as exempt.

## Phase 4: Who, how much, and where it shows

- [ ] pc-4.1 The token login and the person login, after pc-1.4 [PC10] (§D12)
  - $done: Tests: with a plugin, `currentUser()` returns the reply's `login` with no `GET /user`; `personLogin()` returns `person`; each place in D12's first table uses `personLogin()` and, with no `person`, waits with one Needs you item; the spec issue's assignee and driver claim use `person`; with `gh`, both are the `GET /user` login; a `login` equal to the person's own login changes no approval or grant decision; a commit Avoozl makes and pushes with a plugin token has the author and committer of the person's git config, whatever `login` and `person` say, and an approval commit counts by its author email as before.
  - $after: pc-1.4
  - `personLogin()` on `GitHubClient`; the callers in D12's first table.
- [ ] pc-4.2 Counting and pacing per login, after pc-1.4 [PC9.1 to PC9.3, PC9.6] (§D11)
  - $done: Tests: a primary limit seen on `acme-bot[bot]` holds its calls and not `mtdowling`'s; pacer windows count one login's writes; a new token for the same login hits the response cache; the `githubRate` meta keeps per-login entries, merged across processes as today; each new token writes one Activity row with provider, host, job, repository, login, `granted` and `expiresAt` and no token.
  - $after: pc-1.4
  - `RateState`, `WritePacer` and `ResponseCache.owner` keyed by login.
- [ ] pc-4.3 Settings and the pick, after pc-1.2, pc-2.1, pc-4.2 [PC2.3, PC2.5, PC2.6, PC8.1 to PC8.3, PC9.4, PC9.5] (§D3, §D11)
  - $done: UI tests from fixtures: Settings › Plugins, the approval view and Add plugin show "acme-github will sign Avoozl in to github.com for acme, acme-labs" and that every GitHub call there uses its tokens; the clash item shows **Use this one** per plugin and `plugin.credentials.pick` is refused over MCP and for an app token; Settings › GitHub shows D11's two sign-in lines, one per owner group, the token's remaining life, **broader than asked** jobs, and a login column in the calls table; `avoozl plugin credentials pick` works from the CLI; screenshots at 390 and 1280 px, light and dark, go to the owner.
  - $after: pc-1.2, pc-2.1, pc-4.2
  - `plugin.credentials.pick` in `src/app/ops/plugins.mjs` `writes`; `github.settings.get` sign-in fields; `PluginsSettings.tsx`, `AddPlugin.tsx`, `SettingsView.tsx`.
- [ ] pc-4.4 Docs and the plugin skill, after pc-2.2, pc-3.1, pc-4.1, pc-4.3 [PC12] (§D1, §D6, §D7, §D9)
  - $done: `docs/plugins.md` has a Credentials part section with D1's manifest and `token.mjs`, the call and reply, the job table with risk, the confirm, failure without fallback, and PC6.7's speed-bump note; `docs/github.md` says how Avoozl signs in (per owner: a claiming plugin, else `env`, else `gh`), that a credentials plugin is declared only in `plugins.json`, that writes show the token login, and that commits keep the person's git author and committer; `docs/checks.md` and `docs/person-only.md` name the helper's limits; the `avoozl-plugin` skill names the part; the release leak scan passes on the new docs and fixtures; `node scripts/check/spec-lint.mjs` reports 0 errors.
  - $after: pc-2.2, pc-3.1, pc-4.1, pc-4.3

- [ ] pc-p1 Proof: per-job tokens, a refusal and a push through the helper, after pc-2.2, pc-3.1, pc-4.1, pc-4.3 [PC1 to PC13] (§D3, §D6, §D7, §D9, §D10)
  - $done: Expected result observed; receipt under `docs/evidence/`, with no image committed.
  - $manual: true
  - $after: pc-2.2, pc-3.1, pc-4.1, pc-4.3
  - Setup: an isolated workspace and a throwaway Avoozl home; a fake GitHub the proof script starts on `127.0.0.1`, serving the REST and GraphQL calls a spec, a landing and triage make for two private repositories, `acme/api` and `octo/tools`, plus smart-HTTP git for their bare remotes through `git http-backend`. It mints installation-style tokens at `POST /app/installations/1/access_tokens` with the asked `repositories` and `permissions`, enforces each token's permissions on every endpoint and git push, and logs every request with its token id, permission set and job header. `GITHUB_API_URL` and `AVOOZL_GIT_URL` point at it. A local-folder plugin `acme-github` from the proof's fixtures claims the fake host with `owners: ["acme"]`, mints through the fake GitHub, returns `login: "acme-bot[bot]"` and `person: "acme-dev"`, and throws for `purpose: "triage"`. A fake `gh` first on `PATH` logs any run and prints a token the fake GitHub accepts only for `octo/tools`. Both repositories land `direct`, and `acme/api`'s checkout's `origin` is written in the SSH form. The plugin is added in this machine's `plugins.json` and approved in Settings; a copy of its entry is also put in the workspace's `.avoozl.json` under another id.
  - Action: (1) approve a two-task spec on `acme/api` and a one-task spec on `octo/tools`, and run the tick until all three tasks land; (2) turn triage on for `acme/api` and run the tick over one new issue; (3) run landing setup and press Allow; run it again and press Cancel; (4) edit the plugin's `token.mjs` and run one more tick; (5) approve it again, add a second claiming copy `acme-github-two`, run one tick, then pick `acme-github`; (6) remove both plugins, set `AVOOZL_GITHUB_TOKEN` to a token the fake GitHub accepts, and run one tick.
  - Expected: (1) the `.avoozl.json` copy shows as invalid naming `.avoozl.json plugins.0` and claims nothing; the fake GitHub's log shows separate token requests for `check-in`, `spec-issues` and `land` with D6's permission sets, each token used only on `acme/api`, and the landing push authenticated through the helper over the rewritten https URL; `octo/tools` is read and landed with `gh`'s token, and the fake `gh` log shows runs only for it; every commit on both remotes has the person's git author and committer; the pre-push hook's environment file and every worker environment hold no token; Settings shows "acme: signed in through acme-github as acme-bot[bot] (per-job permissions)" with a remaining life and "everything else: signed in with gh"; (2) triage writes nothing on `acme/api`, one Needs you item names `acme-github`'s reason, and the fake `gh` log shows no run for `acme`; other work goes on; (3) the modal names `acme/api`, the action and `administration: write`, and Allow writes the ruleset; Cancel writes nothing and setup shows the step skipped; (4) every GitHub call for `acme` refuses with "approve acme-github again" and the fake `gh` log shows no run for `acme`, while `octo/tools` still reads with `gh`; (5) the clash item appears with **Use this one**, no GitHub call is made until the pick, and work resumes after it; (6) Settings shows "Signed in with env" and full access, and the tick reads and lands with that token.
  - Failure means: any call goes out without a job, a token reaches another repository, a worker, a hook or a store, the fake `gh` runs for an owner a plugin claims, the `.avoozl.json` copy claims anything, a commit's author or committer differs from git config, a high-risk write happens without Allow, or a refusal records work as done.
  - Next decision: whether `person` is enough for driver claims on a real organization's app (D15, decision 1).
