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
- [Manual tasks](manual-tasks.md): steps only a person does.
- [Delivery](delivery.md): workers, checks, landing and merge batches.
- [Drivers](drivers.md): which workspace drives a spec, and handing off.
- [People and machines](scale-out.md): spec lanes per person, shared state
  in git, headless machines and harnesses per role.
- [Flow](flow.md): when work pauses, Stop the line, and retros.
- [Telemetry](telemetry.md): task timing kept locally, and sent over
  OpenTelemetry when this machine's owner turns it on.
- [Agents and the CLI](agents.md): roles and models, MCP tools and
  person-only actions.

## GitHub

- [GitHub](github.md): repository roles and GitHub modes.
- [Workflow v1](github-workflow.md) defines the spec format and the rules for
  approvals, assignment, task order, claims and landing.
- [Workflow scenarios](github-workflow-scenarios.md): each kit case as Given,
  When and Then, with the rules it checks.
- [Agent skills](agent-skills.md): the answer, review and triage skills any
  agent runner can use on issues and pull requests.
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
- [Epic context](epic-context.md): skills, read folders and MCP servers a
  worker gets on your own approved spec tasks.

## Maintainers

- [Live proof harness](live-proof-harness.md): a throwaway Kiro Crew gateway
  for live proofs.
- [Proxy secret by file](kirocrew-requests/proxy-secret-by-file.md): a draft
  request to Kiro Crew to hand an app backend its secret in a file.
- [`research/`](research/) and [`evidence/`](evidence/): dated notes and proof
  receipts, kept as they were written.
