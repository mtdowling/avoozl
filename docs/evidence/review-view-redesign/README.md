# Spec Review view redesign

Screenshots of the full app shell on fake findings (harness
`?page=app&specs=1&review=1`), at 1280 and 390 px, light and dark, with
Kiro Crew's own stylesheet. `before/` is main before this change; `after/`
is this branch.

- `before-*`: the spec page. The Summary card now shows the reviewer's
  short summary of the spec (or a plain line with the task count while
  none is stored) and badges for open findings by severity: blocker red,
  warn yellow, info grey. Zero counts are hidden.
- `after-*`: the Review view. The per-file buttons are now a tab bar
  (requirements.md, design.md, tasks.md, manifest, All findings), each
  with its open-finding count. Arrow keys, Home and End move between tabs.
- `selected-*`: one card picked, its lines highlighted.
- `moved-*`: design.md with its Moved or removed group.
- `all-*` (after only): All findings, every file's findings in one list.
  A click on a card opens its file and highlights its lines.

Cards follow Kiro Crew's Needs your input cards: 12 px radius, a 1.5 px
border in the severity color, a severity icon, a one-line title, a body
clamped to three lines (click to expand), one outlined accent button for
the main action, the other actions beside it, and a muted hint line.

    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> \
      node kirocrew-app/ui/test/browser/review-view-shots.mjs <out dir>
