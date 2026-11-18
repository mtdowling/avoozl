# Top bar and Delivery heading

> Screenshots for this receipt were checked and are not kept in git.

Dashboards › Delivery in the full app shell, at 390 and 1280 px, light and
dark, with Kiro Crew's own stylesheet.

- `before/`: main. Plan a goal and Stop the line on the top line; Refresh
  with its word; Start now's label above its box.
- `after/`: no Plan a goal or Stop the line on the top line. The Delivery
  heading has Start now and its box, an icon-only Refresh and Stop the line
  on one row. `delivery-1280-light-stopped.png` shows a stopped line: the
  banner on Delivery and the play icon to resume.

To make them again:

    cd kirocrew-app/ui
    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> AVOOZL_SHOTS=<out> \
      node --test test/delivery-header.test.mjs
    # before, on main:
    AVOOZL_CHROME_NO_SANDBOX=1 AVOOZL_HOST_CSS=<host css> \
      node test/browser/restore-shots.mjs <out>
