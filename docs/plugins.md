# Writing a plugin

A plugin adds to Avoozl without changing Avoozl itself, and one plugin can
bundle several parts. A team installs one plugin and gets its content rules,
its GitHub sign-in and its checks together.

```json [avoozl-plugin.json]
{
  "id": "acme-team",
  "version": "1.0.0",
  "contract": 1,
  "provides": [
    "rules",
    "checks"
  ],
  "entry": "index.mjs"
}
```

A plugin is a folder with a manifest, `avoozl-plugin.json`, and an entry
module for the parts that run code. The manifest lists the parts the plugin
provides:

| Part          | What it is                                                   | Runs code               |
| ------------- | ------------------------------------------------------------ | ----------------------- |
| `rules`       | Content rule sets supplied while Avoozl runs                 | Yes                     |
| `credentials` | GitHub tokens, per job, from the organization's own provider | Yes, in its own process |
| `checks`      | Checks Avoozl runs on the repositories they name             | As checks               |
| `context`     | Skills and reads a worker session gets                       | No                      |

Avoozl refuses a manifest that lists any other part, naming it: for example
`pack is not a plugin part.`

The examples on this page are the test-only plugins in Avoozl's own test tree.
`src/app/test/fixtures/plugins/fake-rules/`, `fake-credentials/`,
`acme-checks/` and `fake-probe/` each provide one part. Read them alongside
this guide. These fakes are the only plugins tested so far, and no real
plugin has run live.

## Plugin manifest

These keys appear in the manifest:

- `id` is lowercase letters, digits and dashes. `local` and `github` are
  reserved.
- `version` changes whenever you release a new build.
- `contract` is the contract version: which version of Avoozl's plugin
  interface this plugin was built for. It is not the plugin's own version.
  Settings shows it as **Contract version**. This Avoozl supports contract
  version `1`.
- `checks` maps a check name to its definition, and `servers` names the MCP
  servers its MCP steps use. See [Checks part](#checks-part).
- `context` holds the skills, reads and MCP servers of a context part. See
  [Context part](#context-part).
- `entry` is a `.mjs` or `.js` file inside the folder. A plugin that provides
  only `checks` or `context` starts no plugin process, so it has no
  `entry`; Avoozl refuses one that names an entry, and never starts a
  process for it.

The entry module exports one object per kind, such as `rules`. Each method
takes `(params, { config })` and returns a JSON value or a promise of one:

```js
export const rules = {
  ruleSets(params, { config }) { ... },
};
```

## Declaring and approving

A `plugins` entry declares each plugin, either in the repository's
`.avoozl.json` (shared and reviewed in Git) or in this machine's
`plugins.json`, beside the global Avoozl configuration
(`~/.config/avoozl/plugins.json`, never committed):

```json
{
  "plugins": [
    {
      "id": "fake-rules",
      "path": "../fake-rules",
      "contract": 1,
      "config": {
        "crashFile": "crash.txt"
      }
    }
  ]
}
```

- Name exactly one of `path` (a folder, relative to the file that declares
  it), `package` (a package installed into the `plugins` folder beside
  `plugins.json`), or `git` (below).
- `config` is plain data passed to every call. It never holds a credential. A
  key ending in `Env`, such as `tokenEnv`, names the environment variable the
  plugin reads its credential from; Avoozl passes that variable, and only the
  variables `config` names this way, to the plugin.
- Declare a plugin whose name must stay private in `plugins.json`. Settings
  asks you to confirm before it saves a `plugins` entry into `.avoozl.json`.

### Add plugin in Settings

**Settings > Plugins > Add plugin** walks four steps, with Cancel on each:

1. **Where from**: open Folder, Package or Git and fill it in. Each keeps
   what you typed until you cancel. Git shows the exact commit its ref names.
2. **What**: the id, version, kinds and capabilities the plugin's own
   `avoozl-plugin.json` declares. The id and **Contract version** come from
   that file; a git plugin, whose files are fetched later, picks a supported
   contract version. A package's optional version is checked against the
   installed package; the entry stores no version, the approval pins it.
3. **Applies to**: this computer only (`plugins.json`) or shared with the
   repository (`.avoozl.json`). A shared plugin is approved on each computer
   for itself; a shared package is installed on each, and a shared git plugin
   is fetched on each with **Update**. A shared folder is a path inside the
   repository, relative to it.
4. **Review and approve**: the version, content hash and, for git, the commit.
   Cancel here removes the entry step 3 declared.

### Plugins from git

```json
{
  "id": "fake-rules",
  "git": "https://git.example.com/team/fake-rules.git",
  "ref": "v1.0.0",
  "subdir": "plugin",
  "contract": 1
}
```

`git` is a URL or a local repository path. `ref` is a tag, a branch or a full
commit, and `subdir` is the plugin's folder inside the repository. **Add from
git** in Settings (or `avoozl plugins add ID --git URL --ref REF`) resolves
`ref` to one commit, fetches only that commit into
`plugins/git/<id>/<commit>/` beside `plugins.json`, and stores the commit on
this machine. Git runs as you, with your credential helper or SSH key, so
private repositories work. Git hooks are off, submodules are skipped, and
Avoozl runs no `npm install`: commit the plugin ready to run, bundled or with
`node_modules`. The approval names the commit, so a new commit needs a new
approval. **Update** (or `avoozl plugins update ID`) resolves `ref` again.
The tick never fetches. Avoozl refuses a URL with a password or token in it,
a `subdir` outside the repository, and a commit with no `avoozl-plugin.json`.

Nothing loads until a person approves the plugin in **Settings** (or with
`avoozl plugins approve ID --hash HASH`). Settings shows the id, version,
each part, the code kinds it runs as, capabilities, location and content
hash, a SHA-256 over every file in the folder. The
approval lists the parts and is stored on this machine only. Any change to
the version or to any file needs approval again. The tick and example
installation never approve a plugin.

A plugin **shared with the repo** puts its entry in `.avoozl.json`, where
it is committed and reviewed like any other change. Each computer still
approves it for itself. Because a shared entry is the same on every
computer, its `config` holds no machine path: name an environment variable
(`termsFileEnv`) that holds each computer's own path.

## Plugin processes

- Each approved plugin runs in its own Node child process. Avoozl talks to it
  in JSON lines over stdin and stdout, and gives it no port.
- A plugin may call its own system over the network. It must not open a
  listener. A plugin that listens is stopped and marked broken.
- Write nothing to stdout yourself; it carries the protocol. `console.log`
  output goes to stderr, which Avoozl discards.
- Each call has a time limit (20 seconds by default) inside the tick's own
  time budget.
- Every reply is checked against the contract. Links must be `http` or
  `https`. Reply text is untrusted data: Avoozl quotes it as data in briefs
  and escapes it in views.
- When a plugin is missing, unapproved, disabled, crashes, times out, replies
  with the wrong shape, or expects an unsupported contract, Avoozl marks it
  unavailable for that tick. Its rule sets show the reason,
  and every task keeps moving. The next tick tries again.

## Rules kind

A rules plugin supplies content rule sets: terms Avoozl must never write
(see [Content rules](content-rules.md)). It lets a team ship its
list as a private package that public Avoozl never sees.

The call is `ruleSets({})`, and it replies with
`{sets: [{id, version, rules: [{id, pattern}]}]}`.

- `pattern` is a regular expression, matched per line ignoring case.
- A set or rule must not carry `allow`. Allow lines exist only in a person's
  own terms file; a plugin writes its exception into the pattern itself
  (for example `\bzebra\b(?!-ui)`). A reply with `allow` is refused, which
  makes that plugin's sets unavailable.
- A `.avoozl.json` set `{ "id": "<set id>", "plugin": "<plugin id>" }` picks
  one set by id. In **Settings > Content rules**, pick the plugin as the set's
  **Rules plugin**; such a set has no terms file to edit there.
- Without a plugin, a set's rules live in its terms file. See
  [Content rules](content-rules.md) for the format and the Rule builder.
- Avoozl keeps the rules in memory for the tick. It never writes them to
  SQLite, receipts, or Git; findings record the set's `version`.
- A plugin that is missing, unapproved, or broken makes only its own sets
  unavailable, and every boundary those sets cover writes nothing until it is
  fixed.

## Credentials part

A credentials part signs Avoozl in to GitHub through the organization's own
token service. For each GitHub call Avoozl asks it for a token for one
repository, the GitHub permissions that one job needs, and the job's name,
so the provider can mint a narrow, short-lived token, log it, and refuse a
job it does not allow. Installing and approving the plugin on this machine is
the whole setup.

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

`hosts` lists 1 to 10 lowercase GitHub host names, with an optional
`:port`. `owners`, optional, lists 1 to 100 users or organizations; without
it the plugin claims every owner on its hosts. Every other owner signs in
with `env` or `gh` (see [How Avoozl signs in](github.md#how-avoozl-signs-in)).
`entry` is the credentials module; it runs in a child process of its own,
apart from any rules code of the same plugin.

A credentials plugin is declared only in this machine's `plugins.json`. A
repository does not choose who Avoozl signs in as: a `.avoozl.json` entry
for one makes it invalid, with a reason that names the file and the key
(such as `.avoozl.json plugins.0`), and Add plugin refuses that scope.

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
// A fake provider: asks the organization's token service for a token
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

### The call and the reply

Avoozl calls `credentials.token` with `{repository, owner, permissions,
purpose}`. `repository` is `owner/name`, or `null` for a job on an owner
alone (an organization's issue types). `permissions` uses GitHub's own
fine-grained names, each `read` or `write`. `purpose` is the job's name.

The reply is `{token, expiresAt, login, granted, person?}`:

| Field       | Rule |
| ----------- | ---- |
| `token`     | 1 to 8,192 characters of letters, digits and `_ . ~ + / = -`; no space or line break |
| `expiresAt` | `null`, or an ISO time more than 1 minute and at most 24 hours away |
| `login`     | The GitHub login the token acts as, such as `acme-bot[bot]` |
| `person`    | Optional: the person this machine signs in for, such as `acme-dev` |
| `granted`   | `"all"`, or the permissions the token holds |

A reply of any other shape is a failure of that call. A `granted` narrower
than asked is a refusal naming what is missing; `"all"` or broader is used
and shown as **broader than asked** in Settings. Throw to refuse a job: the
message, with any token or credential-looking text replaced by
`[redacted]` and cut to 500 characters, is shown as the reason. A call that
takes over 20 seconds fails.

Avoozl keeps each token in the memory of the process that asked, until 5
minutes before `expiresAt`, and asks again after a 401. It never writes a
token to disk, the database, a log, Activity, a Needs you row, an error or a
child's environment.

### Jobs

Every GitHub call Avoozl makes runs inside one job, and each job asks for
these permissions:

| Job | Risk | Permissions | What it does |
| --- | ---- | ----------- | ------------ |
| `check-in` | low | checks: read, contents: read, issues: read, metadata: read, pull_requests: read, statuses: read | Read issues, pull requests, files and checks |
| `ci-receipts` | low | actions: read, checks: read, contents: read, metadata: read, pull_requests: read, statuses: read | Read CI runs, checks and their receipts |
| `rules-read` | low | administration: read, contents: read, metadata: read | Read branch rules and repository settings |
| `land` | low | checks: read, contents: write, issues: read, metadata: read, pull_requests: write, statuses: write | Land approved work |
| `land-workflows` | low | checks: read, contents: write, issues: read, metadata: read, pull_requests: write, statuses: write, workflows: write | Land approved work that changes .github/workflows |
| `spec-branch` | low | contents: write, issues: write, metadata: read, pull_requests: write | Push spec branches and their pull requests |
| `spec-issues` | low | contents: read, issues: write, metadata: read, pull_requests: read | Publish spec and task issues, claims and assignees |
| `evidence` | low | contents: read, issues: write, metadata: read, pull_requests: read | Post the evidence comment on a pull request |
| `respond` | low | discussions: write, issues: write, metadata: read | Answer discussions and issues |
| `integration` | low | checks: read, contents: write, metadata: read, statuses: read | Move an epic's integration branch |
| `worker-grants` | low | contents: write, issues: write, metadata: read | Open and checkpoint worker branches |
| `workspace-publish` | low | contents: write, metadata: read, pull_requests: write | Publish a workspace repository |
| `landing-setup` | high | administration: write, metadata: read, statuses: write, variables: write | Set rulesets, repository settings and variables |
| `claim-delete` | high | contents: write, metadata: read | Delete a stale claim branch |

A `high` job asks first. Before any provider is asked for its token, the
page shows one confirm naming the repository (or owner), the action and these
exact permissions, with **Allow** and **Cancel**; `gh` and `env` too. Set
up GitHub and landing setup list each write's job and permissions in
their own confirm. **Allow** lets that one step ask once,
within 10 minutes; **Cancel** writes nothing and the rest of setup goes on.
The CLI shows the same lines and asks `Allow? [y/N]`, or takes `--yes`.
The tick, agents and MCP cannot allow a high job, so there it fails as
person-only. A provider that refuses a setup step leaves it skipped, with
what a repository admin does by hand.

### When the provider fails

An error, a timeout, a refusal or a bad reply fails that GitHub call, and the
work waits as it does for any GitHub outage. One Needs you row names the
provider, the owner, the job and the reason, and clears on the next token that
works. **An owner a plugin claims never falls back to `env` or `gh`.** A
plugin that changed since its approval refuses every call for its owners
until a person approves it again. Two plugins that claim one owner both
wait until a person picks one with **Use this one** in Settings › Plugins
(or `plugin.credentials.pick`).

### Git and agents

Avoozl's own pushes and fetches sign in through `avoozl credential`, a git
credential helper that asks the same provider for that one repository and
job, in its own process. The token reaches git only through the helper's
answer, never git's environment, arguments or config, and SSH remotes of the
host are rewritten to https for that command. Workers and checks get no
token and no helper.

The helper refuses to answer when the markers Avoozl sets for agent sessions
are present. For a Kiro Crew chat this is a speed bump, not a sandbox: the
process sandbox, which keeps `plugins.json`, plugin folders and `gh`'s
config out of reach, is the barrier.

## Checks part

A `checks` part ships checks that every machine with the plugin runs on
certain repositories, such as a parity check against an outside review
service. Nothing of the plugin is written to those repositories: not its
scripts, its prompts, its paths or its name in `.avoozl.json`. Checks may
also come from a repository's own `checks` setting
([Repository checks](checks.md)).

```json [avoozl-plugin.json]
{
  "id": "acme-checks",
  "version": "1.4.0",
  "contract": 1,
  "provides": [
    "checks"
  ],
  "servers": {
    "review": {
      "about": "The acme review service, which compares API behavior"
    }
  },
  "checks": {
    "parity": {
      "repos": [
        "acme/*"
      ],
      "paths": [
        "src/api/**",
        "schema/**"
      ],
      "run": [
        "bin/parity.mjs",
        "--repo",
        "{repo}",
        "--from",
        "{base}",
        "--to",
        "{commit}"
      ],
      "env": [
        "PARITY_TOKEN"
      ],
      "network": true,
      "timeout": 1800,
      "decide": "prompts/parity.md",
      "decideAt": [
        "approve",
        "diff"
      ],
      "stage": "task"
    },
    "parity-review": {
      "repos": [
        "acme/*"
      ],
      "paths": [
        "src/api/**"
      ],
      "timeout": 3600,
      "stage": "branch",
      "mcp": {
        "server": "review",
        "start": {
          "tool": "create_review",
          "args": {
            "repo": "{repo}",
            "from": "{base}",
            "to": "{commit}",
            "diff": "{diff_path}",
            "question": "{file:ask.md}"
          },
          "id": "$.review.id"
        },
        "poll": {
          "tool": "get_review",
          "args": {
            "id": "{id}"
          },
          "everySeconds": 60,
          "until": {
            "path": "$.state",
            "in": [
              "done",
              "error"
            ]
          }
        },
        "result": {
          "path": "$.verdict",
          "pass": [
            "same"
          ],
          "text": "$.summary"
        }
      }
    }
  }
}
```

A plugin holds at most 20 checks. Each check names `repos` and exactly one
step, `run` or `mcp`:

| Key        | What it holds                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `repos`    | 1 to 50 globs over `owner/name`, such as `acme/*`. A repository with no GitHub name matches by its ID.          |
| `paths`    | Optional: 1 to 50 path globs. The check runs only for a change that touches one.                                |
| `run`      | A run step: a script inside the plugin folder, never a command on `PATH`, then its arguments.                  |
| `mcp`      | An MCP step: fixed tool calls on a local MCP server (below).                                                    |
| `env`      | Run steps only: the environment variable names the script may read.                                            |
| `network`  | Run steps only: `true` to let the script reach the network. Default `false`.                                    |
| `timeout`  | Whole seconds, 1 to 7200.                                                                                       |
| `decide`   | A Markdown prompt inside the folder that asks whether the check is needed (below).                             |
| `decideAt` | `approve`, `diff` or both. Default `diff`.                                                                      |
| `stage`    | `task` (default), `phase` or `branch` (below).                                                                  |

A `.mjs` or `.js` script runs with Avoozl's own Node, so it runs the same on
macOS, Linux and Windows. Its arguments may hold `{commit}`, `{base}` and
`{repo}`; each value is checked for its shape first, and no shell runs. The
script runs in the repository's isolation, in a worktree at the commit, with
the plugin folder readable and not writable:

```js [bin/parity.mjs]
import { execFileSync } from "node:child_process";
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const changed = execFileSync("git", ["diff", "--name-only", arg("--from"), arg("--to")], { encoding: "utf8" });
if (changed.split("\n").some((file) => file.startsWith("schema/"))) {
  console.log("parity: the schema changed");
  process.exit(1);
}
```

Every file a check names is inside the folder, so the plugin's content hash
covers it, and approving the plugin approves the scripts and the prompts.
Settings › Plugins shows each check's repositories, paths, step, network,
timeout, stage and the full text of its prompt and of each file an MCP step
sends, before you approve. A changed file asks for approval again.

### Which changes a check runs on

For each change, Avoozl applies the filters in this order, and a filter that
rules a check out skips the rest: `repos`, `paths`, the decide answer, and
then the result cache. A plugin check with the same name as one of the
repository's own checks does not run there; the repository's runs. Two
plugins with one check name for a repository are both held there, with one
Needs you item.

A decide prompt is plain Markdown:

```markdown [prompts/parity.md]
Answer whether this change can alter the public API of the service:
request or response shapes, error codes, or the published schema.
Changes only to tests, docs, comments or internal helpers do not.
```

At each point `decideAt` names, Avoozl asks one short read-only, offline
model call (the **Check decide** role in Settings › Models, the planner's
model by default) with the prompt, then the task's text (`approve`) or its
diff (`diff`) as data. Its only answer is `{"needed": true | false, "reason":
"..."}`. A failed call, bad output, no model, or an input over 200 KB counts
as needed. The task shows each answer, and a person can press **Run it** or
**Skip it** until the task's next commit. The tick makes no model call.

The result cache keeps a passed or failed result per content key: the
plugin's id, version and hash, the check's name, and the files its `paths`
match at the commit (and at the base when the step uses `{base}`). The same
content later reuses the result, marked **cached**. A merge batch's rerun
runs the check again. The cache keeps at most 5,000 entries for 30 days.

### Stages

| Stage    | Runs at                                         | A failure holds                    |
| -------- | ----------------------------------------------- | ---------------------------------- |
| `task`   | The task's commit, and each merge batch         | That task's landing                |
| `phase`  | Once every task of a phase has landed           | Nothing; one fix is proposed       |
| `branch` | Each new head of an epic's integration branch   | That head's acceptance only        |

A failed `phase` check opens one Needs you item holding the proposed fix;
**Start** makes the fix in that phase, and the check runs again once it
lands. A `phase` or `branch` check never delays a task's landing.

### MCP steps

An MCP step is a fixed program Avoozl runs itself, with no model in the
loop: it calls `start` once, then `poll` every `everySeconds` (5 to 3600)
until the value at `until.path` is one of `until.in`, then passes when the
value at `result.path` is one of `pass`. Only the `text` value is kept as the
check's output. Arguments may hold `{repo}`, `{commit}`, `{base}`,
`{diff_path}` (a file holding the change's diff), `{id}` (the task id from
`start`, in `poll`) and `{file:NAME}` (a file inside the plugin). A path is
`$` then `.key` and `[index]` parts. A reply never chooses a tool, an
argument or the next step. A restart resumes polling the same id.

Each server alias a plugin declares in `servers` is mapped on this machine
to a local stdio server, in Settings › Plugins (**Set mapping**) or with
`avoozl plugins map`. The mapping lives in this machine's `plugins.json`,
holds no credential, and its hash is part of the approval:

```json [plugins.json]
{
  "mcp": {
    "acme-checks": {
      "review": {
        "command": [
          "/opt/acme/bin/review-mcp",
          "--stdio"
        ],
        "env": [
          "REVIEW_TOKEN"
        ]
      }
    }
  }
}
```

```sh
avoozl plugins map acme-checks review --command '["/opt/acme/bin/review-mcp", "--stdio"]' --env REVIEW_TOKEN
avoozl plugins approve acme-checks --hash HASH
```

The server runs for one check and stops after it, outside the worker
sandbox, with the check environment basics plus its mapping's `env` names.

### Required by name, never posted

A repository may name a plugin check in `requiredChecks`. On a machine whose
approved plugin provides that name, a head counts as checked only when this
machine's result passed on that exact head; a GitHub check of the same name
does not count, and Setup asks for no GitHub branch rule for it. With no
provider here and no GitHub check of that name, the task waits with one
Needs you item.

Plugin check results never go to GitHub: no commit status, check run,
comment or review, under any setting. Pull request text and Activity show a
plugin check by its name and result only.

### What holds a plugin check

A plugin check sees only the check environment basics and its own `env`
names; push and GitHub credentials and the gateway's secrets never reach
it. It may not open a network listener, and nor may anything it starts or
its MCP server: one that does is stopped, failed, and its plugin is marked
broken until approved again. Approving, mapping a server and **Run it** or
**Skip it** are a person's acts. The decide call runs read-only and offline
under a process harness; as a Kiro Crew chat its tool list is its only limit,
which is a speed bump, not a sandbox.


## Context part

A `context` part gives a worker skills, read folders and MCP servers on your
own approved spec tasks in the repositories it names. It is data, so a plugin
that provides only `context` has no `entry`. Declare it on **This computer
only**: a `.avoozl.json` entry for it is ignored and Settings says so. How a
session uses it is in [Epic context](epic-context.md). A complete example is
`examples/plugins/team-context/`.

```json
{
  "id": "team-context",
  "version": "1.0.0",
  "contract": 1,
  "provides": [
    "context"
  ],
  "context": {
    "repos": [
      "acme/*"
    ],
    "skills": "skills",
    "reads": [
      {
        "id": "team-notes",
        "about": "The team's design notes",
        "path": "{ask:notesRoot}/widgets"
      }
    ],
    "ask": {
      "notesRoot": "The folder of your clone of acme/team-notes"
    },
    "mcp": "mcp/servers.json",
    "contentSets": [
      "acme-terms"
    ]
  }
}
```

- `repos` is 1 to 50 of `owner/name`, `owner/*` or a registered repository ID.
- `skills` is a folder inside the plugin with up to 20 folders. Each holds one
  `SKILL.md` of at most 64 KB whose front matter has `name` (the folder name)
  and `description`.
- `reads` is up to 20 folders, each with an `id`, an `about` and an absolute
  or `~/` `path`. A path may hold `{ask:NAME}`.
- `ask` maps each `NAME` to a question. Every `{ask:NAME}` names a key, and
  every key is used.
- `mcp` is a `.json` file inside the plugin. It maps each alias to `{about,
  command}`. `command` is an argument list whose first item is a program name
  or a path inside the plugin. The file holds no `env` and no credential.

```json
{
  "research": {
    "about": "Answers questions from the team's design archive",
    "command": [
      "node",
      "mcp/research.mjs"
    ]
  }
}
```

Each person answers each ask once and maps each alias on their machine:

```text
avoozl plugins answer team-context notesRoot ~/src/acme/team-notes
avoozl plugins map team-context research --env RESEARCH_TOKEN
```

A mapping holds the environment variable names the server may read, and
optionally a `command` that replaces the plugin's. Until every ask is answered
and every alias is mapped, the part gives nothing and one Needs you row names
the questions. The approval binds the plugin's content hash, the answers and
the mappings; changing any of them turns the plugin `changed` until you
approve it again. Settings › Plugins and the Add plugin preview list the
repositories, each skill's hash, each read as written and as filled in, each
server's command and environment names, and each content set.

## Testing your plugin

Copy the fake plugins' approach: keep the remote system in a file or a local
stand-in, declare the plugin in a temporary `plugins.json`, approve its hash,
and run ticks. Avoozl's own tests run the fake rules plugin for content rules
and the fake probe plugin through crashes, listeners, bad replies and time
limits.
