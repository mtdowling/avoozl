---
category: Planning
---

# Requirements: the remaining Avoozl work

Status: Draft

Status 2026-11-18: AN1 to AN3 are built (see `tasks.md`). AN4.1 for P38 and
AN4.2 are superseded because Ideas and the lessons store were removed.

## Introduction

This spec gathers the Avoozl work that is still open, has no owner and no open
pull request, into one plan that Avoozl can project onto its own repository.
It was refreshed against the main branch after the mirror, forward target,
Create and Adopt setup, instance name and In flight work merged.
It adds no new product behavior. Each requirement below points at the
criteria in `.kiro/specs/radar-coder/requirements.md` (RC) or
`.kiro/specs/avoozl/requirements.md` (R) that stay the source of truth for
what the behavior is. This file says only what this plan delivers.

This spec is a draft. Approving it, creating issues and starting agents are
separate acts that a person does later.

### Out of scope

- Phase 12 of `radar-coder` (retirement of worker code).
- Anything that only runs or places Avoozl's own workers (written when
  local workers were retired; Avoozl runs its own workers again, R86). This leaves out the crew registry, the retired `avoozl` tasks 11.x and
  16.7, `avoozl-p29` and the
  worker adapter proof (`rc-p14`).
- Review drafts from a label (`rc-20.*`), merged.
- Work an open pull request or another worker already covers: forward screen,
  block rules, source audit and the `branch` and `batch` targets (`rc-25.4` to
  `rc-25.7`, pull request 191 and later), and the pull requests 23, 26, 50,
  192 and 193.
- Upstream requests to Kiro Crew and the MCP App views the owner skipped.
- Live proofs, publishing, and the Nupp cutover. They need a person and are
  listed in "Owner steps" in `design.md`.

## Requirements

### Requirement AN1: Retired

Retired 2026-11-18 (owner decision). Tracker gates went with tracker
plugins. The number stays so that other requirements keep their references.

### Requirement AN2: Private plans on the mirror's plans branch

**User story:** As the owner of a public repository worked through a private
mirror, I want private plans kept on an orphan branch of the mirror, projected
with public plans into one graph, so that private plan text never reaches the
public repository.

#### Acceptance criteria

1. The behavior of RC25.3 to RC25.5 (marker `ref`, approval on the plans
   branch, `verify-issue`) SHALL hold.
2. The behavior of RC25.6 (containment: sync, forward, leak scan, explicit
   refspecs) SHALL hold.
3. The behavior of RC25.7 to RC25.10 (issues from both homes, edges across
   homes) SHALL hold.
4. A fake-GitHub proof SHALL show both plan kinds in one graph, a cross edge,
   and a planted plans-branch name that blocks a forward, with a receipt.

### Requirement AN3: Crews on public repositories

**User story:** As the owner of a machine with private names and notes, I want
a crew on a public repository fenced by a scan before send, an audit and a
stop, so that one careless line cannot become a public leak.

#### Acceptance criteria

1. The behavior of R85.1 to R85.10 SHALL hold (design §6.14 of `avoozl`).
2. A proof SHALL show a refused canary, a script write that the tick deletes,
   and a handoff refused before sign-off and after a hook change.

### Requirement AN4: Named proofs for features that already ship

**User story:** As a maintainer, I want each shipped feature whose proof was
never run as one named test to have that test and a receipt, so that the proof
list in `avoozl` tasks is closed by evidence.

#### Acceptance criteria

1. Proofs P38 (R62, R63), P39 (R64) and P43 (R71) SHALL each run as one named
   test over the steps in `avoozl` tasks, with a receipt. Where a step opens a
   worker, the step uses the Radar release instead, because workers are retired.
2. Proof P42 SHALL gain the Share steps 13 and 14 (R70, R28.9).
