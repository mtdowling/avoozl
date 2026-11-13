# Writing a plugin

A plugin adds to Avoozl without changing Avoozl itself. One plugin can
bundle several parts, so a team installs one plugin and gets its settings,
its content rules, its tracker and its intake source together:

| Part      | What it is                                                                 | Runs code |
| --------- | -------------------------------------------------------------------------- | --------- |
| `pack`    | Settings a person previews and copies into `.avoozl.json` once             | No        |
| `rules`   | Content rule sets supplied while Avoozl runs                               | Yes       |
| `tracker` | A task tracker that keeps Avoozl's task records                            | Yes       |
| `intake`  | An intake source: the tracker kind's `poll`, which brings outside work in | Yes       |
| `route`   | A delivery route for tasks that are not run by a local worker              | Yes       |

Local and GitHub are the only built-in routes and trackers. Everything
else, including any integration that must stay private, is a separate
package or folder that plugs in here.

The examples on this page are the test-only plugins in Avoozl's own test
tree: `src/app/test/fixtures/plugins/sdk-team/` bundles a pack, rules, a
tracker and an intake source; `fake-route/`, `fake-tracker/` and
`fake-rules/` each provide one part. Read them alongside this guide.

## What a plugin is

A plugin is a folder with a manifest, `avoozl-plugin.json`, an entry module
for the parts that run code, and, with a pack, `avoozl-pack.json`:

```json
{
  "id": "sdk-team",
  "version": "1.0.0",
  "contract": 1,
  "provides": ["pack", "rules", "tracker", "intake"],
  "capabilities": { "tracker": ["actor", "poll"], "rules": [] },
  "pack": "avoozl-pack.json",
  "entry": "index.mjs"
}
```

- `id` is lowercase letters, digits and dashes. `local` and `github` are
  reserved. Tasks name the plugin as `plugin:<id>`.
- `version` changes whenever you release a new build.
- `contract` is the contract version: which version of Avoozl's plugin
  interface this plugin was built for. It is not the plugin's own version.
  Settings shows it as **Contract version**. This Avoozl supports contract
  version `1`.
- `provides` lists the parts: `pack`, `rules`, `tracker`, `intake` and
  `route`. `intake` runs as the `tracker` kind and needs the `poll`
  capability. A manifest written before `provides` lists `kinds` instead
  (`route`, `tracker`, `rules`), and each kind is its own part. With
  `provides`, leave `kinds` out; if you keep it, it must match.
- `capabilities` lists optional features per kind. A tracker may list
  `edges`, `subtasks`, `actor`, `pause` and `poll`. A route lists none yet.
- `pack` names the pack file inside the folder; it defaults to
  `avoozl-pack.json`.
- `entry` is a `.mjs` or `.js` file inside the folder. A plugin that provides
  only a pack runs no code, so it has no `entry`; Avoozl refuses one that
  names an entry, and never starts a process for it.

The entry module exports one object per kind: `route`, `tracker`, or
`rules`. Each
method takes `(params, { config })` and returns a JSON value or a promise of
one:

```js
export const route = {
  submit({ task, brief }, { config }) { ... },
  status({ id }, { config }) { ... },
  completion({ id }, { config }) { ... },
  cancel({ id }, { config }) { ... },
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
      "id": "fake-route",
      "path": "../fake-route",
      "contract": 1,
      "config": { "stateFile": "route-state.json" }
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
{ "id": "fake-route", "git": "https://git.example.com/team/fake-route.git",
  "ref": "v1.0.0", "subdir": "plugin", "contract": 1 }
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
(`termsFileEnv`, `stateFileEnv`) that holds each computer's own path, as the
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
  unavailable for that tick. Its tasks show "needs you" with the reason, and
  every other task keeps moving. The next tick tries again. A plugin's tasks
  never fall back to another route or tracker on their own.

## Route kind

A task whose manifest entry says `"route": "plugin:<id>"` is delivered by
that route instead of a local worker session. One graph can mix routes, for
example a local leaf, then a remote one, then a local one.

| Call                    | Reply                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| `submit({task, brief})` | `{id, link}`: the remote ID and a link to the work                               |
| `status({id})`          | `{state, link?, reason?}`: `queued`, `running`, `needs-person`, `failed`, `done` |
| `completion({id})`      | `{pr?, answer?}`: a pull request link, an answer, or both                        |
| `cancel({id})`          | `{cancelled}`                                                                    |

- `submit` gets the task's own title, summary, acceptance and checks, and a
  brief. Make it idempotent by task ID.
- The tick reads `status` every tick until the work is done. `needs-person`
  shows the task as "needs you" with your link.
- A remote task is done only when `status` says `done` and `completion`
  returns its result. Each dependent's brief quotes that result as data.
- `failed` stops the task for a person. `route.resubmit` starts it again.

## Tracker kind

A task with `"authority": "plugin:<id>"` keeps its record in that tracker,
the way a GitHub task keeps its record in an issue. SQLite only caches it:
direct edits are refused, and changes go through the plan and projection.

| Call                               | Reply                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `project({task, desired, marker})` | `{id, link, marker}`: create or update the record, idempotent by namespace and task ID |
| `read({ids})`                      | `{records: [...]}`: each record's state and fields                                     |
| `list({namespace})`                | `{records: [...]}`: every record carrying this namespace, for rebuild                  |
| `close({id, reason})`              | `{closed}`: close with reason `completed` or `not_planned`                             |

Each record in a `read` or `list` reply has:

- `id`, `link`, `state` (`open` or `closed`), and `closeReason` when closed;
- `fields`: the managed values as they are in the tracker now: `title`,
  `section` (the managed description section) and `tags`, plus `blockedBy`
  with the `edges` capability;
- `marker`: the namespace, task ID and last applied values Avoozl stored with
  the record, returned unchanged;
- with the `actor` capability, `closedBy` and `pausedBy`: who closed or paused
  it; with `pause`, `paused`.

Rules a tracker plugin must follow:

- **Store the marker.** Keep the `marker` from `project` with the record (a
  hidden field or a managed description section) and return it unchanged from
  `project`, `read` and `list`. A plugin that does not is refused as a
  tracker.
- **Edges.** Without the `edges` capability, the graph stays in Avoozl: its
  edges come from the approved plan. With `edges`, `desired.blockedBy` lists
  the record IDs that block this one; store them as the tracker's own links.
- **Edit only managed fields.** Avoozl changes the title, the managed section,
  managed tags and, with `edges`, blocking links. A field a person changed is a
  conflict that Avoozl reports and leaves alone.
- **Completion is Avoozl's.** Avoozl decides a task is done and then calls
  `close(id, "completed")`. A close or pause by someone else is judged with
  the actor you report, against the entry's `config.allowedActors`. Without
  the `actor` capability, every outside close holds the task's dependents for
  a person.

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
        { "id": "deliver", "action": "deliver",
          "match": "label:avoozl:deliver -label:needs-triage -label:response-requested" }
      ],
      "untriaged": { "filter": "label:needs-triage",
                     "triageLabels": ["response-requested", "closing-soon"] }
    },
    "project": { "fields": { "status": "Status", "release": "Release" } },
    "contentRules": { "sets": [{ "id": "team-terms", "plugin": "sdk-team" }] }
  }
}
```

What a pack may set, and where each lands in `.avoozl.json`:

| Pack key                     | Sets                                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings.repositories`      | For each repository you pick at import: `rules` (trigger `match` lines), `untriaged`, `allowedActors`, `minimumPermission`, `requiredChecks`, `priority`, `managedLabels`, `concurrency` |
| `settings.project`           | `github.project.fields` and `statusValues`, when a GitHub Project is set                                                                                   |
| `settings.epicIssueType`     | `github.epicIssueType`                                                                                                                                     |
| `settings.contentRules.sets` | Rule set references by id (`plugin`, `action`, `boundaries`), never rules                                                                                  |
| `settings.delivery`          | `reviewers` (review roles), `agent`, `model`, `runner`, `concurrency`                                                                                      |
| `settings.flow`              | Flow settings, such as `batch.max`                                                                                                                         |

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
**Skip** (a setting that cannot apply here, such as Project fields with no
Project set), with the old and new values. Nothing is written until
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

## Intake part

An intake source is a tracker kind with the `poll` capability, listed in
`provides` as `intake`:

| Call                    | Reply                                                                   |
| ----------------------- | ----------------------------------------------------------------------- |
| `poll({cursor, limit})` | `{items, cursor, more}`: items changed since `cursor`, at most `limit` |

- `cursor` is your own text of at most 2,000 characters, or null on the
  first poll. Return the cursor for the next poll and `more: true` when a
  page is left.
- Each item has `id`, `link` (`http` or `https`), `kind` (`issue`, `pr`,
  `review` or `ticket`), `title`, `state` (`open` or `closed`), and
  `updatedAt`; and may have `body`, `labels`, `author`, `assignees`,
  `closeReason`, `closedBy`, `closedAt` and `fields` (text, number or
  true/false values). An item that breaks a limit is refused with a reason
  naming the field; the other items of the reply still count.
- A plugin that provides `intake` but not `tracker` is never asked to
  `project`, `read`, `list` or `close`.
- The contract is in place now. Storing items, the trigger rules over them
  and the Untriaged list for every source come with incoming items
  (Requirement 50).

## Testing your plugin

Copy the fake plugins' approach: keep the remote system in a file or a local
stand-in, declare the plugin in a temporary `plugins.json`, approve its hash,
and run ticks. Avoozl's proof P26 does exactly this with the two fakes, and
proof P35 installs, previews, imports and polls the `sdk-team` bundle.
