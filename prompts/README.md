# Role prompts

This directory holds the standing instructions for Avoozl's agent roles, one
Markdown file per role. Edit the file here, because nothing else holds a second
copy.

```sh
npm run build:agents
npm run check:agents
```

The directory ships beside `src/`, in a checkout and in the installed app. The
roles are the keys of the `roles` setting, and each file serves these roles:


- `verifier.md` is the `verifier` role.
- `reviewer.md` is the `reviewer` role, for review sessions.
- `planner.md` is the `planner` and `planAnswer` roles.
- `retro.md` is the `retro` role.
- `falsifier.md` is the `falsifier` role, for investigate first.
- `responder.md` is the `responder` role.
- `task-summary.md` is the `taskSummary` role.
- `plan-review.md` is the `planReviewer` role.
- `code-review.md` is the `prReview` role.
- `triage.md` is the `triage` role.
- `assist.md` is the `assist` role, the page's chat when Kiro Crew is absent. It
  runs only as a process session.
- `worker.md` and `review.md` are not a role's prompt. They are the "Steps"
  section of every worker brief and the "Review" section of every review brief.

`src/app/role-table.mjs` is the source for which role reads which file.

## Kiro Crew agents

A Kiro Crew chat gets its prompt from an agent file in `kirocrew-app/agents/`.
Those files are generated: `src/app/executors/kirocrew/agent-metadata.json`
holds each agent's tools, permissions and other settings with no prompt, and
`npm run build:agents` copies the matching `prompts/<role>.md` into each
agent's `prompt` field. `npm run check:agents` fails when a generated file
differs from its prompt or metadata, or when `app.json` and the metadata name
different agents. It runs before `npm test`. Do not edit the generated JSON.

## Process harnesses

A role that runs as a process harness (Claude Code, Codex, or another
harness chosen in Settings > Models) has no agent file. Its brief starts with
the same prompt file (`processBrief` in `src/app/executors/process.mjs`),
then the task's brief, then how to finish.

## Changing a prompt from a retro

A retro can propose a change to one section of `worker.md`, `review.md`,
`planner.md` or `retro.md`, or to the spec steering text. The proposal is a diff
against the shipped section. A person approves or rejects it on the Retros page.
Approval does not touch these files: it writes an override version to a file in
this machine's Avoozl config folder (`prompts/<workspace id>.json`), and
sessions use the active override for that section. Sections that guard the owner
(`untrusted-data`, `content-rules`, `who-counts`, `acceptance`, `person-only`)
are locked and always use the shipped text. A person can revert an override in
one step. When an update changes a section that has an override, Avoozl shows a
three-way diff and a rebased proposal, and keeps the override until a person
approves the rebase. To change the shipped text for everyone, edit the file here
and run `npm run build:agents`.
