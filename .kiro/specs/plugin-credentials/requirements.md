---
category: Planning
---

# Requirements: GitHub sign-in from a plugin

## Introduction

The `credentials` plugin part lets an organization's engineers' Avoozl act
through the organization's own GitHub App, with short-lived tokens and only
the access each job needs. A plugin that provides it answers one call,
`token({repository, owner, permissions, purpose})`, with a token for that
repository, the GitHub permissions that job needs, and the job's name, so
that the provider can mint a narrow token, audit it and refuse a job it does
not allow. Installing the plugin and approving its hash is the whole
configuration. With no plugin, Avoozl signs in through one of two built-in
providers of the same part: `gh` and `env`.

### Scope

- The `credentials` part: its manifest shape, its child process, its one
  call and the reply's validation.
- How a host's provider is chosen, including the built-in `gh` and `env`.
- The table of jobs, the GitHub permissions and the risk of each, the code
  that makes every GitHub call name its job, and the confirm a person gives
  before a high-risk job asks for a token.
- The in-memory token cache, git's use of the same token, failure handling,
  rate counting per login, and what Settings shows.

### Out of scope

- Hosts other than GitHub. A `hosts` entry names a GitHub host; a private
  git host keeps the person's own git sign-in.
- Plugin fetches from git (Requirement 34.13). They keep the person's own
  git and credentials.
- The GitHub sign-in of agent chats and harnesses. Workers get no token
  (PC6.6).
- Writing a real provider. The guide shows a fake one; an organization's
  own provider lives in its own private plugin.

### Words

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

## Requirements

### Requirement PC1: The credentials part

**User story:** As an organization's tools owner, I want to ship a token
provider as a plugin part, so that one install and one approval signs every
engineer's Avoozl in through our app.

#### Acceptance criteria

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

### Requirement PC2: Installing is the configuration

**User story:** As an engineer, I want approving the plugin to be the only
step, so that I cannot forget a setting and keep signing in as myself.

#### Acceptance criteria

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

### Requirement PC3: The built-in providers

**User story:** As an engineer without a plugin, I want Avoozl to sign in
with `gh` or a token through the same code, so that one path is tested.

#### Acceptance criteria

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

### Requirement PC4: Each job names its permissions

**User story:** As a tools owner, I want each token request to say which
job it is for and which GitHub permissions that job needs, in GitHub's own
words, so that my provider can mint the least it can and refuse what it
does not allow.

#### Acceptance criteria

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

### Requirement PC5: The token cache

**User story:** As an engineer, I want Avoozl to ask the provider only when
it needs a new token and never to keep one anywhere it could leak from.

#### Acceptance criteria

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

### Requirement PC6: Git uses the same provider

**User story:** As an engineer, I want Avoozl's own pushes and fetches to
sign in the same way as its API calls, so that the provider sees and can
refuse them too.

#### Acceptance criteria

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

### Requirement PC7: Failure never falls back

**User story:** As a tools owner, I want a refused or broken provider to
stop the job, so that my audit is never bypassed by a quiet switch to the
engineer's own login.

#### Acceptance criteria

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

### Requirement PC8: Only a person

**User story:** As an engineer, I want only myself to decide who signs my
Avoozl in to GitHub.

#### Acceptance criteria

1. Adding, approving, disabling and removing a plugin SHALL be person-only
   (`changesPlugins` in `src/app/ops/plugins.ts`).
2. Picking between two claiming plugins SHALL be a person-only operation:
   refused over MCP and for app tokens.
3. No tick, agent, example installation or plugin SHALL add, approve or
   pick a credentials plugin.
4. A `high` risk job (PC13) SHALL run only from a person's confirmed
   action. Over MCP, for an app token, from an agent session and from the
   tick it SHALL fail as person-only, before any token is asked for.

### Requirement PC9: Counted and shown per login

**User story:** As an engineer, I want to see who Avoozl signs in as and
how much of that login's limit it used.

#### Acceptance criteria

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

### Requirement PC10: Who GitHub shows

**User story:** As a maintainer, I want to know which name my readers see
on Avoozl's comments and pushes, and that approvals still count by who
wrote the commit.

#### Acceptance criteria

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

### Requirement PC11: Security

**User story:** As an engineer, I want a buggy or hostile provider to be
unable to make Avoozl do more than the job it asked a token for.

#### Acceptance criteria

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

### Requirement PC12: Documented

**User story:** As a tools owner, I want one guide for writing a
credentials part, so that I can ship one without reading Avoozl's code.

#### Acceptance criteria

1. `docs/plugins.md` SHALL have a Credentials part section: a complete
   manifest, a fake `token.mjs`, the call and reply, the job table, what
   happens on failure, and PC6.7's speed-bump note.
2. `docs/github.md` SHALL say how Avoozl signs in: for each owner, a
   claiming plugin, else `env`, else `gh`; and that a credentials plugin
   is declared only in this machine's `plugins.json`.
3. The shipped `avoozl-plugin` skill SHALL know the part.
4. Examples SHALL use only neutral names, such as `acme-github` and
   `acme-bot[bot]`.

### Requirement PC13: High-risk jobs ask first

**User story:** As an engineer, I want Avoozl to show me the exact GitHub
access a risky change will use on which repository, and wait for my yes,
so that no delete happens on a token I did not see asked for.

#### Acceptance criteria

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
