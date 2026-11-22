# Design: GitHub sign-in from a plugin

`PC` numbers are in this spec's `requirements.md`; `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`.

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
// scoped to one repository and the job's permissions, and refuses replies.
export const credentials = {
  async token({ repository, owner, permissions, purpose }, { config }) {
    if (purpose === "respond") throw Error("acme does not allow agent replies.");
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

The plugin's `config` holds `serviceUrl` and, by name, any environment
variable the provider reads (`keyEnv`), as for every plugin (`checkConfig`
in `src/app/plugins/plugins.ts`). A plugin may also provide `rules` from a
top-level `entry`; the credentials entry is its own module and runs in its
own child (PC1.3), so a token never sits in the memory of a process that
runs another part's code.

## D2. Where the code goes

| Module | Job |
| --- | --- |
| `src/app/plugins/plugins.ts` | `PARTS` lists `credentials`; `validateManifest` checks the `credentials` key (PC1.2); `inspectPlugins` carries `credentials.hosts` and `owners`, and marks a repository-declared credentials plugin invalid (PC2.2); Add plugin refuses the repository scope for one |
| `src/app/plugins/plugin-child.ts` | Loads the credentials entry for kind `credentials` |
| `src/app/plugins/plugin-contract.ts` | `credentialsReplies.token` and `checkTokenReply` (D5) |
| `src/app/github/github-jobs.ts` | The job table `JOBS` (D6), `withJob`, `currentJob`, `asJob`, the request permission map (`restNeeds`, `graphqlNeeds`) and the confirm grants (D7) |
| `src/app/github/github-credentials.ts` | Provider choice per host and owner (D3), the built-in `gh` and `env` providers, the credentials child (D4), the token cache (D8), redaction, the Needs you items |
| `src/app/github/github.ts` | `GitHubClient` takes `credentials` and asks it per call (D8); `currentUser`, `personLogin` and `personOf` (D12) |
| `src/app/github/github-rate.ts`, `github-pacer.ts` | Keys by token login (D11) |
| `src/app/git/git.ts` | `remoteGit`, the one function for network git (D9) |
| `src/app/github/credential-helper.ts`, `src/app/commands/machine.ts` | The `avoozl credential` helper (D9) |
| `src/app/api/operations.ts`, `src/app/tick/tick.ts` | Each operation entry and tick step names its `github` job; the dispatcher and `under()` wrap the handler in `withJob` |
| `src/app/ops/plugins.ts` | `plugin.credentials.pick`, person-only |
| `src/app/ops/github.ts` | `github.job.confirm`, person-only (D7); `github.settings.get` returns the sign-in lines (D11) |
| `src/app/cli/confirm-high-risk.ts` | The CLI's confirm (D7) |
| `hosts/kirocrew/ui/src/PluginsSettings.tsx`, `AddPlugin.tsx`, `plugins-api.ts`, `settings-api.ts` | The host and owners line (PC2.3), the pick, the sign-in line and per-login calls, the confirm modal |

## D3. Choosing a provider for an owner

A host is the GitHub host Avoozl talks to: `github.com` when the API is
`https://api.github.com`, else the host of `AVOOZL_GIT_URL` or
`GITHUB_API_URL`, with its port when one is given. The owner is the call's
`owner` (PC1.4), compared without case.

For one host and owner, on each token call that misses the cache
(`chooseProvider`):

1. `claims` = plugins declared in this machine's `plugins.json` whose
   manifest lists the host in `credentials.hosts`, whose `owners` is absent
   or lists the owner, and that are `approved`, or were approved and are
   `changed`, `missing` or broken (PC2.4). A plugin with no approval on
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

So `acme-github` with `owners: ["acme", "acme-labs"]` serves `acme/api` and
refuses there when it fails, while `octo/tools` on the same machine goes to
step 4 and signs in with `gh`. Disabling or removing a plugin, or approving
a version that drops an owner, removes those claims, so step 4 applies on
the next call (PC2.7).

**Machine only (PC2.2).** For a plugin from the `repository` source whose
`provides` lists `credentials`, `inspectPlugins` returns `state: "invalid"`
with a reason naming `.avoozl.json plugins.<i>`. Invalid plugins are never
approvable, Settings shows the reason, and `avoozl check` reports it with
the file and key.

**Built-in providers.** `gh`: `gh auth token --hostname <host>`, run with
`execFile`, 5-second limit, asynchronous. `gh` prints `GH_TOKEN` when it is
set, so a machine with `gh` uses that variable through `gh`. `env`:
`AVOOZL_GITHUB_TOKEN`, trimmed. For both, the login comes from one
`GET /user` per new token, and the reply is `granted: "all"`,
`expiresAt: null`, and `person` equal to the login. A machine with neither
`gh` nor `AVOOZL_GITHUB_TOKEN` is not signed in.

## D4. The credentials child

`CredentialChild` in `github-credentials.ts` holds at most one child per
plugin for the life of the process: the app backend, a CLI command, the
tick or the supervisor. It uses `PluginProcess` from `plugins.ts`: the same
spawn, minimal environment, line cap, listen guard and listener check after
every call. It is not part of a tick's plugin session, so the tick budget
does not apply; each call has the 20-second limit.

A local-folder plugin is hashed before each start and again before a
cache-missing call when the last hash is over 10 minutes old. A changed
hash, a disable or a remove stops the child and drops its tokens (PC11.6).
A crash marks it broken for that call; the next call starts it again, once
per minute at most.

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

`credentialsReplies.token(reply, asked)` in `plugin-contract.ts` returns
the checked reply or throws `ContractError`:

| Field | Rule |
| --- | --- |
| `token` | String, 1 to 8,192 characters, only `[A-Za-z0-9_.~+/=-]`. A line break or space would let a token add lines to git's credential reply (D9), so it is refused |
| `expiresAt` | `null`, or ISO time > now + 60 s and <= now + 24 h |
| `login` | `^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$` |
| `person` | Optional; the same rule without `[bot]` |
| `granted` | `"all"`, or an object of GitHub permission names to `read` / `write` / `admin` |
| other keys | Refused |

Then, against `asked`: a permission asked and not in `granted` at that
level or higher makes the reply a refusal ("acme-github granted
`contents: read`; `land` needs `contents: write`"). `"all"` or more than
asked is accepted and marked `broader` (PC11.5).

## D6. Jobs and their permissions

The job table is `JOBS` in `src/app/github/github-jobs.ts`. Every
repository job also holds `metadata: read`, because GitHub gives every
installation token it.

| Job | Risk | Permissions |
| --- | --- | --- |
| `check-in` | low | contents, issues, pull_requests, checks, statuses: read |
| `ci-receipts` | low | actions, checks, statuses, contents, pull_requests: read |
| `rules-read` | low | administration, contents, variables: read |
| `land` | low | contents, pull_requests, statuses: write; issues, checks: read |
| `land-workflows` | low | `land` plus workflows: write (PC4.7) |
| `spec-branch` | low | contents, pull_requests, issues: write |
| `spec-issues` | low | issues: write; contents, pull_requests: read |
| `review-output` | low | issues: write; pull_requests, contents: read |
| `respond` | low | discussions, issues: write |
| `integration` | low | contents: write; checks, statuses: read |
| `worker-grants` | low | contents, issues: write |
| `workspace-publish` | low | contents, pull_requests: write |
| `claim-delete` | high | contents: write |

Reads use `read`; GitHub's `write` includes `read`, so a job that writes a
permission does not list its read too. Risk follows PC13.1 alone.

**Binding a job.** `withJob(job, fn)` runs `fn` with the job in an
`AsyncLocalStorage`, as `withSource` does for call sources. Operation
entries hold `github: "<job>"` or `github: null`; the dispatcher in
`operations.ts` wraps the handler in `withJob`. Tick steps name theirs in
`under(source, job, step)` in `tick.ts`. A write site that does a second
job uses `asJob(job, github)`, so every method of that client runs as the
named job.

**The request guard.** `restNeeds(method, pathname)` maps each REST call to
the permissions it needs from its method and path, for example a `POST` to
`/repos/{owner}/{repo}/issues` needs `issues: write`, and `graphqlNeeds`
does the same for each GraphQL mutation and read. `request` reads the
current job; with no job, or a job whose permission set does not cover the
request's needs, it throws a 500 naming the call, job and permission before
any token call (PC4.3, PC4.4). The guard runs in production too: a missing
binding is a bug and must show, not fall to full access.

**Tests (PC4.5).** One test imports every operation entry and checks its
`github` field is `null` or a job in `JOBS`; one reads the tick's step list
the same way; one checks every job in `JOBS` is named at least once; the
fake-fetch GitHub suites run with the guard on.

## D7. High-risk jobs and the confirm

A `high` job asks for no token unless the current job scope holds a
**grant**: `{id, job, target, permissionsHash, at}`, made by the person's
**Allow** and held in the memory of the process that runs the step
(`Grants` in `github-jobs.ts`). A grant serves one step, once, for 10
minutes (PC13.4).

```text
page                          app backend
 |-- read: the step to run ---->|   returns confirmStep({job, target, action}):
 |                               |   {permissions, permissionsText, permissionsHash}
 |<-- modal: repo, action, ------|
 |    permissions                |
 |-- Allow: github.job.confirm ->|   person-only; checks the hash against JOBS;
 |    {steps}                    |   returns grant ids
 |-- apply with allow: [ids] --->|   the dispatcher runs withJob(job, fn, grants)
```

- `permissionsHash` is SHA-256 of `{job, target, permissions}`. A job
  table or target that changed since the modal refuses the grant (PC13.4).
- The only `high` job is `claim-delete`: **Delete claim branch** on the
  Needs you row of a pull request that closed unmerged, and
  `avoozl claim delete REPOSITORY BRANCH` in the CLI
  (`src/app/workers/claims.ts`, `src/app/commands/delivery.ts`).
- The CLI (`src/app/cli/confirm-high-risk.ts`) prints the same lines and
  asks `Allow? [y/N]` on a terminal, or takes `--yes`; without a terminal
  and without `--yes` it refuses (PC13.6). `--yes` is a person's flag: the
  CLI refuses it inside an agent session.
- `github.job.confirm` has policy `person` (refused over MCP and for app
  tokens). The tick and agents have no path to a grant, so a high job there
  fails as person-only (PC8.4).
- **Cancel** writes nothing (PC13.5).

**Tests (PC13.9).** Every job with `risk: "high"` called without a grant
fails before a token call, for every provider; every `low` job runs with no
grant; `--yes` inside an agent session is refused.

## D8. The client and the token cache

`new GitHubClient({credentials})`, where `credentials.token({repository,
owner, job})` returns `{token, login, person, provider, granted, broader,
expiresAt}`. Tests pass `fixedCredentials(token, login)`, a helper in the
test tree.

`request(method, pathname, options)`:

1. Job and guard (D6), grant (D7), and the transport check (PC11.7).
2. Repository from the method's argument, else the owner.
3. Token from the cache, else the provider (D3, D5).
4. The response cache lookup, keyed by provider and login (D11), then the
   call with `Authorization: Bearer`.
5. A 401 drops that key and repeats from 3 once (PC5.4).

Cache: a `Map` in `github-credentials.ts`, key
`provider|host|repository-or-owner|sorted permissions`, value the checked
reply. Fresh until `expiresAt - 5 min`; `null` expiry for one hour (PC5.2).
One in-flight promise per key (PC5.3). Asking the provider before the
response cache lookup costs nothing on a hit and makes a refused job stop
before it reads cached GitHub answers.

Two jobs with the same permission set on one repository share a token
(PC5.1). The token is never a field of the client.

## D9. Git

`remoteGit` in `git.ts` is the one way to run a network git command. For a
repository on a host D3 resolves, it adds, for that command only:

```text
-c credential.helper=
-c credential.helper=!<node> <cli> credential
-c credential.useHttpPath=true
-c url.<git url>/.insteadOf=git@<host>:
-c url.<git url>/.insteadOf=ssh://git@<host>/
```

and sets `AVOOZL_CREDENTIAL_JOB`, `AVOOZL_CREDENTIAL_REPOSITORY` and
`AVOOZL_CREDENTIAL_WORKSPACE` in that command's environment, with
`GIT_TERMINAL_PROMPT=0`. `<node> <cli>` is the absolute, quoted CLI command,
so `avoozl` need not be on `PATH`. The `insteadOf` rewrites keep `origin` by
name, so remote-tracking refs still update.

A test scans `src/app` for a `git` call whose arguments hold `push`,
`fetch`, `ls-remote` or `clone` outside `remoteGit` and
`src/app/plugins/plugin-git.ts` (PC6.1).

`avoozl credential get` (`src/app/github/credential-helper.ts`):

1. Refuses when the agent markers are set (PC6.7).
2. Reads git's request from stdin: `protocol`, `host`, `path`.
3. Checks PC6.4: `https`, or `http` to `127.0.0.1` / `::1`; `host` equal to
   the host D3 resolves for the workspace; `path` equal to
   `AVOOZL_CREDENTIAL_REPOSITORY` with or without `.git`. A redirect, a
   submodule or a second remote fails here.
4. Gets the token as D8 does, calling the provider itself in its own
   process, for the repository's owner and the job. A high job needs a
   grant, which only the parent process holds, so the helper refuses a high
   job.
5. Prints `username=x-access-token` and `password=<token>`, and exits.
   `store` and `erase` exit 0 and do nothing.

The token reaches git only through the helper's stdout, never git's
environment, arguments or config, so hooks and process listings never see
it (PC5.5, PC6.3). The cost is one Node start, and for a plugin one provider
call, per git network command (the helper's process has its own cache,
PC5.1); a provider that is slow should cache on its side (D15, rule 3).

Workers keep their filters: `sandboxEnv` drops `GH_`, `GITHUB_`, `AVOOZL_`
and `GIT_CONFIG_*` and empties `credential.helper`; checks and plugin checks
get `checkEnvironment`; agent-facing env goes through
`withoutPushCredentials`. None gains the helper or a token (PC6.6).

## D10. Failure

| Cause | What the call does | Needs you |
| --- | --- | --- |
| Plugin throws (refusal) | Fails with the redacted reason | One item per provider, host, owner, job: "acme-github refused `respond` on acme/api: <reason>" |
| Timeout, crash, listener, bad reply | Fails; child restarted next call | Same item, with the cause |
| Claiming plugin changed, missing or broken | Fails for its owners, no provider call | "Approve acme-github again; GitHub work for acme and acme-labs waits" |
| Two claims on one owner, no pick | Fails for that owner, no provider call | "Pick one" with **Use this one** per plugin |
| `granted` narrower than asked | Fails | Names the missing permission |
| Second 401 | Fails | "The token from <provider> was refused by GitHub" |
| No grant for a high job | Fails as person-only | None from the tick; the page step shows **Allow** |

The failed call raises the same error class a GitHub outage does (status
503), so every step waits and retries next tick, and nothing is recorded as
written (PC7.4). Items clear on the next success for their key (PC7.3). No
path calls another provider after a failure (PC7.2); a test with a refusing
fake plugin and a fake `gh` on `PATH` checks `gh` was never run for a
claimed owner, and was run for an unclaimed one.

## D11. Counting and Settings

- `RateState` keeps resources, the pause and usage per token login (`logins`
  in the `githubRate` meta). A pause reads the login the call uses (PC9.1).
- `WritePacer` counts one login's writes in its windows (PC9.2).
- The response cache keys answers by provider and login, so a new token for
  the same login hits the same answers (PC9.3).
- `bin/gh-counted` calls stay under the `gh` login, since chats use `gh`.

`github.settings.get` returns, per host, one entry per provider in use:
`{provider, owners, login, person, granted, broader, expiresAt, error}`.
The GitHub calls section shows one line per entry:

```text
github.com · acme, acme-labs: signed in through acme-github as acme-bot[bot] (per-job permissions) · token good for 41 min
github.com · everything else: signed in with gh as octo-dev (full access) · no expiry
```

and its usage table has a login column (PC9.5). Activity gets one row per
new token (PC9.6).

## D12. Who GitHub shows

Approvals are commits by an allowed author email (R114), whoever pushed
(PC10.1). GitHub shows the token login on every write made with a plugin's
token (PC10.3).

**Commits are the person's, always (PC10.2).** Every commit Avoozl makes,
and its author and committer, come from the person's git config
(`user.name`, `user.email`). No provider, token, `login` or `person` touches
them; a token only signs the push in.

**`person` is the API-side identity only (PC10.4).** `currentUser()`
returns the token login (for a plugin, the reply's `login`, with no call).
`personLogin()` on `GitHubClient` returns the reply's `person`, or for `gh`
and `env` the same login; `personOf(github)` in `github.ts` reads it. With
no `person`, `recordNoPerson` raises PC10.4's item and the step waits. These
places use the person login:

| Place | Uses it as |
| --- | --- |
| `operations.ts` `personLogin` | The approver login a commit names |
| `pr-landing.ts` | The login whose GitHub rights are checked |
| `spec-assignee.ts`, `spec-publication.ts` | The spec issue's assignee |
| `labeled-issues.ts` | The login an issue is assigned to |

`github-sync.ts` uses `currentUser()` as the token, to recognize Avoozl's
own writes.

## D13. Security

Threats from a hostile or buggy provider, and the defense of each:

| Threat | Defense | Test |
| --- | --- | --- |
| Token for the wrong repository | Avoozl sends a token only on calls to the repository it asked for (PC5.6); the helper checks git's `path` (D9). A wrong token fails at GitHub; it never reaches another repository's calls | Fake GitHub logs which token hit which repository |
| Token broader than asked | Avoozl's request guard (D6) limits what Avoozl calls, whatever the token can do; Settings shows **broader than asked** (PC11.5). Avoozl cannot read an installation token's real permissions, so this is shown, not refused | Reply with `granted: "all"` shows the mark |
| Token or secret in error text | Redaction of held tokens and `SECRET_VALUE` patterns before any store or view; 500-character cap (PC11.4) | Error holding the token and a `ghp_` value stores `[redacted]` |
| Line break in the token | Character rule (D5) | Reply with `\n` is refused |
| Lying `login` | Used only to show, count and recognize own writes (PC10.5) | A login equal to the person's changes no approval or grant |
| Lying `person` | The provider already holds tokens that can write; `person` gives it no more, and never changes a commit's author (PC10.2) | A reply with another `person` leaves commit author and committer as git config says |
| Hang or flood | 20-second limit, a line cap, one in-flight call per key | Slow fake times out; Needs you item |
| Listener, or a changed folder | Listen guard and check; re-hash before start and every 10 minutes; changed stops the child (PC11.6) | As for other plugin tests |
| Token in a child | No token in any environment; workers keep `sandboxEnv`; the helper only on Avoozl's own `remoteGit` | Worker env and a pre-push hook's env hold no token |
| Agent mints a token | Helper and `--yes` refuse with agent markers (speed bump); the sandbox keeps `plugins.json`, plugin folders and `gh`'s config unreadable and the network off | Marker test; sandbox test lists the paths |
| A repository chooses the sign-in | A credentials plugin in `.avoozl.json` is invalid and never claims (PC2.2); only this machine's `plugins.json` may declare one, and only a person approves it | A `.avoozl.json` entry for a credentials plugin is refused naming `.avoozl.json plugins.0` |
| A plugin claims more owners than meant | `owners` is shown on the approval view (PC2.3); an owner outside it uses `env` or `gh` | A call for an unlisted owner never reaches the plugin |

The plugin is trusted with tokens once approved; nothing here guards
against a provider that misuses its own tokens outside Avoozl.

## D14. Risks

- **Every GitHub call runs in a job.** The request guard fails loudly where
  a binding is missing. The guard runs on every fake-fetch test, and pc-p1
  runs the real paths.
- **SSH remotes push over https.** Under `gh`, a checkout using an SSH key
  pushes with `gh`'s token. A `gh` token without the `workflow` scope
  cannot push `.github/workflows/` changes.

## D15. Rules

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
5. **Owners.** A plugin may list the owners it serves; every other owner on
   the host uses `env` or `gh`. No-fallback holds per owner: an owner the
   plugin claims never falls back to `gh` (PC1.2, PC2.1, PC7.2, D3).
