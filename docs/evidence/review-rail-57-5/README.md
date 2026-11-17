# Review rail alignment, scroll and highlight, and moved findings (task 57.5)

Screenshots of the full app shell on fake findings (harness
`?page=app&specs=1&review=1`), at 390 and 1280 px, light and dark, with
Kiro Crew's own stylesheet.

- `before/review-*`: the Review view as task 57.4 left it. Cards list under
  the text in line order, with the filters inside the rail.
- `after-*`: the specs list folds to its bar so the text and the rail sit
  side by side. Each card is level with its anchor's first block. Warn
  (line 5) is level with its paragraph; Blocker (line 7) would overlap it,
  so it stacks just below. Info (line 14) is level with its list item. At
  390 px each card sits inline after its block.
- `selected-*`: the Info card is selected (accent outline) and its lines
  14-15 are highlighted. Clicking highlighted text selects its card.
- `moved-*`: Design. The finding whose quote is gone lists first under
  **Moved or removed**, with its original revision.

    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> \
      node kirocrew-app/ui/test/browser/review-view-shots.mjs docs/evidence/review-rail-57-5
