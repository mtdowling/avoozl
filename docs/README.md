# Avoozl documentation

Avoozl lands epics from specs, including repeatable rollouts across
repositories. Inspect an epic's task order and linked specs with its graph.

```sh
avoozl graph service-rollout --workspace ~/plans
```

## Start

These pages show how to run an epic and how to start with one spec.

- Follow the [epic rollout](overview.md#epic-rollout) to link specs, run
  tasks in parallel, and require sign-off.
- Use [Control during a rollout](overview.md#control-during-a-rollout) to
  pause new work, steer a running task, or adjust the plan after a retro.
- Use [Getting started](getting-started.md) to install Avoozl and run a first
  spec.
- See [Avoozl](overview.md) for shared state, work in progress, and decisions.
- [Glossary](glossary.md): words that look alike, set apart.

## Working with Avoozl

- [Workspaces](workspaces.md): settings files, the standalone server, backup
  and rebuilding.
- [Manual tasks](manual-tasks.md): steps only a person does.
- [Delivery](delivery.md): workers, checks, landing and merge batches.
- [People and machines](scale-out.md): spec lanes per person, shared state
  in git, headless machines and harnesses per role.
- [Flow](flow.md): when work pauses, Stop the line, Insights and the retro
  skill.
- [Telemetry](telemetry.md): task timing kept locally, and sent over
  OpenTelemetry when this machine's owner turns it on.
- [Agents and the CLI](agents.md): roles and models, MCP tools and
  person-only actions.

## Workflow v1

Workflow v1 defines the spec format and the rules runners follow.

- Read [Workflow v1](github-workflow.md) for approvals, assignment, task
  order, claims and landing.
- See [workflow scenarios](github-workflow-scenarios.md) for the cases that
  check those rules.

## GitHub and intake

These pages describe GitHub-backed delivery and handoffs from other tools.

- Configure [GitHub modes and repository roles](github.md).
- Hand a scoped issue to a runner through [a label and assignment](github-workflow.md#11-labeled-issues).
- Bring in work from scripts through [intake sources](intake.md).
- Give external agents [skills for issues and pull requests](agent-skills.md).
- See [GitHub rate limits](rate-limit.md) for the cache and write pacing.

## Safety

- [Content rules](content-rules.md): keeping private terms out of everything
  Avoozl writes.
- [Content hook](content-hook.md): the same rules on an agent's own GitHub
  writes.
- [Repository checks and isolation](checks.md): check commands and the sandbox
  they run in.
- [Person-only operations](person-only.md): what an agent session cannot do.

## Extending

- [Writing a plugin](plugins.md): content rules, GitHub sign-in, checks and
  epic context.
- [Epic context](epic-context.md): skills, read folders and MCP servers a
  worker gets on your own approved spec tasks.

## Maintainers

- [Live proof harness](live-proof-harness.md): a throwaway Kiro Crew gateway
  for live proofs.
- [Proxy secret by file](kirocrew-requests/proxy-secret-by-file.md): a draft
  request to Kiro Crew to hand an app backend its secret in a file.
- [`research/`](research/) and [`evidence/`](evidence/): dated notes and proof
  receipts, kept as they were written.
