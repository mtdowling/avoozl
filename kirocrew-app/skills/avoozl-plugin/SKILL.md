---
name: avoozl-plugin
description: Design, write, and test an Avoozl plugin, including a bundle that ships a settings pack, content rules, a tracker, and an intake source in one install. Use when a user asks to build, review, or package an Avoozl plugin or config pack.
---

# Avoozl plugin

Use this skill when a user wants to add to Avoozl without changing Avoozl:
a team's shared settings, content rules, a task tracker, an intake source,
or a delivery route. The full contract is `docs/plugins.md` in the Avoozl
repository; read it before writing code. The worked example is
`src/app/test/fixtures/plugins/sdk-team/`.

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
- Never open a network listener in a plugin. Calls out are fine.

## Pick the parts

Ask what the team needs, then list only those parts in `provides`:

| Need                                                                                                            | Part      |
| --------------------------------------------------------------------------------------------------------------- | --------- |
| Shared triggers, Untriaged filter, who counts, checks, review roles, Project fields, flow and delivery defaults | `pack`    |
| Terms Avoozl must never write                                                                                   | `rules`   |
| Task records kept in another system                                                                             | `tracker` |
| Outside work brought in on each tick                                                                            | `intake`  |
| Tasks delivered somewhere other than a local worker                                                             | `route`   |

A plugin with only `pack` has no `entry` and runs no code. `intake` needs
`capabilities.tracker` to list `poll`.

## Write it

1. Create the folder with `avoozl-plugin.json`: `id`, `version`,
   `contract: 1`, `provides`, `capabilities`, and `entry` when any part runs
   code.
2. For a pack, write `avoozl-pack.json` with `description` and `settings`.
   Use only the keys in the pack table of `docs/plugins.md`; Avoozl refuses
   any other key by name. Content rule sets are references
   (`{ "id": "...", "plugin": "<this id>" }`), never patterns.
3. For code parts, export `rules`, `tracker` (with `poll` for intake), or
   `route` from the entry module. Every method takes `(params, { config })`
   and returns JSON. Write nothing to stdout.
4. Make every reply match the contract tables in `docs/plugins.md`. Links
   are `http` or `https`. A `poll` reply is `{items, cursor, more}`.

## Check it

1. Copy the `sdk-team` proof (`src/app/test/proof-p35.test.mjs`): a
   temporary workspace, the plugin added, approved by hash, the pack
   previewed and imported, and the code parts called through
   `pluginHost(...).open()`.
2. Run `avoozl plugins add ID --path DIR`, then `avoozl plugins list`, and
   check the state, parts, and hash. Read `avoozl plugins pack-preview ID`
   and look for any **who counts** warning: a pack that lowers
   `minimumPermission` or adds `allowedActors` must say so to the user.
3. Hand the user the steps that are theirs: approve the version in
   Settings > Plugins, then **Preview and import pack** and **Import
   settings**. A new version needs approval again, then offers its diff.
