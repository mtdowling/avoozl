# Delivery: four lanes in one row above phone width

Dashboards › Delivery used to pick 4, 2 or 1 lanes per row from the board's
width with a 320 px lane minimum, so 4 lanes needed a 1328 px board. Beside
the left nav, a 1280 px window (or a little zoom) dropped to 2 per row.

Now every window wider than the phone breakpoint (767 px, the one
`useNarrow` uses) draws all four lanes in one row. The lane minimum is
88 px, so 4 lanes fit even at 768 px; the 2-per-row step is only a fallback
for a board under 400 px. Lanes narrower than 160 px draw their cards'
buttons as icons alone (names and tooltips stay), with tighter padding, and
the title wraps below its state icon. A phone stacks the lanes, 1 per row,
folded, as before.

| Width | Stands for | Before | After |
|---|---|---|---|
| 1280 | laptop window | 2 per row | 4 |
| 1024 | 1280 at 125% zoom | 2 per row | 4 |
| 853 | 1280 at 150% zoom | 1 per row | 4 (icon buttons) |
| 768 | narrowest above a phone | 1 per row | 4 (icon buttons) |
| 390 | phone | 1 per row | 1 per row |

`before/` is origin/main at 50ac631a; `after/` is this branch. Full app
shell with the host's stylesheet, light and dark:

    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> \
      node kirocrew-app/ui/test/browser/delivery-lanes-shots.mjs <out>

`kirocrew-app/ui/test/delivery-lanes.test.mjs` checks the same widths in
Chrome: one column per lane in one row, no button outside its card and no
sideways scroll above 767 px, and 1 per row at 390 px.

The Delivery nav filters also move the "Task name or ID" search under the
Filters header, as the first row above All states (left nav in the 1280 and
1024 shots). No other dashboard rail has a search above its first header:
Graph, Activity and Flow have no search box.
