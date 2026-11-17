# Task details: every section at once (2026-11-17)

The task details drawer (opened from Specs, Graph, Trace, Needs you, Home,
Flow, Activity and Lanes; all use the one shared drawer) now shows every
section at once. Each section is a bordered, titled box (the host `Card`, as
Settings uses) whose header is a button with a chevron and `aria-expanded`.
Click, Enter or Space folds it. All boxes start open, and folding one leaves
the others alone. Review runs, when a task has them, get their own box too.
The data shown is unchanged.

- `before/`: `origin/main`. Only Summary was open; the rest was a one-open
  accordion.
- `after/`: this branch. `*-end` is the same drawer scrolled to its end.
  `task-details-folded-*` has Summary folded.

Shots are inside the full app (harness `?page=app`), opened from Home's
Needs you row, with Kiro Crew's own stylesheet. To make them again:

    AVOOZL_HOST_CSS=<host css> node kirocrew-app/ui/test/browser/task-details-shots.mjs <out>
