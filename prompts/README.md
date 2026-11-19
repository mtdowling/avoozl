# prompts/

The standing instructions for Avoozl's agent roles, one Markdown file per
role. Edit the file here; nothing else holds a second copy. The directory
ships beside `src/`, in a checkout and in the installed app.

| File | Role (`roles` setting) |
| ---- | ---------------------- |
| `verifier.md` | `verifier` |
| `reviewer.md` | `reviewer` (review sessions) |
| `planner.md` | `planner`, and `planAnswer` |
| `retro.md` | `retro` |
| `falsifier.md` | `falsifier` (investigate first) |
| `responder.md` | `responder` |
| `task-summary.md` | `taskSummary` |
| `plan-review.md` | `planReviewer` |
| `code-review.md` | `prReview` |
| `triage.md` | `triage` |
| `assist.md` | `assist` (the page's chat when Kiro Crew is absent; a process session only) |
| `worker.md`, `review.md` | Not a role's prompt. The "Steps" section of every worker brief and the "Review" section of every review brief. |

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
`planner.md` or `retro.md`, or to the spec steering text. The proposal is a
diff against the shipped section. A person approves or rejects it on the Retros page.
Approval does not touch these files: it writes an override version to a file
in this machine's Avoozl config folder (`prompts/<workspace id>.json`), and
sessions use the active override for that section. Sections that guard
the owner (`untrusted-data`, `content-rules`, `who-counts`, `acceptance`,
`person-only`) are locked and always use the shipped text. A person can
revert an override in one step. When an update changes a section that has an
override, Avoozl shows a three-way diff and a rebased proposal, and keeps the
override until a person approves the rebase. To change the shipped text for
everyone, edit the file here and run `npm run build:agents`.
