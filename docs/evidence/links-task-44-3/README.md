# Task Links box: branch, PR, checks, landed commit, issue (44.3, 2026-11-17)

- Task details: the **Links** box now starts with the task's GitHub links
  from stored records (R92.5): Branch, Pull request with its state, Checks
  with a dot, the head SHA and its age, Landed commit and Issue. A missing
  record shows "none". Checks read for another head show a hollow grey dot
  and "not the current head", never the old state as current.
- The worktree path shows as plain local text, never a link (R92.10).
- The links people and chats add follow under **Added links**, with the
  Add link button as before.
- Every GitHub link opens in a new tab with `rel="noopener noreferrer"`
  (R92.9), including the drawer's older Pull request and board links.
- Graph: O on a task card opens the same task details, so it shows the
  same box (`2-graph-links-*`).

`before/` is `origin/main` at 4e0e2165; `after/` is this branch. Shots are
inside the full app (harness `?page=app`) with Kiro Crew's own stylesheet,
at 1280 and 390 px, light and dark. The harness answers every task with the
same fixture task, whose checks were read for an older head. To make them
again:

    AVOOZL_HOST_CSS=<host css> node kirocrew-app/ui/test/browser/links-task-shots.mjs <out>
