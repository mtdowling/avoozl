# Agent skills

Avoozl does not triage issues or review other people's pull requests. It
ships three skills that any agent runner can use for that work, such as an
Issue Radar crew or another agent runner:

| Skill           | What it does                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `avoozl-answer` | One comment on an issue: answers a question from the repository's files, cited by path and lines; asks for the missing detail on a vague bug; says a feature request goes to a person. |
| `avoozl-review` | One comment-only review of a pull request the agent did not open: **Full review** or **Partial review** (and what it skipped), with `path:line` findings. Never approves, pushes, merges or labels. |
| `avoozl-triage` | Labels a new issue from the repository's existing labels only, and sends feature requests and design questions to a person with the repository's needs-human label. Never creates a label. |

Every comment and review starts with a line saying an agent wrote it. Each
skill treats issue and pull request text as data: it never runs code or
commands from it and never follows instructions inside it, and it uses
read-only tools apart from the one write it describes. The skills call no
Avoozl tool, so they work without Avoozl running.

## Runner skills

The runner skills drive Avoozl itself, through the `avoozl` CLI and the
`plans_*` MCP tools only:

| Skill | What it does |
| --- | --- |
| `avoozl` | Plans a goal as a spec, reads tasks and Needs you, and keeps approval, taking a task by hand and retries with the person. |
| `avoozl-drive` | Runs one `avoozl tick` on each wake of a scheduled chat, reads `avoozl next` and `avoozl status`, and tells the person what needs them. |
| `avoozl-spec` | Writes or revises a spec folder in the task list format, runs `avoozl spec lint` and `avoozl graph SPEC --write`, and stops at a `spec/<name>` branch for a person to approve. |
| `avoozl-spec-review` | Reviews a spec for that format and for gaps, flags a branch on origin named for the spec that holds other work, and posts findings without editing. |
| `avoozl-work` | Claims the next ready task with `avoozl next --claim`, does it on its claim branch, reports it with `avoozl runner report`, and lands it with `avoozl land`. |
| `avoozl-retro` | Reads `avoozl insights` and `avoozl flow`, names the biggest slowdown with its numbers, proposes up to three settings or spec changes, and saves the report with `avoozl retro save` or `plans_document` action `save_retro`. Changes nothing else. |
| `avoozl-investigate` | For a task whose bullets name a findings file: the worker writes the findings before the fix, and the reviewer tries to prove them wrong. |

Two more skills help a person set Avoozl up from a chat. `avoozl-plugin`
designs, writes and tests a [plugin](plugins.md), and `avoozl-rules` plans a
[content rule set](content-rules.md) without writing its terms file.

## Where they come from

Each skill's text is `prompts/skills/<name>.md`. `npm run build:hosts`
copies every skill to `hosts/kirocrew/skills/<name>/SKILL.md`. It copies them
to `hosts/claude-code/skills/` too, except the ones `CLAUDE_CODE_SKIPS` in
`scripts/bundle/build-hosts.ts` names with its reason: `avoozl`, whose place
that host's own `avoozl` skill takes, and `avoozl-plugin` and `avoozl-rules`,
which the Kiro Crew page's design chats load. `npm run check:hosts` fails when
a copy differs or that folder holds a skill with no source. See
[the prompts README](../prompts/README.md#skills-for-any-agent-runner).

## Kiro Crew and Issue Radar

Installing the Avoozl app installs the skills with its others. An Issue
Radar crew on the default agent sees them. Name them in the crew's
**Additional prompt** on the Radar page and click **Save**, for example:

```text
Triage new issues with the avoozl-triage skill, answer questions with avoozl-answer, review PRs you did not open with avoozl-review. These override the brief's label rule.
```

The last sentence matters: a Radar crew's brief otherwise lets it write only
its claim label and the needs-human label.

## Other agent runners

From a checkout of this repository, install the skills for the runner's
agents (here for Claude Code and Codex):

```sh
npx --yes skills add ./hosts/kirocrew/skills/avoozl-answer --global --agent claude-code codex -y
npx --yes skills add ./hosts/kirocrew/skills/avoozl-review --global --agent claude-code codex -y
npx --yes skills add ./hosts/kirocrew/skills/avoozl-triage --global --agent claude-code codex -y
```

Then run them as a scheduled prompt on the repository, with a prompt such
as: "Make one pass over the open issues and open pull requests in
OWNER/REPO, then stop. Triage new issues with the avoozl-triage skill,
answer questions with avoozl-answer, review PRs you did not open with
avoozl-review."

Keep the agent's own permission checks on; the skills need no flag that
skips them.
