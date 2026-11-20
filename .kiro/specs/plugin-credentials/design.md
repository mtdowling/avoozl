# Design: GitHub sign-in from a plugin

`PC` numbers are in this spec's `requirements.md`; `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`. Labels are as in the
requirements: **V** read in the file cited at `84d792aa`, **A** assumed.

## D1. The part in a manifest

```json [avoozl-plugin.json]
{
  "id": "acme-github",
  "version": "2.1.0",
  "contract": 1,
  "provides": [
    "credentials"
  ],
  "credentials": {
    "entry": "token.mjs",
    "hosts": [
      "github.com"
    ],
    "owners": [
      "acme",
      "acme-labs"
    ]
  }
}
```

With `owners`, this machine signs in through `acme-github` for
repositories and organizations owned by `acme` and `acme-labs`, and with
`env` or `gh` for every other owner. Without `owners` the plugin claims
every owner on `github.com`.

The plugin is declared in this machine's `plugins.json` only (PC2.2):

```json [plugins.json]
{
  "plugins": [
    {
      "id": "acme-github",
      "git": "https://git.example.com/acme/avoozl-plugins.git",
      "ref": "v2.1.0",
      "subdir": "acme-github",
      "contract": 1,
      "config": {
        "serviceUrl": "https://tokens.example.com/mint",
        "keyEnv": "ACME_TOKEN_KEY"
      }
    }
  ]
}
```

```js [token.mjs]
// A fake provider: asks the organization's token service for an app token
// scoped to one repository and the job's permissions, and refuses triage.
export const credentials = {
  async token({ repository, owner, permissions, purpose }, { config }) {
    if (purpose === "triage") throw Error("acme does not allow triage comments.");
    const reply = await fetch(config.serviceUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repository, owner, permissions, purpose }),
    }).then((r) => r.json());
    return {
      token: reply.token,
      expiresAt: reply.expires_at,
      login: "acme-bot[bot]",
      person: reply.person,
      granted: reply.permissions,
    };
  },
};
```

The plugin's `config` holds `serviceUrl` and, by
name, any environment variable the provider reads (`keyEnv`), as for every
plugin (V: `checkConfig` in `src/app/plugins/plugins.mjs`). A plugin may
also provide `intake` or `rules` from a top-level `entry`; the credentials
entry is its own module and runs in its own child (PC1.3).

Why a part-level `entry` and not the top-level one: today a plugin has one
child that loads one entry and serves every code kind it exports (V:
`hello` in `src/app/plugins/plugin-child.mjs`). A token must not sit in the
memory of a process that also runs an intake poll, whose code reads outside
data; a separate module and child keep them apart at no cost to other parts.

## D2. Where the code goes

| Module                                              | Change |
| --------------------------------------------------- | ------ |
| `src/app/plugins/plugins.mjs`                       | `PARTS` gains `credentials`; `validateManifest` checks the `credentials` key (PC1.2); `inspectPlugin` carries `credentials.hosts` and `owners`, and marks a repository-declared credentials plugin invalid (PC2.2); `checkAdd` refuses the repository scope for one; `PluginProcess` and `listeningSockets` exported for D4 |
| `src/app/plugins/plugin-child.mjs`                  | `hello` accepts kind `credentials`; `kinds` lists it |
| `src/app/plugins/plugin-contract.mjs`               | `credentialsReplies.token` (D5); `checkReply` routes kind `credentials` |
| `src/app/github/github-jobs.mjs` (new)              | The job table (D6), `withJob`, `currentJob`, the method permission table and the confirm grants (D7) |
| `src/app/github/github-credentials.mjs` (new)       | Provider choice per host (D3), the built-in `gh` and `env` providers, the credentials child host, the token cache (D8), redaction |
| `src/app/github/github.mjs`                         | `localToken`, `token`, `discoverToken` and `gitHeader` go; `GitHubClient` takes `credentials` and asks it per call (D8); `currentUser` and a new `personLogin` (D12) |
| `src/app/github/github-rate.mjs`, `github-pacer.mjs` | Keys by token login (D11) |
| `src/app/git/git.mjs`                               | `remoteGit(cwd, args, {repository, job, env})`, the one function for network git (D9) |
| `src/app/commands/machine.mjs`                      | One command entry, `credential`: the git helper (D9) |
| `src/app/ops/` (entries), `src/app/tick/tick.mjs`   | Each operation entry and tick step names its `github` job; `operations.mjs` and `under()` wrap the handler in `withJob` |
| `src/app/ops/plugins.mjs`                           | `plugin.credentials.pick`, person-only, in `writes` |
| `src/app/ops/github.mjs`                            | `github.job.confirm`, person-only (D7); `github.settings.get` returns the sign-in lines (D11) |
| Setup modules (`github-setup.mjs`, `setup-landing.mjs`, the triage setup flow) | Each write's description names its job and permissions (D7) |
| UI: `PluginsSettings.tsx`, `AddPlugin.tsx`, `SettingsView.tsx`, `Modal.tsx` users | The host and owners line (PC2.3), the pick, the sign-in line and per-login calls, the confirm modal |

No dependency is added. The credentials child is the plugin child already
used for intake and rules.

## D3. Choosing a provider for an owner

A host is the GitHub host Avoozl talks to: `github.com` when the API is
`https://api.github.com` (V: `GitHubClient` constructor), else the host of
`AVOOZL_GIT_URL` or `GITHUB_API_URL`, with its port when one is given. The
owner is the call's `owner` (PC1.4), compared without case.

For one host and owner, on each token call that misses the cache:

1. `claims` = plugins declared in this machine's `plugins.json` whose
   manifest lists the host in `credentials.hosts`, whose `owners` is absent
   or lists the owner, and that are `approved`, or were approved and are
   now `changed`, `missing` or broken (PC2.4). A plugin with no approval on
   this machine never claims. A credentials plugin declared in
   `.avoozl.json` is `invalid` (below) and never claims.
2. More than one claim: use the plugin `plugins.json` `credentialsPick`
   names for this host if it is one of the claims, else refuse every call
   for that owner with the clash (PC2.5). The Needs you item has **Use this
   one** per plugin, which runs `plugin.credentials.pick`.
3. One claim: that plugin. If it is not `approved`, refuse with its state's
   reason; never go on to step 4 (PC7.2).
4. No claim: `env` when `AVOOZL_GITHUB_TOKEN` is set and not blank, else
   `gh`.

So `acme-github` with `owners: ["acme", "acme-labs"]` serves
`acme/api` and refuses there when it fails, while `octo/tools` on the same
machine goes to step 4 and signs in with `gh`. An owner a plugin claims
never reaches step 4 (PC7.2). Disabling or removing a plugin, or
approving a version that drops an owner, removes those claims, so step 4
applies on the next call (PC2.7).

**Machine only (PC2.2).** `inspectPlugin` reads the manifest of every
declared plugin. For one from the `repository` source whose `provides`
lists `credentials`, it returns `state: "invalid"` with the reason
"`.avoozl.json plugins.<i>`: plugin `<id>` provides `credentials`; only
this machine's plugins.json may declare who Avoozl signs in as." Invalid
plugins are never approvable (V: `approvePlugin` needs a hash), Settings
shows the reason, and `avoozl check` reports it with the file and key.
`checkAdd` refuses `scope: "repository"` for a plugin whose preview
provides `credentials`.

`env` wins over `gh` as it does today (V:
`localToken`), so no setting is added. `GH_TOKEN` and `GITHUB_TOKEN` are no
longer read by Avoozl; `gh auth token` prints `GH_TOKEN` when it is set
(checked with `gh` 2.104.0 on 2026-11-19), so a machine with `gh` keeps
them working. A machine with neither `gh` nor `AVOOZL_GITHUB_TOKEN` is not
signed in.

`gh`: `gh auth token --hostname <host>`, run with `execFile`, 5-second
limit, asynchronous (today's `execFileSync` blocks the backend, V:
`localToken`). Login: one `GET /user` per new token. `env`: the variable,
trimmed; login the same way. Both reply `granted: "all"`,
`expiresAt: null`, and `person` equal to the login.

`available()` stays synchronous and means "a provider is chosen for this
host and owner" (step 4 always chooses one, so it is false only on a
clash). `signedIn()` becomes asynchronous and means "a `check-in` token
was obtained" (A: its caller `src/app/ops/github.mjs:86` can await).

## D4. The credentials child

`credentialHost` in `github-credentials.mjs` holds at most one child per
plugin for the life of the process: the app backend, a CLI command, the
tick or the supervisor. It reuses `PluginProcess`: the same spawn, minimal
environment (`childEnvironment`), 1 MB reply cap, listen guard and
listener check after every call (V: `src/app/plugins/plugins.mjs`). It is
not part of a tick's `pluginSession`, so the tick budget does not apply;
each call has the 20-second limit.

A local-folder plugin is hashed before each start (as R83.6) and again
before a cache-missing call when the last hash is over 10 minutes old. A
changed hash, a disable or a remove stops the child and drops its tokens
(PC11.6). A crash marks it broken for that call; the next call starts it
again, once per minute at most.

## D5. The call and the reply

Avoozl sends `credentials.token` with:

```json
{
  "repository": "acme/api",
  "owner": "acme",
  "permissions": {
    "metadata": "read",
    "contents": "write",
    "pull_requests": "write"
  },
  "purpose": "land"
}
```

`credentialsReplies.token(reply, asked)` in `plugin-contract.mjs` returns
the checked reply or throws `ContractError`:

| Field       | Rule |
| ----------- | ---- |
| `token`     | String, 1 to 8,192 characters, only `[A-Za-z0-9_.~+/=-]`. GitHub's newer installation tokens are longer than 40 characters (GitHub's installation token docs, read 2026-11-19), so no length is assumed beyond the cap. A line break or space would let a token add lines to git's credential reply (D9), so it is refused |
| `expiresAt` | `null`, or ISO time > now + 60 s and ≤ now + 24 h |
| `login`     | `^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$` |
| `person`    | Optional; the same rule without `[bot]` |
| `granted`   | `"all"`, or an object of GitHub permission names to `read` / `write` / `admin` |
| other keys  | Refused |

Then, against `asked`: a permission asked and not in `granted` at that
level or higher makes the reply a refusal ("acme-github granted
`contents: read`; `land` needs `contents: write`"). `"all"` or more than
asked is accepted and marked `broader` (PC11.5).

## D6. Jobs and their permissions

The job table is `JOBS` in `src/app/github/github-jobs.mjs`. The rows below
are derived from the GitHub client calls each module makes (V: a scan of
`src/app` for every `GitHubClient` method name, outside tests). Task
pc-1.3 checks each permission name against GitHub's "Permissions required
for GitHub Apps" page; names marked **A** were not checked here.

| Job               | Risk | Permissions | Used by (today's modules) |
| ----------------- | ---- | ----------- | ------------------------- |
| `check-in`        | low  | metadata, contents, issues, pull_requests: read | tick reads, `github-open-read`, `github-items`, `pull-request-snapshot`, `github-intake` reads, `repo-files`, `scm-links`, `git-approvals` reads, `spec-scheduler`, `integration-head`, `driver` reads, page views |
| `ci-receipts`     | low  | metadata, actions, checks, statuses: read | `check-reads`, `flow-ci`, `build-receipt-read` |
| `rules-read`      | low  | metadata, administration: read | `github-branch-rules`, `merge-path`, `github.repository.inspect` |
| `land`            | low  | metadata: read; contents, pull_requests: write; checks, statuses: read | `landing-pulls`, `pr-landing`, direct landing (`driver-generations`), `merge-batch`, `working-heads.pushHead` |
| `land-workflows`  | low  | `land` plus workflows: write | the same, when the range touches `.github/workflows/` (PC4.7) |
| `spec-branch`     | low  | metadata: read; contents, pull_requests, issues: write | `spec-approval`, `spec-ticks`, `git-approvals` push, `spec-pull-requests` |
| `spec-issues`     | low  | metadata: read; issues: write | `spec-publication`, `spec-journal`, `intake.createIssue`, `driver` claims and assignees, sub-issues, blockers, setting an issue's type |
| `evidence`        | low  | metadata, pull_requests: read; issues: write | `tasks/evidence` |
| `triage`          | low  | metadata, contents: read; issues, pull_requests: write | `triage`, `triage-reproduce` |
| `respond`         | low  | metadata: read; discussions, issues: write | `github-respond` |
| `page-actions`    | low  | metadata: read; issues, pull_requests: write | `github-pages` (a person's comment, label, assignee, review) |
| `integration`     | low  | metadata: read; contents: write | `integration-sync`, `integration-branch` |
| `worker-grants`   | low  | metadata: read; contents, issues: write | `worker-grants`, `remote-runner`, `working-heads` checkpoints |
| `workspace-publish` | low | metadata: read; contents, pull_requests: write | `workspace-repository` |
| `board-sync`      | low  | organization_projects: write (**A**), owner-level | Projects reads and writes in `github.mjs` |
| `repo-setup`      | high | metadata: read; administration, issues: write | `github-setup` (labels, repository checks) |
| `issue-types-setup` | high | organization_administration: write (**A**), owner-level | `github-setup` `create-issue-type` |
| `landing-setup`   | high | metadata: read; administration, statuses, variables (**A**): write | `setup-landing` (rulesets, repository settings, variables, the status probe) |
| `triage-setup`    | high | metadata: read; issues: write | the triage setup flow (creating its labels) |
| `own-branch-delete` | low | metadata: read; contents: write | `worker-release`: only a branch under Avoozl's grant prefix whose head is a commit Avoozl pushed (PC13.1) |
| `branch-delete`   | high | metadata: read; contents: write | any other branch delete |
| `comment-delete`  | high | metadata: read; issues: write | `deleteIssueComment` callers |

Rules the table follows:

- Reads use `read`; GitHub's `write` includes `read`, so a job that writes
  a permission does not list its read too.
- `metadata: read` is in every repository job, because GitHub gives every
  installation token it.
- Risk follows PC13.1 alone. `own-branch-delete` is its one low delete:
  the job's method checks, before the call, that the branch name has the
  grant prefix (V: `grantBranch` in `src/app/workers/worker-grants.mjs`)
  and that its head on GitHub is the commit Avoozl's journal says it
  pushed there; any other branch is refused and needs `branch-delete`.
- Mirror modules and `instance-publish` have no row: `spec/drop-mirror`
  deletes them, and spec take over goes with the approval cut-down
  (handing off is reassigning the spec issue, which is `spec-issues`).

**Binding a job.** `withJob(job, fn)` runs `fn` with the job in an
`AsyncLocalStorage`, as `withSource` does for call sources (V:
`src/app/github/github-rate.mjs:43-45`). Operation entries gain one field,
`github: "<job>"` or `github: null`; the dispatcher wraps the handler in
`withJob` beside `withSource` (V: `src/app/api/operations.mjs:2159`).
Tick steps name theirs in `under(source, job, step)` (V:
`src/app/tick/tick.mjs:556-560`); the app backend's queues (check runs,
receipts) wrap their runners. A step that does two jobs, such as landing
that also posts an evidence comment, runs the second inside its own
`withJob`.

Explicit `github.for(job)` at each call (about 60 files) was the other
way. The job belongs to the entry point, not the call, and the entry
points are already tables (operation entries, tick steps), so binding
there is fewer edits and one place to read.

**The method guard.** `METHOD_NEEDS` maps each `GitHubClient` method to the
permissions it uses, for example `createIssue: {issues: "write"}`,
`mergePullRequest: {contents: "write", pull_requests: "write"}`,
`checkRuns: {checks: "read"}`. `request` reads the current job; with no
job, or a job whose permission set does not cover the method's needs, it
throws a 500 naming the method, job and permission before any token call
(PC4.3, PC4.4). The guard runs in production too: a missing binding is a
bug and must show, not fall to full access.

`createIssue` creates missing labels today (V: `ensureLabel` in
`src/app/github/github.mjs:860-866`). Creating a label is high risk
(PC13.1), so `createIssue` in a low job no longer creates labels: a
missing label refuses the publish with a Needs you item whose **Create
labels** action runs `repo-setup` through the confirm. Set up creates the
labels Avoozl uses, so this shows only after someone deletes one.

**Owner-level jobs.** `repository: null` and `owner` set; the cache key
uses the owner (PC4.6). An app installation is per owner, so a provider
can mint for it; a user-owned Projects board may be out of an app's
reach, and the provider then refuses, with PC7's Needs you item.

**Tests (PC4.5).** One test imports every operation entry and checks its
`github` field is `null` or a job in `JOBS`; one reads the tick's step
list the same way; one checks every job in `JOBS` is named at least once;
one runs the existing fake-fetch GitHub suites with the guard on.

## D7. High-risk jobs and the confirm

A `high` job asks for no token unless the current job scope holds a
**grant**: `{job, target, permissionsHash, at}`, made by the person's
**Allow** and held in the memory of the process that runs the step. A grant
serves one step, once, for 10 minutes (PC13.4).

```
page                     app backend
 |-- preview (low/no GitHub) -->|   returns steps; each high write names
 |                               |   {job, target, permissions, permissionsHash}
 |<-- modal: repo, action, ------|
 |    permissions per write      |
 |-- Allow: github.job.confirm -->|   person-only; checks the hash against JOBS
 |    {steps, hashes}            |   and the preview; makes grants
 |-- apply ---------------------->|   each high write runs withJob(job, fn, grant)
```

- `permissionsHash` is SHA-256 of `{job, target, permissions}`. A job
  table or target that changed since the preview refuses the grant
  (PC13.4).
- Set up GitHub, landing setup and triage setup already preview and then
  apply (V: `buildPlan` writes in `src/app/github/github-setup.mjs`,
  `previewLanding` / `applyLanding` in `src/app/github/setup-landing.mjs`).
  Each write description gains `job` and `permissions`, and the existing
  confirm becomes the modal of PC13.2 listing them. There is no second
  popup (PC13.3).
- A high job outside a setup flow (deleting a grant branch, creating a
  missing label) opens the same modal from its Needs you action.
- The CLI prints the same lines and asks `Allow? [y/N]` on a terminal, or
  takes `--yes`; without a terminal and without `--yes` it refuses
  (PC13.6). `--yes` is a person's flag: the CLI refuses it when the agent
  markers of PC6.7 are set.
- `github.job.confirm` has policy `person` (refused over MCP and for app
  tokens, V: `src/app/api/operation-policy.mjs`). The tick and agents have
  no path to a grant, so a high job there fails as person-only (PC8.4).
- **Cancel** writes nothing; the step shows **Skipped**, and the flow goes
  on (PC13.5).
- A provider's refusal of a high job: the step shows the plugin's reason
  and a manual list built from the write's own description, for example
  "On GitHub, open acme/api › Settings › Rules and add a ruleset for main
  requiring Linux, macOS and Windows" or "Grant acme-github
  `administration: write` on acme/api". Setup goes on with its other
  steps (PC13.8).

`worker-release` deletes a grant branch when the driver settles a task
(V: `src/app/workers/worker-release.mjs:101`, in the tick). It runs as
`own-branch-delete` (D6), which is `low`, so it needs no confirm and the
tick keeps doing it; a branch that fails the job's own check is left and
listed in Needs you with **Delete branches** under `branch-delete`.

**Tests (PC13.9).** Every job with `risk: "high"` called without a grant
fails before a token call, for every provider; every `low` job runs with no
grant; every write in each setup preview names a `high` job and its
permissions appear in the modal's text (UI test from a fixture preview);
`--yes` with agent markers is refused.

## D8. The client and the token cache

`new GitHubClient({credentials})`, where `credentials.token({repository,
owner, job})` returns `{token, login, person, provider, granted, broader,
expiresAt}`. Tests pass `fixedCredentials(token, login)`, a two-line helper
in the test tree, in place of today's `token:`.

`request(method, pathname, options)`:

1. Job and guard (D6), grant (D7).
2. Repository from the method's argument (every repository method passes
   it; GraphQL methods pass theirs explicitly), else the owner.
3. Token from the cache, else the provider (D3, D5).
4. The response cache lookup, keyed by provider and login (D11), then the
   call with `Authorization: Bearer`.
5. A 401 drops that key and repeats from 3 once (PC5.4).

Cache: a `Map` in `github-credentials.mjs`, key
`provider|host|repository-or-owner|sorted permissions`, value the checked
reply. Fresh until `expiresAt - 5 min`; `null` expiry for one hour (PC5.2).
One in-flight promise per key (PC5.3). Asking the provider before the
response cache lookup costs nothing on a hit and makes a refused job stop
before it reads cached GitHub answers.

Two jobs with the same permission set on one repository share a token
(PC5.1). The token is never a field of the client, so `github.token` and
`gitHeader` go (V: `src/app/github/github.mjs:302-308`,
`src/app/github/github.mjs:1673`).

## D9. Git

### Today

Every network git call in `src/app/` outside tests, at `84d792aa` (V: a
search for `push`, `fetch`, `ls-remote` and `clone` arguments):

| Where | Remote | How it signs in today |
| ----- | ------ | --------------------- |
| `working-heads.mjs` `pushHead` (:421-490), `fetchExact` (:197-240) | the registry URL (the checkout's `origin` or a source URL) | The person's own git config. Avoozl adds nothing |
| `driver-generations.mjs` `guardedFastForward` (:350-370) | URL | Same |
| `merge-batch.mjs` (:302-310) | URL | Same |
| `pr-landing.mjs` (:82), `driver.mjs` (:1235) | `origin` | Same |
| `git-approvals.mjs` (:121, :196) | `origin` | Same |
| `spec-ticks.mjs` (:183, :213, :237) | `origin` | Same |
| `workspace-repository.mjs` (:250, :330), `remote-runner.mjs` (:409, :550) | the configured remote | Same |
| `plan-review-worktrees.mjs` (:79, :88) | `origin` | Same |
| `mirror-setup.mjs` `pushMirror` (:38-56) | `https://github.com/...` | Same (deleted by `spec/drop-mirror`) |
| `repo-files.mjs` (:76-89) | `github.gitRemote` (https) | The API token as `http.<origin>.extraheader`, through `GIT_CONFIG_*` environment variables |
| `mirror-forward-git.mjs` (:34-42, :67-205) | URL | Helpers cleared; the person's own `gh` token as `http.extraheader` in the arguments (deleted by `spec/drop-mirror`) |
| `mirror-sync.mjs` `gitCopy` (:85-112) | `https://github.com/...` | Helpers cleared, then `credential.helper=!gh auth git-credential`: gh's helper, set by Avoozl (deleted by `spec/drop-mirror`) |
| `plugin-git.mjs` | plugin source | The person's own git, by design (R34.13) |

So Avoozl relies on gh's credential helper explicitly in one place
(`mirror-sync`, which `spec/drop-mirror` deletes). Everywhere else it relies on whatever the person's git
config does for that URL: often gh's helper after `gh auth setup-git`, an
OS keychain, or an SSH key (A: depends on each machine). Two places put a
token where git hooks and same-user process listings can read it.

### After

`remoteGit(cwd, args, {repository, job, env})` in `git.mjs` is the one way
to run a network git command. For a repository on a host D3 resolves, it
adds, for that command only:

```
-c credential.helper=
-c credential.helper=!<node> <cli> credential
-c credential.useHttpPath=true
-c url.https://<host>/.insteadOf=git@<host>:
-c url.https://<host>/.insteadOf=ssh://git@<host>/
```

and sets `AVOOZL_CREDENTIAL_JOB`, `AVOOZL_CREDENTIAL_REPOSITORY` and
`AVOOZL_CREDENTIAL_WORKSPACE` in that command's environment, with
`GIT_TERMINAL_PROMPT=0`. `<node> <cli>` is `cliCommand()`'s absolute,
quoted form (V: used by `src/app/delivery/delivery.mjs`), so `avoozl` need
not be on `PATH`. The `insteadOf` rewrites keep `origin` by name, so
remote-tracking refs still update.

Every row of the table above but `plugin-git.mjs` and the mirror rows
(gone with `spec/drop-mirror`) calls `remoteGit`. `repo-files.mjs` loses
its own token handling. A test scans `src/app` for a `git` call whose
arguments hold `push`, `fetch`, `ls-remote` or `clone` outside `remoteGit`
and `plugin-git.mjs` (PC6.1).

`avoozl credential get` (one command entry):

1. Refuses when the agent markers are set (PC6.7).
2. Reads git's request from stdin: `protocol`, `host`, `path`.
3. Checks PC6.4: `https`, or `http` to `127.0.0.1` / `::1`; `host` equal to
   the host D3 resolves for the workspace; `path` equal to
   `AVOOZL_CREDENTIAL_REPOSITORY` with or without `.git`. A redirect,
   a submodule or a second remote fails here.
4. Gets the token as D8 does, calling the provider itself in its own
   process, for the repository's owner and the job. A high job needs a
   grant, which only the parent process holds, so the helper refuses a high
   job; no git command runs under one.
5. Prints `username=x-access-token` and `password=<token>`, and exits.
   `store` and `erase` exit 0 and do nothing.

Why a helper and not a header: the token reaches git only through the
helper's stdout, never git's environment, arguments or config, so hooks
and process listings never see it (PC5.5, PC6.3). The cost is one Node
start, and for a plugin one provider call, per git network command (the
helper's process has its own cache, PC5.1); a provider that is slow should
cache on its side. Decided in D15 (3).

Workers keep today's filters: `sandboxEnv` drops `GH_`, `GITHUB_`,
`AVOOZL_` and `GIT_CONFIG_*` and empties `credential.helper`; checks and
plugin checks get `checkEnvironment`; agent-facing env goes through
`withoutPushCredentials` (V: `src/app/executors/sandbox.mjs:126-149`,
`src/app/git/git.mjs:493-545`). None gains the helper or a token (PC6.6).

## D10. Failure

| Cause | What the call does | Needs you |
| ----- | ------------------ | --------- |
| Plugin throws (refusal) | Fails with the redacted reason | One item per provider, host, owner, job: "acme-github refused `triage` on acme/api: <reason>" |
| Timeout, crash, listener, bad reply | Fails; child restarted next call | Same item, with the cause |
| Claiming plugin changed, missing or broken | Fails for its owners, no provider call | "Approve acme-github again; GitHub work for acme and acme-labs waits" |
| Two claims on one owner, no pick | Fails for that owner, no provider call | "Pick one" with **Use this one** per plugin |
| `granted` narrower than asked | Fails | Names the missing permission |
| Second 401 | Fails | "The token from <provider> was refused by GitHub" |
| No grant for a high job | Fails as person-only | None from the tick; the page step shows **Allow** |

The failed call raises the same error class a GitHub outage does today
(status 503), so every step already waits and retries next tick, and
nothing is recorded as written (PC7.4). Items clear on the next success for
their key (PC7.3). No path calls another provider after a failure (PC7.2);
a test with a refusing fake plugin and a fake `gh` on `PATH` checks `gh`
was never run for a claimed owner, and was run for an unclaimed one.

## D11. Counting and Settings

- `RateState` keeps `resources`, `pause` and `usage` per token login
  (`{logins: {"acme-bot[bot]": {...}}}` in the `githubRate` meta).
  `held(resource)` reads the pause of the login the call uses (PC9.1).
- `WritePacer` journal rows gain `login`; windows count one login's rows
  (PC9.2).
- `ResponseCache.owner(token)` becomes `owner(provider, login)`
  (V: `src/app/github/github-rate.mjs:150-166`), so a new token for the same
  login hits the same answers (PC9.3).
- `bin/gh-counted` calls stay under the `gh` login, since chats use `gh`.

`github.settings.get` returns, per host, one entry per provider in use:
`{provider, owners: [..] | "all" | "other", login, person, granted: "all" |
"per-job", broader: [jobs], expiresAt, error}`. The GitHub calls section
shows one line per entry:

```
github.com · acme, acme-labs: signed in through acme-github as acme-bot[bot] (per-job permissions) · token good for 41 min
github.com · everything else: signed in with gh as mtdowling (full access) · no expiry
```

and its usage table gains a login column (PC9.5). Activity gets one row
per new token (PC9.6).

## D12. Who GitHub shows

Approvals are commits by an allowed author email (R114), whoever pushed
(PC10.1). GitHub shows the token login on every write made with a plugin's
token (PC10.3).

**Commits are the person's, always (PC10.2).** Every commit Avoozl makes,
and its author and committer, come from the person's git config
(`user.name`, `user.email`) exactly as today. No provider, token, `login`
or `person` touches them; a token only signs the push in. A commit pushed
with `acme-bot[bot]`'s token still shows Michael Dowling as author and
committer, and still counts as an approval by that author email.

**`person` is the API-side identity only (PC10.4).** It is the GitHub login
Avoozl uses where GitHub needs a person: the spec issue's assignee and
driver claims, rights checks (`permission()` for that login), and setup.
It never names a commit's author.

`currentUser()` today returns the token's login, and these places use it
as the person (V: `git grep currentUser` at `84d792aa`):

| Place | Uses it as |
| ----- | ---------- |
| `operations.mjs` `specApprover`, `personLogin` (:941-985) | The person who is granted work (a rights check) |
| `pr-landing.mjs` (:349) | The login whose GitHub rights are checked |
| `repository-setup.mjs` (:36), `worker-setup.mjs` (:54) | The person setting up |
| `remote-runner.mjs` (:255, :279), `driver.mjs` `currentLogin` (:427) | This machine's identity for offers and driver claims (the spec issue's assignee) |

Mirror forwarding, mirror setup and spec take over also call it today
(V: `src/app/ops/specs.mjs:118`, `src/app/mirror/`,
`src/app/specs/spec-takeover.mjs:49`). They are left out: `spec/drop-mirror`
deletes the mirror modules, and the approval cut-down deletes take over
(a handoff reassigns the spec issue, a `spec-issues` write by the person
login).

and these as the token: `specPullTick` owners (:1083, which pull requests
are Avoozl's own), `github-intake` (:141, own comments), `github-sync`
(:31), `permission()`'s fallback (`github.mjs:697`).

After: `currentUser()` returns the token login (for a plugin, the reply's
`login`, with no call, since `GET /user` fails for installation tokens and
GraphQL `viewer` is null for them; A, from GitHub's docs). A new
`personLogin()` returns the reply's `person`, or for `gh` and `env` the
same login. The first table's places call `personLogin()`; with no
`person` they wait with PC10.4's item. A GitHub App cannot be an issue
assignee (A), so driver claims need `person`.

## D13. Security

Threats from a hostile or buggy provider, and the defense of each:

| Threat | Defense | Test |
| ------ | ------- | ---- |
| Token for the wrong repository | Avoozl sends a token only on calls to the repository it asked for (PC5.6); the helper checks git's `path` (D9). A wrong token fails at GitHub; it never reaches another repository's calls | Fake GitHub logs which token hit which repository |
| Token broader than asked | Avoozl's method guard (D6) limits what Avoozl calls, whatever the token can do; Settings shows **broader than asked** (PC11.5). Avoozl cannot read an installation token's real permissions, so this is shown, not refused | Reply with `granted: "all"` shows the mark |
| Token or secret in error text | Redaction of held tokens and `SECRET_VALUE` patterns before any store or view; 500-character cap (PC11.4) | Error holding the token and a `ghp_` value stores `[redacted]` |
| Line break in the token | Character rule (D5) | Reply with `\n` is refused |
| Lying `login` | Used only to show, count and recognize own writes (PC10.5) | A login equal to the person's changes no approval or grant |
| Lying `person` | The provider already holds tokens that can write; `person` gives it no more, and never changes a commit's author (PC10.2) | A reply with another `person` leaves commit author and committer as git config says |
| Hang or flood | 20-second limit, 1 MB reply cap, one in-flight call per key | Slow fake times out; Needs you item |
| Listener, or a changed folder | Listen guard and check; re-hash before start and every 10 minutes; changed stops the child (PC11.6) | As for other plugin tests |
| Token in a child | No token in any environment; workers keep `sandboxEnv`; the helper only on Avoozl's own `remoteGit` | Worker env and a pre-push hook's env hold no token |
| Agent mints a token | Helper and `--yes` refuse with agent markers (speed bump); the sandbox keeps `plugins.json`, plugin folders and `gh`'s config unreadable and the network off | Marker test; sandbox test lists the paths |
| A repository chooses the sign-in | A credentials plugin in `.avoozl.json` is invalid and never claims (PC2.2); only this machine's `plugins.json` may declare one, and only a person approves it | A `.avoozl.json` entry for a credentials plugin is refused naming `.avoozl.json plugins.0` |
| A plugin claims more owners than meant | `owners` is shown on the approval view (PC2.3); an owner outside it uses `env` or `gh` | A call for an unlisted owner never reaches the plugin |

The plugin is trusted with tokens once approved; nothing here guards
against a provider that misuses its own tokens outside Avoozl.

## D14. Risks

- **Every GitHub call site changes behavior at once.** The method guard
  fails loudly where a binding is missing. The guard runs on every existing
  fake-fetch test, and pc-p1 runs the real paths.
- **SSH users move to https.** Under `gh`, a checkout using an SSH key now
  pushes with `gh`'s token. A `gh` token without the `workflow` scope
  cannot push `.github/workflows/` changes; Set up's token step already
  reads scopes (V: `missingScopes` in `src/app/github/github-setup.mjs`)
  and gains `workflow` when a repository lands workflow changes.
- **Permission names.** Rows marked **A** in D6 may be named differently by
  GitHub; pc-1.3 checks them against the docs before code reads them.

## D15. Decisions

The owner settled the questions the first draft left open (2026-11-19):

1. **The person's login** comes from an optional `person` in the reply
   (PC1.5, PC10.4). Commits and their author and committer always come from
   the person's git config, never from a provider (PC10.2).
2. **One git path for every provider**, `gh` and `env` included: SSH
   remotes of a GitHub host are rewritten to https and signed in through
   the helper (PC6.2). The cost is D14's `workflow` scope.
3. **The helper calls the provider itself**, in its own process (PC6.5),
   so a CLI-only machine needs no running backend.
4. **Machine only.** A credentials plugin may be declared only in this
   machine's `plugins.json`; a repository's `.avoozl.json` must not choose
   who Avoozl signs in as, and an entry there is refused naming the file
   and key (PC2.2, D3).
5. **`own-branch-delete` is `low`**, limited to branches under Avoozl's
   grant prefix at a commit it pushed; every other delete stays `high`
   (PC13.1, D6, D7).
6. **No mirror or instance-publish jobs.** `spec/drop-mirror` deletes those
   modules, and the approval cut-down deletes spec take over, so neither
   has a row in D6 or D12.
7. **`owners` now.** A plugin may list the owners it serves; every other
   owner on the host uses `env` or `gh`. No-fallback holds per owner: an
   owner the plugin claims never falls back to `gh` (PC1.2, PC2.1, PC7.2,
   D3).
