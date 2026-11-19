# Avoozl documentation

Approve a spec, and Avoozl runs it with coding agents, checks each commit
itself, and lands it. These pages say how to set it up and how each part works.

## Start

- [Getting started](getting-started.md): install Avoozl and run a first spec.
- [Overview](overview.md): where state lives and what each page shows.
- [Glossary](glossary.md): words that look alike, set apart.

## Working with Avoozl

- [Workspaces](workspaces.md): settings files, the standalone server, backup
  and rebuilding.
- [Specs](specs.md): the task list format, approvals and dependencies across
  specs.
- [Epic types](epic-types.md): goals that need many changes in a set order.
- [Manual tasks and task links](manual-tasks.md): steps only a person does.
- [Delivery](delivery.md): workers, checks, landing and merge batches.
- [Drivers](drivers.md): which workspace drives a spec, and handing off.
- [Flow](flow.md): when work pauses, Stop the line, and retros.
- [Agents and the CLI](agents.md): roles and models, MCP tools and
  person-only actions.

## GitHub

- [GitHub](github.md): repository roles and GitHub modes.
- [Triage agent](triage.md): answering, reviewing and handing off new issues
  and pull requests.
- [Intake sources](intake.md): bringing in work from trackers and scripts.
- [GitHub rate limit](rate-limit.md): the cache and write pacing.

## Safety

- [Content rules](content-rules.md): keeping private terms out of everything
  Avoozl writes.
- [Content hook](content-hook.md): the same rules on an agent's own GitHub
  writes.
- [Repository checks and isolation](checks.md): check commands and the sandbox
  they run in.
- [Person-only operations](person-only.md): what an agent session cannot do.

## Extending

- [Writing a plugin](plugins.md): intake sources, content rules and workflow
  templates.
- [Build report format](build-report.md): how a repository says where a build's
  time went.

## Maintainers

- [Live proof harness](live-proof-harness.md): a throwaway Kiro Crew gateway
  for live proofs.
- [Proxy secret by file](kirocrew-requests/proxy-secret-by-file.md): a draft
  request to Kiro Crew to hand an app backend its secret in a file.
- [`research/`](research/) and [`evidence/`](evidence/): dated notes and proof
  receipts, kept as they were written.
