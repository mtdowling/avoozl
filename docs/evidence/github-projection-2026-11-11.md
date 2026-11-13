# GitHub projection proof

Date: 2026-11-11

## Result

Avoozl successfully projected approved tasks into private GitHub repositories,
created native issue dependencies, withheld readiness from blocked tasks, and
reused the same issues after rebuilding its local workspace from GitHub markers.

The live proof also confirmed that a repository-configured label can authorize
an assigned issue after checking the label actor and repository permission.
Removing that label withdrew local readiness.

A separate proof created a pull request, attached a named status to its exact
head commit, merged it, closed its issue, and accepted completion only after all
of those facts matched.

## Two-repository flow

- Planning task: [planning issue 4](https://github.com/mtdowling/avoozl-e2e-planning-20261111/issues/4)
- Dependent code task: [code issue 5](https://github.com/mtdowling/avoozl-e2e-code-20261111/issues/5)

GitHub returned the planning issue as the code issue's native blocker. Only the
planning issue received the configured ready label.

## Same-repository flow

- Foundation task: [combined issue 7](https://github.com/mtdowling/avoozl-e2e-combined-20261111/issues/7)
- Dependent task: [combined issue 8](https://github.com/mtdowling/avoozl-e2e-combined-20261111/issues/8)

GitHub returned the foundation issue as the dependent issue's native blocker.
Only the foundation issue received the configured ready label.

## Configurable intake

- Intake task: [combined issue 9](https://github.com/mtdowling/avoozl-e2e-combined-20261111/issues/9)
- Configured label: `ship-with-avoozl`
- Authorized actor: `mtdowling`

The issue became an authorized local task. Removing the label withdrew its
readiness.

All projection proof issues were closed with reason `not_planned` after
verification. Their dependency edges remain available for inspection.

## Exact pull-request completion

- Completion issue: [code issue 7](https://github.com/mtdowling/avoozl-e2e-code-20261111/issues/7)
- Merged change: [pull request 8](https://github.com/mtdowling/avoozl-e2e-code-20261111/pull/8)
- Exact head: `9c78b2cff3ae5598baea78b3397e16ee385126f6`
- Required status: `avoozl/e2e`

Avoozl accepted completion only after one closing pull request targeted `main`,
merged, closed the issue as completed, and carried the successful named status
on that exact head commit.

## Automated coverage

Tests cover:

- issue dependency REST paths;
- same-repository native dependencies;
- cross-repository native dependencies;
- readiness added only after dependency reconciliation;
- readiness withdrawn before a repeated reconciliation;
- dependency drift reported instead of overwritten;
- fresh-workspace recovery from managed GitHub markers;
- exact pull-request, base, head, closure, and check validation;
- Kiro Crew app package contents and build output.

## Remaining proofs

The next slice must prove:

1. one single-writer scheduling path;
2. automatic Kiro Crew delivery of one ready leaf;
3. the installed Avoozl page inside Kiro Crew.
