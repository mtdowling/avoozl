---
name: avoozl
description: Work with Avoozl from this tool. Plan specs, read tasks and Needs you, and report on work through the avoozl MCP tools. A person approves a spec and answers a person-only Needs you item at their own prompt; this skill says how. Use when the user mentions Avoozl, a spec, a task, or Needs you.
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
- Draft a spec when the person asks for a plan, in the layout the spec
  repository's `.avoozl.json` names in `specs.layout`: `single` (the default)
  is `<name>.md` directly under `specs.path` with `## Tasks`. Use a subfolder
  with `requirements.md` or `bugfix.md`, `design.md`, and `tasks.md` for
  `kiro`. The default `specs.path` is `.kiro/specs`. Tell the person when
  the spec is ready to review.
- Report on a task you were given with the tools its brief names.

## What only the person does

You never approve a spec, answer a person-only Needs you item, approve a
harness, or close a decision for the person. The MCP tools refuse these, and
this package refuses the matching `avoozl` shell commands from you. When one
is due, tell the person the exact command and let them run it at their own
prompt, in a terminal of their own (in Claude Code, a line starting with `!`
runs as the person):

- Approve a spec: `avoozl plan approve NAME`, which previews it, then
  `avoozl plan approve NAME --yes --expect HASH` with the hash it printed.
- A task the person marks done or reopens: `avoozl task done TASK_ID`,
  `avoozl task reopen TASK_ID`.
- A stopped line: `avoozl flow resume STOP_ID`.
- A harness file: `avoozl harness approve NAME`.

Or give them the page: `avoozl link` prints a one-time link to Avoozl's page
on this machine, where every Needs you item has its buttons.
