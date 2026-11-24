---
repo: avoozl
category: Planning
---

# GitHub sign-in from a plugin

## Requirements

### Introduction

The `credentials` plugin part lets an organization's engineers' Avoozl act
through the organization's own GitHub App, with short-lived tokens and only
the access each job needs. A plugin that provides it answers one call,
`token({repository, owner, permissions, purpose})`, with a token for that
repository, the GitHub permissions that job needs, and the job's name, so
that the provider can mint a narrow token, audit it and refuse a job it does
not allow. Installing the plugin and approving its hash is the whole
configuration. With no plugin, Avoozl signs in through one of two built-in
providers of the same part: `gh` and `env`.

#### Scope

- The `credentials` part: its manifest shape, its child process, its one
  call and the reply's validation.
- How a host's provider is chosen, including the built-in `gh` and `env`.
- The table of jobs, the GitHub permissions and the risk of each, the code
  that makes every GitHub call name its job, and the confirm a person gives
  before a high-risk job asks for a token.
- The in-memory token cache, git's use of the same token, failure handling,
  rate counting per login, and what Settings shows.

#### Out of scope

- Hosts other than GitHub. A `hosts` entry names a GitHub host; a private
  git host keeps the person's own git sign-in.
- Plugin fetches from git (Requirement 34.13). They keep the person's own
  git and credentials.
- The GitHub sign-in of agent chats and harnesses. Workers get no token
  (PC6.6).
- Writing a real provider. The guide shows a fake one; an organization's
  own provider lives in its own private plugin.

#### Words

| Word | Meaning |
| --- | --- |
| Provider | The code that hands Avoozl a GitHub token: a `credentials` plugin, or built-in `gh` or `env` |
| Host | A GitHub host name, such as `github.com`, that a provider signs Avoozl in to |
| Claim | A provider's statement that it serves a host, or some owners on it: `credentials.hosts` and `owners` |
| Job | One named kind of GitHub work, such as `land` or `respond`; the `purpose` of a token call |
| Job table | The one table in Avoozl that maps each job to the GitHub permissions it needs |
| Permission set | A job's permissions, such as `{contents: "write", pull_requests: "write"}` |
| Risk | `high` for a job that deletes on GitHub what another runner relies on, else `low` (PC13) |
| Confirm | The modal (or CLI prompt) where a person allows one high-risk step, seeing its permissions |
| Token login | The GitHub login a token acts as, such as `acme-bot[bot]` |
| Person login | The GitHub login of the person at this machine, such as `octo-dev` |
| Helper | `avoozl credential`, the git credential helper Avoozl hands its own git calls |


#### Requirement PC1: The credentials part

**User story:** As an organization's tools owner, I want to ship a token
provider as a plugin part, so that one install and one approval signs every
engineer's Avoozl in through our app.

##### Acceptance criteria

1. `credentials` SHALL be one of the plugin parts in `PARTS`
   (`src/app/plugins/plugins.ts`), with the code kind `credentials`. A
   manifest MAY list it in `provides` with any other part.
2. A manifest that provides `credentials` SHALL hold
   `credentials: {entry, hosts, owners?}`. `entry` SHALL be a `.mjs` or
   `.js` file inside the plugin folder, with no `..` and no absolute path.
   `hosts` SHALL list 1 to 10 GitHub host names, each once, lowercase, with
   an optional `:port`. `owners`, when given, SHALL list 1 to 100 GitHub
   owner names (users or organizations), each once, compared without case,
   such as `["acme", "acme-labs"]`; without it the plugin claims every
   owner on its hosts. Any other key in `credentials` SHALL be refused
   naming the key. `credentials` SHALL be refused when `provides` does not
   list it.
3. The entry SHALL run in the plugin child (`src/app/plugins/plugin-child.ts`):
   stdio JSON lines, no port, the listen guard and the listener check after
   every call (Requirement 34.5). It SHALL run in its own child, apart from
   any child the same plugin runs for `rules`, so that the process holding
   tokens runs no other part's code.
4. The entry module SHALL export `credentials.token(params, {config})`.
   Avoozl SHALL call it as `credentials.token` with
   `{repository, owner, permissions, purpose}`:
   - `repository`: `owner/name`, or `null` for a job on an owner and no
     one repository (PC4.6).
   - `owner`: the repository's owner, always set.
   - `permissions`: the job's permission set (PC4.2).
   - `purpose`: the job's name from the job table.
5. The reply SHALL be `{token, expiresAt, login, granted}` and MAY add
   `person`, the GitHub login of the person this machine signs in for
   (PC10.4). `src/app/plugins/plugin-contract.ts` SHALL validate it before
   anything reads it (PC11.3). A reply of any other shape SHALL count as a
   failure of that call (PC7), never as a partial token.
6. A refusal SHALL be the call throwing an error. Its message SHALL be
   shown as the plugin's reason, redacted (PC11.4) and bounded to 500
   characters.
7. A token call SHALL time out after 20 seconds. The credentials child
   SHALL NOT be bound to one tick's session: a process that makes GitHub
   calls (the app backend, a CLI command, the tick, the supervisor) SHALL
   start it on its first token call and keep it until the process ends or
   the child is stopped (PC11.6).

#### Requirement PC2: Installing is the configuration

**User story:** As an engineer, I want approving the plugin to be the only
step, so that I cannot forget a setting and keep signing in as myself.

##### Acceptance criteria

1. There SHALL be no setting that turns a credentials plugin on. A plugin
   that provides `credentials` SHALL claim each host in its `hosts`, for
   the owners in its `owners` or for every owner without it, once a person
   approved it on this machine. A claim SHALL be per host and owner: every
   other owner on that host SHALL use the built-in provider (PC3.2).
2. A credentials plugin SHALL be declared only in this machine's
   `plugins.json`. A repository's `.avoozl.json` SHALL NOT choose who
   Avoozl signs in as: a `.avoozl.json` `plugins` entry whose plugin
   provides `credentials` SHALL make that plugin invalid, never approvable,
   with a reason naming the file and the entry's key (such as
   `.avoozl.json plugins.0`), and Add plugin SHALL refuse the repository
   scope for it.
3. The approval view, the Add plugin preview and the Settings > Plugins row
   SHALL say, for each host, "`<plugin>` will sign Avoozl in to `<host>`"
   (with "for `<owners>`" when it lists owners), and SHALL say that every
   GitHub call Avoozl makes there will use its tokens.
4. A plugin that was approved and then `changed` (a new version, hash or
   commit) SHALL still claim its hosts and owners. Avoozl SHALL NOT use it
   until it is approved again and SHALL NOT fall back to a built-in
   provider for those owners meanwhile (PC7.2). A plugin never approved on
   this machine SHALL NOT claim anything.
5. WHEN two or more plugins claim one owner on one host THEN Avoozl SHALL
   use none of them for that owner, SHALL make no GitHub call for it, and
   SHALL raise one Needs you item naming the plugins, with a **Use this
   one** action per plugin.
6. The pick SHALL be stored only in this machine's `plugins.json`, keyed by
   host, and SHALL hold the picked plugin's id. It SHALL apply only where
   two or more plugins claim one owner on that host. Removing the picked
   plugin SHALL drop the pick.
7. WHEN a person removes or disables a plugin, or approves a version whose
   `owners` drops an owner, THEN Avoozl SHALL use the built-in provider for
   each owner no plugin claims (PC3.2) from the next token call on.

#### Requirement PC3: The built-in providers

**User story:** As an engineer without a plugin, I want Avoozl to sign in
with `gh` or a token through the same code, so that one path is tested.

##### Acceptance criteria

1. `gh` and `env` SHALL be providers with the same `token` call and reply
   as a plugin, implemented in Avoozl. `gh` SHALL run
   `gh auth token --hostname <host>`. `env` SHALL read
   `AVOOZL_GITHUB_TOKEN`.
2. For an owner no plugin claims on a host, Avoozl SHALL use `env` when
   `AVOOZL_GITHUB_TOKEN` is set and not blank, else `gh`. No setting SHALL
   choose between them.
3. Avoozl SHALL NOT read `GH_TOKEN` or `GITHUB_TOKEN` itself. `gh` reads
   those two, so a machine with `gh` installed uses them through `gh`.
4. A built-in provider SHALL NOT narrow permissions. It SHALL reply
   `granted: "all"` and `expiresAt: null`, and its login SHALL come from
   GitHub's `GET /user` once per token.
5. WHEN `gh` is missing, signed out, or prints nothing THEN the reply SHALL
   be a refusal saying "Run `gh auth login`, or set AVOOZL_GITHUB_TOKEN."

#### Requirement PC4: Each job names its permissions

**User story:** As a tools owner, I want each token request to say which
job it is for and which GitHub permissions that job needs, in GitHub's own
words, so that my provider can mint the least it can and refuse what it
does not allow.

##### Acceptance criteria

1. Avoozl SHALL hold one job table, `JOBS` in
   `src/app/github/github-jobs.ts`: each job's name, a one-line description,
   its permission set and its `risk` (`low` or `high`, PC13). No other code
   SHALL list a job's permissions or risk.
2. A permission set SHALL use GitHub's fine-grained permission names (such
   as `metadata`, `contents`, `pull_requests`, `issues`, `checks`,
   `statuses`, `actions`, `workflows`, `discussions`, `administration`,
   `variables`), each `read` or `write` (`workflows` only `write`), as
   GitHub's installation token call takes them.
3. Every GitHub API call and every network git call to a claimed host SHALL
   run inside exactly one job. A call outside any job SHALL fail before it
   is sent, naming the call.
4. Each GitHub request SHALL be mapped to the permission it needs, from its
   REST method and path or its GraphQL query. WHEN a request runs inside a
   job whose permission set lacks that permission THEN it SHALL fail before
   it is sent, naming the request, the job and the missing permission.
5. A test SHALL check that every operation entry and every tick step that
   reaches GitHub names a job in the job table, and that every job in the
   table is named somewhere.
6. A job on an owner with no one repository SHALL ask with
   `repository: null` and the `owner`.
7. A landing push whose range changes a file under `.github/workflows/`
   SHALL run as the job `land-workflows`, which adds `workflows: write`; any
   other landing push SHALL run as `land`.

#### Requirement PC5: The token cache

**User story:** As an engineer, I want Avoozl to ask the provider only when
it needs a new token and never to keep one anywhere it could leak from.

##### Acceptance criteria

1. Avoozl SHALL cache tokens in the memory of the process that asked,
   keyed by provider, host, repository (or owner) and permission set. Two
   jobs with the same permission set on one repository SHALL share one
   token. The cache SHALL NOT be shared between processes.
2. A cached token SHALL be used until 5 minutes before its `expiresAt`. A
   token with `expiresAt: null` SHALL be used for at most one hour, then
   asked for again.
3. One token request per key SHALL be in flight at a time; callers waiting
   on the same key SHALL share its answer.
4. WHEN GitHub answers 401 to a call THEN Avoozl SHALL drop that cached
   token, ask the provider once more, and retry the call once. A second 401
   SHALL fail the job (PC7).
5. A token SHALL NOT be written to disk, SQLite, `plugins.json`, logs,
   Activity, a Needs you item, an error message, a brief or any child's
   environment.
6. A token minted for one repository SHALL only be sent on calls to that
   repository, and one minted for an owner only on that owner's calls.

#### Requirement PC6: Git uses the same provider

**User story:** As an engineer, I want Avoozl's own pushes and fetches to
sign in the same way as its API calls, so that the provider sees and can
refuse them too.

##### Acceptance criteria

1. Every network git call Avoozl makes itself (`push`, `fetch`,
   `ls-remote`, `clone`) to a repository on a GitHub host SHALL go through
   one function, `remoteGit` in `src/app/git/git.ts`, that adds, for that
   one command, a credential helper that clears every configured helper and
   then names `avoozl credential`, plus `credential.useHttpPath=true`. A
   test SHALL fail on a network git call in `src/app` outside that function,
   with plugin fetches (`src/app/plugins/plugin-git.ts`, Requirement 34.13)
   the one named exception.
2. That function SHALL rewrite the host's SSH remote forms
   (`git@<host>:` and `ssh://git@<host>/`) to the host's https URL for that
   command, so a checkout whose `origin` uses SSH is signed in the same
   way.
3. Avoozl SHALL pass the job, the repository and the workspace to the helper
   in the environment of that git command only. They are not secrets. The
   token SHALL NOT be passed in git's environment, its arguments or its
   config.
4. The helper SHALL answer `get` only when git's `protocol` is `https` (or
   `http` to a loopback address), its `host` is the repository's GitHub
   host, and its `path` names the repository Avoozl passed. Otherwise it
   SHALL answer nothing and exit with an error. It SHALL ignore `store` and
   `erase`.
5. The helper SHALL get its token from the same provider choice, for that
   repository's host and owner, and the same job table as the API (PC2,
   PC3, PC4), calling the provider itself in its own process.
6. Workers, checks, plugin checks and their children SHALL never receive a
   token or the helper. Their environments SHALL stay filtered:
   `sandboxEnv` (`src/app/executors/sandbox.ts`), which also empties
   `credential.helper`, and `withoutPushCredentials` and `checkEnvironment`
   (`src/app/git/git.ts`), which drop `AVOOZL_CREDENTIAL_` and the GitHub
   token variables.
7. The helper SHALL refuse when the markers Avoozl sets for agent sessions
   are present in its environment. For a Kiro Crew chat executor this is a
   speed bump, not a sandbox, and the guide SHALL say so; the sandbox,
   which keeps the plugin settings, plugin folders and `gh`'s config out of
   reach, is the barrier.

#### Requirement PC7: Failure never falls back

**User story:** As a tools owner, I want a refused or broken provider to
stop the job, so that my audit is never bypassed by a quiet switch to the
engineer's own login.

##### Acceptance criteria

1. WHEN the provider for an owner on a host errors, times out, refuses,
   sends a reply that fails validation, or is a claiming plugin that is not
   usable (changed, missing, broken) THEN the GitHub call SHALL fail and
   the job SHALL not run that step.
2. Avoozl SHALL NOT use another provider for that owner because one
   failed: an owner a plugin claims SHALL never fall back to `env` or `gh`.
   A plugin claim SHALL be replaced only by a person's remove, disable,
   new approval or pick (PC2.5 to PC2.7).
3. A failure SHALL raise one Needs you item per provider, host, owner and
   job, with the plugin's reason. The item SHALL clear itself on the next
   successful token call for that key.
4. The work SHALL wait as it does for any GitHub outage: a landing waits
   and retries next tick, a write is not counted as made, and nothing is
   recorded as done.
5. Pages SHALL keep showing what they already read and stored. A failed job
   SHALL NOT clear stored reads.

#### Requirement PC8: Only a person

**User story:** As an engineer, I want only myself to decide who signs my
Avoozl in to GitHub.

##### Acceptance criteria

1. Adding, approving, disabling and removing a plugin SHALL be person-only
   (`changesPlugins` in `src/app/ops/plugins.ts`).
2. Picking between two claiming plugins SHALL be a person-only operation:
   refused over MCP and for app tokens.
3. No tick, agent, example installation or plugin SHALL add, approve or
   pick a credentials plugin.
4. A `high` risk job (PC13) SHALL run only from a person's confirmed
   action. Over MCP, for an app token, from an agent session and from the
   tick it SHALL fail as person-only, before any token is asked for.

#### Requirement PC9: Counted and shown per login

**User story:** As an engineer, I want to see who Avoozl signs in as and
how much of that login's limit it used.

##### Acceptance criteria

1. Rate state, the rate-limit pause and the call counts SHALL be kept per
   token login, since each login has its own limit. A limit on one login
   SHALL NOT hold calls made as another.
2. The write pacer's windows SHALL be counted per token login.
3. The response cache SHALL key answers by provider and token login, not by
   the token, so a new token for the same login reads the same answers.
4. Settings > GitHub SHALL show, per host, one sign-in line per provider in
   use, with the owners it serves, such as "acme, acme-labs: signed in
   through acme-github as acme-bot[bot] (per-job permissions)" and
   "Everything else: signed in with gh as octo-dev (full access)", and the
   remaining life of the newest cached token ("no expiry" for a built-in
   provider).
5. The GitHub calls table SHALL show calls per token login beside the
   per-source rows.
6. Activity SHALL record each new token: provider, host, job, repository,
   token login, `granted` and `expiresAt`, and never the token.

#### Requirement PC10: Who GitHub shows

**User story:** As a maintainer, I want to know which name my readers see
on Avoozl's comments and pushes, and that approvals still count by who
wrote the commit.

##### Acceptance criteria

1. Approvals SHALL stay as Requirement 114 sets them: a commit on main by an
   allowed author email. Who pushed it, and with which token, SHALL NOT
   count.
2. Commits Avoozl makes, and their author and committer, SHALL always come
   from the person's git config (`user.name`, `user.email`). No provider,
   token, `login` or `person` SHALL change them.
3. The guide SHALL say that comments, reviews, labels, pull requests and
   pushes made with a plugin's token show the token login on GitHub, such
   as `acme-bot[bot]`.
4. Avoozl SHALL keep the token login and the person login apart. The
   person login is only the GitHub login Avoozl uses for identity on the
   API side: the spec issue's assignee, rights checks and approvals. Every
   place that uses a login as the person (D12) SHALL use the reply's
   `person` when a plugin provides one. WHEN it does not THEN those steps
   SHALL wait with one Needs you item saying the provider names no person.
   For `gh` and `env` both logins are the same.
5. Avoozl SHALL use the token login only to show it, to count calls, and to
   recognize its own writes. It SHALL NOT use it to decide who may approve
   or be granted work.

#### Requirement PC11: Security

**User story:** As an engineer, I want a buggy or hostile provider to be
unable to make Avoozl do more than the job it asked a token for.

##### Acceptance criteria

1. A credentials plugin SHALL be held to every rule other plugin code is
   held to: approval of id, version, hash and commit (Requirements 34.4,
   34.14); a local folder hashed again before each start; no listener; the
   minimal environment.
2. The design SHALL state a threat model for a hostile or buggy provider
   and the defense for each threat (D13), and each defense SHALL have a
   test.
3. The reply SHALL be refused unless: `token` is 1 to 8,192 characters of
   `A-Z a-z 0-9 _ . - ~ + / =` only, with no space or line break;
   `expiresAt` is `null` or an ISO time more than 60 seconds and at most
   24 hours from now; `login` matches GitHub's login rule with an optional
   `[bot]`; `person`, when given, matches the same rule without `[bot]`;
   `granted` is `"all"` or a permission set.
4. Any text from a provider that Avoozl shows or stores SHALL be redacted
   first: every token Avoozl holds, and every credential pattern plugin
   config refuses (`SECRET_VALUE` in `src/app/plugins/plugins.ts`), become
   `[redacted]`.
5. WHEN `granted` is narrower than the permissions asked THEN the call
   SHALL count as a refusal naming what is missing. WHEN a plugin's
   `granted` is `"all"` or broader than asked THEN Avoozl SHALL use the
   token and show "broader than asked" for that job in Settings.
6. A credentials child whose plugin turns `changed`, disabled or removed
   SHALL be stopped, and its tokens dropped from the cache, before the next
   token call.
7. The token SHALL be sent only over `https`, or over `http` to a loopback
   address for tests and proofs.

#### Requirement PC12: Documented

**User story:** As a tools owner, I want one guide for writing a
credentials part, so that I can ship one without reading Avoozl's code.

##### Acceptance criteria

1. `docs/plugins.md` SHALL have a Credentials part section: a complete
   manifest, a fake `token.mjs`, the call and reply, the job table, what
   happens on failure, and PC6.7's speed-bump note.
2. `docs/github.md` SHALL say how Avoozl signs in: for each owner, a
   claiming plugin, else `env`, else `gh`; and that a credentials plugin
   is declared only in this machine's `plugins.json`.
3. The shipped `avoozl-plugin` skill SHALL know the part.
4. Examples SHALL use only neutral names, such as `acme-github` and
   `acme-bot[bot]`.

#### Requirement PC13: High-risk jobs ask first

**User story:** As an engineer, I want Avoozl to show me the exact GitHub
access a risky change will use on which repository, and wait for my yes,
so that no delete happens on a token I did not see asked for.

##### Acceptance criteria

1. Every job in the job table SHALL have a `risk`. `claim-delete`, which
   deletes a stale claim branch that another runner may hold, SHALL be
   `high`. Every other job, such as reads, check-in, CI receipts, landing
   approved work, publishing a spec issue and assignee changes, SHALL be
   `low`.
2. Before Avoozl asks any provider for a token for a `high` job, the page
   SHALL show one confirm in the shared modal naming the repository, the
   action, and the exact GitHub permissions the job will ask for, with
   **Allow** and **Cancel**. This SHALL hold for every provider, `gh` and
   `env` included.
4. **Allow** SHALL let only that step, on that repository, with that
   permission set, ask for a token, once, within 10 minutes. The page SHALL
   send back a hash of what it showed; a job table or target that changed
   since SHALL be refused, asking again.
5. **Cancel** SHALL skip the step and write nothing.
6. The CLI (`avoozl claim delete`) SHALL show the same text and ask the
   same yes or no on a terminal, or take `--yes`. Without a terminal and
   without `--yes` it SHALL refuse. `--yes` SHALL be refused inside an agent
   session.
7. A `low` job SHALL run with no confirm.
9. A test SHALL check that every `high` job reaches GitHub only through the
   confirm and that no `low` job does.

## Design

`PC` numbers are in [Requirements](#requirements); `R` numbers and `§`
sections without a `D` are in `.kiro/specs/avoozl/`.

### D1. The part in a manifest

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

### D2. Where the code goes

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

### D3. Choosing a provider for an owner

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

### D4. The credentials child

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

### D5. The call and the reply

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

### D6. Jobs and their permissions

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

### D7. High-risk jobs and the confirm

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

### D8. The client and the token cache

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

### D9. Git

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

### D10. Failure

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

### D11. Counting and Settings

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

### D12. Who GitHub shows

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

### D13. Security

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

### D14. Risks

- **Every GitHub call runs in a job.** The request guard fails loudly where
  a binding is missing. The guard runs on every fake-fetch test, and pc-p1
  runs the real paths.
- **SSH remotes push over https.** Under `gh`, a checkout using an SSH key
  pushes with `gh`'s token. A `gh` token without the `workflow` scope
  cannot push `.github/workflows/` changes.

### D15. Rules

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

## Tasks

Tasks run in list order, and each phase waits for the one above it. Requirement
numbers are in brackets (`PC1` to `PC13`, in [Requirements](#requirements)); `D` sections
refer to [Design](#design), `R` numbers to
`.kiro/specs/avoozl/avoozl.md#requirements`.

Phase 1 adds the part, the built-in providers, the job table and the
client that asks per job. Phase 2 adds the confirm for high-risk jobs.
Phase 3 moves Avoozl's own git calls to the helper. Phase 4 splits the
person's login from the token's, counts per login, shows it and documents
it. `pc-p1` proves the whole path against a fake GitHub.

Tests use isolated temporary workspaces, real git with a bare remote, a fake
GitHub over a fake `fetch` or on `127.0.0.1`, and only fake plugins kept in
the test tree (R34.11). Examples use neutral names such as `acme-github` and
`acme-bot[bot]`. No token appears in a fixture except a fake one the test
made. Screen changes need phone and desktop, light and dark screenshots for
owner approval before merge (R92.12); screenshots are shown to the owner
and never committed (AGENTS.md).

Task IDs start with `pc-` so
they never collide with the IDs of the other specs.

### Phase 1: Providers, jobs and the client

- [x] `pc-1.1` The credentials part and its reply [PC1.1 to PC1.6, PC2.2, PC11.3] (§D1, §D3, §D5)
  - Tests: D1's manifest validates and `inspectPlugins` carries `credentials.hosts`; `credentials` without `provides: credentials`, an entry outside the folder or with `..`, an empty or duplicate host, an uppercase host, 11 hosts, an empty `owners`, a duplicate owner (in any case), 101 owners and an unknown key are each refused naming the key; a credentials plugin declared in `.avoozl.json` is `invalid` with a reason naming `.avoozl.json plugins.0`, cannot be approved, is reported by `avoozl check` with that file and key, and Add plugin refuses the repository scope for it; the child loads the credentials entry for kind `credentials` only, in a child of its own; `credentialsReplies.token` accepts D5's good reply and refuses a token with a space or line break, one of 8,193 characters, an `expiresAt` 30 seconds or 25 hours away, a login with a space, `person` with `[bot]`, an unknown key, and a `granted` narrower than asked (naming the missing permission); `"all"` and broader replies come back marked `broader`.
  - `PARTS` and `PART_KIND` list `credentials`; `validateManifest` checks the key; `src/app/plugins/plugin-child.ts` lists the kind; `src/app/plugins/plugin-contract.ts` holds `credentialsReplies` and routes it in `checkReply`.
- [x] `pc-1.2` Choosing a provider per owner; `gh` and `env` built in, after pc-1.1 [PC1.7, PC2.1, PC2.4 to PC2.7, PC3, PC7.2, PC11.1, PC11.6] (§D3, §D4)
  - Tests with fake plugins and a fake `gh` on `PATH`: with no plugin, `AVOOZL_GITHUB_TOKEN` set picks `env` and unset picks `gh`, which is run as `gh auth token --hostname github.com` and never blocks the event loop; `GH_TOKEN` alone is not read by Avoozl; a missing `gh` refuses with PC3.5's text; an approved claiming plugin wins over both; with `owners: ["acme"]` it serves `acme/api` and `octo/tools` uses `gh`; a never-approved one claims nothing; a changed one refuses every call for its owners and `gh` is never run for them, while an unlisted owner still uses `gh`; two approved claims on one owner refuse with the clash until `credentialsPick` names one, two plugins with disjoint `owners` do not clash, and a pick of a removed plugin is dropped; removing or disabling the only claim, or approving a version that drops an owner, moves the next call for those owners to the built-in; the credentials child outlives a tick session, is restarted after a crash at most once a minute, and is stopped when its local folder's hash changes.
  - `src/app/github/github-credentials.ts`: `chooseProvider`, the `gh` and `env` providers, `CredentialChild`; `PluginProcess` exported from `plugins.ts`; `credentialsPick` read and written in `readPluginSettings` / `writePluginSettings`.
- [x] `pc-1.3` The job table and the request guard [PC4] (§D6)
  - `JOBS` holds D6's rows with `risk`, with the permission names checked against GitHub's "Permissions required for GitHub Apps" page in a comment beside the table; tests: a call outside `withJob` throws before any token call, naming the call; a job lacking a request's permission throws naming call, job and permission; every operation entry has a `github` field that is `null` or a job in `JOBS`; every tick step passed to `under()` names one; every job in `JOBS` is named at least once; a range touching `.github/workflows/` lands as `land-workflows` and any other as `land`; every GitHub suite that uses a fake `fetch` passes with the guard on.
  - `src/app/github/github-jobs.ts`: `JOBS`, `restNeeds`, `graphqlNeeds`, `withJob`, `currentJob`, `asJob`; the `github` field on every operation entry; `withJob` in the dispatcher and in `under()`; the app backend's queues wrap their runners.
- [x] `pc-1.4` The client asks per job; the token cache; failure, after pc-1.2, pc-1.3 [PC5, PC7, PC11.4, PC11.5, PC11.7] (§D8, §D10)
  - Tests with a fake `fetch` and a recording fake provider: two calls of one job on one repository make one provider call; two jobs with the same permission set share it; another repository or permission set makes a new call; a token is reused until 5 minutes before `expiresAt`, and a `null` expiry for one hour; concurrent misses on one key make one call; a 401 drops the key, asks once more and retries once, and a second 401 fails; a token minted for `acme/api` is never sent on an `acme/web` call; a refusal, a timeout and a bad reply each fail the call with status 503 and one Needs you item per provider, host and job that clears on the next success, and no other provider is called; the reason is redacted (a held token and a `ghp_` value become `[redacted]`) and cut to 500 characters; the token is in no store row, log line, Activity row, error or child environment (a test searches each for the fake token); `http` is refused for a non-loopback host; Settings data marks a `broader` job.
  - `GitHubClient({credentials})`; the `fixedCredentials` helper in `src/app/test/github-credentials.ts` for tests.

### Phase 2: High-risk jobs ask first

- [x] `pc-2.1` Grants and the confirm, after pc-1.4 [PC13, PC8.4] (§D7)
  - Tests: every `high` job without a grant fails as person-only before a token call, with `gh`, `env` and a plugin provider alike; every `low` job runs without one; `github.job.confirm` is refused over MCP and for an app token; a grant serves one step once and expires after 10 minutes; a `permissionsHash` that does not match `JOBS` or the target is refused; Cancel writes nothing (the fake GitHub records no write); the CLI asks `Allow? [y/N]` on a terminal, takes `--yes`, refuses without a terminal and without `--yes`, and refuses `--yes` inside an agent session; the modal shows repository, action and each permission (UI test from a fixture); the tick path to every `high` job fails as person-only.
  - `github.job.confirm` in `src/app/ops/github.ts` with `person` policy; `Grants` in `github-jobs.ts`; the confirm modal on the shared `Modal`; the CLI prompt in `src/app/cli/confirm-high-risk.ts`.

### Phase 3: Git

- [x] `pc-3.1` One network git function and the helper, after pc-1.4 [PC6] (§D9)
  - Tests with real git and a fake smart-HTTP remote on `127.0.0.1` that checks Basic auth: a push and a fetch through `remoteGit` authenticate with the provider's token for that repository, owner and job, and a repository of an owner the plugin does not list authenticates with `gh`'s; an `origin` written `git@<host>:owner/name.git` is rewritten for that command and its remote-tracking ref updates; the helper answers nothing and fails for another `path`, another host, `http` to a non-loopback host, and with agent markers set; `store` and `erase` do nothing; a pre-push hook and the git process's environment hold no token (the hook writes its environment to a file the test searches); `sandboxEnv`, `checkEnvironment` and `withoutPushCredentials` output holds no `AVOOZL_CREDENTIAL_` helper or token; a scan finds no `push`, `fetch`, `ls-remote` or `clone` git call in `src/app` outside `remoteGit` and `plugin-git.ts`; nothing in `src/app` names `gh auth git-credential`; the helper refuses a high job.
  - `remoteGit` in `src/app/git/git.ts`; the `credential` command entry in `src/app/commands/machine.ts` and the helper in `src/app/github/credential-helper.ts`.

### Phase 4: Who, how much, and where it shows

- [x] `pc-4.1` The token login and the person login, after pc-1.4 [PC10] (§D12)
  - Tests: with a plugin, `currentUser()` returns the reply's `login` with no `GET /user`; `personLogin()` returns `person`; each place in D12's table uses `personOf` and, with no `person`, waits with one Needs you item; the spec issue's assignee uses `person`; with `gh`, both are the `GET /user` login; a `login` equal to the person's own login changes no approval or grant decision; a commit Avoozl makes and pushes with a plugin token has the author and committer of the person's git config, whatever `login` and `person` say, and an approval commit counts by its author email.
  - `personLogin()` on `GitHubClient` and `personOf` in `src/app/github/github.ts`; the callers in D12's table.
- [x] `pc-4.2` Counting and pacing per login, after pc-1.4 [PC9.1 to PC9.3, PC9.6] (§D11)
  - Tests: a primary limit seen on `acme-bot[bot]` holds its calls and not `octo-dev`'s; pacer windows count one login's writes; a new token for the same login hits the response cache; the `githubRate` meta keeps per-login entries, merged across processes; each new token writes one Activity row with provider, host, job, repository, login, `granted` and `expiresAt` and no token.
  - `RateState`, `WritePacer` and the response cache keyed by login.
- [x] `pc-4.3` Settings and the pick, after pc-1.2, pc-2.1, pc-4.2 [PC2.3, PC2.5, PC2.6, PC8.1 to PC8.3, PC9.4, PC9.5] (§D3, §D11)
  - UI tests from fixtures: Settings > Plugins, the approval view and Add plugin show "acme-github will sign Avoozl in to github.com for acme, acme-labs" and that every GitHub call there uses its tokens; the clash item shows **Use this one** per plugin and `plugin.credentials.pick` is refused over MCP and for an app token; Settings > GitHub shows D11's two sign-in lines, one per owner group, the token's remaining life, **broader than asked** jobs, and a login column in the calls table.
  - `plugin.credentials.pick` in `src/app/ops/plugins.ts`; `github.settings.get` sign-in fields; `PluginsSettings.tsx`, `AddPlugin.tsx`, `plugins-api.ts`, `settings-api.ts`.
- [x] `pc-4.4` Docs and the plugin skill, after pc-3.1, pc-4.1, pc-4.3 [PC12] (§D1, §D6, §D7, §D9)
  - `docs/plugins.md` has a Credentials part section with D1's manifest and `token.mjs`, the call and reply, the job table with risk, the confirm, failure without fallback, and PC6.7's speed-bump note; `docs/github.md` says how Avoozl signs in (per owner: a claiming plugin, else `env`, else `gh`), that a credentials plugin is declared only in `plugins.json`, that writes show the token login, and that commits keep the person's git author and committer; `docs/person-only.md` names the helper's limits; the `avoozl-plugin` skill names the part.

- [x] `pc-p1` Proof: per-job tokens, a refusal and a push through the helper, after pc-2.1, pc-3.1, pc-4.1, pc-4.3 [PC1 to PC13] (§D3, §D6, §D7, §D9, §D10) (**MANUAL**)
  - Expected result observed; receipt at `docs/evidence/pc-p1-credentials.md`, with no image committed.
  - Setup: an isolated workspace and a throwaway Avoozl home; a fake GitHub the proof script starts on `127.0.0.1`, serving the REST calls a spec and a landing make for two private repositories, `acme/api` and `octo/tools`, plus smart-HTTP git for their bare remotes through `git http-backend`. It mints installation-style tokens at `POST /app/installations/1/access_tokens` with the asked `repositories` and `permissions`, enforces each token's permissions on every endpoint and git push, and logs every request with its token id, permission set and job header. `GITHUB_API_URL` and `AVOOZL_GIT_URL` point at it. A local-folder plugin `acme-github` from the proof's fixtures claims the fake host with `owners: ["acme"]`, mints through the fake GitHub, and returns `login: "acme-bot[bot]"` and `person: "acme-dev"`. A fake `gh` first on `PATH` logs any run and prints a token the fake GitHub accepts only for `octo/tools`. Both repositories land `direct`, and `acme/api`'s checkout's `origin` is written in the SSH form. The plugin is added in this machine's `plugins.json` and approved with **Approve** in a throwaway `avoozl serve` page's Settings > Plugins; a copy of its entry is also put in the workspace's `.avoozl.json` under another id.
  - Action: (1) approve a two-task spec on `acme/api` and a one-task spec on `octo/tools`, and run the tick until all three tasks land; (2) edit the plugin's `token.mjs` and run one more tick; (3) approve it again in Settings > Plugins, add a second claiming copy `acme-github-two` and approve it, run one tick, then press **Use this one: acme-github**; (4) remove both plugins with **Remove** in Settings > Plugins, set `AVOOZL_GITHUB_TOKEN` to a token the fake GitHub accepts, and run one tick.
  - Expected: (1) the `.avoozl.json` copy shows as invalid naming `.avoozl.json plugins.0` and claims nothing; the fake GitHub's log shows separate token requests for `check-in`, `spec-issues` and `land` with D6's permission sets, each token used only on `acme/api`, and the landing push authenticated through the helper over the rewritten https URL; `octo/tools` is read and landed with `gh`'s token, and the fake `gh` log shows runs only for it; every commit on both remotes has the person's git author and committer; the pre-push hook's environment file and every worker environment hold no token; Settings > GitHub > GitHub calls shows "acme: signed in through acme-github as acme-bot[bot] (per-job permissions)" with a remaining life and "everything else: signed in with gh"; (2) every GitHub call for `acme` refuses with "approve acme-github again" and the fake `gh` log shows no run for `acme`, while `octo/tools` still reads with `gh`; (3) the clash item appears with **Use this one** for each plugin, no GitHub call is made until the pick, and work resumes after it; (4) Settings > GitHub > GitHub calls shows "every owner: signed in with env (full access)", and the tick reads and lands with that token.
  - Failure means: any call goes out without a job, a token reaches another repository, a worker, a hook or a store, the fake `gh` runs for an owner a plugin claims, the `.avoozl.json` copy claims anything, a commit's author or committer differs from git config, or a refusal records work as done.
  - Next decision: none.
