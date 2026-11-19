# Drivers

The driver is the one Avoozl workspace that drives an approved spec: it alone
starts work, writes to GitHub, and merges for that spec. Every other workspace
only reads that spec, and says why.

```sh
avoozl driver status recipe-box
avoozl driver handoff recipe-box --folder ~/handoff
avoozl driver takeover recipe-box --file ~/handoff/recipe-box.json
```

## Choosing the driver

In a GitHub mode, the spec's plan issue names the driver. Its one assignee is
the person, and a machine claim in Avoozl's marker on the issue is which of
that person's machines. With no assignee on the plan issue, the epic issue's
assignee counts. With none or several, every workspace only reads, and one
decision opens in **Needs you**.

In Local only mode the claim is a row in the workspace database. Make this
workspace the driver once per approved spec:

```sh
node cli.mjs spec publish NAME --workspace ~/plans
node cli.mjs spec takeover NAME --workspace ~/plans
```

Nothing moves the role because a machine went quiet.

## Handing off

**Hand off driver** on the spec's page stops new work, lets running chats
finish, and writes an export file to a folder you pick. It then links the plan
issue for you to reassign; Avoozl never reassigns it. The export may hold
private notes, and Avoozl never uploads, commits, or pushes it.

## Taking over

**Take over** on the other machine reads the export. When the old machine is
gone it takes over without one, and lists what that loses first. An old
driver that comes back only reads.

**Force take over** assigns the plan issue to you, and asks you to type the
spec name first:

```sh
avoozl driver takeover NAME --force --confirm NAME --yes
```

A task that was running on the old driver shows as away. It waits for you to
start it on the new driver, or completes if its work lands.

Plugin approvals, terms files, retro instructions, crews, and SSH host keys
stay on each machine. After a take over, the page lists what to set up again.

## Limits

Assignment is not atomic. Work the old driver started after its last check,
at most one tick's worth, can overlap, and it shows as away on the new driver.

In Local only mode the lock guards only instances that open that database file
or a copy of it. It cannot see another machine, and it has no forced take
over.
