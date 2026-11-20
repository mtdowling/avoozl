# Manual tasks

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
takes one of three outcomes:

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

Manual tasks are tested with a fake GitHub and have not run live.

## See also

- [Specs](avoozl-specs.md) for the `$` fact bullets
