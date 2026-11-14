---
category: Planning
---

# Requirements: the remaining Avoozl work

Status: Draft

## Introduction

This spec gathers the Avoozl work that is still open, has no owner and no open
pull request, into one plan that Avoozl can project onto its own repository.
It adds no new product behavior. Each requirement below points at the
criteria in `.kiro/specs/radar-coder/requirements.md` (RC) or
`.kiro/specs/avoozl/requirements.md` (R) that stay the source of truth for
what the behavior is. This file says only what this plan delivers.

This spec is a draft. Approving it, creating issues and starting agents are
separate acts that a person does later.

### Out of scope

- Phase 12 of `radar-coder` (retirement of worker code).
- Anything that only runs or places Avoozl's own workers: local workers are
  retired. This leaves out crew placement, the crew registry, routing
  defaults in packs (`avoozl` tasks 11.x, 16.7, `avoozl-p29`) and the
  worker adapter proof (`rc-p14`).
- Review drafts from a label (`rc-20.1` to `rc-p20`), open as pull request 138.
- Work an open pull request already covers: `rc-22.2` (pull request 155),
  the mirror's private plans branch (`rc-24.*`, pull request 154), the app
  reshape (pull request 153), and the pull requests 23, 26 and 50.
- Upstream requests to Kiro Crew and the MCP App views the owner skipped.
- Live proofs, publishing, and the Nupp cutover. They need a person and are
  listed in "Owner steps" in `design.md`.

## Requirements

### Requirement AN1: Tracker gates finish

**User story:** As a person planning an epic with an external gate, I want the
gate's waiting label, its Needs you row, my clear and its views, so that a
dependent waits on a tracker and I can see and override that.

#### Acceptance criteria

1. The behavior of RC23.4, RC23.5 and RC23.13 (the waiting label) SHALL hold.
2. The behavior of RC23.9, RC23.10 and RC23.13 (Needs you row, a person's
   clear as an order) SHALL hold.
3. The behavior of RC23.11 and RC23.12 (Release queue, Trace, Waiting on you,
   CLI and MCP reads) SHALL hold.
4. A fake `gate` plugin proof SHALL show open, unknown, failed, done and a
   clear by an allowed person and by a stranger, with a receipt.

### Requirement AN2: Mirror repositories

**User story:** As the owner of a public repository worked through a private
mirror, I want crews to work in the mirror and changes to reach the public
repository only through a scanned forward, so that private text never reaches
the public repository.

#### Acceptance criteria

1. The behavior of RC24.1 to RC24.14 SHALL hold, in the order of design D29 of
   `radar-coder`.
2. A fake-GitHub proof SHALL show sync, mirror merge, forward, public merge,
   and a planted private term that blocks the push, with a receipt.

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
