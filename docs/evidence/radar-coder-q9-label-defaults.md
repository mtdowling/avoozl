# Q9: the default label names

Status: partly answered. The label set of Kiro Crew's own repository was not
read; that needs the owner.

## Sources

- Avoozl code: `src/app/github-policy.mjs` (`RADAR_DEFAULTS`,
  `READY_LABEL_DEFAULT`, `CREW_LABEL_DEFAULTS`).
- Design D2 and D26 in `.kiro/specs/radar-coder/design.md`.
- Issue Radar in the installed Kiro Crew 0.12.2.4 release (its crew brief and
  settings defaults). This is the shipped release, not the repository.

## Comparison

| Label | Code default | Design D2 | Source of the Radar side | Decision |
| --- | --- | --- | --- | --- |
| Planning | `to plan` | `avoozl:plan` | Avoozl only | open: rename is RC21, no task yet |
| Needs-human | `crew: needs human` | as set in Radar | Radar setting `needs_human_label`, default `crew: needs human` | match |
| Claim | `crew: in progress` | `crew: in progress` | fixed label in the crew brief and runtime | match |
| Ready | `ready` | `avoozl:ready` | Avoozl only | open: RC21 |
| Conflict (on PRs) | `merge conflict` | `avoozl:merge-conflict` | Avoozl only | open: RC21 |
| Approval | `plan approved` | `avoozl:plan-approved` | Avoozl only | open: RC21 |
| Review (on PRs) | none | `avoozl:review` | Avoozl only | open: RC20, RC21 |
| Drafted (on PRs) | none | `avoozl:drafted` | Avoozl only | open: RC20, RC21 |

Radar skips any issue that carries a label starting with `crew:`. Avoozl's two
Radar labels already follow that, and none of Avoozl's own labels starts with
`crew:`.

## Answer so far

- The two Radar labels in code match Radar's release.
- The code defaults for Avoozl's own labels do not match D2. D2 and D26 say
  they move to the `avoozl:` names (RC21), and no task for that exists in
  `tasks.md`, so the code still has the old names. Nothing was renamed here.
  This note does not change the defaults.
- `rc-1.1`'s defaults (`to plan`, `ready`, `crew: in progress`, `merge conflict`)
  match the code. They do not match D2.

## Needs the owner

1. Read the label set of Kiro Crew's own repository and add it to this table.
2. Decide: keep the old names, or add a task that moves the defaults to the
   `avoozl:` names (RC21) before the first Set up ships.
3. Then tick `rc-q9`.
