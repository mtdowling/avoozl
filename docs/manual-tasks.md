# Manual tasks and task links

A manual task is a step only a person does, such as a team review before a
cutover. Mark it with `$manual: true` in `tasks.md`:

```markdown [tasks.md]
- [ ] `team-review` Review with the team
  - $manual: true
  - $repo: sdk
  - $after: protocol-tests-proof
  - $done: The team agreed the results are good enough to cut over
```

A manual task needs `$done` and a `$repo`. `$manual: true` is the one way to say a
person does a task. It completes by a person.

## Lint rules

Lint refuses `$paths` on a manual task, by name. It refuses `$completion`
anywhere, and names `$manual: true` as the fix.

## Running a manual task

No agent ever runs a manual task: it is never ready, checked, reviewed
or merged. Until its blockers finish it is in **Blocked or waiting**. Then it is
in **Needs you**, tagged **Manual**, with the text "Waiting for a person:
`<title>`". Its dependents wait on it like on any task.

Open the task in the drawer to see its acceptance and **Mark done**. The dialog
takes optional outcome links and one of three outcomes:

- **Done** releases the dependents.
- **Skipped** releases the dependents and stays shown as skipped.
- **Refused** is a no-go for a go/no-go step. The task shows **Refused** and
  sits as Blocked in Needs you, its dependents stay held, and Flow does not
  count it as finished.

**Reopen** undoes any of the three. Only a person marks a manual task or reopens
it, in the page or from the command line. MCP refuses both.

```sh
avoozl task done TASK --skipped
avoozl task reopen TASK
```

Flow counts a manual task's time in Needs you as waiting on a person and leaves
it out of the first-pass rate.

## Task links

Every task also has **Links** in the drawer. Each link is an `http` or `https`
URL with no user name, plus a label. The list shows the newest first, with who
added each link and when. **Add link** opens the fields for one link.

Links live in SQLite, not in the spec, so adding one never changes a plan's
revision. A task holds up to 200. Content rules check each link at the `notes`
boundary when it is saved, and a blocked save offers **Allow once** in place. A
session may add a link to the task it is bound to through the `plans_task`
tool's `add_note` action. Only a person edits or removes one, and a removed link
stays in the activity log.

A worker's brief carries the newest 20 links (at most 8,000 characters) as data,
not instructions, and a dependent's brief carries each blocker's outcome links.
Links stay in Avoozl.

```sh
avoozl task links TASK add --link https://example.test/review --label Review
```

Manual tasks and links are tested with a fake GitHub and have not run live.

## See also

- [Specs](specs.md) for the `$` fact bullets
- [Content rules](content-rules.md) for the check on each link
