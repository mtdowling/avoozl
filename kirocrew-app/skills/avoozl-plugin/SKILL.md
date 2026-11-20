---
name: avoozl-plugin
description: Design, write, and test an Avoozl plugin, including a bundle that ships a settings pack, content rules, and an intake source in one install. Use when a user asks to build, review, or package an Avoozl plugin or config pack, or opens Design a plugin in Settings > Plugins.
---

# Avoozl plugin

Use this skill when a user wants to add to Avoozl without changing Avoozl:
a team's shared settings, content rules, an intake source, or workflow
templates. The full contract is `docs/plugins.md` in the Avoozl
repository (Settings > Plugins > **Plugin guide** shows it); read it before
writing code. The worked example is `src/app/test/fixtures/plugins/sdk-team/`.

## Rules

- A person approves every plugin version on their own computer. Never
  approve one, never import a pack, and never tell the user it is done
  before they did it in Settings > Plugins or with the CLI.
- A pack is settings only. Put no code, script, or install step in it.
- Keep credentials and private terms out of the plugin, the pack, and
  `.avoozl.json`. Config names an environment variable (`tokenEnv`,
  `termsFileEnv`) instead; rule patterns come from the `rules` part at run
  time.
- Keep public text free of private system, host, and company names. Write
  "a private tracker" or "an internal code review system".
- Never open a network listener in a plugin. Calls out are fine. A plugin
  that listens is stopped and marked broken.

## Plan it with the user

Work in this order, and confirm each step before the next:

1. Ask what the plugin is for and which system it talks to, if any.
2. Pick the parts (below) and say why each is needed.
3. Pick the source and where it applies (below).
4. Write the folder: manifest, pack, entry module, and a test.
5. Run the checks, then hand the user the steps that are theirs.

## Pick the parts

Ask what the team needs, then list only those parts in `provides`:

| Need                                                                                                            | Part       |
| --------------------------------------------------------------------------------------------------------------- | ---------- |
| Who counts, priority and waiting labels, checks, review roles, flow and delivery defaults       | `pack`     |
| Terms Avoozl must never write                                                                                   | `rules`    |
| Outside work brought in on each tick                                                                            | `intake`   |
| A repeated kind of work started the same way each time, as folders under `templates/`                           | `template` |
| GitHub sign-in through the organization's own short-lived tokens, per job                                        | `credentials` |
| A limit on the machines that approve it: `"policy": {"triage": "blocked", "reason": "..."}` blocks the triage agent | `policy`   |
| Checks every engineer's machine runs on certain repositories, kept out of those repositories                    | `checks`   |

A plugin with only `pack`, `template`, `policy` or `checks` has no `entry` and
runs no plugin process. A `policy` part counts only when the plugin is
declared in the machine's `plugins.json`, never in `.avoozl.json`. A `checks`
part's scripts run as checks, and an MCP step calls a local MCP server this
machine maps by alias; see the Checks part in `docs/plugins.md`. Its results
never go to GitHub.

A `credentials` part runs from its own `credentials.entry`, in a child of
its own; see **Credentials** below.

The code kinds are `intake` and `rules`. A manifest written
before `provides` lists `kinds` instead; with `provides`, leave `kinds` out,
or make it match.

## The manifest

`avoozl-plugin.json` in the plugin folder:

- `id`: lowercase letters, digits and dashes. `local` and `github` are
  reserved. An intake source names it as `plugin:<id>`.
- `version`: change it on every release; a new version needs approval again.
- `contract`: the **Contract version**, which version of Avoozl's plugin
  interface the plugin was built for. It is not the plugin's own version.
  This Avoozl supports contract version `1`. The `plugins` entry that
  declares the plugin names the same number, or the plugin is unavailable.
- `provides`: the parts above, each once.
- `capabilities`: optional features per kind. An intake part may list
  `actor`, which says it reports who acted. Rules list none.
- `pack`: the pack file, `avoozl-pack.json` by default.
- `entry`: a `.mjs` or `.js` file inside the folder, only when a part runs
  code.

## Write it

1. Create the folder with `avoozl-plugin.json` as above.
2. For a pack, write `avoozl-pack.json` with `description` and `settings`.
   Use only the keys in the pack table of `docs/plugins.md`; Avoozl refuses
   any other key by name. Content rule sets are references
   (`{ "id": "...", "plugin": "<this id>" }`), never patterns.
3. For code parts, export `rules` or `intake` (with `poll`) from the entry
   module. Every method takes `(params, { config })`
   and returns JSON. Write nothing to stdout; it carries the protocol.
4. Make every reply match the contract tables in `docs/plugins.md`. Links
   are `http` or `https`. A `poll` reply is `{items, cursor, more}`. A rules
   reply never carries `allow`; write the exception into the pattern.
5. For a template, write `templates/<name>/avoozl-template.json` with `id`,
   `title`, `description`, `inputs`, `prompt` (a Markdown file) and
   `starter` (a spec folder), and optional `phases`, `proofKinds`, `pack`
   and `flow`. Use `{{<input id>}}` only for real input IDs. The starter
   must lint clean with sample values put in, and `phases` must match its
   headings. Put a step only a person does in it as a manual task
   (`"manual": true`, no checks; it completes by a person). Copy the
   `sdk-templates` sample (`src/app/test/fixtures/plugins/sdk-templates/`)
   and its proof (`src/app/test/proof-p37.test.mjs`).

## Credentials

A `credentials` part hands Avoozl a GitHub token per job. The manifest holds
`"credentials": {"entry": "token.mjs", "hosts": ["github.com"], "owners": ["acme"]}`;
`owners` is optional (1 to 100 owners; without it every owner on the host).
The entry exports `credentials.token({repository, owner, permissions, purpose}, {config})`
and returns `{token, expiresAt, login, granted, person?}`. Throw to refuse a
job. Declare it on **This computer only**: a `.avoozl.json` entry for it is
invalid. An owner it claims never falls back to `gh`. Copy the fake
provider in `docs/plugins.md` (Credentials part), with neutral names such as
`acme-github` and `acme-bot[bot]`.

## Where it comes from

A `plugins` entry names exactly one source:

| Source  | Entry key              | Notes                                                                                   |
| ------- | ---------------------- | --------------------------------------------------------------------------------------- |
| Folder  | `path`                 | Relative to the file that declares it. A shared folder is a path inside the repository. |
| Package | `package`              | Installed into the `plugins` folder beside `plugins.json`.                              |
| Git     | `git`, `ref`, `subdir` | `ref` resolves to one commit. No hooks, no submodules, no `npm install`.                |

Commit a git plugin ready to run, bundled or with `node_modules`. Avoozl
refuses a git URL with a password or token in it.

## Where it applies

Add plugin's third step, **Applies to**:

- **This computer only** writes the entry to this computer's `plugins.json`,
  beside the global Avoozl configuration. It is never committed. Use it for
  a plugin whose name must stay private.
- **Shared with the repo** writes the entry to `.avoozl.json`, reviewed in
  Git like any change. Each computer still approves it for itself, installs
  a shared package, and fetches a shared git plugin with **Update**. Its
  `config` holds no machine path; name an environment variable instead.

## Approval

Nothing loads until a person approves it, in Settings or with
`avoozl plugins approve ID --hash HASH [--commit SHA]`. The approval pins
the exact version, the content hash (SHA-256 over every file in the folder,
the pack included) and, for git, the commit. Any change to the version, a
file, or the commit needs approval again. The tick never approves and never
fetches.

## Check it

1. Test against a fake host, as Avoozl's own tests do. Copy the `sdk-team`
   proof (`src/app/test/proof-p35.test.mjs`) and the single-part fakes
   (`fake-intake`, `fake-rules`): a temporary workspace, the
   remote system kept in a file, the plugin declared in a temporary
   `plugins.json`, approved by hash, the pack previewed and imported, and
   the code parts called through `pluginHost(...).open()`.
2. Run `avoozl plugins add ID --path DIR` (or `--package NAME`, or
   `--git URL --ref REF [--subdir DIR]`; add `--repository` to share it),
   then `avoozl plugins list`, and check the state, parts, and hash. Read
   `avoozl plugins pack-preview ID` and look for any **who counts** warning:
   a pack that lowers `minimumPermission` or adds `allowedActors` must say
   so to the user.
3. Hand the user the steps that are theirs: approve the version in
   Settings > Plugins, then **Preview and import pack** and **Import
   settings**. A new version needs approval again, then offers its diff.
