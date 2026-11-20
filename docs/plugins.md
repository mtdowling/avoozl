# Writing a plugin

A plugin adds to Avoozl without changing Avoozl itself, and one plugin can
bundle several parts. A team installs one plugin and gets its settings, its
content rules and its intake source together.

```json [avoozl-plugin.json]
{
  "id": "sdk-team",
  "version": "1.0.0",
  "contract": 1,
  "provides": ["pack", "rules", "intake"],
  "capabilities": { "intake": ["actor"], "rules": [] },
  "pack": "avoozl-pack.json",
  "entry": "index.mjs"
}
```

A plugin is a folder with a manifest, `avoozl-plugin.json`, an entry module for
the parts that run code, and, with a pack, `avoozl-pack.json`. The manifest
lists the parts the plugin provides:

| Part       | What it is                                                        | Runs code |
| ---------- | ----------------------------------------------------------------- | --------- |
| `pack`     | Settings a person previews and copies into `.avoozl.json` once    | No        |
| `rules`    | Content rule sets supplied while Avoozl runs                      | Yes       |
| `intake`   | An intake source: its `poll` brings outside work in               | Yes       |
| `template` | A workflow template that starts a new spec from a reusable folder | No        |
| `policy`   | A limit this machine holds Avoozl to, such as no triage agent     | No        |
| `credentials` | GitHub tokens, per job, from the organization's own provider | Yes, in its own process |

Avoozl's own worker paths deliver every task, and each task's record is local.
A plugin cannot add a delivery route or a task tracker, and Avoozl refuses a
manifest that lists `route`, `tracker` or `gate` when it loads.

The examples on this page are the test-only plugins in Avoozl's own test tree.
`src/app/test/fixtures/plugins/sdk-team/` bundles a pack, content rules and an
intake source, `sdk-templates/` holds one workflow template, and `fake-intake/`
and `fake-rules/` each provide one part. Read them alongside this guide. These
fakes are the only plugins tested so far, and no real plugin has run live.

## Plugin manifest

These keys appear in the manifest:

- `id` is lowercase letters, digits and dashes. `local` and `github` are
  reserved. An intake source names the plugin as `plugin:<id>`.
- `version` changes whenever you release a new build.
- `contract` is the contract version: which version of Avoozl's plugin
  interface this plugin was built for. It is not the plugin's own version.
  Settings shows it as **Contract version**. This Avoozl supports contract
  version `1`.
- `provides` lists the parts: `pack`, `rules`, `intake`, `template` and
  `policy`.
- `capabilities` lists optional features per kind. An intake part may list
  `actor`. Rules list none.
- `pack` names the pack file inside the folder; it defaults to
  `avoozl-pack.json`.
- `entry` is a `.mjs` or `.js` file inside the folder. A plugin that provides
  only data parts (`pack`, `template`, `policy`) runs no code, so it has no
  `entry`; Avoozl refuses one that names an entry, and never starts a
  process for it.

The entry module exports one object per kind: `intake` or `rules`. Each
method takes `(params, { config })` and returns a JSON value or a promise of
one:

```js
export const intake = {
  poll({ cursor, limit }, { config }) { ... },
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
      "id": "fake-intake",
      "path": "../fake-intake",
      "contract": 1,
      "config": { "intakeFile": "intake.json" }
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
  "id": "fake-intake",
  "git": "https://git.example.com/team/fake-intake.git",
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
hash, a SHA-256 over every file in the folder, the pack included. The
approval lists the parts and is stored on this machine only. Any change to
the version or to any file needs approval again. The tick and example
installation never approve a plugin.

A plugin **shared with the repo** puts its entry in `.avoozl.json`, where
it is committed and reviewed like any other change. Each computer still
approves it for itself. Because a shared entry is the same on every
computer, its `config` holds no machine path: name an environment variable
(`termsFileEnv`, `intakeFileEnv`) that holds each computer's own path, as the
`sdk-team` sample does.

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
  unavailable for that tick. Its intake source or rule sets show the reason,
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

## Pack part

A pack is settings only. Avoozl never runs anything from it. It is one JSON
file:

```json
{
  "description": "Who counts, priority and waiting labels for SDK repositories.",
  "settings": {
    "repositories": {
      "minimumPermission": "write",
      "priorityLabels": ["p0", "p1", "p2", "p3"],
      "waitingLabels": ["response-requested"]
    },
    "contentRules": { "sets": [{ "id": "team-terms", "plugin": "sdk-team" }] }
  }
}
```

What a pack may set, and where each lands in `.avoozl.json`:

- `settings.repositories` sets, for each repository you pick at import,
  `allowedActors`, `minimumPermission`, `requiredChecks`, `priorityLabels` and
  `waitingLabels`.
- `settings.epicIssueType` sets `github.epicIssueType`.
- `settings.contentRules.sets` holds rule set references by ID (`plugin`,
  `action`, `boundaries`), never rules.
- `settings.delivery` sets `reviewers` (review roles), `agent`, `model` and
  `concurrency`.
- `settings.flow` sets flow settings, such as `retro.everyTasks`.

- Every key is checked with the same rules Settings uses. Any other key is
  refused by name, such as `Pack key settings.repositories.autoMerge is not
a pack setting.`, and the plugin shows as invalid until it is fixed.
- A pack cannot hold a credential or a content rule pattern. Terms come
  from the `rules` part at run time, so they are never stored in a public
  repository.
- A pack has no follow mode and no org minimums. Avoozl copies the
  settings once; after that they are the repository's own settings.

**Import.** On the plugin's card in **Settings > Plugins**, **Preview and
import pack** shows each setting as **Create**, **Change**, **Keep** or
**Skip** (a setting that cannot apply here, such as repository rules with no
repository chosen), with the old and new values. Nothing is written until
**Import settings**, and only:

- after this computer approved this exact plugin version;
- for the exact preview shown: if the pack or `.avoozl.json` changed since,
  Avoozl asks you to preview again;
- when a setting would let more people give orders than before (a lower
  `minimumPermission`, or new `allowedActors`), only after you accept that
  change, which the preview names on its own line;
- for a plugin declared on this computer only, after you confirm that its
  id and settings go into `.avoozl.json`.

Import writes `packs` into `.avoozl.json`: for each plugin, the version
imported, when and by whom, and the settings that came from it. When a
newer version arrives, approve it, and the card offers its preview again;
importing it records the new version. At the command line:

```sh
avoozl plugins pack-preview sdk-team [--github OWNER/REPO]
avoozl plugins pack-import sdk-team --preview HASH [--accept-lowered]
```

## Template part

A workflow template starts a new spec the same way each time, such as one
SDK rewrite after another. It is data only. Each template is a folder under
`templates/` in the plugin:

```text
templates/sdk-rewrite/
  avoozl-template.json
  prompt.md
  starter/requirements.md
  starter/design.md
  starter/tasks.md
```

`avoozl-template.json` holds:

- `id`, `title` and `description` are what the New spec drawer shows.
- `inputs` are the fields the person fills. Each has `id`, `label`, `type`
  (`text`, `choice` with `options`, `file`, `repositories` or `epic`) and
  `required`.
- `prompt` is the planner prompt, a Markdown file.
- `starter` is a spec folder in the usual layout.
- `phases` is optional: the starter's phases, `{id, title}` in order.
- `proofKinds` is optional: proof outlines the prompt asks the planner to fill
  in.
- `pack` is optional: a settings pack, as in the pack part.
- `flow` is optional: flow defaults `stopTheLine`, `localChecksFirst`
  and `retro.everyTasks`.

The prompt and starter files may use a placeholder for an input:

```text
{{<input id>}}
```

Avoozl puts in what the person typed, as plain text, once, and never runs it. A
`file` input is read in the page, at most 200 KB of text; Avoozl never opens a
path someone typed. The plugin shows as invalid, naming the key or file, when:

- a key or input setting is unknown, or an input ID is used twice;
- a file uses a placeholder that is no input ID;
- the starter, with sample values put in, does not lint clean;
- `phases` does not match the starter's headings or `phase` facts;
- `pack` or `flow` fails its own check.

A template is offered only while its plugin is approved on this computer.
In **New spec**, choose **From template**, pick it, and fill its inputs
beside Name, Category and Epic. Submit checks the inputs and runs content
rules on the seed, then opens a planner chat with the prompt, the filled
starter and the inputs. Picking a template changes no setting: with a `pack`
or `flow`, the drawer shows the pack preview with **Import these settings**
unticked, and only ticking it imports them, as Settings does. The folder
comes back as a draft spec that records the template; with an epic picked,
the epic's change comes back as its own draft. Nothing is approved, started
or pushed.

The sample `sdk-templates/` plugin has an **SDK rewrite** template: six
phases (inventory, codegen, runtime, protocol tests, review, cutover), a
manual **Review with team** task that cutover waits on, two proof kinds and
flow defaults. A test runs it with a fake GitHub; no template has run live
yet.

A starter may hold manual tasks (`"manual": true`): steps only a person
does. See [Manual tasks and task links](manual-tasks.md).

## Policy part

A policy part is a limit a machine holds Avoozl to. It is data only, so a
plugin that provides only `policy` has no `entry` and runs no code. The one
limit so far blocks the [triage agent](triage.md):

```json [avoozl-plugin.json]
{
  "id": "team-policy",
  "version": "1.0.0",
  "contract": 1,
  "provides": ["policy"],
  "policy": {
    "triage": "blocked",
    "reason": "Our team triages issues by hand."
  }
}
```

`triage` must be `"blocked"` and `reason` 1 to 300 characters. Avoozl
reads the policy only from a plugin declared in this machine's `plugins.json`
and approved here, so the block stays on this machine: a plugin that
`.avoozl.json` declares sets no policy, and the block never writes the
repository. While it holds, **Set up triage** shows the reason instead of
its button, `avoozl triage setup` and `triage.setup` refuse with it, and a
repository whose agent is on runs no triage and shows one Needs you row.
Disable or remove the plugin to lift the block.

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
  "provides": ["credentials"],
  "credentials": {
    "entry": "token.mjs",
    "hosts": ["github.com"],
    "owners": ["acme", "acme-labs"]
  }
}
```

`hosts` lists 1 to 10 lowercase GitHub host names, with an optional
`:port`. `owners`, optional, lists 1 to 100 users or organizations; without
it the plugin claims every owner on its hosts. Every other owner signs in
with `env` or `gh` (see [How Avoozl signs in](github.md#how-avoozl-signs-in)).
`entry` is the credentials module; it runs in a child process of its own,
apart from any intake or rules code of the same plugin.

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
      "config": { "serviceUrl": "https://tokens.example.com/mint", "keyEnv": "ACME_TOKEN_KEY" }
    }
  ]
}
```

```js [token.mjs]
// A fake provider: asks the organization's token service for a token
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
| `triage` | low | contents: read, issues: write, metadata: read, pull_requests: write | Comment on and label new issues (triage agent) |
| `respond` | low | discussions: write, issues: write, metadata: read | Answer discussions and issues |
| `page-actions` | low | contents: read, issues: write, metadata: read, pull_requests: write | A person's comment, label, assignee or review |
| `integration` | low | checks: read, contents: write, metadata: read, statuses: read | Move an epic's integration branch |
| `worker-grants` | low | contents: write, issues: write, metadata: read | Open and checkpoint worker branches |
| `workspace-publish` | low | contents: write, metadata: read, pull_requests: write | Publish a workspace repository |
| `own-branch-delete` | low | contents: write, metadata: read | Delete a worker branch Avoozl pushed |
| `repo-setup` | high | administration: write, issues: write, metadata: read | Create labels and set up repository checks |
| `issue-types-setup` | high | organization_administration: write | Create an organization's issue types |
| `landing-setup` | high | administration: write, metadata: read, statuses: write, variables: write | Set rulesets, repository settings and variables |
| `triage-setup` | high | issues: write, metadata: read | Create the triage agent's labels |
| `branch-delete` | high | contents: write, metadata: read | Delete a branch |

A `high` job asks first. Before any provider is asked for its token, the
page shows one confirm naming the repository (or owner), the action and these
exact permissions, with **Allow** and **Cancel**; `gh` and `env` too. Set
up GitHub, landing setup and triage setup list each write's job and
permissions in their own confirm. **Allow** lets that one step ask once,
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

## Intake part

An intake source is the `intake` part. Its one call is `poll`. The fake
intake plugin (`fake-intake/`) is the example: its `poll` reads a JSON file
of items and returns those changed since the cursor.

The call is `poll({cursor, limit})`, and it replies with
`{items, cursor, more}`: the items changed since `cursor`, at most `limit`.

```js
export const intake = {
  poll({ cursor, limit }, { config }) {
    const changed = readItems(config).filter(
      (item) => !cursor || mark(item) > cursor,
    );
    const page = changed.slice(0, limit);
    return {
      items: page,
      cursor: page.length ? mark(page.at(-1)) : cursor,
      more: changed.length > page.length,
    };
  },
};
```

- `cursor` is your own text of at most 2,000 characters, or null on the first
  poll. Return the cursor for the next poll and `more: true` when a page is
  left. Avoozl asks for at most 500 items, polls each source at most once per
  tick, and stores the new cursor only after every item of the reply is handled,
  so a crash replays the same page. A failed poll keeps the cursor and the items
  and shows the error on the source.
- Each item has `id`, `link` (`http` or `https`), `kind` (`issue`, `pr`,
  `review` or `ticket`), `title`, `state` (`open` or `closed`), and `updatedAt`;
  and may have `body`, `labels`, `author`, `assignees`, `closeReason`,
  `closedBy`, `closedAt`, `fields` (text, number or true/false values) and
  `trigger`. An item that breaks a limit is refused with a reason naming the
  field; the other items of the reply still count.
- `trigger` is `{actor, permission, eventId, at}`: who last changed the item,
  and that person's standing in your system, mapped to `none`, `read`, `triage`,
  `write`, `maintain` or `admin`. Avoozl checks it against the source's
  `allowedActors` and `minimumPermission` (default `write`). Without the `actor`
  capability nobody counts. A close counts as an order only when `closedBy` is
  the trigger's actor and that actor counts.
- Avoozl writes nothing back to an intake source.

Declare the source under `intake.sources`, in `.avoozl.json` or in this
machine's `plugins.json` when its name must stay private:

```json
{
  "intake": {
    "sources": {
      "tickets": {
        "via": "plugin:fake-intake",
        "repository": "example/app",
        "labelFields": ["component"],
        "minimumPermission": "write"
      }
    }
  }
}
```

`repository` names a registered repository: a delivered item's task lands
there. `labelFields` adds a `<field>:<value>` label per field and
`assigneeField` an assignee to each item. No item starts work by itself:
`avoozl intake list` shows them with their source, and a person runs
`avoozl intake deliver` or `avoozl intake plan`.

## Testing your plugin

Copy the fake plugins' approach: keep the remote system in a file or a local
stand-in, declare the plugin in a temporary `plugins.json`, approve its hash,
and run ticks. Avoozl's own tests install, preview, import and poll the
`sdk-team` bundle, start a spec from the `sdk-templates` template, and poll the
fake intake plugin as an intake source.
