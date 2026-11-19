# Writing a plugin

A plugin adds to Avoozl without changing Avoozl itself. One plugin can
bundle several parts, so a team installs one plugin and gets its settings,
its content rules and its intake source together:

| Part       | What it is                                                        | Runs code |
| ---------- | ----------------------------------------------------------------- | --------- |
| `pack`     | Settings a person previews and copies into `.avoozl.json` once    | No        |
| `rules`    | Content rule sets supplied while Avoozl runs                      | Yes       |
| `intake`   | An intake source: its `poll` brings outside work in               | Yes       |
| `template` | A workflow template that starts a new spec from a reusable folder | No        |

Avoozl's own worker paths deliver every task, and each task's record is
local. A plugin cannot add a delivery route or a task
tracker. A manifest that lists `route`, `tracker` or `gate` is refused when
it loads.

The examples on this page are the test-only plugins in Avoozl's own test
tree: `src/app/test/fixtures/plugins/sdk-team/` bundles a pack, rules and
an intake source; `sdk-templates/` holds one workflow template;
`fake-intake/` and `fake-rules/` each provide one part. Read them alongside this guide. These
fakes are the only plugins tested so far; no real plugin has run live.

## A pack's `crews` section

A pack can carry a `crews` section for Issue Radar with one key, `labels`
(`plan`, `ready`, `conflict`). The labels go to each chosen repository's
settings. A pack creates no crew. Content rules screen the section before
it is previewed or imported. `examples/sdk-team/` is a
sample (a manifest and a pack) with made-up values; add it with `--path`.

## What a plugin is

A plugin is a folder with a manifest, `avoozl-plugin.json`, an entry module
for the parts that run code, and, with a pack, `avoozl-pack.json`:

```json
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

- `id` is lowercase letters, digits and dashes. `local` and `github` are
  reserved. An intake source names the plugin as `plugin:<id>`.
- `version` changes whenever you release a new build.
- `contract` is the contract version: which version of Avoozl's plugin
  interface this plugin was built for. It is not the plugin's own version.
  Settings shows it as **Contract version**. This Avoozl supports contract
  version `1`.
- `provides` lists the parts: `pack`, `rules`, `intake` and `template`
  (`lessons` is still accepted and does nothing). A manifest written before
  `provides` lists `kinds` instead (`intake`, `rules`), and each kind is its
  own part. With `provides`, leave `kinds` out; if you keep it, it must
  match.
- `capabilities` lists optional features per kind. An intake part may list
  `actor`. Rules list none.
- `pack` names the pack file inside the folder; it defaults to
  `avoozl-pack.json`.
- `entry` is a `.mjs` or `.js` file inside the folder. A plugin that provides
  only data parts (`pack`, `lessons`, `template`) runs no code, so it has no
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

## Declaring and approving a plugin

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

### A plugin from a git repository

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

## How Avoozl runs a plugin

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
(see "Ban private terms" in `docs/policies.md`). It lets a team ship its
list as a private package that public Avoozl never sees.

| Call           | Reply                                             |
| -------------- | ------------------------------------------------- |
| `ruleSets({})` | `{sets: [{id, version, rules: [{id, pattern}]}]}` |

- `pattern` is a regular expression, matched per line ignoring case.
- A set or rule must not carry `allow`. Allow lines exist only in a person's
  own terms file; a plugin writes its exception into the pattern itself
  (for example `\bzebra\b(?!-ui)`). A reply with `allow` is refused, which
  makes that plugin's sets unavailable.
- A `.avoozl.json` set `{ "id": "<set id>", "plugin": "<plugin id>" }` picks
  one set by id. In **Settings > Content rules**, pick the plugin as the set's
  **Rules plugin**; such a set has no terms file to edit there.
- Without a plugin, a set's rules live in its terms file,
  `.avoozl/local/content-rules/<set id>.txt`, one `name: pattern` per line,
  plus `allow:` lines for false matches.
  Settings edits it with a Rule builder (word or phrase, or pattern) and a
  File view, writes it readable by your account only, and refuses to write
  it where Git could commit it. **How rules work** on that tab explains the
  format with made-up examples.
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
  "description": "Triage labels, triggers and who counts for SDK repositories.",
  "settings": {
    "repositories": {
      "minimumPermission": "write",
      "rules": [
        {
          "id": "ask",
          "action": "respond",
          "match": "label:question -label:needs-triage"
        }
      ],
      "untriaged": {
        "filter": "label:needs-triage",
        "triageLabels": ["response-requested", "closing-soon"]
      }
    },
    "contentRules": { "sets": [{ "id": "team-terms", "plugin": "sdk-team" }] }
  }
}
```

What a pack may set, and where each lands in `.avoozl.json`:

| Pack key                     | Sets                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings.repositories`      | For each repository you pick at import: `rules` (trigger `match` lines), `untriaged`, `allowedActors`, `minimumPermission`, `requiredChecks`, `priorityLabels`, `managedLabels`. |
| `settings.epicIssueType`     | `github.epicIssueType`                                                                                                                                                                                                  |
| `settings.contentRules.sets` | Rule set references by id (`plugin`, `action`, `boundaries`), never rules                                                                                                                                               |
| `settings.delivery`          | `reviewers` (review roles), `agent`, `model`.                                                                                                                                      |
| `settings.flow`              | Flow settings, such as `retro.everyTasks`                                                                                                                                                |

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
avoozl plugins pack-preview sdk-team
avoozl plugins pack-import sdk-team --preview HASH [--accept-lowered]
```

## Template part

A workflow template starts a new spec the same way each time, such as one
SDK rewrite after another. It is data only. Each template is a folder under
`templates/` in the plugin:

```
templates/sdk-rewrite/
  avoozl-template.json
  prompt.md
  starter/requirements.md
  starter/design.md
  starter/tasks.md
```

`avoozl-template.json` holds:

| Key                          | Holds                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `title`, `description` | What the New spec drawer shows                                                                                                           |
| `inputs`                     | Fields the person fills; each has `id`, `label`, `type` (`text`, `choice` with `options`, `file`, `repositories`, `epic`) and `required` |
| `prompt`                     | The planner prompt, a Markdown file                                                                                                      |
| `starter`                    | A spec folder in the usual layout                                                                                                        |
| `phases`                     | Optional: the starter's phases, `{id, title}` in order                                                                                   |
| `proofKinds`                 | Optional: proof outlines the prompt asks the planner to fill in                                                                          |
| `pack`                       | Optional: a settings pack, as in the pack part                                                                                           |
| `flow`                       | Optional: flow defaults: `batch`, `stopTheLine`, `localChecksFirst`, `retro.everyTasks`                                                  |

The prompt and starter files may use `{{<input id>}}`. Avoozl puts in what
the person typed, as plain text, once, and never runs it. A `file` input is
read in the page, at most 200 KB of text; Avoozl never opens a path someone
typed. The plugin shows as invalid, naming the key or file, when:

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
flow defaults. Proof P37 runs it with a fake GitHub; no template has run
live yet.

A starter may hold manual tasks (`"manual": true`): steps only a person
does. See [Manual tasks and task links](policies.md#manual-tasks-and-task-links).

## Intake part

An intake source is the `intake` part. Its one call is `poll`. The fake
intake plugin (`fake-intake/`) is the example: its `poll` reads a JSON file
of items and returns those changed since the cursor.

| Call                    | Reply                                                                  |
| ----------------------- | ---------------------------------------------------------------------- |
| `poll({cursor, limit})` | `{items, cursor, more}`: items changed since `cursor`, at most `limit` |

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

- `cursor` is your own text of at most 2,000 characters, or null on the
  first poll. Return the cursor for the next poll and `more: true` when a
  page is left. Avoozl asks for at most 500 items, polls each source at most
  once per tick, and stores the new cursor only after every item of the
  reply is handled, so a crash replays the same page. A failed poll keeps
  the cursor and the items and shows the error on the source.
- Each item has `id`, `link` (`http` or `https`), `kind` (`issue`, `pr`,
  `review` or `ticket`), `title`, `state` (`open` or `closed`), and
  `updatedAt`; and may have `body`, `labels`, `author`, `assignees`,
  `closeReason`, `closedBy`, `closedAt`, `fields` (text, number or
  true/false values) and `trigger`. An item that breaks a limit is refused
  with a reason naming the field; the other items of the reply still count.
- `trigger` is `{actor, permission, eventId, at}`: who last changed what a
  rule would match, and that person's standing in your system, mapped to
  `none`, `read`, `triage`, `write`, `maintain` or `admin`. Avoozl checks it
  against the source's `allowedActors` and `minimumPermission` (default
  `write`). Without the `actor` capability nobody counts, so your items only
  list, pause or quarantine. A close counts as an order only when
  `closedBy` is the trigger's actor and that actor counts.
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

`repository` names a registered repository: its trigger rules apply, and a
delivered item's task lands there. A rule matches a source's items only
with a `source:` term, such as `label:go source:tickets`; a rule without
one matches GitHub only. `labelFields` adds a `<field>:<value>` label per
field and `assigneeField` an assignee before matching. Items no rule takes
show in the **Intake** tab with their source.

## Testing your plugin

Copy the fake plugins' approach: keep the remote system in a file or a local
stand-in, declare the plugin in a temporary `plugins.json`, approve its hash,
and run ticks. Avoozl's proof P35 installs, previews, imports and polls the
`sdk-team` bundle, proof P37 starts a spec from the `sdk-templates`
template, and proof P32 polls the fake intake plugin as an intake source.
