# PR and branch chips on In flight rows (task 44.4)

Screenshots of Home in the full app shell on fake data (harness
`?page=app&links=1`), at 1280 and 390 px, light and dark, with Kiro Crew's
own stylesheet. Five rows: checks pass, running, fail, for an older commit
(grey), and a task with a branch but no pull request. Each `*-more.png`
scrolls the In flight card to its last rows. Repositories and numbers are
made up.

- `before/`: main. Rows show no pull request or branch.
- `after/`: each row has a `PR #N` chip with a check dot and a branch chip,
  both opening GitHub in a new tab. A long branch name shrinks with an
  ellipsis, so the row fits 390 px.

    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> \
      node kirocrew-app/ui/test/browser/in-flight-links-shots.mjs docs/evidence/links-chips-44-4/after

The before shots ran the same script and harness fixture on main.
