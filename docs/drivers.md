# Drivers

The driver is the one Avoozl workspace that drives an approved spec: it alone
starts work, writes to GitHub, and merges for that spec. Every other workspace
only reads that spec, and says why.

```sh
avoozl driver status recipe-box
avoozl driver takeover recipe-box
avoozl driver handoff recipe-box --folder ~/handoff
avoozl driver release recipe-box
```

## Who has a spec

In a GitHub mode, the spec issue's assignee says who works on the spec. A
spec has one driver, and that driver's own Avoozl knows the tasks it runs, so
the shared record is per spec, not per task. A machine claim in Avoozl's
marker on the issue says which of that person's machines drives it. With no
assignee on the spec issue, the epic issue's assignee counts.

| Spec issue assignees | Here                                          |
| -------------------- | --------------------------------------------- |
| None                 | Nobody drives it. **Take over** is offered.   |
| You                  | You drive it, on the machine the claim names. |
| Someone else         | Read only, "Taken by octocat".                |
| Two or more          | Read only everywhere, one item in Needs you.  |
| No spec issue        | You drive it here, "Not shared".              |

The Specs list shows the same words on each spec's row.

In Local only mode the claim is a row in the workspace database. Make this
workspace the driver once per approved spec:

```sh
avoozl spec publish NAME --workspace ~/plans
avoozl spec takeover NAME --workspace ~/plans
```

Nothing moves the role because a machine went quiet.

## Taking a spec

**Take over** on the spec's page, or `avoozl driver takeover`, reads the
spec issue first. When nobody is assigned, Avoozl assigns your `gh` login,
reads the issue back, writes this machine's claim, and drives the spec. When
someone else is assigned it changes nothing and says who has the spec.
`avoozl spec takeover` assigns you the same way.

GitHub ignores an assignee change from a token without push access, so
Avoozl reads the issue back after each change and says so when GitHub kept
the old assignees.

## Handing off

**Hand off driver** on the spec's page stops new work, lets running chats
finish, and writes an export file to a folder you pick. Avoozl then removes
you from the spec issue. **Take over** on the next machine assigns that
person. The export may hold private notes, and Avoozl never uploads, commits,
or pushes it.

## Releasing

**Release** in the Hand off dialog, or `avoozl driver release`, stops driving
now with no export and removes you from the spec issue. It refuses while
chats run for the spec; Hand off lets them finish instead.

## Taking over

**Take over** on the other machine reads the export. When the old machine is
gone it takes over without one, and lists what that loses first. An old
driver that comes back only reads.

**Force take over** sets the spec issue's assignees to just you, and asks you
to type the spec name first:

```sh
avoozl driver takeover NAME --force --confirm NAME --yes
```

A task that was running on the old driver shows as away. It waits for you to
start it on the new driver, or completes if its work lands.

Plugin approvals, terms files, retro instructions, crews, and SSH host keys
stay on each machine. After a take over, the page lists what to set up again.

## When the spec lands

When every task of a spec has landed, its driver closes the spec issue as
completed.

## Limits

Assignment is not atomic. Two people who press Take over at the same moment
both end up assigned, and both machines then read only until a person
removes one. Work the old driver started after its last check, at most one
tick's worth, can overlap, and it shows as away on the new driver.

A spec with no spec issue is not shared: two machines that both hold it both
drive it. `avoozl spec publish` makes its issue.

In Local only mode the lock guards only instances that open that database file
or a copy of it. It cannot see another machine, and it has no forced take
over.

See [People and machines](scale-out.md) for running each spec of an epic on
its own person's machine, and for worker machines.
