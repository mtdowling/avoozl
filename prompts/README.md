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


- `verifier.md` is the `verifier` role.
- `reviewer.md` is the `reviewer` role, for review sessions.
- `planner.md` is the `planner` and `planAnswer` roles.
- `retro.md` is the `retro` role.
- `falsifier.md` is the `falsifier` role, for investigate first.
- `responder.md` is the `responder` role.
- `plan-review.md` is the `planReviewer` role.
- `code-review.md` is the `prReview` role.
- `assist.md` is the `assist` role, the page's chat when Kiro Crew is absent. It
  runs only as a process session.
- `worker.md` and `review.md` are not a role's prompt. They are the "Steps"
  section of every worker brief and the "Review" section of every review brief.

`src/app/agents/role-table.mjs` is the source for which role reads which file.

## Skills for any agent runner

`skills/<name>.md` is a whole skill (front matter and text) that any agent
runner can read, such as an Issue Radar crew: `avoozl-answer`,
`avoozl-review` and `avoozl-triage` (see `docs/agent-skills.md`). They
call no Avoozl tool. `npm run build:hosts` copies each one to
`hosts/kirocrew/skills/<name>/SKILL.md`, which the app installs like its other
skills, and `npm run check:hosts` fails when a copy differs or `app.json`
does not list it. Do not edit the copies.

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
harness chosen in Settings > Models) has no agent file. Its brief starts with
the same prompt file (`processBrief` in `src/app/executors/process.mjs`),
then the task's brief, then how to finish.
