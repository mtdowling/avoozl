# Integrator trains: repository setup

Status: first cut, not yet run against a live repository.

With `landing: train`, Avoozl pushes each verified task as a batch branch
(`avoozl-batch/<task>` by default) and queues it. One integrator then stacks
the ready branches on the trunk, validates the stack once, and lands it. The
batch branches are only a queue. They should not each start a CI run, because
the train's single run on the trunk is the one that counts.

This page says what a repository changes in its CI for that. Avoozl does not
edit your workflows. `avoozl setup OWNER/REPO --landing train` lists each
workflow whose `push` trigger would run on a batch branch, with the line to
add.

## Keep CI off batch branches

A push workflow with no branch filter: ignore the batch prefix.

```yaml
on:
  push:
    branches-ignore: ["avoozl-batch/**"]
```

A push workflow that already lists `branches` cannot also use
`branches-ignore` for the same event. Add a negative pattern instead.

```yaml
on:
  push:
    branches: ["**", "!avoozl-batch/**"]
```

A workflow with `branches: [main]` already skips batch branches.

If your repository's prefix is not `avoozl-batch/`, use the value of
`landing.trains.branchPrefix`.

## Review pull requests

Avoozl opens a pull request for a batch branch only when a person asks for a
review of it. Keep required checks reporting on such a pull request and skip
the work, because the train validates the change and a run per review pull
request would spend runners on a head that is not what lands.

```yaml
jobs:
  test:
    if: ${{ !startsWith(github.head_ref, 'avoozl-batch/') }}
```

## Do not use a skip tag

Do not put `[skip ci]` or a similar tag in commit messages to keep CI off
batch branches. The train rebases each member's commits and keeps their
messages, so the tag would land in the trunk and skip the trunk push's run.
That run is the one the train wants.

## A repository whose CI needs a manual run (gated, CI-only platform)

Under `policy: gated`, a platform with no environment on the integrator's
machine is validated by one `workflow_dispatch` run on a candidate ref
(`avoozl-validate/<train>`), and that ref is deleted afterward. The workflow
named by `landing.trains.ci.workflow` needs:

```yaml
on:
  workflow_dispatch:
    inputs:
      platforms:
        description: Comma-separated platform names to run
        required: false
```

and each job should run only when its platform is named in `platforms`. Each
such train costs one extra CI run, and settings validation warns about it.

## A repository whose CI does not gate merges

A repository whose trunk requires no checks can use `landing: train` with
`policy: gated`. Full validation runs on the integrator's own machine for the
platforms it has (`native`), and one `workflow_dispatch` run covers the rest.
`landing: pr` with protected review is a different mode: it lands one pull
request at a time and never combines unrelated ones.

## Settings

Repository settings go under `landing.trains` in `.avoozl.json`. Machine
settings (`machine.platforms`, `machine.slots` and `lease.*`) go in the
global configuration and are refused in `.avoozl.json`. Both are described in
`src/avoozl-config.schema.json`, and a bad value fails when the configuration
loads, with a message naming the key and the file.
