# Radar-coder Proof 17: epic types

Receipt for task `rc-p17` in `.kiro/specs/radar-coder/tasks.md`.

**Run on fake GitHub; the live run on a scratch repository is pending the owner.**

- Test: `src/app/test/radar-proof-17.test.mjs`
- Run with: `node --test src/app/test/radar-proof-17.test.mjs`
- Recorded: 2026-11-14, Node 24 on Linux, isolated temporary workspace, fake GitHub, no network.
- Verdict: **PASS on the fake GitHub.** Live verdict: **pending the owner.**

## Setup

A scratch workspace with three fake repositories (`repo-a`, `repo-b`, `repo-c`), local files only. The migration template is copied from `examples/epic-templates/migration`.

## Action

1. Lint the migration template and approve it as a spec.
2. Write a parent spec with three sub-specs, lint the parent, and approve each sub-spec on its own.
3. Preview a gap report with three failing and six passing cells, then accept it.

## Observation

- The migration template lints with 0 errors and approves.
- The parent lints clean. Each sub-spec approves alone: three approvals, one per sub-spec.
- The preview gives three proposals, one per failing cell, and writes nothing to the sub-specs.
- Accepting adds `close-gap-r2` to `repo-a`, `close-gap-r1` to `repo-b` and `close-gap-r3` to `repo-c`. Passing cells add nothing.

## What this does not show

The three repositories share one local folder. The cross-repository `requires` refusal and the parent-with-a-task refusal are in `src/app/test/epic-proposal.test.mjs`, not repeated here.

## Live steps for the owner

Use a scratch repository you can delete. Nothing here touches a real project.

1. Make three scratch repositories and a scratch workspace.
2. Create a migration from the **Migration** template. Look for: it lints with no errors and you can approve it.
3. Create a parent spec and one sub-spec for each repository. Look for: the parent lists the sub-specs and holds no repository task.
4. Approve one sub-spec. Look for: only that one is approved.
5. Approve the other two.
6. Save a gap report as a table with `pass` and `fail` cells and import it. Look for: the table and one proposal per `fail` cell, nothing written yet.
7. Accept. Look for: one new task in each failing repository's sub-spec.
8. If a template misleads you into an invalid spec, the proof fails; the next decision is to fix the template before the docs.
