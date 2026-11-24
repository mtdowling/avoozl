# Role prompts

This directory holds the standing instructions for Avoozl's agent roles, one
Markdown file per role. Edit the file here, because nothing else holds a second
copy.

```sh
npm run build:hosts
npm run check:hosts
```

The directory ships beside `src/`, in a checkout and in the installed app. The
roles are the keys of the `roles` setting, and each file serves these roles:

- `reviewer.md` is the `reviewer` role, for review sessions.
- `responder.md` is the `responder` role.
- `check-decide.md` is the `checkDecide` role, a plugin check's decide call.
- `assist.md` is the `assist` role, the page's chat when Kiro Crew is absent. It
  runs only as a process session.
- `worker.md` and `review.md` are not a role's prompt. They are the "Steps"
  section of every worker brief and the "Review" section of every review brief.

`src/app/agents/role-table.ts` is the source for which role reads which file.

## Skills for any agent runner

`skills/<name>.md` is a whole skill (front matter and text) that any agent
runner can read. `avoozl-answer`, `avoozl-review` and `avoozl-triage` call no
Avoozl tool, so an Issue Radar crew can use them; the rest drive Avoozl
through the `avoozl` CLI and the `plans_*` MCP tools. See
[docs/agent-skills.md](../docs/agent-skills.md) for what each one does.

`npm run build:hosts` copies each skill to
`hosts/kirocrew/skills/<name>/SKILL.md`, which the app installs like its other
skills. It also copies each one to `hosts/claude-code/skills/`, except those
`CLAUDE_CODE_SKIPS` in `scripts/bundle/build-hosts.ts` names, beside that
host's own `avoozl` and `open` skills, whose texts are `hosts/front-end.md`
and `hosts/open.md`. `npm run check:hosts` fails when a copy differs,
`app.json` does not list a skill, or the plugin holds a skill with no source.
Do not edit the copies.

## Kiro Crew agents

A Kiro Crew chat gets its prompt from an agent file in `hosts/kirocrew/agents/`.
Those files are generated: `roles.json`
holds each agent's tools, permissions and other settings with no prompt, and
`npm run build:hosts` copies the matching `prompts/<role>.md` into each
agent's `prompt` field. `npm run check:hosts` fails when a generated file
differs from its prompt or metadata, or when `app.json` and the metadata name
different agents. It runs before `npm test`. Do not edit the generated JSON.

## Process harnesses

A role that runs as a process harness (Claude Code, Codex, or another
harness chosen in **Settings › Models**) has no agent file. Its brief starts
with the same prompt file (`processBrief` in `src/app/executors/process.ts`),
then the task's brief, then how to finish.
