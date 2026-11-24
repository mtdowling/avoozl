---
name: avoozl
description: Work with Avoozl from this tool. Plan specs, read tasks and Needs you, and report on work through the avoozl MCP tools. A person decides on a spec and on a Needs you decision; this skill says how. Use when the user mentions Avoozl, a spec, a task, or Needs you.
---

# Avoozl

Avoozl runs approved specs with coding agents, checks each commit itself, and
lands it. The work happens in `avoozl tick`, one pass that exits; a timer on
this machine runs it, so work keeps going when this tool is closed. This tool
reads and plans through the `avoozl` MCP server (`avoozl mcp`), and the
`avoozl-drive` skill says how a chat drives the tick when no timer does.

## What you do

- Read state with the `plans_*` tools: `plans_workspace`, `plans_task`,
  `plans_view`, and the Needs you list.
- Draft a spec in its own folder under `specs.path` (default `.kiro/specs`)
  when the person asks for a plan, in the layout the spec repository's
  `.avoozl.json` names in `specs.layout`: `single` (the default) is one
  `<name>.md` with `## Requirements`, `## Design` and `## Tasks`;
  `kiro` is `<name>/` with `requirements.md`, `design.md` and `tasks.md`.
  Then tell them it is ready to review.
- Report on a task you were given with the tools its brief names.

## What the person decides

You never approve a spec, answer a Needs you decision, approve a harness, or
close a decision unless the person asks you to in this chat. Avoozl would run
them for you (the `plans_control` and `plans_setup` tools, and a delete with
`confirm: true`), and records who did. When one is due, tell the person the
exact command, or run it once they say so (in Claude Code, a line starting
with `!` runs as the person):

- Approve a spec: `avoozl plan approve NAME`, which previews it, then
  `avoozl plan approve NAME --yes --expect HASH` with the hash it printed.
- A task the person marks done or reopens: `avoozl task done TASK_ID`,
  `avoozl task reopen TASK_ID`.
- A stopped line: `avoozl flow resume STOP_ID`.
- A harness file: `avoozl harness approve NAME`.

Or give them the page: `avoozl link` prints a one-time link to Avoozl's page
on this machine, where every Needs you item has its buttons.
