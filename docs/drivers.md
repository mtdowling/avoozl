# Drivers

The driver is the one Avoozl workspace that drives an approved spec: it alone
starts work, writes to GitHub, and merges for that spec. Every other workspace
only reads that spec, and says why.

```sh
avoozl driver status recipe-box
avoozl driver set --label "Draco"
```

## Who has a spec

In a GitHub mode, the spec issue's assignee is the driver: the Avoozl signed
in to GitHub as that login drives the spec. A spec has one driver, and that
driver's own Avoozl knows the tasks it runs, so the shared record is per
spec, not per task. With no assignee on the spec issue, the epic issue's
assignee counts. Avoozl never changes the assignee itself.

| Spec issue assignees | Here                                         |
| -------------------- | -------------------------------------------- |
| None                 | Nobody drives it.                            |
| You                  | You drive it.                                |
| Someone else         | Read only, "Taken by octocat".               |
| Two or more          | Read only everywhere, one item in Needs you. |
| No spec issue        | You drive it here, "Not shared".             |

The Specs list shows the same words on each spec's row, and a read-only
spec's banner links to its spec issue.

In Local only mode there is no spec issue, so this workspace drives every
approved spec. Nothing moves the role because a machine went quiet.

`driver set --label` names this machine in `avoozl driver status` and on
the page.

## Handing off

Push the branch you were working on, mention the spec issue in it, and
reassign the spec issue on GitHub. The new assignee's Avoozl drives the spec
from its next tick, and yours reads only. Unassigning yourself releases the
spec: nobody drives it until someone is assigned.

Plugin approvals, terms files, retro instructions, crews, and SSH host keys
stay on each machine, so the new driver sets up its own.

## When the spec lands

When every task of a spec has landed, its driver closes the spec issue as
completed.

## Limits

Two people assigned at once both read only until a person removes one.
Work the old driver started before its next tick read the issue, at most one
tick's worth, can overlap; what it pushes to GitHub still counts.

A spec with no spec issue is not shared: two machines that both hold it both
drive it. **Make the GitHub issues** on an approved spec, or
`avoozl spec publish`, makes its issue.

See [People and machines](scale-out.md) for running each spec of an epic on
its own person's machine.
