# Approve dialogs: counts, Open review, in-place updates (task 57.6)

Screenshots of the full app shell on fake findings (harness
`?page=app&specs=1&review=1`), at 390 and 1280 px, light and dark, with
Kiro Crew's own stylesheet.

- `before/dialog-*`: main before this change. The dialog lists each open
  finding with a disposition picker and **Close finding**.
- `after/dialog-*`: counts by severity and by state ("1 blocker · 2 warn ·
  1 info · 2 for you · 1 fixed · 1 rejected") and **Open review**, with no
  close controls.
- `after/changed-*`: the planner wrote a revision while the dialog was open.
  The dialog says "Changed while open: old → new", lists each changed file
  with lines added and removed, and the findings that became fixed or moved.
  Approve now targets the new revision and needs a new click.
- `after/batch-changed-*`: Approve 2 specs, with only byte-types updated.

    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> \
      node kirocrew-app/ui/test/browser/approve-dialog-shots.mjs docs/evidence/approve-dialog-57-6/after

The before shots ran the same script and harness on main with `--only dialog`.
