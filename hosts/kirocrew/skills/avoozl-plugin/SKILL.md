---
name: avoozl-plugin
description: Design, write, and test an Avoozl plugin, including a bundle that ships content rules, GitHub sign-in, checks and context in one install. Use when a user asks to build, review, or package an Avoozl plugin, or opens Design a plugin in Settings > Plugins.
---

# Avoozl plugin

Use this skill when a user wants to add to Avoozl without changing Avoozl:
content rules, GitHub sign-in, checks, or context for worker sessions. The
full contract is `docs/plugins.md` in the Avoozl repository (Settings >
Plugins > **Plugin guide** shows it); read it before writing code. The
worked examples are the fakes in `src/app/test/fixtures/plugins/`.

## Rules

- A person approves every plugin version on their own computer. Never
  approve one, and never tell the user it is done before they did it in
  Settings > Plugins or with the CLI.
- Keep credentials and private terms out of the plugin and `.avoozl.json`.
  Config names an environment variable (`tokenEnv`, `termsFileEnv`)
  instead; rule patterns come from the `rules` part at run time.
- Keep public text free of private system, host, and company names. Write
  "a private tracker" or "an internal code review system".
- Never open a network listener in a plugin. Calls out are fine. A plugin
  that listens is stopped and marked broken.

## Plan it with the user

Work in this order, and confirm each step before the next:

1. Ask what the plugin is for and which system it talks to, if any.
2. Pick the parts (below) and say why each is needed.
3. Pick the source and where it applies (below).
4. Write the folder: manifest, entry module, and a test.
5. Run the checks, then hand the user the steps that are theirs.

## Pick the parts

Ask what the team needs, then list only those parts in `provides`:

| Need                                                                                         | Part          |
| -------------------------------------------------------------------------------------------- | ------------- |
| Terms Avoozl must never write                                                                | `rules`       |
| GitHub sign-in through the organization's own short-lived tokens, per job                     | `credentials` |
| Checks every engineer's machine runs on certain repositories, kept out of those repositories | `checks`      |
| Skills, read folders and MCP servers a worker gets on its owner's own approved spec tasks   | `context`     |

Avoozl refuses any other part by name, such as `pack is not a plugin part.`

A plugin with only `checks` or `context` has no `entry` and runs no plugin
process. A `checks` part's scripts run as checks, and an MCP step calls a
local MCP server this machine maps by alias; see the Checks part in
`docs/plugins.md`. Its results never go to GitHub.

A `credentials` part runs from its own `credentials.entry`, in a child of
its own; see **Credentials** below.

A `context` part is data too. Declare it on **This computer only**; a
`.avoozl.json` entry for it is ignored. See **Context** below.

The code kinds are `rules`. A manifest written before `provides` lists
`kinds` instead; with `provides`, leave `kinds` out, or make it match.

## The manifest

`avoozl-plugin.json` in the plugin folder:

- `id`: lowercase letters, digits and dashes. `local` and `github` are
  reserved.
- `version`: change it on every release; a new version needs approval again.
- `contract`: the **Contract version**, which version of Avoozl's plugin
  interface the plugin was built for. It is not the plugin's own version.
  This Avoozl supports contract version `1`. The `plugins` entry that
  declares the plugin names the same number, or the plugin is unavailable.
- `provides`: the parts above, each once.
- `capabilities`: optional features per kind. Rules list none.
- `entry`: a `.mjs` or `.js` file inside the folder, only when a part runs
  code.

## Write it

1. Create the folder with `avoozl-plugin.json` as above.
2. For a rules part, export `rules` (with `ruleSets`) from the entry module.
   Every method takes `(params, { config })` and returns JSON. Write nothing
   to stdout; it carries the protocol.
3. Make every reply match the contract in `docs/plugins.md`. A rules reply
   never carries `allow`; write the exception into the pattern.

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

## Context

A `context` part gives a worker skills, read folders and MCP servers, only
on its owner's own approved spec tasks in the repositories it names. The
manifest holds `"context": {"repos": ["acme/*"], "skills": "skills",
"reads": [{"id", "about", "path"}], "ask": {"NAME": "question"},
"mcp": "mcp/servers.json", "contentSets": []}`. A read's `path` may hold
`{ask:NAME}`; each person answers it once with
`avoozl plugins answer ID NAME VALUE`. `mcp/servers.json` maps each alias to
`{about, command}`, an argument list, with no `env` and no credential; the
person maps each alias on their machine (`avoozl plugins map ID ALIAS`)
with the environment variable names the server may read. Each skill is a
folder with one `SKILL.md` whose front matter holds `name` (the folder
name) and `description`. A changed file, answer or mapping needs approval
again. Copy `examples/plugins/team-context/` and read `docs/epic-context.md`.

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
the exact version, the content hash (SHA-256 over every file in the folder)
and, for git, the commit. Any change to the version, a file, or the commit
needs approval again. The tick never approves and never fetches.

## Check it

1. Test against a fake host, as Avoozl's own tests do. Copy the single-part
   fakes (`fake-rules`, `fake-probe`, `fake-credentials`, `acme-checks`): a
   temporary workspace, the remote system kept in a file, the plugin
   declared in a temporary `plugins.json`, approved by hash, and the code
   parts called through `pluginHost(...).open()`.
2. Run `avoozl plugins add ID --path DIR` (or `--package NAME`, or
   `--git URL --ref REF [--subdir DIR]`; add `--repository` to share it),
   then `avoozl plugins list`, and check the state, parts, and hash.
3. Hand the user the step that is theirs: approve the version in Settings >
   Plugins. A new version needs approval again.
